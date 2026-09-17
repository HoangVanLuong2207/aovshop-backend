import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { isTable, eq, sql } from 'drizzle-orm';
import { OAuth2Client } from 'google-auth-library';
import { createClient } from '@libsql/client';
import { migrateSecurity } from '../src/db/securityMigration.js';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

// Never load dotenv or use a configured remote database in regression tests.
if (!process.env.AOVSHOP_SECURITY_TEST_DB?.startsWith('file:')) throw new Error('Run through npm test for an isolated database');
process.env.TURSO_DATABASE_URL = process.env.AOVSHOP_SECURITY_TEST_DB;
delete process.env.TURSO_AUTH_TOKEN;
process.env.JWT_SECRET = 'isolated-security-test-secret-not-for-production';
delete process.env.BREVO_API_KEY;
delete process.env.BREVO_SENDER_EMAIL;
delete process.env.LICENSE_SERVER_URL;
const { db, client } = await import('../src/db/index.js');
const schema = await import('../src/db/schema.js');
const { users, products, productAccounts, orders, transactions, deposits, paymentAccounts, settings, promotions } = schema;
for (const table of Object.values(schema).filter(isTable)) {
    const config = getTableConfig(table as any);
    const columns = config.columns.map(c => `"${c.name}" ${c.getSQLType()}${c.primary ? ' PRIMARY KEY' : ''}${c.notNull ? ' NOT NULL' : ''}${c.isUnique ? ' UNIQUE' : ''}`);
    await client.execute(`CREATE TABLE "${config.name}" (${columns.join(',')})`);
}
const app = express();
app.use(express.json());
app.use('/auth', (await import('../src/routes/auth.js')).default);
app.use('/deposit', (await import('../src/routes/deposit.js')).default);
app.use('/orders', (await import('../src/routes/orders.js')).default);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); client.close(); });
const password = 'Test-password-123';
const hash = await bcrypt.hash(password, 4);
let seq = 0;
async function user(balance = 100000, verified = true) {
    const [u] = await db.insert(users).values({ name: 'Test', email: `test-${++seq}@example.invalid`, password: hash, balance, emailVerified: verified }).returning();
    return { ...u, token: jwt.sign({ userId: u.id, tokenVersion: u.tokenVersion }, process.env.JWT_SECRET!) };
}
async function request(route: string, body?: unknown, token?: string, method = body === undefined ? 'GET' : 'POST') {
    const response = await fetch(base + route, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() as any };
}
async function product(extra = {}) {
    return (await db.insert(products).values({ name: 'Test', price: 80000, isPreorder: true, ...extra }).returning())[0];
}
async function payment(secretKey: string | null = 'test-webhook-key') {
    const u = await user(0);
    const [bank] = await db.insert(paymentAccounts).values({ bankName: 'MB', accountNumber: `account-${++seq}`, accountName: 'Test', secretKey }).returning();
    const [deposit] = await db.insert(deposits).values({ userId: u.id, bankId: bank.id, amount: 10000, reference: `NAP123${++seq}U${u.id}` }).returning();
    const payload = { id: ++seq, content: deposit.reference, transferAmount: 10000, transferType: 'in', accountNumber: bank.accountNumber, gateway: 'MBBank' };
    return { u, bank, deposit, payload };
}
async function webhook(payload: unknown, key = 'test-webhook-key') {
    const r = await fetch(base + '/deposit/webhook', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Apikey ${key}` }, body: JSON.stringify(payload) });
    return { status: r.status, body: await r.json() as any };
}

test('deposit history does not expose webhook secrets', async () => {
    const p = await payment();
    const r = await request('/deposit/history', undefined, p.u.token);
    assert.equal(r.status, 200);
    assert.equal(r.body[0].bank.accountNumber, p.bank.accountNumber);
    assert.equal('secretKey' in r.body[0].bank, false);
    assert.equal('merchantId' in r.body[0].bank, false);
});
test('webhook rejects missing configuration, bad keys and unmatched payments', async () => {
    const missing = await payment(null);
    assert.equal((await webhook(missing.payload)).status, 503);
    const p = await payment();
    assert.equal((await webhook(p.payload, 'incorrect')).status, 401);
    for (const change of [{ transferType: 'out' }, { transferAmount: -10000 }, { transferAmount: '10000' }, { transferAmount: 20000 }, { accountNumber: 'wrong' }, { content: 'NAP999999U999' }]) {
        assert.equal((await webhook({ ...p.payload, ...change })).status, 400);
    }
    assert.equal((await db.query.users.findFirst({ where: eq(users.id, p.u.id) }))!.balance, 0);
});
test('valid webhook credits once, retry is idempotent and event cannot be reused', async () => {
    const p = await payment();
    assert.equal((await webhook(p.payload)).body.success, true);
    assert.equal((await webhook(p.payload)).body.success, true);
    assert.equal((await db.query.users.findFirst({ where: eq(users.id, p.u.id) }))!.balance, 10000);
    const other = await payment();
    assert.equal((await webhook({ ...other.payload, id: p.payload.id })).status, 400);
    assert.equal((await db.query.users.findFirst({ where: eq(users.id, other.u.id) }))!.balance, 0);
});
test('expired and already completed deposits cannot be credited', async () => {
    for (const status of ['expired', 'completed'] as const) {
        const p = await payment();
        await db.update(deposits).set({ status }).where(eq(deposits.id, p.deposit.id));
        assert.equal((await webhook(p.payload)).status, 400);
    }
});
test('concurrent checkout cannot spend the same balance twice', async () => {
    const u = await user(); const p = await product();
    const results = await Promise.all([1, 2].map(() => request('/orders/checkout', { items: [{ product_id: p.id, quantity: 1 }] }, u.token)));
    assert.equal(results.filter(r => r.status === 200).length, 1);
    assert.equal((await db.query.users.findFirst({ where: eq(users.id, u.id) }))!.balance, 20000);
    assert.equal((await db.query.orders.findMany({ where: eq(orders.userId, u.id) })).length, 1);
});
test('duplicate cart rows cannot bypass daily limits', async () => {
    const u = await user(); const p = await product({ dailyBuyLimit: 1, price: 1000 });
    assert.equal((await request('/orders/checkout', { items: [{ product_id: p.id, quantity: 1 }, { product_id: p.id, quantity: 1 }] }, u.token)).status, 400);
});
test('concurrent buyers cannot receive the same inventory', async () => {
    const a = await user(); const b = await user(); const p = await product({ isPreorder: false });
    await db.insert(productAccounts).values({ productId: p.id, data: 'test-only-account' });
    const results = await Promise.all([a, b].map(u => request('/orders/checkout', { items: [{ product_id: p.id, quantity: 1 }] }, u.token)));
    assert.equal(results.filter(r => r.status === 200).length, 1);
    const balances = await Promise.all([a, b].map(u => db.query.users.findFirst({ where: eq(users.id, u.id) })));
    assert.equal(balances.reduce((sum, u) => sum + u!.balance, 0), 120000);
});
test('ledger failure rolls back order, inventory and charge', async (t) => {
    t.mock.method(console, 'error', () => {});
    const u = await user(); const p = await product({ isPreorder: false });
    const [account] = await db.insert(productAccounts).values({ productId: p.id, data: 'rollback-test' }).returning();
    await client.execute("CREATE TRIGGER fail_purchase BEFORE INSERT ON transactions WHEN NEW.type = 'purchase' BEGIN SELECT RAISE(ABORT, 'injected test failure'); END");
    try {
        assert.equal((await request('/orders/checkout', { items: [{ product_id: p.id, quantity: 1 }] }, u.token)).status, 500);
        assert.equal((await db.query.users.findFirst({ where: eq(users.id, u.id) }))!.balance, 100000);
        assert.equal((await db.query.orders.findMany({ where: eq(orders.userId, u.id) })).length, 0);
        assert.equal((await db.query.productAccounts.findFirst({ where: eq(productAccounts.id, account.id) }))!.status, 'available');
    } finally { await client.execute('DROP TRIGGER fail_purchase'); }
});
test('expired, future and exhausted promotions are rejected without consuming usage', async () => {
    const u = await user(); const p = await product({ price: 1000 });
    for (const extra of [{ endDate: '2000-01-01' }, { startDate: '2099-01-01' }, { usageLimit: 1, usedCount: 1 }]) {
        const code = `PROMO${++seq}`;
        await db.insert(promotions).values({ code, name: code, type: 'fixed', value: 500, ...extra });
        assert.equal((await request('/orders/checkout', { items: [{ product_id: p.id, quantity: 1 }], promo_code: code }, u.token)).status, 400);
    }
});
test('logout and password changes invalidate old tokens', async () => {
    const u = await user();
    assert.equal((await request('/auth/logout', {}, u.token)).status, 200);
    assert.equal((await request('/auth/profile', undefined, u.token)).status, 401);
    const login = await request('/auth/login', { email: u.email, password });
    assert.equal(login.status, 200);
    assert.equal((await request('/auth/password', { current_password: password, password: 'new-password-123' }, login.body.token, 'PUT')).status, 200);
    assert.equal((await request('/auth/profile', undefined, login.body.token)).status, 401);
});
test('password reset invalidates sessions and consumes the reset token', async () => {
    const u = await user(); const token = 'a'.repeat(64);
    await db.update(users).set({ resetPasswordToken: token, resetPasswordExpires: new Date(Date.now() + 60000).toISOString() }).where(eq(users.id, u.id));
    assert.equal((await request('/auth/reset-password', { token, password: 'reset-password-123' })).status, 200);
    assert.equal((await request('/auth/profile', undefined, u.token)).status, 401);
    assert.equal((await request('/auth/reset-password', { token, password: 'reset-password-456' })).status, 400);
});
test('Google linking removes an unverified registrant password and sessions', async () => {
    const u = await user(0, false);
    await db.insert(settings).values({ key: 'google_client_id', value: 'test-client' });
    const verify = OAuth2Client.prototype.verifyIdToken;
    OAuth2Client.prototype.verifyIdToken = (async () => ({ getPayload: () => ({ sub: 'test-google-id', email: u.email, email_verified: true }) })) as any;
    try {
        const result = await request('/auth/google', { credential: 'test-token' });
        assert.equal(result.status, 200);
        assert.equal((await request('/auth/profile', undefined, u.token)).status, 401);
        assert.equal((await request('/auth/login', { email: u.email, password })).status, 401);
        assert.equal((await request('/auth/profile', undefined, result.body.token)).status, 200);
    } finally { OAuth2Client.prototype.verifyIdToken = verify; }
});

test('concurrent webhook retries do not double credit', async () => {
    const p = await payment();
    const results = await Promise.all([webhook(p.payload), webhook(p.payload)]);
    assert.ok(results.some(r => r.body.success));
    assert.equal((await db.query.users.findFirst({ where: eq(users.id, p.u.id) }))!.balance, 10000);
    assert.equal((await db.query.transactions.findMany({ where: eq(transactions.userId, p.u.id) })).length, 1);
});
test('webhook ledger failure rolls back balance, deposit and replay marker', async (t) => {
    t.mock.method(console, 'error', () => {});
    const p = await payment();
    await client.execute("CREATE TRIGGER fail_deposit BEFORE INSERT ON transactions WHEN NEW.type = 'deposit' BEGIN SELECT RAISE(ABORT, 'injected test failure'); END");
    try {
        assert.equal((await webhook(p.payload)).status, 500);
        assert.equal((await db.query.users.findFirst({ where: eq(users.id, p.u.id) }))!.balance, 0);
        assert.equal((await db.query.deposits.findFirst({ where: eq(deposits.id, p.deposit.id) }))!.status, 'pending');
    } finally { await client.execute('DROP TRIGGER fail_deposit'); }
    assert.equal((await webhook(p.payload)).body.success, true);
});
test('promotion usage is atomic and failed payment does not consume a use', async () => {
    const code = `PROMO${++seq}`;
    await db.insert(promotions).values({ code, name: code, type: 'fixed', value: 1000, usageLimit: 1 });
    const p = await product(); const poor = await user(0);
    const body = { items: [{ product_id: p.id, quantity: 1 }], promo_code: code };
    assert.equal((await request('/orders/checkout', body, poor.token)).status, 400);
    assert.equal((await db.query.promotions.findFirst({ where: eq(promotions.code, code) }))!.usedCount, 0);
    const a = await user(); const b = await user();
    const results = await Promise.all([a, b].map(u => request('/orders/checkout', body, u.token)));
    assert.equal(results.filter(r => r.status === 200).length, 1);
    assert.equal((await db.query.promotions.findFirst({ where: eq(promotions.code, code) }))!.usedCount, 1);
});
test('duplicate cart rows receive distinct inventory and disabled products are rejected', async () => {
    const u = await user(); const p = await product({ isPreorder: false, price: 1000 });
    await db.insert(productAccounts).values([{ productId: p.id, data: 'one' }, { productId: p.id, data: 'two' }]);
    const result = await request('/orders/checkout', { items: [{ product_id: p.id, quantity: 1 }, { product_id: p.id, quantity: 1 }] }, u.token);
    assert.equal(result.status, 200);
    assert.equal((await db.query.productAccounts.findMany({ where: eq(productAccounts.orderId, result.body.order.id) })).length, 2);
    await db.update(products).set({ active: false }).where(eq(products.id, p.id));
    assert.equal((await request('/orders/checkout', { items: [{ product_id: p.id, quantity: 1 }] }, u.token)).status, 400);
});
test('legacy JWTs and anonymous cleanup are rejected', async () => {
    const u = await user();
    const old = jwt.sign({ userId: u.id }, process.env.JWT_SECRET!);
    assert.equal((await request('/auth/profile', undefined, old)).status, 401);
    assert.equal((await request('/deposit/cleanup')).status, 401);
    assert.equal((await request('/deposit/cleanup', undefined, u.token)).status, 403);
    assert.equal((await request('/auth/register', { name: 'Test', email: 'test@example.invalid', password: 'short' })).status, 400);
});
test('security migration preserves balances and only revokes old email tokens once', async () => {
    const legacy = createClient({ url: process.env.AOVSHOP_SECURITY_TEST_DB!.replace('test.db', 'migration.db') });
    try {
        await legacy.executeMultiple(`
            CREATE TABLE users (id INTEGER PRIMARY KEY, balance REAL, reset_password_token TEXT, reset_password_expires TEXT, verification_token TEXT, verification_expires TEXT);
            CREATE TABLE settings (id INTEGER PRIMARY KEY, key TEXT UNIQUE, value TEXT);
            CREATE TABLE deposits (id INTEGER PRIMARY KEY);
            INSERT INTO users (id, balance, reset_password_token, verification_token) VALUES (1, 12345, 'old-reset', 'old-verify');
        `);
        await migrateSecurity(legacy);
        let row = (await legacy.execute('SELECT * FROM users')).rows[0];
        assert.equal(row.balance, 12345);
        assert.equal(row.token_version, 0);
        assert.equal(row.reset_password_token, null);
        assert.equal(row.verification_token, null);
        await legacy.execute("UPDATE users SET reset_password_token = 'new-reset'");
        await migrateSecurity(legacy);
        row = (await legacy.execute('SELECT * FROM users')).rows[0];
        assert.equal(row.reset_password_token, 'new-reset');
    } finally { legacy.close(); }
});

test('real production startup preserves legacy users and balances without schema push', { timeout: 60000 }, async () => {
    const url = process.env.AOVSHOP_SECURITY_TEST_DB!.replace('test.db', 'startup.db');
    const fixture = createClient({ url });
    for (const table of Object.values(schema).filter(isTable)) {
        const config = getTableConfig(table as any);
        const columns = config.columns.filter(c => !(config.name === 'users' && c.name === 'token_version'))
            .map(c => `"${c.name}" ${c.getSQLType()}${c.primary ? ' PRIMARY KEY' : ''}${c.notNull ? ' NOT NULL' : ''}${c.isUnique ? ' UNIQUE' : ''}`);
        await fixture.execute(`CREATE TABLE "${config.name}" (${columns.join(',')})`);
    }
    await fixture.execute("INSERT INTO users (id,name,email,password,role,balance,email_verified) VALUES (57,'Existing customer','existing@example.invalid','existing-hash','user',12345,1)");
    fixture.close();
    const child = spawn(process.execPath, ['startup.js'], {
        cwd: process.cwd(),
        env: { ...process.env, TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: '', PORT: '0' },
        stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    const exited = once(child, 'exit');
    let startupOutput = '';
    child.stdout.on('data', chunk => { startupOutput += chunk.toString(); });
    child.stderr.on('data', chunk => { startupOutput += chunk.toString(); });
    try {
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error(`Startup timed out: ${startupOutput}`)), 45000);
            child.stdout.on('data', chunk => {
                if (chunk.toString().includes('Server running')) { clearTimeout(timeout); resolve(); }
            });
            child.on('error', error => { clearTimeout(timeout); reject(error); });
            child.on('exit', code => { clearTimeout(timeout); reject(new Error(`Startup exited with ${code}: ${startupOutput}`)); });
        });
        const verify = createClient({ url });
        try {
            const result = await verify.execute('SELECT id,password,balance,token_version FROM users');
            assert.equal(result.rows.length, 1);
            assert.equal(result.rows[0].id, 57);
            assert.equal(result.rows[0].password, 'existing-hash');
            assert.equal(result.rows[0].balance, 12345);
            assert.equal(result.rows[0].token_version, 0);
        } finally { verify.close(); }
    } finally { child.kill(); await exited; }
});
