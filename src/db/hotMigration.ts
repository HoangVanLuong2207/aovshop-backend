import type { Client } from '@libsql/client';

// Additive only; intentionally separate from Checkpass tickets and credentials.
export async function migrateHot(client: Client) {
    const tx = await client.transaction('write');
    try {
        await tx.execute(`CREATE TABLE IF NOT EXISTS hot_sso_tickets (
            code_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            token_version INTEGER NOT NULL,
            audience TEXT NOT NULL CHECK(audience = 'hot'),
            return_url TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            consumed_at TEXT,
            created_at TEXT NOT NULL
        )`);
        await tx.execute('CREATE INDEX IF NOT EXISTS idx_hot_sso_expiry ON hot_sso_tickets(expires_at)');
        await tx.execute(`CREATE TABLE IF NOT EXISTS hot_billing_operations (
            external_reference TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            amount_tenths INTEGER NOT NULL CHECK(amount_tenths > 0),
            status TEXT NOT NULL CHECK(status IN ('reserved','captured','released','refunded')),
            hold_id INTEGER NOT NULL UNIQUE REFERENCES balance_holds(id),
            purchase_transaction_id INTEGER REFERENCES transactions(id),
            refund_transaction_id INTEGER REFERENCES transactions(id),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )`);
        await tx.execute('CREATE INDEX IF NOT EXISTS idx_hot_billing_user ON hot_billing_operations(user_id)');
        await tx.commit();
    } catch (error) {
        await tx.rollback();
        throw error;
    } finally {
        tx.close();
    }
}
