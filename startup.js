// Startup script - runs db migrations and seed, then starts server
import { execSync } from 'child_process';
import { createClient } from '@libsql/client';

async function main() {
    console.log('🚀 Starting AOVShop Backend...');

    // Check if database URL is configured
    if (!process.env.TURSO_DATABASE_URL) {
        console.error('❌ TURSO_DATABASE_URL is not set!');
        process.exit(1);
    }

    try {
        // Run database migrations
        console.log('📦 Running database migrations...');
        execSync('npx drizzle-kit push', { stdio: 'inherit' });
        console.log('✅ Database migrations completed!');

        // Check if we need to seed
        console.log('🌱 Checking if database needs seeding...');
        const client = createClient({
            url: process.env.TURSO_DATABASE_URL,
            authToken: process.env.TURSO_AUTH_TOKEN,
        });

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
            execSync('npx drizzle-kit push', { stdio: 'inherit' });
            execSync('npx tsx src/db/seed.ts', { stdio: 'inherit' });
            await import('./dist/index.js');
        } else {
            process.exit(1);
        }
    }
}

main();
