import type { Client, Transaction } from '@libsql/client';

export class HotBillingError extends Error {
    constructor(public status: number, public code: string) { super(code); }
}

const fail = (status: number, code: string): never => { throw new HotBillingError(status, code); };
function integer(value: unknown) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0) return fail(409, 'INVALID_WALLET_STATE');
    return number;
}

async function snapshot(tx: Transaction, userId: number) {
    const users = await tx.execute({
        sql: 'SELECT COALESCE(balance_tenths,ROUND(balance*10)) AS cash FROM users WHERE id=?', args: [userId],
    });
    if (!users.rows.length) return fail(404, 'USER_NOT_FOUND');
    const holds = await tx.execute({
        sql: `SELECT COALESCE(SUM(amount_tenths-COALESCE(bonus_amount_tenths,0)),0) AS held
            FROM balance_holds WHERE user_id=? AND status='active' AND expires_at>?`,
        args: [userId, new Date().toISOString()],
    });
    const cash = integer(users.rows[0].cash);
    const held = integer(holds.rows[0].held);
    return { cash_balance_tenths: cash, held_cash_tenths: held, available_cash_tenths: Math.max(0, cash - held) };
}

export type HotBillingAction = 'reserve' | 'capture' | 'release' | 'refund' | 'status';

// A HOT external reference is the immutable payment/idempotency identity.
// Serialize wallet reads, shared holds, ledger and state transitions in a single
// libSQL write transaction. No game/network calls are made inside this lock.
export async function hotBilling(client: Client, action: HotBillingAction, input: {
    user_id: number; external_reference: string; amount_tenths?: number;
}) {
    const tx = await client.transaction('write');
    try {
        const now = new Date().toISOString();
        const existing = await tx.execute({
            sql: 'SELECT * FROM hot_billing_operations WHERE external_reference=?', args: [input.external_reference],
        });
        let operation = existing.rows[0];
        if (operation && (Number(operation.user_id) !== input.user_id ||
            (input.amount_tenths !== undefined && Number(operation.amount_tenths) !== input.amount_tenths))) {
            return fail(409, 'REFERENCE_CONFLICT');
        }
        if (!operation) {
            if (action !== 'reserve') return fail(404, 'PAYMENT_NOT_FOUND');
            if (!Number.isSafeInteger(input.amount_tenths) || !input.amount_tenths || input.amount_tenths < 1) return fail(400, 'INVALID_AMOUNT');
            const wallet = await snapshot(tx, input.user_id);
            if (wallet.available_cash_tenths < input.amount_tenths) return fail(409, 'INSUFFICIENT_CASH');
            const expires = new Date(Date.now() + 15 * 60_000).toISOString();
            const hold = await tx.execute({
                sql: `INSERT INTO balance_holds(user_id,service,external_reference,amount_tenths,
                    captured_amount_tenths,bonus_amount_tenths,captured_bonus_tenths,status,expires_at,created_at,updated_at)
                    VALUES (?,'hot',?,?,0,0,0,'active',?,?,?) RETURNING id`,
                args: [input.user_id, `hot:${input.external_reference}`, input.amount_tenths, expires, now, now],
            });
            const inserted = await tx.execute({
                sql: `INSERT INTO hot_billing_operations(external_reference,user_id,amount_tenths,status,hold_id,created_at,updated_at)
                    VALUES (?,?,?,'reserved',?,?,?) RETURNING *`,
                args: [input.external_reference, input.user_id, input.amount_tenths, hold.rows[0].id, now, now],
            });
            operation = inserted.rows[0];
        }
        const holdResult = await tx.execute({ sql: 'SELECT * FROM balance_holds WHERE id=?', args: [operation.hold_id] });
        const hold = holdResult.rows[0];
        if (!hold || hold.service !== 'hot' || Number(hold.user_id) !== input.user_id ||
            Number(hold.amount_tenths) !== Number(operation.amount_tenths) || Number(hold.bonus_amount_tenths) !== 0) {
            return fail(409, 'INVALID_HOLD_STATE');
        }
        const expired = operation.status === 'reserved' && String(hold.expires_at) <= now;
        const amount = integer(operation.amount_tenths);
        if (action === 'capture' && operation.status !== 'captured') {
            if (operation.status !== 'reserved' || expired || hold.status !== 'active') return fail(409, 'PAYMENT_NOT_CAPTURABLE');
            const wallet = await snapshot(tx, input.user_id);
            // The own active hold is included in held_cash_tenths. Preserve
            // every other service's hold even if a legacy debit bypassed it.
            if (wallet.cash_balance_tenths < amount || wallet.cash_balance_tenths < wallet.held_cash_tenths) return fail(409, 'INSUFFICIENT_CASH');
            const after = wallet.cash_balance_tenths - amount;
            await tx.execute({
                sql: 'UPDATE users SET balance_tenths=?,balance=? WHERE id=?', args: [after, after / 10, input.user_id],
            });
            const ledger = await tx.execute({
                sql: `INSERT INTO transactions(user_id,type,amount,amount_tenths,balance_before,balance_after,
                    balance_before_tenths,balance_after_tenths,checkpass_bonus_amount_tenths,status,description,reference,created_at)
                    VALUES (?,'purchase',?,?,?,?,?,?,0,'completed','HOT order',?,?) RETURNING id`,
                args: [input.user_id, -amount / 10, -amount, wallet.cash_balance_tenths / 10, after / 10,
                    wallet.cash_balance_tenths, after, `hot:${input.external_reference}:capture`, now],
            });
            await tx.execute({ sql: `UPDATE balance_holds SET status='captured',captured_amount_tenths=?,updated_at=? WHERE id=?`, args: [amount, now, hold.id] });
            await tx.execute({ sql: `UPDATE hot_billing_operations SET status='captured',purchase_transaction_id=?,updated_at=? WHERE external_reference=?`, args: [ledger.rows[0].id, now, input.external_reference] });
        } else if (action === 'release' && operation.status !== 'released') {
            if (operation.status !== 'reserved') return fail(409, 'PAYMENT_NOT_RELEASABLE');
            await tx.execute({ sql: `UPDATE balance_holds SET status='released',updated_at=? WHERE id=?`, args: [now, hold.id] });
            await tx.execute({ sql: `UPDATE hot_billing_operations SET status='released',updated_at=? WHERE external_reference=?`, args: [now, input.external_reference] });
        } else if (action === 'refund' && operation.status !== 'refunded') {
            if (operation.status !== 'captured' || hold.status !== 'captured') return fail(409, 'PAYMENT_NOT_REFUNDABLE');
            const wallet = await snapshot(tx, input.user_id);
            const after = integer(wallet.cash_balance_tenths + amount);
            await tx.execute({ sql: 'UPDATE users SET balance_tenths=?,balance=? WHERE id=?', args: [after, after / 10, input.user_id] });
            const ledger = await tx.execute({
                sql: `INSERT INTO transactions(user_id,type,amount,amount_tenths,balance_before,balance_after,
                    balance_before_tenths,balance_after_tenths,checkpass_bonus_amount_tenths,status,description,reference,created_at)
                    VALUES (?,'refund',?,?,?,?,?,?,0,'completed','HOT full refund',?,?) RETURNING id`,
                args: [input.user_id, amount / 10, amount, wallet.cash_balance_tenths / 10, after / 10,
                    wallet.cash_balance_tenths, after, `hot:${input.external_reference}:refund`, now],
            });
            await tx.execute({ sql: `UPDATE balance_holds SET status='refunded',updated_at=? WHERE id=?`, args: [now, hold.id] });
            await tx.execute({ sql: `UPDATE hot_billing_operations SET status='refunded',refund_transaction_id=?,updated_at=? WHERE external_reference=?`, args: [ledger.rows[0].id, now, input.external_reference] });
        }
        const updated = await tx.execute({ sql: 'SELECT * FROM hot_billing_operations WHERE external_reference=?', args: [input.external_reference] });
        const payment = updated.rows[0];
        const result = {
            ok: true, payment: { ...payment, status: payment.status === 'reserved' && expired ? 'expired' : payment.status, expires_at: hold.expires_at },
            wallet: await snapshot(tx, input.user_id),
        };
        await tx.commit();
        return result;
    } catch (error) {
        await tx.rollback();
        throw error;
    } finally {
        tx.close();
    }
}
