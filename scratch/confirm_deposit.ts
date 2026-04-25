import dotenv from 'dotenv';
dotenv.config();

async function run() {
    try {
        const { db } = await import('../src/db/index.js');
        const { deposits, users, transactions } = await import('../src/db/schema.js');
        const { eq, and } = await import('drizzle-orm');

        const content = 'NAP250426123518U1';
        const transferAmount = 30000;
        const transactionId = 'SIMULATED_20260425_MANUAL';
        const gateway = 'Manual';

        const match = content.match(/NAP(\d+)U(\d+)/i);
        if (!match) {
            console.error('Invalid content');
            process.exit(1);
        }

        const userId = parseInt(match[2]);
        const amount = parseFloat(transferAmount.toString());

        console.log(`Processing userId: ${userId}, amount: ${amount}`);

        const result = await db.transaction(async (tx) => {
            const existing = await tx.query.transactions.findFirst({ where: eq(transactions.reference, transactionId) });
            if (existing) return { duplicate: true };

            const user = await tx.query.users.findFirst({ where: eq(users.id, userId) });
            if (!user) return { error: 'User not found' };

            const currentBalance = user.balance || 0;
            const newBalance = currentBalance + amount;

            await tx.update(users).set({ balance: newBalance }).where(eq(users.id, userId));
            
            const deposit = await tx.query.deposits.findFirst({
                where: and(eq(deposits.reference, match[0]), eq(deposits.status, 'pending'))
            });

            if (deposit) {
                await tx.update(deposits).set({ status: 'completed' }).where(eq(deposits.id, deposit.id));
                console.log(`Updated deposit ${deposit.id} to completed`);
            } else {
                console.log('Deposit record not found or already completed');
            }

            await tx.insert(transactions).values({
                userId,
                type: 'deposit',
                amount,
                balanceBefore: currentBalance,
                balanceAfter: newBalance,
                status: 'completed',
                description: `Nạp tiền thủ công qua hệ thống`,
                reference: transactionId,
            });

            return { success: true };
        });

        console.log('Result:', result);
    } catch (err) {
        console.error('ERROR:', err);
    }
    process.exit(0);
}

run();
