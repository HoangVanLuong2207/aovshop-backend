import 'dotenv/config';
import { db } from './index.js';
import { users, categories, products, promotions } from './schema.js';
import bcrypt from 'bcryptjs';

async function seed() {
    console.log('🌱 Seeding database...');

    // Create admin user
    const hashedAdminPassword = await bcrypt.hash('admin123', 10);
    await db.insert(users).values({
        name: 'Admin',
        email: 'admin@aovshop.com',
        password: hashedAdminPassword,
        role: 'admin',
        balance: 0,
    }).onConflictDoNothing();

    console.log('✅ Database seeded successfully!');
}

seed().catch(console.error);
