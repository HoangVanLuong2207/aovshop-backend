import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
dotenv.config();

const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function migrate() {
    console.log('[Migrate] Connecting to Turso database...');

    const alterStatements = [
        // products table
        { table: 'products', column: 'is_preorder', sql: `ALTER TABLE products ADD COLUMN is_preorder INTEGER NOT NULL DEFAULT 0` },
        // orders table
        { table: 'orders', column: 'order_type', sql: `ALTER TABLE orders ADD COLUMN order_type TEXT NOT NULL DEFAULT 'instant'` },
        { table: 'orders', column: 'customer_note', sql: `ALTER TABLE orders ADD COLUMN customer_note TEXT` },
        { table: 'orders', column: 'delivery_data', sql: `ALTER TABLE orders ADD COLUMN delivery_data TEXT` },
        { table: 'orders', column: 'delivered_at', sql: `ALTER TABLE orders ADD COLUMN delivered_at TEXT` },
    ];

    for (const stmt of alterStatements) {
        try {
            await client.execute(stmt.sql);
            console.log(`✅ Added column ${stmt.table}.${stmt.column}`);
        } catch (err: any) {
            if (err.message?.includes('duplicate column') || err.message?.includes('already exists')) {
                console.log(`⏭️  Column ${stmt.table}.${stmt.column} already exists, skipping.`);
            } else {
                console.error(`❌ Failed to alter ${stmt.table}.${stmt.column}:`, err.message);
            }
        }
    }

    console.log('\n✅ Pre-order migration completed!');
    process.exit(0);
}

migrate().catch((err) => {
    console.error('Migration error:', err);
    process.exit(1);
});
