import 'dotenv/config';
import { createClient } from '@libsql/client';

async function main() {
    const client = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
    });

    try {
        // Check products 33 and 34 - image and description fields
        const products = await client.execute(
            'SELECT id, name, image, description FROM products WHERE id IN (33, 34)'
        );
        console.log('\n=== PRODUCTS ===');
        for (const p of products.rows) {
            console.log(`Product #${p.id}: ${p.name}`);
            console.log(`  image: ${p.image || '(NULL/EMPTY)'}`);
            console.log(`  description: ${p.description || '(NULL/EMPTY)'}`);
        }

        // Check product_images gallery
        const images = await client.execute(
            'SELECT product_id, url, sort_order FROM product_images WHERE product_id IN (33, 34) ORDER BY product_id, sort_order'
        );
        console.log('\n=== GALLERY IMAGES ===');
        if (images.rows.length === 0) {
            console.log('  No gallery images found for products 33, 34');
        }
        for (const img of images.rows) {
            console.log(`  Product #${img.product_id}: ${img.url} (order: ${img.sort_order})`);
        }
    } catch (error) {
        console.error('Error:', error);
    }
    process.exit(0);
}

main();
