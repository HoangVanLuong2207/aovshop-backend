// Startup runs reviewed additive migrations, then starts the server.
import { execSync } from 'child_process';
import { createClient } from '@libsql/client';
import crypto from 'crypto';

async function main() {
    console.log('🚀 Starting AOVShop Backend...');

    // Check if database URL is configured
    if (!process.env.TURSO_DATABASE_URL) {
        console.error('❌ TURSO_DATABASE_URL is not set!');
        process.exit(1);
    }

    try {
        // Production startup only runs reviewed, additive migrations.
        // Never use drizzle-kit push here: schema diffing can delete populated tables.
        console.log('Applying additive security migration...');
        execSync('npx tsx src/db/migrate-security.ts', { stdio: 'inherit' });

        // Run push notification migration (adds VAPID keys if missing)
        console.log('🔔 Checking push notification settings...');
        execSync('npx tsx src/db/migrate-push.ts', { stdio: 'inherit' });
        console.log('✅ Push notification settings verified!');

        const client = createClient({
            url: process.env.TURSO_DATABASE_URL,
            authToken: process.env.TURSO_AUTH_TOKEN,
        });

        // ==================== AUTO-GENERATE JWT_SECRET ====================
        console.log('🔐 Checking JWT secret...');
        
        if (!process.env.JWT_SECRET) {
            // No ENV set — check DB for existing secret
            const jwtResult = await client.execute({
                sql: "SELECT value FROM settings WHERE key = 'jwt_secret'",
                args: [],
            });

            if (jwtResult.rows.length > 0 && jwtResult.rows[0].value) {
                // Found in DB — use it
                process.env.JWT_SECRET = jwtResult.rows[0].value;
                console.log('✅ JWT secret loaded from database.');
            } else {
                // Not in DB either — generate new one
                const newSecret = crypto.randomBytes(48).toString('base64url');
                await client.execute({
                    sql: "INSERT OR IGNORE INTO settings (key, value, description, updated_at) VALUES (?, ?, ?, ?)",
                    args: ['jwt_secret', newSecret, 'JWT Secret Key (tự động tạo)', new Date().toISOString()],
                });
                process.env.JWT_SECRET = newSecret;
                console.log('✅ JWT secret auto-generated and saved to database.');
            }
        } else {
            console.log('✅ JWT secret loaded from environment variable.');
        }

        // ==================== ENSURE BREVO SETTINGS KEYS EXIST ====================
        console.log('📧 Checking email settings...');

        const brevoSettings = [
            { key: 'brevo_api_key', value: '', description: 'Brevo API Key (để gửi email)' },
            { key: 'brevo_sender_email', value: '', description: 'Email người gửi (đã xác minh trên Brevo)' },
        ];

        for (const setting of brevoSettings) {
            try {
                await client.execute({
                    sql: "INSERT OR IGNORE INTO settings (key, value, description, updated_at) VALUES (?, ?, ?, ?)",
                    args: [setting.key, setting.value, setting.description, new Date().toISOString()],
                });
            } catch (err) {
                // Ignore — may already exist
            }
        }
        console.log('✅ Email settings verified!');

        // Start the server
        console.log('🌐 Starting server...');
        await import('./dist/index.js');

    } catch (error) {
        console.error('❌ Startup error:', error);
        // A missing/incompatible schema requires an explicit migration; never retry
        // with destructive schema synchronization or reseed an existing database.
        process.exit(1);
    }
}

main();
