import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
dotenv.config();

const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function migrate() {
    console.log('[Migrate] Connecting to Turso database...');

    const settingsToAdd = [
        { key: 'telegram_enabled', value: 'false', description: 'Bật thông báo Telegram' },
        { key: 'telegram_bot_token', value: '', description: 'Telegram Bot Token' },
        { key: 'telegram_chat_id', value: '', description: 'Telegram Chat ID (ID người nhận)' }
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

    console.log('\n✅ Migration completed!');
    process.exit(0);
}

migrate().catch((err) => {
    console.error('Migration error:', err);
    process.exit(1);
});
