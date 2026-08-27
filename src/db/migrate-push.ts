import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import webpush from 'web-push';
dotenv.config();

const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function migrate() {
    console.log('[Migrate] Connecting to Turso database...');

    // 1. Create push_subscriptions table
    try {
        await client.execute(`
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER REFERENCES users(id),
                endpoint TEXT NOT NULL UNIQUE,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                user_agent TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            )
        `);
        console.log('✅ Created push_subscriptions table');
    } catch (err: any) {
        console.error('❌ Failed to create table:', err.message);
    }

    // 2. Generate and add VAPID keys if they don't exist
    const vapidKeys = webpush.generateVAPIDKeys();
    
    const settingsToAdd = [
        { key: 'push_enabled', value: 'true', description: 'Bật thông báo Web Push' },
        { key: 'vapid_public_key', value: vapidKeys.publicKey, description: 'VAPID Public Key' },
        { key: 'vapid_private_key', value: vapidKeys.privateKey, description: 'VAPID Private Key' },
        { key: 'vapid_subject', value: 'mailto:admin@example.com', description: 'VAPID Subject (Email)' }
    ];

    for (const setting of settingsToAdd) {
        try {
            await client.execute({
                sql: `INSERT OR IGNORE INTO settings (key, value, description, updated_at) VALUES (?, ?, ?, ?)`,
                args: [setting.key, setting.value, setting.description, new Date().toISOString()]
            });
            console.log(`✅ Added/Checked setting: ${setting.key}`);
        } catch (err: any) {
            console.error(`❌ Failed to add setting ${setting.key}:`, err.message);
        }
    }

    console.log('\n✅ Web Push migration completed!');
    process.exit(0);
}

migrate().catch((err) => {
    console.error('Migration error:', err);
    process.exit(1);
});
