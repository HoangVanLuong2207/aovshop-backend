import 'dotenv/config';
import dotenv from 'dotenv';
import { sql } from 'drizzle-orm';

dotenv.config({ path: '.env.local', override: true });

async function migrateGoogleAuth() {
    const { db } = await import('./index.js');
    const columns = await db.all(sql`PRAGMA table_info(users)`) as Array<{ name: string }>;
    if (!columns.some((column) => column.name === 'google_id')) {
        await db.run(sql`ALTER TABLE users ADD COLUMN google_id TEXT`);
        console.log('Added users.google_id');
    }
    await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_unique ON users (google_id)`);
    console.log('Google authentication migration complete');
}

migrateGoogleAuth().catch((error) => {
    console.error('Google authentication migration failed:', error);
    process.exitCode = 1;
});
