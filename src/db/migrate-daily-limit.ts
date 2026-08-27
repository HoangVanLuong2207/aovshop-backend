import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
dotenv.config();

const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function migrate() {
    console.log('[Migrate] Adding daily_buy_limit column to products table...');

    try {
        await client.execute(`
            ALTER TABLE products ADD COLUMN daily_buy_limit INTEGER DEFAULT NULL
        `);
        console.log('✅ Added daily_buy_limit column to products table');
    } catch (err: any) {
        if (err.message?.includes('duplicate column')) {
            console.log('ℹ️  Column daily_buy_limit already exists, skipping...');
        } else {
            console.error('❌ Failed to add column:', err.message);
        }
    }

    console.log('\n✅ Daily buy limit migration completed!');
    process.exit(0);
}

migrate().catch((err) => {
    console.error('Migration error:', err);
    process.exit(1);
});
