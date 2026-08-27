import { db } from '../src/db/index.js';
import { productAccounts } from '../src/db/schema.js';
import { sql } from 'drizzle-orm';

async function main() {
    try {
        const result = await db.select({ count: sql`count(*)` }).from(productAccounts);
        console.log('Total accounts in database:', result[0].count);
        
        const statusResult = await db.select({ 
            status: productAccounts.status, 
            count: sql`count(*)` 
        })
        .from(productAccounts)
        .groupBy(productAccounts.status);
        console.log('Status counts:', statusResult);
    } catch (e) {
        console.error('Error querying database:', e);
    }
    process.exit(0);
}

main();
