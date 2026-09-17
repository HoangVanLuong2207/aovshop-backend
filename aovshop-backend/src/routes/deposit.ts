import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { db } from '../db/index.js';
import { settings, deposits, users, transactions, paymentAccounts, paymentWebhookEvents } from '../db/schema.js';
import { eq, and, lt, sql, inArray } from 'drizzle-orm';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth.js';
import { PushService } from '../services/push.js';
import { TelegramService } from '../services/telegram.js';

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
            .map((bank) => ({ ...bank, currentMonthCount: countsByBankId.get(bank.id) || 0 }));

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

router.get('/cleanup', authMiddleware, adminMiddleware, async (req, res) => {
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
        if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 10000 || amount > 1000000000) {
            return res.status(400).json({ message: 'Số tiền nạp tối thiểu là 10.000đ' });
        }

        const userId = req.user!.id;

        // Auto-select a bank that hasn't reached the 50 orders/month limit
        const allActiveBanks = await db.query.paymentAccounts.findMany({
            where: eq(paymentAccounts.isActive, true),
        });

        const countsByBankId = await getCurrentMonthDepositCountsByBank(allActiveBanks.map((b) => b.id));
        
        const banksWithStats = allActiveBanks.map(bank => {
            const count = countsByBankId.get(bank.id) || 0;
            return {
                ...bank,
                count,
                cycle: Math.floor(count / 50)
            };
        });

        banksWithStats.sort((a, b) => {
            if (a.cycle !== b.cycle) return a.cycle - b.cycle;
            return a.count - b.count;
        });

        const selectedBank = banksWithStats.length > 0 ? banksWithStats[0] : null;

        if (!selectedBank) {
            return res.status(503).json({ message: 'Không có cổng thanh toán nào hoạt động.' });
        }

        // Generate transfer content: NAP + timestamp + U + UserID
        const now = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const timestamp = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear().toString().slice(-2)}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const reference = `NAP${timestamp}${randomBytes(8).toString('hex')}U${userId}`;

        const [newDeposit] = await db.insert(deposits).values({
            userId,
            amount,
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
        const { content, transferAmount, id: transactionId, gateway, transferType, accountNumber } = req.body;
        const amount = typeof transferAmount === 'number' ? transferAmount : NaN;
        if (typeof content !== 'string' || content.length > 2000 ||
            !Number.isSafeInteger(amount) || amount <= 0 || amount > 1000000000 ||
            !(typeof transactionId === 'string' && /^[0-9]{1,64}$/.test(transactionId) ||
              typeof transactionId === 'number' && Number.isSafeInteger(transactionId) && transactionId > 0) ||
            typeof accountNumber !== 'string' || transferType !== 'in') {
            return res.status(400).json({ success: false, message: 'Invalid payment event' });
        }
        const match = content.match(/\bNAP([a-f0-9]+)U(\d+)\b/i);
        if (!match) return res.status(400).json({ success: false, message: 'Invalid content' });
        const reference = match[0].toUpperCase();
        const pending = await db.query.deposits.findFirst({
            where: sql`upper(${deposits.reference}) = ${reference}`,
            with: { bank: true },
        });
        if (!pending?.bank?.isActive || pending.bank.accountNumber !== accountNumber) {
            return res.status(400).json({ success: false, message: 'Payment does not match a deposit' });
        }
        const globalKey = pending.bank.secretKey ? null : await db.query.settings.findFirst({ where: eq(settings.key, 'sepay_secret_key') });
        const secretKey = pending.bank.secretKey || globalKey?.value;
        if (!secretKey) return res.status(503).json({ success: false, message: 'Webhook authentication is not configured' });
        const expected = Buffer.from(`Apikey ${secretKey}`);
        const supplied = Buffer.from(req.get('authorization') || '');
        if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const userId = pending.userId;
        const eventId = `sepay:${transactionId}`;
        const result = await db.transaction(async (tx) => {
            const existing = await tx.query.paymentWebhookEvents.findFirst({ where: eq(paymentWebhookEvents.id, eventId) });
            if (existing) return existing.depositId === pending.id ? { duplicate: true } : { error: 'Event already used' };
            // Preserve replay protection for events recorded before this patch.
            const legacy = await tx.query.transactions.findFirst({ where: eq(transactions.reference, String(transactionId)) });
            if (legacy) return { error: 'Event already processed' };
            const deposit = await tx.query.deposits.findFirst({ where: eq(deposits.id, pending.id) });
            if (!deposit || deposit.status !== 'pending' || deposit.amount !== amount ||
                deposit.bankId !== pending.bankId || !deposit.createdAt ||
                Date.parse(deposit.createdAt) < Date.now() - 2 * 60 * 60 * 1000) {
                return { error: 'Deposit is unavailable or amount does not match' };
            }
            const user = await tx.query.users.findFirst({ where: eq(users.id, userId) });
            if (!user || !Number.isSafeInteger(user.balance + amount)) return { error: 'Invalid balance' };
            const claimed = await tx.update(deposits)
                .set({ status: 'completed', transactionId: String(transactionId), updatedAt: new Date().toISOString() })
                .where(and(eq(deposits.id, deposit.id), eq(deposits.status, 'pending')))
                .returning({ id: deposits.id });
            if (claimed.length !== 1) throw new Error('Deposit changed during processing');
            await tx.insert(paymentWebhookEvents).values({ id: eventId, depositId: deposit.id });
            await tx.update(users).set({ balance: sql`${users.balance} + ${amount}` }).where(eq(users.id, userId));
            await tx.insert(transactions).values({
                userId, type: 'deposit', amount, balanceBefore: user.balance,
                balanceAfter: user.balance + amount, status: 'completed',
                description: 'Nạp tiền tự động qua SePay', reference: String(transactionId),
            });
            return { success: true };
        });
        if (result.duplicate) return res.json({ success: true, message: 'Already processed' });
        if (result.error) return res.status(400).json({ success: false, message: result.error });

        // Notify Admin
        try {
            const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
            const deposit = await db.query.deposits.findFirst({ where: eq(deposits.id, pending.id) });
            
            if (user && deposit) {
                const formattedAmount = new Intl.NumberFormat('vi-VN').format(deposit.amount);
                const escapedUserName = TelegramService.escapeHtml(user.name);

                // 1. Web Push Notification
                try {
                    await PushService.notifyAdmin({
                        title: '💰 Tiền về! Tiền về!',
                        body: `${user.name} vừa nạp ${formattedAmount}đ`,
                        icon: '/logo.png',
                        data: { url: `/admin/transactions` }
                    });
                } catch (err) {
                    console.error('[Push Notify Error]:', err);
                }

                // 2. Telegram Notification
                try {
                    const telegramMsg = `💰 <b>TIỀN VỀ!</b>\n\n👤 Khách hàng: <b>${escapedUserName}</b>\n💵 Số tiền nạp: <b>${formattedAmount}đ</b>\n🔗 Xem chi tiết trên trang Admin.`;
                    await TelegramService.sendMessage(telegramMsg);
                } catch (err) {
                    console.error('[Telegram Notify Error]:', err);
                }
            }
        } catch (err) {
            console.error('[Notification Fetch Error]:', err);
        }

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
            with: { bank: { columns: {
                id: true, bankName: true, accountNumber: true, accountName: true,
                description: true, image: true,
            } } },
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
