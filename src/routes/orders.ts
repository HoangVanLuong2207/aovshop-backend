import { Router } from 'express';
import { db } from '../db/index.js';
import { orders, orderItems, products, users, transactions, promotions, productAccounts } from '../db/schema.js';
import { eq, desc, and, gte, lte, inArray, sql } from 'drizzle-orm';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Get user orders
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const perPage = 10;

        const allUserOrders = await db.query.orders.findMany({
            where: eq(orders.userId, req.user!.id),
        });

        const total = allUserOrders.length;
        const lastPage = Math.ceil(total / perPage);

        const userOrders = await db.query.orders.findMany({
            where: eq(orders.userId, req.user!.id),
            with: {
                items: true,
                accounts: true,
            },
            orderBy: desc(orders.id),
            limit: perPage,
            offset: (page - 1) * perPage,
        });

        // Map to snake_case for frontend compatibility
        const mappedOrders = (userOrders as any[]).map(order => ({
            id: order.id,
            status: order.status,
            subtotal: order.subtotal,
            discount: order.discount,
            total: order.total,
            promo_code: order.promoCode,
            note: order.note,
            created_at: order.createdAt,
            items: order.items.map((item: any) => ({
                id: item.id,
                product_name: item.productName,
                quantity: item.quantity,
                price: item.price,
                total: item.total
            })),
            accounts: order.accounts
        }));

        res.json({
            data: mappedOrders,
            current_page: page,
            last_page: lastPage,
            total: total
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Get single order
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const order = await db.query.orders.findFirst({
            where: and(
                eq(orders.id, parseInt(req.params.id)),
                eq(orders.userId, req.user!.id)
            ),
            with: {
                items: true,
                accounts: true,
            },
        });

        if (!order) {
            return res.status(404).json({ message: 'Đơn hàng không tồn tại' });
        }

        res.json(order);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Create order (checkout)
router.post('/checkout', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { items, promo_code, note } = req.body;

        // Get user
        const user = await db.query.users.findFirst({
            where: eq(users.id, req.user!.id),
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Calculate totals and verify account availability
        let subtotal = 0;
        const orderProducts = [];
        const allTargetAccounts: any[] = [];

        for (const item of items) {
            const product = await db.query.products.findFirst({
                where: eq(products.id, item.product_id),
            });

            if (!product) {
                return res.status(400).json({ message: `Sản phẩm không tồn tại` });
            }

            // Fetch available accounts for this product
            const availableAccounts = await db.query.productAccounts.findMany({
                where: and(
                    eq(productAccounts.productId, product.id),
                    eq(productAccounts.status, 'available')
                ),
                limit: item.quantity,
            });

            if (availableAccounts.length < item.quantity) {
                return res.status(400).json({ message: `${product.name} không đủ số lượng tài khoản trong kho (còn lại: ${availableAccounts.length})` });
            }

            const price = product.salePrice || product.price;
            const itemTotal = price * item.quantity;
            subtotal += itemTotal;

            orderProducts.push({
                product,
                quantity: item.quantity,
                price,
                total: itemTotal,
            });

            allTargetAccounts.push(...availableAccounts);
        }

        // Apply promotion
        let discount = 0;
        if (promo_code) {
            const promo = await db.query.promotions.findFirst({
                where: and(
                    eq(promotions.code, promo_code),
                    eq(promotions.active, true)
                ),
            });

            if (promo && subtotal >= (promo.minOrder || 0)) {
                if (promo.type === 'percent') {
                    discount = (subtotal * promo.value) / 100;
                    if (promo.maxDiscount && discount > promo.maxDiscount) {
                        discount = promo.maxDiscount;
                    }
                } else {
                    discount = promo.value;
                }

                // Update promo usage
                await db.update(promotions)
                    .set({ usedCount: (promo.usedCount || 0) + 1 })
                    .where(eq(promotions.id, promo.id));
            }
        }

        const total = subtotal - discount;

        // Check balance
        if (user.balance < total) {
            return res.status(400).json({ message: 'Số dư không đủ' });
        }

        // Create order
        const [order] = await db.insert(orders).values({
            userId: user.id,
            status: 'completed',
            subtotal,
            discount,
            total,
            promoCode: promo_code || null,
            note: note || null,
        }).returning();

        // Create order items, link accounts, and update stock
        for (const item of orderProducts) {
            await db.insert(orderItems).values({
                orderId: order.id,
                productId: item.product.id,
                productName: item.product.name,
                quantity: item.quantity,
                price: item.price,
                total: item.total,
            });

            // Get accounts belonging to THIS product from our collected list
            const productAccountsToLink = allTargetAccounts
                .filter(acc => acc.productId === item.product.id)
                .slice(0, item.quantity);

            if (productAccountsToLink.length > 0) {
                const accountIds = productAccountsToLink.map(acc => acc.id);

                // Link accounts to order and mark as sold
                await db.update(productAccounts)
                    .set({
                        orderId: order.id,
                        status: 'sold'
                    })
                    .where(inArray(productAccounts.id, accountIds));
            }

            // Update stock (count of available accounts remaining)
            const remainingCount = await db.select({ count: sql`count(*)` })
                .from(productAccounts)
                .where(and(
                    eq(productAccounts.productId, item.product.id),
                    eq(productAccounts.status, 'available')
                ));

            await db.update(products)
                .set({
                    stock: Number(remainingCount[0]?.count || 0),
                    soldCount: sql`${products.soldCount} + ${item.quantity}`
                })
                .where(eq(products.id, item.product.id));
        }

        // Update user balance
        const newBalance = user.balance - total;
        await db.update(users)
            .set({ balance: newBalance })
            .where(eq(users.id, user.id));

        // Create transaction
        await db.insert(transactions).values({
            userId: user.id,
            type: 'purchase',
            amount: -total,
            balanceBefore: user.balance,
            balanceAfter: newBalance,
            status: 'completed',
            description: `Thanh toán đơn hàng #${order.id}`,
            orderId: order.id,
        });

        res.json({
            message: 'Thanh toán thành công',
            order,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Validate promo code
router.post('/apply-promotion', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { code, subtotal } = req.body;

        const promo = await db.query.promotions.findFirst({
            where: and(
                eq(promotions.code, code),
                eq(promotions.active, true)
            ),
        });

        if (!promo) {
            return res.status(400).json({ message: 'Mã giảm giá không hợp lệ' });
        }

        if (promo.minOrder && subtotal < promo.minOrder) {
            return res.status(400).json({ message: `Đơn hàng tối thiểu ${promo.minOrder.toLocaleString()}đ` });
        }

        let discount = 0;
        if (promo.type === 'percent') {
            discount = (subtotal * promo.value) / 100;
            if (promo.maxDiscount && discount > promo.maxDiscount) {
                discount = promo.maxDiscount;
            }
        } else {
            discount = promo.value;
        }

        res.json({
            valid: true,
            discount,
            promotion: promo,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Export orders
router.get('/export', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const userOrders = await db.query.orders.findMany({
            where: eq(orders.userId, req.user!.id),
            with: {
                items: true,
            },
            orderBy: desc(orders.id),
        });

        // The frontend expects a JSON object with orders array
        const mappedOrders = (userOrders as any[]).map(order => ({
            id: order.id,
            date: order.createdAt,
            status: order.status,
            subtotal: order.subtotal,
            discount: order.discount,
            total: order.total,
            items: order.items.map((i: any) => ({
                name: i.productName,
                quantity: i.quantity
            }))
        }));

        res.json({ orders: mappedOrders });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

export default router;
