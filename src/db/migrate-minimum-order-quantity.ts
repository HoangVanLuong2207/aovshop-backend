import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

dotenv.config();

const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function migrate() {
    try {
        await client.execute('ALTER TABLE products ADD COLUMN minimum_order_quantity INTEGER DEFAULT NULL');
        console.log('Added minimum_order_quantity column to products table');
    } catch (error: any) {
        if (error.message?.includes('duplicate column')) {
            console.log('minimum_order_quantity already exists, skipping');
        } else {
            throw error;
        }
    }
}

migrate()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Migration error:', error);
        process.exit(1);
    });
