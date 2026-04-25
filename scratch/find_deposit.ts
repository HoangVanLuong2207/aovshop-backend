import dotenv from 'dotenv';
dotenv.config();

async function run() {
    try {
        const { db } = await import('../src/db/index.js');
        const { deposits } = await import('../src/db/schema.js');
        const { eq } = await import('drizzle-orm');

        const d = await db.query.deposits.findFirst({
            where: eq(deposits.reference, 'NAP250426123518U1')
        });
        if (d) {
            console.log('FOUND:', JSON.stringify(d));
        } else {
            console.log('NOT_FOUND');
        }
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
}

run();
