import 'dotenv/config';
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import * as schema from './schema.js';

const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
});

const db = drizzle(client, { schema });

async function migrateFreshAndSeed() {
    console.log('🗑️  Truncating all tables...');

    // Disable foreign key checks
    await db.run(sql`PRAGMA foreign_keys = OFF`);

    // Delete all tables
    await db.run(sql`DELETE FROM product_accounts`);
    await db.run(sql`DELETE FROM order_items`);
    await db.run(sql`DELETE FROM transactions`);
    await db.run(sql`DELETE FROM deposits`);
    await db.run(sql`DELETE FROM orders`);
    await db.run(sql`DELETE FROM products`);
    await db.run(sql`DELETE FROM categories`);
    await db.run(sql`DELETE FROM promotions`);
    await db.run(sql`DELETE FROM settings`);
    await db.run(sql`DELETE FROM users`);

    // Reset auto-increment counters
    await db.run(sql`DELETE FROM sqlite_sequence`);

    // Re-enable foreign key checks
    await db.run(sql`PRAGMA foreign_keys = ON`);

    console.log('✅ All data cleared!');
    console.log('');
    console.log('🌱 Seeding database...');

    // Create admin user
    const hashedAdminPassword = await bcrypt.hash('admin123', 10);
    await db.insert(schema.users).values({
        name: 'Admin',
        email: 'admin@aovshop.com',
        password: hashedAdminPassword,
        role: 'admin',
        balance: 0,
    });
    console.log('   ✓ Created admin user (admin@aovshop.com / admin123)');

    // Create demo user
    const hashedUserPassword = await bcrypt.hash('user123', 10);
    await db.insert(schema.users).values({
        name: 'Demo User',
        email: 'user@demo.com',
        password: hashedUserPassword,
        role: 'user',
        balance: 500000,
    });
    console.log('   ✓ Created demo user (user@demo.com / user123) with 500,000đ balance');

    // Create categories
    const categoryData = [
        { name: 'Tài khoản VIP', description: 'Tài khoản có skin hiếm và tướng VIP', image: 'https://i.imgur.com/YqKmKzZ.png' },
        { name: 'Tài khoản Thường', description: 'Tài khoản phù hợp để bắt đầu', image: 'https://i.imgur.com/r5EYx3X.png' },
        { name: 'Nạp game', description: 'Dịch vụ nạp vàng, kim cương', image: 'https://i.imgur.com/VJfGdNT.png' },
    ];

    for (const cat of categoryData) {
        await db.insert(schema.categories).values(cat);
    }
    console.log('   ✓ Created 3 categories');

    // Create products
    const productData = [
        { categoryId: 1, name: 'ACC VIP Full Tướng', description: 'Full 115 tướng, 200+ skin, rank Kim Cương', price: 500000, salePrice: 450000, image: 'https://i.imgur.com/YqKmKzZ.png' },
        { categoryId: 1, name: 'ACC VIP Skin Hiếm', description: 'Có skin giới hạn SS1-SS5, nhiều skin sự kiện', price: 800000, salePrice: null, image: 'https://i.imgur.com/jR3WCKK.png' },
        { categoryId: 2, name: 'ACC Newbie 50 Tướng', description: '50 tướng, 30 skin, rank Bạc', price: 50000, salePrice: 39000, image: 'https://i.imgur.com/r5EYx3X.png' },
        { categoryId: 2, name: 'ACC Starter Pack', description: '20 tướng meta, 10 skin đẹp', price: 25000, salePrice: null, image: 'https://i.imgur.com/8fKJCcM.png' },
        { categoryId: 3, name: 'Nạp 100 Quân Huy', description: 'Nạp nhanh trong 5 phút', price: 20000, salePrice: null, image: 'https://i.imgur.com/VJfGdNT.png' },
        { categoryId: 3, name: 'Nạp 500 Quân Huy', description: 'Nạp nhanh + bonus 50 quân huy', price: 90000, salePrice: 85000, image: 'https://i.imgur.com/VJfGdNT.png' },
    ];

    for (const prod of productData) {
        const [inserted] = await db.insert(schema.products).values({
            ...prod,
            stock: 0,
            soldCount: 0,
        }).returning();

        // Add sample accounts for each product
        const accountCount = Math.floor(Math.random() * 5) + 3; // 3-7 accounts
        for (let i = 0; i < accountCount; i++) {
            await db.insert(schema.productAccounts).values({
                productId: inserted.id,
                data: `account${i + 1}@demo.com|password${i + 1}`,
                status: 'available',
            });
        }

        // Update stock
        await db.update(schema.products)
            .set({ stock: accountCount })
            .where(sql`id = ${inserted.id}`);
    }
    console.log('   ✓ Created 6 products with sample accounts');

    // Create promotions
    await db.insert(schema.promotions).values([
        { code: 'NEWUSER', name: 'Khách hàng mới', description: 'Giảm 10% cho đơn hàng đầu tiên', type: 'percent', value: 10, minOrder: 50000, maxDiscount: 50000 },
        { code: 'SAVE20K', name: 'Giảm 20k', description: 'Giảm 20.000đ cho đơn từ 100k', type: 'fixed', value: 20000, minOrder: 100000 },
    ]);
    console.log('   ✓ Created 2 promo codes (NEWUSER, SAVE20K)');

    // Create shop settings
    await db.insert(schema.settings).values([
        { key: 'shop_name', value: 'AOV Shop', description: 'Tên cửa hàng' },
        { key: 'notification_enabled', value: 'true', description: 'Bật thông báo' },
        { key: 'notification_type', value: 'info', description: 'Loại thông báo' },
        { key: 'notification_text', value: '🎉 Chào mừng đến AOV Shop! Nạp tiền ngay để nhận ưu đãi!', description: 'Nội dung thông báo' },
    ]);
    console.log('   ✓ Created shop settings');

    console.log('');
    console.log('✅ Database seeded successfully!');
    console.log('');
    console.log('📝 Login credentials:');
    console.log('   Admin: admin@aovshop.com / admin123');
    console.log('   User:  user@demo.com / user123');
}

migrateFreshAndSeed()
    .catch(console.error)
    .finally(() => process.exit(0));
