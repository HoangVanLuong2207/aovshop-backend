import type { Client } from '@libsql/client';

// Additive and repeatable: does not rebuild tables or modify balances/orders.
export async function migrateSecurity(client: Client) {
    const tx = await client.transaction('write');
    try {
        const columns = await tx.execute('PRAGMA table_info(users)');
        if (!columns.rows.length) {
            throw new Error('Database is not initialized. Initialize a new empty database explicitly before starting the server.');
        }
        if (!columns.rows.some(row => row.name === 'token_version')) {
            await tx.execute('ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0');
        }
        await tx.execute(`CREATE TABLE IF NOT EXISTS payment_webhook_events (
            id TEXT PRIMARY KEY NOT NULL,
            deposit_id INTEGER NOT NULL REFERENCES deposits(id),
            created_at TEXT
        )`);
        const marker = await tx.execute("SELECT id FROM settings WHERE key = 'security_patch_v1'");
        if (!marker.rows.length) {
            // Previously generated bearer links may have been exposed in logs.
            await tx.execute('UPDATE users SET reset_password_token = NULL, reset_password_expires = NULL, verification_token = NULL, verification_expires = NULL');
            await tx.execute("INSERT INTO settings (key, value) VALUES ('security_patch_v1', 'applied')");
        }
        await tx.commit();
    } catch (error) {
        await tx.rollback();
        throw error;
    } finally {
        tx.close();
    }
}
