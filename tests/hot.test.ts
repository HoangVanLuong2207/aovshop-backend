import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { createClient } from '@libsql/client';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { isTable } from 'drizzle-orm';
import { migrateHot } from '../src/db/hotMigration.js';

if (!process.env.AOVSHOP_SECURITY_TEST_DB?.startsWith('file:')) throw new Error('Isolated test database required');
process.env.TURSO_DATABASE_URL = process.env.AOVSHOP_SECURITY_TEST_DB;
delete process.env.TURSO_AUTH_TOKEN;
process.env.JWT_SECRET = 'hot-isolated-test-jwt-secret';
process.env.HOT_SERVICE_TOKEN = 'hot-isolated-service-token';
process.env.HOT_ALLOWED_ORIGINS = 'https://hot.sp1s.shop';
const setup = createClient({ url: process.env.TURSO_DATABASE_URL });
const schema = await import('../src/db/schema.js');
for (const table of Object.values(schema).filter(isTable)) {
    const config = getTableConfig(table as any);
    await setup.execute(`CREATE TABLE "${config.name}" (${config.columns.map(column => `"${column.name}" ${column.getSQLType()}${column.primary ? ' PRIMARY KEY' : ''}`).join(',')})`);
}
await setup.execute(`INSERT INTO users(id,name,email,role,token_version) VALUES (1,'Test','test@example.invalid','user',0)`);
await migrateHot(setup);
await migrateHot(setup);
const { userHotRouter, hotIntegrationRouter } = await import('../src/routes/hot.js');
const { client } = await import('../src/db/index.js');
const app = express();
app.use(express.json());
app.use('/user', userHotRouter);
app.use('/service', hotIntegrationRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('No test port');
const base = `http://127.0.0.1:${address.port}`;
const token = jwt.sign({ userId: 1, tokenVersion: 0 }, process.env.JWT_SECRET);
const callback = 'https://hot.sp1s.shop/auth/callback?state=abcdefghijklmnopqrstuvwx';
async function post(path: string, body: unknown, bearer = process.env.HOT_SERVICE_TOKEN!) {
    const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() as any };
}
async function ticket() {
    const result = await post('/user/sso/ticket', { return_url: callback }, token);
    assert.equal(result.status, 200);
    return new URL(result.body.redirect_url).searchParams.get('code');
}
after(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    client.close();
    setup.close();
});

test('HOT SSO is service-authenticated, callback-bound and one-use under concurrency', async () => {
    const code = await ticket();
    assert.equal((await post('/service/sso/exchange', { code, return_url: callback }, 'checkpass-token')).status, 403);
    assert.equal((await post('/service/sso/exchange', { code, return_url: callback.replace('abcdefghijklmnopqrstuvwx', 'zyxwvutsrqponmlkjihgfedc') })).status, 401);
    const results = await Promise.all([1, 2].map(() => post('/service/sso/exchange', { code, return_url: callback })));
    assert.deepEqual(results.map(result => result.status).sort(), [200, 401]);
    const user = results.find(result => result.status === 200)!.body.user;
    assert.equal(user.id, 1);
    assert.equal(user.role, 'user');
    assert.equal((await post('/service/sso/exchange', { code, return_url: callback })).status, 401);
});

test('HOT rejects unapproved domains, paths, missing state and insecure callbacks', async () => {
    for (const return_url of ['https://evil.invalid/auth/callback?state=abcdefghijklmnopqrstuvwx', 'https://hot.sp1s.shop/admin?state=abcdefghijklmnopqrstuvwx', 'https://hot.sp1s.shop/auth/callback', callback.replace('https:', 'http:'), callback.replace('hot.sp1s.shop', 'user@hot.sp1s.shop')]) {
        assert.equal((await post('/user/sso/ticket', { return_url }, token)).status, 400);
    }
});

test('expired tickets and revoked identities fail; roles come from current DB', async () => {
    const expired = await ticket();
    await setup.execute("UPDATE hot_sso_tickets SET expires_at='2000-01-01T00:00:00.000Z'");
    assert.equal((await post('/service/sso/exchange', { code: expired, return_url: callback })).status, 401);
    const code = await ticket();
    await setup.execute("UPDATE users SET role='admin'");
    assert.equal((await post('/service/session/validate', { user_id: 1, token_version: 0 })).body.user.role, 'admin');
    await setup.execute('UPDATE users SET token_version=1');
    assert.equal((await post('/service/sso/exchange', { code, return_url: callback })).status, 401);
    assert.equal((await post('/service/session/validate', { user_id: 1, token_version: 0 })).status, 401);
});

async function wallet(cash = 1000, bonus = 9000) {
    await setup.execute({ sql: 'UPDATE users SET balance=?,balance_tenths=?,checkpass_bonus_tenths=? WHERE id=1', args: [cash / 10, cash, bonus] });
    await setup.execute("UPDATE balance_holds SET status='released' WHERE status='active'");
}
function billing(action: string, reference: string, amount?: number, userId = 1) {
    return post(`/service/billing/${action}`, { user_id: userId, external_reference: reference, ...(amount === undefined ? {} : { amount_tenths: amount }) });
}

test('HOT reserve/capture/refund are idempotent, cash-only and immutable', async () => {
    await wallet();
    const reserved = await billing('reserve', 'purchase-1', 700);
    assert.equal(reserved.status, 200);
    assert.equal(reserved.body.wallet.available_cash_tenths, 300);
    assert.equal((await billing('reserve', 'purchase-1', 700)).status, 200);
    assert.equal((await billing('reserve', 'purchase-1', 701)).status, 409);
    assert.equal((await billing('capture', 'purchase-1', undefined, 2)).status, 409);
    const captured = await Promise.all([1, 2].map(() => billing('capture', 'purchase-1')));
    assert.deepEqual(captured.map(value => value.status), [200, 200]);
    assert.equal(captured[0].body.wallet.cash_balance_tenths, 300);
    assert.equal((await billing('release', 'purchase-1')).status, 409);
    assert.equal((await billing('reserve', 'bonus-cannot-pay', 301)).status, 409);
    const refunded = await Promise.all([1, 2].map(() => billing('refund', 'purchase-1')));
    assert.deepEqual(refunded.map(value => value.status), [200, 200]);
    assert.equal(refunded[0].body.wallet.cash_balance_tenths, 1000);
    assert.equal((await billing('capture', 'purchase-1')).status, 409);
    const user = await setup.execute('SELECT checkpass_bonus_tenths,balance FROM users WHERE id=1');
    assert.equal(user.rows[0].checkpass_bonus_tenths, 9000);
    assert.equal(user.rows[0].balance, 100);
    const ledger = await setup.execute("SELECT COUNT(*) AS total,SUM(amount_tenths) AS net FROM transactions WHERE reference LIKE 'hot:purchase-1:%'");
    assert.equal(ledger.rows[0].total, 2);
    assert.equal(ledger.rows[0].net, 0);
});

test('concurrent HOT reservations cannot spend the same cash and honor shared cash/bonus holds', async () => {
    await wallet();
    const concurrent = await Promise.all(['race-1', 'race-2'].map(reference => billing('reserve', reference, 700)));
    assert.deepEqual(concurrent.map(value => value.status).sort(), [200, 409]);
    for (const reference of ['race-1', 'race-2']) await billing('release', reference);
    await setup.execute({
        sql: `INSERT INTO balance_holds(id,user_id,service,external_reference,amount_tenths,bonus_amount_tenths,status,expires_at)
            VALUES (1000,1,'checkpass','shared-test',900,500,'active',?)`,
        args: [new Date(Date.now() + 60_000).toISOString()],
    });
    assert.equal((await billing('reserve', 'shared-too-much', 601)).status, 409);
    assert.equal((await billing('reserve', 'shared-ok', 600)).status, 200);
    assert.equal((await billing('capture', 'shared-ok')).body.wallet.cash_balance_tenths, 400);
});

test('expired and released holds cannot be captured; status lookup never creates payments', async () => {
    await wallet();
    assert.equal((await billing('status', 'not-found')).status, 404);
    assert.equal((await billing('reserve', 'expired-payment', 500)).status, 200);
    await setup.execute("UPDATE balance_holds SET expires_at='2000-01-01T00:00:00.000Z' WHERE external_reference='hot:expired-payment'");
    assert.equal((await billing('status', 'expired-payment')).body.payment.status, 'expired');
    assert.equal((await billing('capture', 'expired-payment')).status, 409);
    assert.equal((await billing('release', 'expired-payment')).status, 200);
    assert.equal((await billing('release', 'expired-payment')).status, 200);
    assert.equal((await billing('capture', 'expired-payment')).status, 409);
    assert.equal((await billing('refund', 'expired-payment')).status, 409);
});

test('ledger failure rolls back debit and payment state', async () => {
    await wallet();
    assert.equal((await billing('reserve', 'rollback-payment', 500)).status, 200);
    await setup.execute(`CREATE TRIGGER fail_hot_ledger BEFORE INSERT ON transactions
        WHEN NEW.reference='hot:rollback-payment:capture' BEGIN SELECT RAISE(ABORT,'test ledger failure'); END`);
    try {
        // Test the service directly so the intentionally injected SQL error is
        // not rendered by Express as an HTML error page.
        const { hotBilling } = await import('../src/services/hotBilling.js');
        await assert.rejects(hotBilling(client, 'capture', { user_id: 1, external_reference: 'rollback-payment' }), /test ledger failure/);
        const status = await billing('status', 'rollback-payment');
        assert.equal(status.body.payment.status, 'reserved');
        assert.equal(status.body.wallet.cash_balance_tenths, 1000);
    } finally {
        await setup.execute('DROP TRIGGER fail_hot_ledger');
    }
    assert.equal((await billing('capture', 'rollback-payment')).body.wallet.cash_balance_tenths, 500);
});

test('duplicate reserve requests create exactly one shared hold', async () => {
    await wallet();
    const results = await Promise.all([1, 2, 3].map(() => billing('reserve', 'reserve-replay', 600)));
    assert.deepEqual(results.map(value => value.status), [200, 200, 200]);
    assert.equal(results[0].body.wallet.available_cash_tenths, 400);
    const count = await setup.execute("SELECT COUNT(*) AS total FROM balance_holds WHERE external_reference='hot:reserve-replay'");
    assert.equal(count.rows[0].total, 1);
});

test('refund ledger failure rolls back credit and supports safe retry', async () => {
    await wallet();
    await billing('reserve', 'refund-rollback', 500);
    await billing('capture', 'refund-rollback');
    await setup.execute(`CREATE TRIGGER fail_hot_refund BEFORE INSERT ON transactions
        WHEN NEW.reference='hot:refund-rollback:refund' BEGIN SELECT RAISE(ABORT,'test refund failure'); END`);
    try {
        const { hotBilling } = await import('../src/services/hotBilling.js');
        await assert.rejects(hotBilling(client, 'refund', { user_id: 1, external_reference: 'refund-rollback' }), /test refund failure/);
        const status = await billing('status', 'refund-rollback');
        assert.equal(status.body.payment.status, 'captured');
        assert.equal(status.body.wallet.cash_balance_tenths, 500);
    } finally {
        await setup.execute('DROP TRIGGER fail_hot_refund');
    }
    assert.equal((await billing('refund', 'refund-rollback')).body.wallet.cash_balance_tenths, 1000);
});

test('capture cannot consume cash protected by another service after a legacy debit', async () => {
    await wallet();
    await billing('reserve', 'protect-shared-hold', 500);
    await setup.execute({
        sql: `INSERT INTO balance_holds(id,user_id,service,external_reference,amount_tenths,bonus_amount_tenths,status,expires_at)
            VALUES (2000,1,'checkpass','protected-other-service',500,0,'active',?)`,
        args: [new Date(Date.now() + 60_000).toISOString()],
    });
    await setup.execute('UPDATE users SET balance=70,balance_tenths=700 WHERE id=1');
    assert.equal((await billing('capture', 'protect-shared-hold')).status, 409);
    assert.equal((await billing('status', 'protect-shared-hold')).body.wallet.cash_balance_tenths, 700);
});
