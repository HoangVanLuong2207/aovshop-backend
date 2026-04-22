/**
 * Migration: Remove FK constraint between product_accounts.order_id and orders
 *
 * SQLite does not support ALTER TABLE DROP CONSTRAINT.
 * The only way is to recreate the table without the FK.
 *
 * Steps:
 * 1. Rename product_accounts -> product_accounts_old
 * 2. Create new product_accounts WITHOUT the FK on order_id
 * 3. Copy all data from old to new
 * 4. Drop the old table
 * 5. Recreate indexes
 */

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { sql } from 'drizzle-orm';

const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
});

const db = drizzle(client);

async function removeFkOrderFromProductAccounts() {
    console.log('🔧 Starting migration: remove FK constraint on product_accounts.order_id...');

    // Disable FK checks during migration
    await db.run(sql`PRAGMA foreign_keys = OFF`);

    try {
        // Step 1: Rename old table
        console.log('   1️⃣  Renaming product_accounts -> product_accounts_old...');
        await db.run(sql`ALTER TABLE product_accounts RENAME TO product_accounts_old`);

        // Step 2: Create new table WITHOUT FK on order_id
        console.log('   2️⃣  Creating new product_accounts table (no FK on order_id)...');
        await db.run(sql`
            CREATE TABLE product_accounts (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id  INTEGER NOT NULL REFERENCES products(id),
                order_id    INTEGER,
                data        TEXT NOT NULL,
                status      TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','sold')),
                created_at  TEXT,
                updated_at  TEXT
            )
        `);

        // Step 3: Copy all data
        console.log('   3️⃣  Copying data from old table...');
        await db.run(sql`
            INSERT INTO product_accounts (id, product_id, order_id, data, status, created_at, updated_at)
            SELECT id, product_id, order_id, data, status, created_at, updated_at
            FROM product_accounts_old
        `);

        // Step 4: Drop old table
        console.log('   4️⃣  Dropping product_accounts_old...');
        await db.run(sql`DROP TABLE product_accounts_old`);

        // Step 5: Recreate indexes
        console.log('   5️⃣  Recreating indexes...');
        await db.run(sql`
            CREATE INDEX IF NOT EXISTS idx_product_accounts_product_status
            ON product_accounts (product_id, status)
        `);
        await db.run(sql`
            CREATE INDEX IF NOT EXISTS idx_product_accounts_order_id
            ON product_accounts (order_id)
        `);

        console.log('');
        console.log('✅ Migration completed successfully!');
        console.log('   FK constraint between product_accounts.order_id and orders has been removed.');
        console.log('   You can now delete product accounts regardless of order references.');

    } catch (err) {
        console.error('❌ Migration failed:', err);
        // Attempt rollback
        try {
            await db.run(sql`ALTER TABLE product_accounts_old RENAME TO product_accounts`);
            console.log('   ♻️  Rolled back: product_accounts_old restored as product_accounts');
        } catch (_) {
            // product_accounts_old may not exist if error was early
        }
        throw err;
    } finally {
        await db.run(sql`PRAGMA foreign_keys = ON`);
    }
}

removeFkOrderFromProductAccounts()
    .catch(console.error)
    .finally(() => process.exit(0));
