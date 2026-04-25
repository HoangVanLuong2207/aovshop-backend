import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
dotenv.config();

const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function migrate() {
    console.log('[Migrate] Connecting to Turso database...');

    const sql = `ALTER TABLE products ADD COLUMN preorder_placeholder TEXT`;

    try {
        await client.execute(sql);
        console.log(`✅ Added column products.preorder_placeholder`);
    } catch (err: any) {
        if (err.message?.includes('duplicate column') || err.message?.includes('already exists')) {
            console.log(`⏭️  Column products.preorder_placeholder already exists, skipping.`);
        } else {
            console.error(`❌ Failed to alter products.preorder_placeholder:`, err.message);
        }
    }

    console.log('\n✅ Migration completed!');
    process.exit(0);
}

migrate().catch((err) => {
    console.error('Migration error:', err);
    process.exit(1);
});
