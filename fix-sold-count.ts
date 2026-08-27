import 'dotenv/config';
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { sql } from 'drizzle-orm';

const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
});

const db = drizzle(client);

async function syncSoldCount() {
    try {
        console.log('Syncing sold_count based on actual sold accounts...');

        // Update sold_count for each product based on the number of sold accounts
        await db.run(sql`
            UPDATE products 
            SET sold_count = (
                SELECT COUNT(*) 
                FROM product_accounts 
                WHERE product_accounts.product_id = products.id 
                AND product_accounts.status = 'sold'
            )
        `);

        console.log('Sold count synced successfully!');

        // Show results
        const results = await db.all(sql`SELECT id, name, sold_count, stock FROM products`);
        console.log('Updated products:');
        console.table(results);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit(0);
    }
}

syncSoldCount();
