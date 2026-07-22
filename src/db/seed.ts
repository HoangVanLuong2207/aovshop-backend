import 'dotenv/config';
import { db } from './index.js';

async function seed() {
    console.log('🌱 Seeding database...');

    // Admin is read from ENV at login time, not stored in DB
    console.log('ℹ️ Admin credentials are managed via ADMIN_EMAIL & ADMIN_PASSWORD env vars');

    console.log('✅ Database seeded!');
}

seed().catch(console.error);
