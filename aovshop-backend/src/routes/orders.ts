import { Router } from 'express';
import { db } from '../db/index.js';
import { orders, orderItems, products, users, transactions, promotions, productAccounts } from '../db/schema.js';
import { eq, desc, and, gte, lte, inArray, sql } from 'drizzle-orm';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { PushService } from '../services/push.js';
import { TelegramService } from '../services/telegram.js';

const router = Router();
class CheckoutError extends Error {
    constructor(public status: number, message: string) { super(message); }
}


const CHECKPASS_URL = (process.env.CHECKPASS_URL || 'https://check.sp1s.shop').replace(/\/$/, '');

async function issueCheckpassKey(orderId: number, productId: number, durationHours: number, customerEmail?: string) {
    const licenseServerUrl = (process.env.LICENSE_SERVER_URL || '').replace(/\/$/, '');
    const issuerToken = process.env.LICENSE_SERVER_ISSUER_TOKEN || '';
    if (!licenseServerUrl || !issuerToken) throw new Error('Chưa cấu hình LICENSE_SERVER_URL hoặc LICENSE_SERVER_ISSUER_TOKEN');
    const response = await fetch(`${licenseServerUrl}/api/integrations/aovshop/checkpass-keys`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AOVShop-Issuer-Token': issuerToken },
        body: JSON.stringify({ order_id: orderId, product_id: productId, duration_hours: durationHours, customer_email: customerEmail || undefined }),
        signal: AbortSignal.timeout(10_000),
    });
    const body: any = await response.json().catch(() => ({}));
    if (!response.ok || !body.key || !body.expires_at) throw new Error(body.detail || body.message || `License Server trả lỗi HTTP ${response.status}`);
    return { key: String(body.key), expiresAt: String(body.expires_at), url: `${CHECKPASS_URL}/?key=${encodeURIComponent(String(body.key))}` };
}

const parsePromotionProductIds = (raw: string | null) => {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((id: any) => parseInt(id))
            .filter((id: number) => !Number.isNaN(id));
    } catch {
        return [];
    }
};

const getPromotionDiscount = (
    promo: any,
    subtotal: number,
    applicableSubtotal: number,
) => {
    const now = Date.now();
    if ((promo.startDate && (!Number.isFinite(Date.parse(promo.startDate)) || Date.parse(promo.startDate) > now)) ||
        (promo.endDate && (!Number.isFinite(Date.parse(promo.endDate)) || Date.parse(promo.endDate) < now)) ||
        (promo.usageLimit != null && (promo.usedCount || 0) >= promo.usageLimit)) {
        return { valid: false, message: 'Mã giảm giá đã hết hạn hoặc hết lượt sử dụng', discount: 0 };
    }
    if (!Number.isFinite(promo.value) || promo.value < 0 || (promo.type === 'percent' && promo.value > 100)) {
        return { valid: false, message: 'Mã giảm giá không hợp lệ', discount: 0 };
    }
    if (promo.minOrder && subtotal < promo.minOrder) {
        return { valid: false, message: `Đơn hàng tối thiểu ${promo.minOrder.toLocaleString()}đ`, discount: 0 };
    }

    if (applicableSubtotal <= 0) {
        return { valid: false, message: 'Mã giảm giá không áp dụng cho sản phẩm trong giỏ hàng', discount: 0 };
    }

    let discount = 0;
    if (promo.type === 'percent') {
        discount = (applicableSubtotal * promo.value) / 100;
        if (promo.maxDiscount && discount > promo.maxDiscount) {
            discount = promo.maxDiscount;
        }
    } else {
        discount = Math.min(promo.value, applicableSubtotal);
    }

    return { valid: true, discount: Math.max(0, Math.min(subtotal, Math.round(discount))) };
};

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
            order_type: order.orderType,
            subtotal: order.subtotal,
            discount: order.discount,
            total: order.total,
            promo_code: order.promoCode,
            note: order.note,
            customer_note: order.customerNote,
            delivery_data: order.deliveryData,
            delivered_at: order.deliveredAt,
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

// Export orders (MUST be before /:id route)
router.get('/export', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const rawOrderIds = typeof req.query.order_ids === 'string' ? req.query.order_ids : '';
        const orderIds = [...new Set(
            rawOrderIds
                .split(',')
                .map(id => parseInt(id.trim(), 10))
                .filter(id => Number.isInteger(id) && id > 0)
        )];

        if (orderIds.length === 0) {
            return res.status(400).json({ message: 'Vui lòng chọn ít nhất một đơn hàng để xuất' });
        }

        const userOrders = await db.query.orders.findMany({
            where: and(
                eq(orders.userId, req.user!.id),
                inArray(orders.id, orderIds)
            ),
            with: {
                items: true,
                accounts: true,
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
            })),
            accounts: order.accounts?.map((acc: any) => acc.data) || []
        }));

        res.json({ orders: mappedOrders });
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
        const { items, promo_code, note, customer_note } = req.body;

        if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
            return res.status(400).json({ message: 'Giỏ hàng không hợp lệ hoặc đang trống' });
        }

        const quantities = new Map<number, number>();
        for (const item of items) {
            const id = Number(item?.product_id);
            const quantity = Number(item?.quantity);
            if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 10000) {
                return res.status(400).json({ message: 'Sản phẩm hoặc số lượng không hợp lệ' });
            }
            const combined = (quantities.get(id) || 0) + quantity;
            if (combined > 10000) return res.status(400).json({ message: 'Số lượng quá lớn' });
            quantities.set(id, combined);
        }
        for (const value of [note, customer_note, promo_code]) {
            if (value != null && (typeof value !== 'string' || value.length > 5000)) {
                return res.status(400).json({ message: 'Dữ liệu không hợp lệ' });
            }
        }
        const { order, user, orderProducts, orderType } = await db.transaction(async (tx) => {
            // Get user
            const user = await tx.query.users.findFirst({
                where: eq(users.id, req.user!.id),
            });

            if (!user) {
                throw new CheckoutError(404, 'User not found');
            }

            // Calculate totals and verify account availability
            let subtotal = 0;
            const orderProducts = [];
            const allTargetAccounts: any[] = [];
            let hasPreorder = false;
            let isAllPreorder = true;
            const subtotalByProductId: Record<number, number> = {};

            for (const [product_id, quantity] of quantities) {
                if (!Number.isInteger(quantity) || quantity < 1) {
                    throw new CheckoutError(400, 'Số lượng sản phẩm không hợp lệ');
                }
                const product = await tx.query.products.findFirst({
                    where: and(eq(products.id, product_id), eq(products.active, true)),
                });

                if (!product) {
                    throw new CheckoutError(400, `Sản phẩm không tồn tại`);
                }

                if (product.minimumOrderQuantity && quantity < product.minimumOrderQuantity) {
                    throw new CheckoutError(400, `Sản phẩm "${product.name}" yêu cầu mua tối thiểu ${product.minimumOrderQuantity} sản phẩm.`);
                }

                const checkpassHours = Number(product.checkpassHours || 0);
                if (checkpassHours > 0) {
                    isAllPreorder = false;
                } else if (product.isPreorder) {
                    hasPreorder = true;
                } else {
                    isAllPreorder = false;
                    // Only check stock for non-preorder items
                    const availableAccounts = await tx.query.productAccounts.findMany({
                        where: and(
                            eq(productAccounts.productId, product.id),
                            eq(productAccounts.status, 'available')
                        ),
                        limit: quantity,
                    });

                    if (availableAccounts.length < quantity) {
                        throw new CheckoutError(400, `${product.name} không đủ số lượng tài khoản trong kho (còn lại: ${availableAccounts.length})`);
                    }

                    allTargetAccounts.push(...availableAccounts);
                }

                const price = product.salePrice ?? product.price;
                if (!Number.isFinite(price) || price < 0) throw new CheckoutError(400, 'Giá sản phẩm không hợp lệ');
                const itemTotal = price * quantity;
                subtotal += itemTotal;
                subtotalByProductId[product.id] = (subtotalByProductId[product.id] || 0) + itemTotal;

                orderProducts.push({
                    product,
                    quantity,
                    price,
                    total: itemTotal,
                });
            }

            // Mixed cart not allowed: all must be same type
            if (hasPreorder && !isAllPreorder) {
                throw new CheckoutError(400, 'Không thể kết hợp sản phẩm thường và sản phẩm pre-order trong cùng một đơn hàng');
            }

            // === Daily buy limit check ===
            // Calculate today's date range in VN timezone (UTC+7)
            const nowVN = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);
            const todayStartVN = new Date(Date.UTC(
                nowVN.getUTCFullYear(), nowVN.getUTCMonth(), nowVN.getUTCDate(),
                -7, 0, 0, 0 // 00:00:00 VN = -7h UTC
            ));
            const todayEndVN = new Date(Date.UTC(
                nowVN.getUTCFullYear(), nowVN.getUTCMonth(), nowVN.getUTCDate(),
                -7 + 23, 59, 59, 999 // 23:59:59 VN
            ));
            const todayStartISO = todayStartVN.toISOString();
            const todayEndISO = todayEndVN.toISOString();

            for (const item of orderProducts) {
                const limit = item.product.dailyBuyLimit;
                if (limit && limit > 0) {
                    // Count how many of this product the user already bought today (excluding cancelled)
                    const purchasedResult = await tx.select({
                        total: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)`
                    })
                    .from(orderItems)
                    .innerJoin(orders, eq(orderItems.orderId, orders.id))
                    .where(and(
                        eq(orders.userId, req.user!.id),
                        eq(orderItems.productId, item.product.id),
                        gte(orders.createdAt, todayStartISO),
                        lte(orders.createdAt, todayEndISO),
                        sql`${orders.status} != 'cancelled'`
                    ));

                    const purchasedToday = Number(purchasedResult[0]?.total || 0);
                    const remaining = limit - purchasedToday;

                    if (item.quantity > remaining) {
                        const msg = purchasedToday > 0
                            ? `Sản phẩm "${item.product.name}" giới hạn mua ${limit}/ngày. Hôm nay bạn đã mua ${purchasedToday}, chỉ còn mua được thêm ${remaining}.`
                            : `Sản phẩm "${item.product.name}" giới hạn mua tối đa ${limit}/ngày.`;
                        throw new CheckoutError(400, msg);
                    }
                }
            }

            const orderType = hasPreorder ? 'preorder' : 'instant';

            // Apply promotion
            let discount = 0;
            if (promo_code) {
                const promo = await tx.query.promotions.findFirst({
                    where: and(
                        eq(promotions.code, promo_code),
                        eq(promotions.active, true)
                    ),
                });

                if (!promo) throw new CheckoutError(400, 'Mã giảm giá không hợp lệ');
                if (promo) {
                    const promoProductIds = parsePromotionProductIds(promo.appliesToProductIds);
                    const applicableSubtotal = promoProductIds.length > 0
                        ? promoProductIds.reduce((sum: number, productId: number) => sum + (subtotalByProductId[productId] || 0), 0)
                        : subtotal;
                    const promoResult = getPromotionDiscount(promo, subtotal, applicableSubtotal);

                    if (!promoResult.valid) {
                        throw new CheckoutError(400, promoResult.message || 'Mã giảm giá không hợp lệ');
                    }

                    discount = promoResult.discount;

                    // Update promo usage
                    await tx.update(promotions)
                        .set({ usedCount: sql`COALESCE(${promotions.usedCount}, 0) + 1` })
                        .where(eq(promotions.id, promo.id));
                }
            }

            const total = subtotal - discount;
            if (!Number.isSafeInteger(total) || total < 0) throw new CheckoutError(400, 'Tổng tiền không hợp lệ');

            // Check balance
            if (user.balance < total) {
                throw new CheckoutError(400, 'Số dư không đủ');
            }

            // Determine initial status
            const initialStatus = orderType === 'preorder' ? 'waiting' : 'completed';

            // Create order
            const [order] = await tx.insert(orders).values({
                userId: user.id,
                status: initialStatus as any,
                orderType: orderType as any,
                subtotal,
                discount,
                total,
                promoCode: promo_code || null,
                note: note || null,
                customerNote: customer_note || null,
                createdAt: new Date().toISOString(),
            }).returning();

            // Create order items, link accounts, and update stock
            for (const item of orderProducts) {
                await tx.insert(orderItems).values({
                    orderId: order.id,
                    productId: item.product.id,
                    productName: item.product.name,
                    quantity: item.quantity,
                    price: item.price,
                    total: item.total,
                });

                // Only manage accounts for instant (non-preorder) items
                if (!item.product.isPreorder && !item.product.checkpassHours) {
                    const productAccountsToLink = allTargetAccounts
                        .filter(acc => acc.productId === item.product.id)
                        .slice(0, item.quantity);

                    if (productAccountsToLink.length > 0) {
                        const accountIds = productAccountsToLink.map(acc => acc.id);

                        const claimed = await tx.update(productAccounts)
                            .set({
                                orderId: order.id,
                                status: 'sold'
                            })
                            .where(and(inArray(productAccounts.id, accountIds), eq(productAccounts.status, 'available')))
                            .returning({ id: productAccounts.id });
                        if (claimed.length !== accountIds.length) throw new CheckoutError(409, 'Kho hàng đã thay đổi, vui lòng thử lại');
                    }

                    const remainingCount = await tx.select({ count: sql`count(*)` })
                        .from(productAccounts)
                        .where(and(
                            eq(productAccounts.productId, item.product.id),
                            eq(productAccounts.status, 'available')
                        ));

                    await tx.update(products)
                        .set({
                            stock: Number(remainingCount[0]?.count || 0),
                            soldCount: sql`${products.soldCount} + ${item.quantity}`
                        })
                        .where(eq(products.id, item.product.id));
                } else {
                    // For preorder: just increment soldCount
                    await tx.update(products)
                        .set({
                            soldCount: sql`${products.soldCount} + ${item.quantity}`
                        })
                        .where(eq(products.id, item.product.id));
                }
            }

            // Update user balance (charged immediately)
            const newBalance = user.balance - total;
            const charged = await tx.update(users)
                .set({ balance: sql`${users.balance} - ${total}` })
                .where(and(eq(users.id, user.id), gte(users.balance, total)))
                .returning({ id: users.id });
            if (charged.length !== 1) throw new CheckoutError(400, 'Số dư không đủ');

            // Create transaction
            await tx.insert(transactions).values({
                userId: user.id,
                type: 'purchase',
                amount: -total,
                balanceBefore: user.balance,
                balanceAfter: newBalance,
                status: 'completed',
                description: orderType === 'preorder'
                    ? `Đặt hàng pre-order #${order.id}`
                    : `Thanh toán đơn hàng #${order.id}`,
                orderId: order.id,
            });

            return { order, user, orderProducts, orderType };
        });

        const checkpassItems = orderProducts.filter((item: any) => Number(item.product.checkpassHours || 0) > 0);
        if (checkpassItems.length > 0) {
            const durationHours = checkpassItems.reduce((total: number, item: any) => total + Number(item.product.checkpassHours) * item.quantity, 0);
            try {
                const license = await issueCheckpassKey(order.id, checkpassItems[0].product.id, durationHours, user.email);
                const deliveryData = JSON.stringify({ type: 'checkpass_license', key: license.key, expires_at: license.expiresAt, url: license.url, duration_hours: durationHours });
                await db.update(orders).set({ deliveryData, deliveredAt: new Date().toISOString() }).where(eq(orders.id, order.id));
                order.deliveryData = deliveryData;
                order.deliveredAt = new Date().toISOString();
            } catch (issueError) {
                console.error(`[Checkpass license] Could not issue key for order #${order.id}:`, issueError);
                const deliveryData = JSON.stringify({ type: 'checkpass_pending', error: 'Đang cấp key, vui lòng liên hệ hỗ trợ nếu chưa nhận được.' });
                await db.update(orders).set({ deliveryData }).where(eq(orders.id, order.id));
                order.deliveryData = deliveryData;
            }
        }

        // Notify Admin
        const orderLabel = orderType === 'preorder' ? 'PRE-ORDER' : 'MỚI';
        const escapedUserName = TelegramService.escapeHtml(user.name);
        const formattedTotal = new Intl.NumberFormat('vi-VN').format(order.total);

        // 1. Web Push Notification
        try {
            await PushService.notifyAdmin({
                title: `🛒 Đơn hàng ${orderLabel}!`,
                body: `${user.name} vừa đặt đơn hàng #${order.id} (${formattedTotal}đ)`,
                icon: '/logo.png',
                data: { url: `/admin/orders` }
            });
        } catch (err) {
            console.error('[Push Notify Error]:', err);
        }

        // 2. Telegram Notification
        try {
            const productList = orderProducts.map(p => `- ${p.product.name} (x${p.quantity})`).join('\n');
            const noteContent = note ? `\n📝 <b>Thông tin khách nhập:</b>\n<i>${TelegramService.escapeHtml(note)}</i>\n` : '';
            
            const telegramMsg = `🛒 <b>ĐƠN HÀNG ${orderLabel}</b>\n\n👤 Khách hàng: <b>${escapedUserName}</b>\n📦 Đơn hàng: #${order.id}\n💰 Tổng tiền: <b>${formattedTotal}đ</b>${noteContent}\n🛍️ <b>Sản phẩm:</b>\n${productList}\n\n🔗 Xem chi tiết trên trang Admin.`;
            await TelegramService.sendMessage(telegramMsg);
        } catch (err) {
            console.error('[Telegram Notify Error]:', err);
        }

        res.json({
            message: orderType === 'preorder'
                ? 'Đặt hàng thành công! Đơn hàng đang chờ hàng về.'
                : 'Thanh toán thành công',
            order,
        });
    } catch (error) {
        if (error instanceof CheckoutError) return res.status(error.status).json({ message: error.message });
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Validate promo code
router.post('/apply-promotion', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { code, subtotal, items } = req.body;

        const promo = await db.query.promotions.findFirst({
            where: and(
                eq(promotions.code, code),
                eq(promotions.active, true)
            ),
        });

        if (!promo) {
            return res.status(400).json({ message: 'Mã giảm giá không hợp lệ' });
        }

        const promoProductIds = parsePromotionProductIds(promo.appliesToProductIds);
        let applicableSubtotal = Number(subtotal) || 0;

        if (promoProductIds.length > 0) {
            if (!Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ message: 'Không đủ dữ liệu sản phẩm để áp mã giảm giá' });
            }

            applicableSubtotal = items.reduce((sum: number, item: any) => {
                const rawProductId = item.product_id ?? item.id;
                const productId = parseInt(rawProductId);
                if (!promoProductIds.includes(productId)) return sum;
                const price = Number(item.sale_price || item.price || 0);
                const quantity = Number(item.quantity || 0);
                return sum + (price * quantity);
            }, 0);
        }

        const promoResult = getPromotionDiscount(promo, Number(subtotal) || 0, applicableSubtotal);
        if (!promoResult.valid) {
            return res.status(400).json({ message: promoResult.message });
        }

        res.json({
            valid: true,
            discount: promoResult.discount,
            promotion: promo,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

export default router;
