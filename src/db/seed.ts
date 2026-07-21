import 'dotenv/config';
import { db } from './index.js';
import { users, categories, products, promotions } from './schema.js';
import bcrypt from 'bcryptjs';

async function seed() {
    console.log('🌱 Seeding database...');

    // Read admin credentials from ENV (with defaults)
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@aovshop.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    // Create admin user
    const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);
    await db.insert(users).values({
        name: 'Admin',
        email: adminEmail,
        password: hashedAdminPassword,
        role: 'admin',
        balance: 0,
    }).onConflictDoNothing();

    console.log(`✅ Database seeded! Admin: ${adminEmail}`);
}

seed().catch(console.error);
