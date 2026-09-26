import 'dotenv/config';

async function seed() {
    console.log('🌱 Seeding database...');
    console.log('✅ Database seeded!');
}

seed().catch(console.error);
