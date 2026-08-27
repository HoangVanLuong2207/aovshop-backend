import 'dotenv/config';
import { createClient } from '@libsql/client';

async function main() {
    console.log('Connecting to database:', process.env.TURSO_DATABASE_URL);
    const client = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
    });

    try {
        const countRes = await client.execute('SELECT COUNT(*) as count FROM product_accounts');
        console.log('Total product_accounts rows:', countRes.rows[0].count);

        const statusRes = await client.execute('SELECT status, COUNT(*) as count FROM product_accounts GROUP BY status');
        console.log('Status counts:', statusRes.rows);

        const productsRes = await client.execute('SELECT id, name, stock FROM products');
        console.log('Products stock list:', productsRes.rows);

    } catch (error) {
        console.error('Error querying database:', error);
    }
    process.exit(0);
}

main();
