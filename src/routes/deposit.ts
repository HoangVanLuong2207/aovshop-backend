import { Router } from 'express';
import { db } from '../db/index.js';
import { settings, deposits, users, transactions, paymentAccounts } from '../db/schema.js';
import { eq, and, lt, sql, inArray } from 'drizzle-orm';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

const getCurrentMonthDepositCountsByBank = async (bankIds: number[]) => {
    if (bankIds.length === 0) return new Map<number, number>();

    const rows = await db.select({
        bankId: deposits.bankId,
        count: sql<number>`count(*)`,
    })
        .from(deposits)
        .where(and(
            inArray(deposits.bankId, bankIds),
            eq(deposits.status, 'completed'),
            sql`strftime('%m', ${deposits.createdAt}) = strftime('%m', 'now')`,
            sql`strftime('%Y', ${deposits.createdAt}) = strftime('%Y', 'now')`
        ))
        .groupBy(deposits.bankId);

    return new Map<number, number>(
        rows
            .filter((row) => row.bankId !== null)
            .map((row) => [row.bankId as number, row.count || 0])
    );
};

// Get active payment accounts with usage check (for month reach 50 orders)
router.get('/banks', async (req, res) => {
    try {
        const banks = await db.query.paymentAccounts.findMany({
            where: eq(paymentAccounts.isActive, true),
            columns: {
                id: true,
                bankName: true,
                accountNumber: true,
                accountName: true,
                description: true,
                image: true,
            }
        });

        // Count once for all active banks instead of N queries.
        const countsByBankId = await getCurrentMonthDepositCountsByBank(banks.map((b) => b.id));
        const availableBanks = banks
            .map((bank) => ({ ...bank, currentMonthCount: countsByBankId.get(bank.id) || 0 }))
            .filter((bank) => bank.currentMonthCount < 50);

        res.json(availableBanks);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Cleanup expired deposits (pending > 2 hours)
export const cleanupExpiredDeposits = async () => {
    try {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        const result = await db.update(deposits)
            .set({ status: 'expired', updatedAt: new Date().toISOString() })
            .where(and(eq(deposits.status, 'pending'), lt(deposits.createdAt, twoHoursAgo)))
            .returning({ id: deposits.id });
        return result.length;
    } catch (error) {
        console.error('[Cleanup] Error:', error);
        return 0;
    }
};

router.get('/cleanup', async (req, res) => {
    const count = await cleanupExpiredDeposits();
    res.json({ success: true, expired_count: count });
});

router.get('/shop-info', async (req, res) => {
    try {
        const s = await db.query.settings.findMany();
        const config = Object.fromEntries(s.map(x => [x.key, x.value]));
        res.json({
            shop_name: config.shop_name || 'AOV Shop',
            shop_logo: config.shop_logo || '',
            shop_banner: config.shop_banner || '',
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Create deposit with AUTO-ROTATION logic
router.post('/create', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { amount } = req.body;
        if (!amount || amount < 10000) {
            return res.status(400).json({ message: 'Số tiền nạp tối thiểu là 10.000đ' });
        }

        const userId = req.user!.id;

        // Auto-select a bank that hasn't reached the 50 orders/month limit
        const allActiveBanks = await db.query.paymentAccounts.findMany({
            where: eq(paymentAccounts.isActive, true),
        });

        const countsByBankId = await getCurrentMonthDepositCountsByBank(allActiveBanks.map((b) => b.id));
        const selectedBank = allActiveBanks.find((bank) => (countsByBankId.get(bank.id) || 0) < 50) || null;

        if (!selectedBank) {
            return res.status(503).json({ message: 'Hiện tại các cổng nạp đều đạt giới hạn đơn trong tháng, vui lòng liên hệ Admin.' });
        }

        // Generate transfer content: NAP + timestamp + U + UserID
        const now = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const timestamp = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear().toString().slice(-2)}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const reference = `NAP${timestamp}U${userId}`;

        const [newDeposit] = await db.insert(deposits).values({
            userId,
            amount: parseFloat(amount),
            reference,
            bankId: selectedBank.id,
            status: 'pending',
        }).returning();

        res.json({
            ...newDeposit,
            bank_name: selectedBank.bankName,
            account_number: selectedBank.accountNumber,
            account_name: selectedBank.accountName,
            qr_url: `https://img.vietqr.io/image/${selectedBank.bankName}-${selectedBank.accountNumber}-compact2.png?amount=${amount}&addInfo=${reference}&accountName=${encodeURIComponent(selectedBank.accountName)}`,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Webhook with individual Secret Key verification
router.post('/webhook', async (req, res) => {
    try {
        const { content, transferAmount, id: transactionId, gateway } = req.body;
        if (!content || !transferAmount || !transactionId) {
            return res.json({ success: false, message: 'Missing fields' });
        }

        // Verify Secret Key
        let secretKey = '';
        if (gateway) {
            const bank = await db.query.paymentAccounts.findFirst({
                where: and(eq(paymentAccounts.bankName, gateway), eq(paymentAccounts.isActive, true)),
            });
            secretKey = bank?.secretKey || '';
        }

        if (!secretKey) {
            const globalKey = await db.query.settings.findFirst({ where: eq(settings.key, 'sepay_secret_key') });
            secretKey = globalKey?.value || '';
        }

        if (secretKey) {
            const auth = req.headers['authorization'] || req.headers['Authorization'];
            if (auth !== `Apikey ${secretKey}`) {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }
        }

        const match = content.match(/NAP(\d+)U(\d+)/i);
        if (!match) return res.json({ success: false, message: 'Invalid content' });

        const userId = parseInt(match[2]);
        const amount = parseFloat(transferAmount);

        const result = await db.transaction(async (tx) => {
            const existing = await tx.query.transactions.findFirst({ where: eq(transactions.reference, transactionId.toString()) });
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
            }

            await tx.insert(transactions).values({
                userId,
                type: 'deposit',
                amount,
                balanceBefore: currentBalance,
                balanceAfter: newBalance,
                status: 'completed',
                description: `Nạp tiền tự động qua ${gateway || 'SePay'}`,
                reference: transactionId.toString(),
            });

            return { success: true };
        });

        if (result.duplicate) return res.json({ success: true, message: 'Already processed' });
        if (result.error) return res.json({ success: false, message: result.error });

        res.json({ success: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ success: false });
    }
});

router.get('/status/:reference', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const deposit = await db.query.deposits.findFirst({
            where: and(eq(deposits.reference, req.params.reference), eq(deposits.userId, req.user!.id)),
        });
        res.json(deposit || { status: 'not_found' });
    } catch (error) {
        res.status(500).json({ message: 'Error' });
    }
});

router.get('/history', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const data = await db.query.deposits.findMany({
            where: eq(deposits.userId, req.user!.id),
            with: { bank: true },
            orderBy: (d, { desc }) => [desc(d.id)],
        });
        res.json(data);
    } catch (error) {
        res.status(500).json({ message: 'Error' });
    }
});

router.get('/balance', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const user = await db.query.users.findFirst({ where: eq(users.id, req.user!.id) });
        res.json({ balance: user?.balance || 0 });
    } catch (error) {
        res.status(500).json({ message: 'Error' });
    }
});

export default router;
