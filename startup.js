// Startup script - runs db migrations and seed, then starts server
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
        // Run database migrations (--force skips interactive prompts on Render)
        console.log('📦 Running database migrations...');
        execSync('npx drizzle-kit push --force', { stdio: 'inherit' });
        console.log('✅ Database migrations completed!');

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

        // ==================== SEED DATABASE ====================
        console.log('🌱 Checking if database needs seeding...');

        const result = await client.execute('SELECT COUNT(*) as count FROM users');
        const userCount = result.rows[0].count;

        if (userCount === 0) {
            console.log('🌱 Seeding database...');
            execSync('npx tsx src/db/seed.ts', { stdio: 'inherit' });
            console.log('✅ Database seeded!');
        } else {
            console.log('✅ Database already has data, skipping seed.');
        }

        // Start the server
        console.log('🌐 Starting server...');
        await import('./dist/index.js');

    } catch (error) {
        console.error('❌ Startup error:', error);
        // If db:push fails on first run (table doesn't exist), try anyway
        if (error.message?.includes('no such table')) {
            console.log('📦 First run detected, running migrations...');
            execSync('npx drizzle-kit push --force', { stdio: 'inherit' });
            execSync('npx tsx src/db/seed.ts', { stdio: 'inherit' });
            await import('./dist/index.js');
        } else {
            process.exit(1);
        }
    }
}

main();
