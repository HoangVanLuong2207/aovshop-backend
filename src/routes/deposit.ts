import { Router } from 'express';
import crypto from 'crypto';
import { db } from '../db/index.js';
import { settings, deposits, users, transactions, paymentAccounts } from '../db/schema.js';
import { eq, and, lt, sql } from 'drizzle-orm';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Get active payment accounts (banks)
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
        res.json(banks);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Cleanup expired deposits (pending > 2 hours)
export const cleanupExpiredDeposits = async () => {
    try {
        // Calculate timestamp 2 hours ago
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

        // Update all pending deposits older than 2 hours to expired
        const result = await db.update(deposits)
            .set({
                status: 'expired',
                updatedAt: new Date().toISOString()
            })
            .where(
                and(
                    eq(deposits.status, 'pending'),
                    lt(deposits.createdAt, twoHoursAgo)
                )
            )
            .returning({ id: deposits.id });

        const count = result.length;
        if (count > 0) {
            console.log(`[Cleanup] Marked ${count} expired deposit(s)`);
        }
        return count;
    } catch (error) {
        console.error('[Cleanup] Error:', error);
        return 0;
    }
};

// Public cleanup endpoint for external cron
router.get('/cleanup', async (req, res) => {
    const count = await cleanupExpiredDeposits();
    res.json({ success: true, expired_count: count });
});

// Public endpoint - Get shop info (name, logo, banner) - no auth required
router.get('/shop-info', async (req, res) => {
    try {
        const shopName = await db.query.settings.findFirst({
            where: eq(settings.key, 'shop_name'),
        });
        const shopLogo = await db.query.settings.findFirst({
            where: eq(settings.key, 'shop_logo'),
        });
        const shopBanner = await db.query.settings.findFirst({
            where: eq(settings.key, 'shop_banner'),
        });

        res.json({
            shop_name: shopName?.value || 'AOV Shop',
            shop_logo: shopLogo?.value || '',
            shop_banner: shopBanner?.value || '',
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Public endpoint - Get bank info for payment (no auth required)
router.get('/bank-info', async (req, res) => {
    try {
        const bankAccount = await db.query.settings.findFirst({
            where: eq(settings.key, 'sepay_bank_account'),
        });
        const bankName = await db.query.settings.findFirst({
            where: eq(settings.key, 'sepay_bank_name'),
        });
        const accountName = await db.query.settings.findFirst({
            where: eq(settings.key, 'sepay_account_name'),
        });

        if (!bankAccount?.value) {
            return res.status(404).json({ message: 'Chưa cấu hình thông tin ngân hàng' });
        }

        res.json({
            sepay_bank_account: bankAccount.value,
            sepay_bank_name: bankName?.value || 'MB',
            sepay_account_name: accountName?.value || 'AOVSHOP',
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Get SePay payment info for deposit
router.post('/create', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { amount } = req.body;

        if (!amount || amount < 10000) {
            return res.status(400).json({ message: 'Số tiền nạp tối thiểu 10,000đ' });
        }

        // Get SePay settings
        const merchantId = await db.query.settings.findFirst({
            where: eq(settings.key, 'sepay_merchant_id'),
        });
        const bankAccount = await db.query.settings.findFirst({
            where: eq(settings.key, 'sepay_bank_account'),
        });
        const bankName = await db.query.settings.findFirst({
            where: eq(settings.key, 'sepay_bank_name'),
        });
        const accountName = await db.query.settings.findFirst({
            where: eq(settings.key, 'sepay_account_name'),
        });


        if (!merchantId?.value || !bankAccount?.value) {
            return res.status(500).json({ message: 'Hệ thống thanh toán chưa được cấu hình' });
        }

        // Generate transfer content: NAP + DDMMYYHHMMSS + U + UserID
        const now = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const timestamp = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear().toString().slice(-2)}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const transferContent = `NAP${timestamp}U${req.user!.id}`;

        // Create pending deposit (ID is auto-generated by database)
        const [deposit] = await db.insert(deposits).values({
            userId: req.user!.id,
            amount: parseFloat(amount),
            status: 'pending',
            reference: transferContent, // Store the transfer content as reference
        }).returning();

        // Return payment info (order_code = deposit.id)
        res.json({
            deposit,
            payment_info: {
                bank_name: bankName?.value || 'Ngân hàng',
                account_number: bankAccount.value,
                account_name: accountName?.value || 'AOV SHOP',
                amount: parseFloat(amount),
                order_code: deposit.id, // Auto ID from database
                content: transferContent,
                qr_url: `https://img.vietqr.io/image/${bankName?.value || 'MB'}-${bankAccount.value}-compact2.png?amount=${amount}&addInfo=${transferContent}&accountName=${encodeURIComponent(accountName?.value || 'AOVSHOP')}`,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// SePay Webhook - called when payment is confirmed
// Nội dung chuyển khoản = OrderCode_UserID (ví dụ: NAP123456_1)
router.post('/webhook', async (req, res) => {
    try {
        console.log('Webhook received:', JSON.stringify(req.body));

        const {
            content,
            transferAmount,
            id: transactionId,
            gateway,
        } = req.body;

        // Get Webhook Secret Key (Individual or Global)
        let webhookSecretKey = '';
        
        // 1. Try to find individual secret key for this bank (gateway)
        if (gateway) {
            const bankAccount = await db.query.paymentAccounts.findFirst({
                where: and(eq(paymentAccounts.bankName, gateway), eq(paymentAccounts.isActive, true)),
            });
            if (bankAccount?.secretKey) {
                webhookSecretKey = bankAccount.secretKey;
            }
        }

        // 2. If not found, use global secret key
        if (!webhookSecretKey) {
            const secretKeySetting = await db.query.settings.findFirst({
                where: eq(settings.key, 'sepay_secret_key'),
            });
            webhookSecretKey = secretKeySetting?.value || '';
        }

        // Verify Authorization header
        if (webhookSecretKey) {
            const authHeader = req.headers['authorization'] || req.headers['Authorization'];
            const expectedAuth = `Apikey ${webhookSecretKey}`;

            if (authHeader !== expectedAuth) {
                console.log('Invalid authorization for gateway:', gateway);
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }
        } else {
            console.warn('⚠️ WARNING: No Secret Key found for gateway:', gateway);
        }

        if (!content || !transferAmount || !transactionId) {
            return res.json({ success: false, message: 'Missing required fields' });
        }

        // Parse content format: NAP301224111342U1 (OrderCode U UserID)
        const match = content.match(/NAP(\d+)U(\d+)/i);
        if (!match) {
            console.log('Invalid content format:', content);
            return res.json({ success: false, message: 'Invalid content format' });
        }

        const userId = parseInt(match[2]);
        const amount = parseFloat(transferAmount) || 0;

        if (amount <= 0) {
            return res.json({ success: false, message: 'Invalid amount' });
        }

        // Execute everything in a transaction to prevent race conditions and inconsistency
        const result = await db.transaction(async (tx) => {
            // 1. Check for duplicate transaction (Replay Attack protection)
            const existingTx = await tx.query.transactions.findFirst({
                where: eq(transactions.reference, transactionId.toString()),
            });

            if (existingTx) {
                console.log('Duplicate transaction detected:', transactionId);
                return { success: false, message: 'Transaction already processed', duplicate: true };
            }

            // 2. Find user
            const user = await tx.query.users.findFirst({
                where: eq(users.id, userId),
            });

            if (!user) {
                return { success: false, message: 'User not found' };
            }

            // 3. Update user balance
            const currentBalance = user.balance || 0;
            const newBalance = currentBalance + amount;

            await tx.update(users)
                .set({ balance: newBalance })
                .where(eq(users.id, user.id));

            // 4. Update deposit status if found
            const deposit = await tx.query.deposits.findFirst({
                where: and(eq(deposits.reference, match[0]), eq(deposits.status, 'pending')),
            });

            if (deposit) {
                await tx.update(deposits)
                    .set({ status: 'completed' })
                    .where(eq(deposits.id, deposit.id));
            }

            // 5. Create transaction record
            await tx.insert(transactions).values({
                userId: user.id,
                type: 'deposit',
                amount: amount,
                balanceBefore: currentBalance,
                balanceAfter: newBalance,
                status: 'completed',
                description: `Nạp tiền tự động qua ${gateway || 'SePay'}`,
                reference: transactionId.toString(),
            });

            return { success: true, userId, amount, newBalance };
        });

        if (result.duplicate) {
            return res.json({ success: true, message: 'Already processed' }); // Return 200 to gateway
        }

        if (!result.success) {
            return res.json(result);
        }

        console.log('Deposit completed for user:', userId, 'Amount:', amount, 'New balance:', result.newBalance);
        res.json(result);

    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Check deposit status
router.get('/status/:reference', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const deposit = await db.query.deposits.findFirst({
            where: and(
                eq(deposits.reference, req.params.reference),
                eq(deposits.userId, req.user!.id)
            ),
        });

        if (!deposit) {
            return res.status(404).json({ message: 'Không tìm thấy giao dịch' });
        }

        res.json(deposit);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Get deposit history
router.get('/history', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const userDeposits = await db.query.deposits.findMany({
            where: eq(deposits.userId, req.user!.id),
            orderBy: (deposits, { desc }) => [desc(deposits.id)],
        });

        res.json(userDeposits);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Get user transactions (for frontend compatibility)
router.get('/transactions', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const userTransactions = await db.query.transactions.findMany({
            where: eq(transactions.userId, req.user!.id),
            orderBy: (transactions, { desc }) => [desc(transactions.id)],
        });

        res.json({ data: userTransactions });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Get balance
router.get('/balance', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const user = await db.query.users.findFirst({
            where: eq(users.id, req.user!.id),
        });

        res.json({ balance: user?.balance || 0 });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

export default router;
