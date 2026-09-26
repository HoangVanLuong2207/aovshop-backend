import type { Client, Transaction } from '@libsql/client';

async function addColumn(tx: Transaction, table: string, name: string, definition: string) {
    const columns = await tx.execute(`PRAGMA table_info(${table})`);
    if (!columns.rows.some(row => row.name === name)) {
        await tx.execute(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
}

// Additive and repeatable. Legacy REAL columns remain readable/writable during
// the rolling deployment; *_tenths columns are the exact financial source.
export async function migrateCheckpass(client: Client) {
    const tx = await client.transaction('write');
    try {
        const users = await tx.execute('PRAGMA table_info(users)');
        if (!users.rows.length) throw new Error('Database is not initialized');

        await addColumn(tx, 'users', 'balance_tenths', 'INTEGER');
        await addColumn(tx, 'orders', 'subtotal_tenths', 'INTEGER');
        await addColumn(tx, 'orders', 'discount_tenths', 'INTEGER');
        await addColumn(tx, 'orders', 'total_tenths', 'INTEGER');
        await addColumn(tx, 'orders', 'source', "TEXT NOT NULL DEFAULT 'shop'");
        await addColumn(tx, 'orders', 'external_reference', 'TEXT');
        await addColumn(tx, 'orders', 'metadata', 'TEXT');
        await addColumn(tx, 'order_items', 'price_tenths', 'INTEGER');
        await addColumn(tx, 'order_items', 'total_tenths', 'INTEGER');
        await addColumn(tx, 'transactions', 'amount_tenths', 'INTEGER');
        await addColumn(tx, 'transactions', 'balance_before_tenths', 'INTEGER');
        await addColumn(tx, 'transactions', 'balance_after_tenths', 'INTEGER');

        await tx.execute('UPDATE users SET balance_tenths=ROUND(balance * 10) WHERE balance_tenths IS NULL');
        await tx.execute('UPDATE orders SET subtotal_tenths=ROUND(subtotal * 10) WHERE subtotal_tenths IS NULL');
        await tx.execute('UPDATE orders SET discount_tenths=ROUND(COALESCE(discount,0) * 10) WHERE discount_tenths IS NULL');
        await tx.execute('UPDATE orders SET total_tenths=ROUND(total * 10) WHERE total_tenths IS NULL');
        await tx.execute('UPDATE order_items SET price_tenths=ROUND(price * 10) WHERE price_tenths IS NULL');
        await tx.execute('UPDATE order_items SET total_tenths=ROUND(total * 10) WHERE total_tenths IS NULL');
        await tx.execute('UPDATE transactions SET amount_tenths=ROUND(amount * 10) WHERE amount_tenths IS NULL');
        await tx.execute('UPDATE transactions SET balance_before_tenths=ROUND(balance_before * 10) WHERE balance_before_tenths IS NULL');
        await tx.execute('UPDATE transactions SET balance_after_tenths=ROUND(balance_after * 10) WHERE balance_after_tenths IS NULL');

        await tx.execute(`CREATE TABLE IF NOT EXISTS checkpass_sso_tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code_hash TEXT NOT NULL UNIQUE,
            user_id INTEGER NOT NULL REFERENCES users(id),
            audience TEXT NOT NULL DEFAULT 'checkpass',
            return_url TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            consumed_at TEXT,
            created_at TEXT
        )`);
        await tx.execute('CREATE INDEX IF NOT EXISTS idx_checkpass_sso_user ON checkpass_sso_tickets(user_id)');
        await tx.execute('CREATE INDEX IF NOT EXISTS idx_checkpass_sso_expiry ON checkpass_sso_tickets(expires_at)');

        await tx.execute(`CREATE TABLE IF NOT EXISTS balance_holds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            service TEXT NOT NULL DEFAULT 'checkpass',
            external_reference TEXT NOT NULL UNIQUE,
            amount_tenths INTEGER NOT NULL,
            captured_amount_tenths INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'active',
            expires_at TEXT NOT NULL,
            created_at TEXT,
            updated_at TEXT
        )`);
        await tx.execute('CREATE INDEX IF NOT EXISTS idx_balance_holds_user_status ON balance_holds(user_id,status)');

        await tx.execute(`CREATE TABLE IF NOT EXISTS checkpass_entitlements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            block_count INTEGER NOT NULL,
            duration_minutes INTEGER NOT NULL,
            starts_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            order_id INTEGER REFERENCES orders(id),
            status TEXT NOT NULL DEFAULT 'active',
            service_tier TEXT NOT NULL DEFAULT 'normal',
            source TEXT NOT NULL DEFAULT 'checkpass',
            external_reference TEXT NOT NULL UNIQUE,
            created_at TEXT
        )`);
        await tx.execute('CREATE INDEX IF NOT EXISTS idx_checkpass_entitlements_user_expiry ON checkpass_entitlements(user_id,expires_at)');

        await tx.execute(`CREATE TABLE IF NOT EXISTS checkpass_billing_operations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            external_job_reference TEXT NOT NULL UNIQUE,
            user_id INTEGER NOT NULL REFERENCES users(id),
            billing_mode TEXT NOT NULL,
            service_tier TEXT NOT NULL DEFAULT 'normal',
            submitted_count INTEGER NOT NULL DEFAULT 0,
            ok_count INTEGER NOT NULL DEFAULT 0,
            fail_count INTEGER NOT NULL DEFAULT 0,
            uncheckable_count INTEGER NOT NULL DEFAULT 0,
            unit_price_tenths INTEGER NOT NULL DEFAULT 0,
            estimated_amount_tenths INTEGER NOT NULL DEFAULT 0,
            final_amount_tenths INTEGER NOT NULL DEFAULT 0,
            hold_id INTEGER REFERENCES balance_holds(id),
            entitlement_id INTEGER REFERENCES checkpass_entitlements(id),
            order_id INTEGER REFERENCES orders(id),
            status TEXT NOT NULL,
            idempotency_key TEXT NOT NULL UNIQUE,
            created_at TEXT,
            settled_at TEXT
        )`);
        await tx.execute('CREATE INDEX IF NOT EXISTS idx_checkpass_billing_user ON checkpass_billing_operations(user_id)');
        await tx.execute('CREATE INDEX IF NOT EXISTS idx_checkpass_billing_status ON checkpass_billing_operations(status)');
        await addColumn(tx, 'checkpass_entitlements', 'service_tier', "TEXT NOT NULL DEFAULT 'normal'");
        await addColumn(tx, 'checkpass_billing_operations', 'service_tier', "TEXT NOT NULL DEFAULT 'normal'");
        await tx.execute('CREATE INDEX IF NOT EXISTS idx_checkpass_entitlements_tier ON checkpass_entitlements(user_id,service_tier,expires_at)');
        await tx.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_source_reference ON orders(source,external_reference)');

        await tx.commit();
    } catch (error) {
        await tx.rollback();
        throw error;
    } finally {
        tx.close();
    }
}
