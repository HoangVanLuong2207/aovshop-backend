import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

dotenv.config();

const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function migrate() {
    try {
        await client.execute('ALTER TABLE products ADD COLUMN checkpass_hours INTEGER DEFAULT NULL');
        console.log('Added checkpass_hours column to products table');
    } catch (error: any) {
        if (error.message?.includes('duplicate column')) {
            console.log('checkpass_hours already exists, skipping');
            return;
        }
        throw error;
    }
}

migrate()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Migration error:', error);
        process.exit(1);
    });
