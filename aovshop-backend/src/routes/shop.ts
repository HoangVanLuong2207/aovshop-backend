import { Router } from 'express';
import { db } from '../db/index.js';
import { categories, products, settings, orders, transactions, users } from '../db/schema.js';
import { eq, and, like, desc, asc, sql, isNotNull, gte, lt } from 'drizzle-orm';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { PushService } from '../services/push.js';

const router = Router();

const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

type DateRange = {
    start: string;
    end: string;
};

// Dates are persisted as UTC ISO strings. Vietnam has a fixed UTC+7 offset,
// so calculate calendar boundaries in Vietnam before converting them to UTC.
const getVietnamDateRanges = (now = new Date()): { week: DateRange; month: DateRange } => {
    const vietnamNow = new Date(now.getTime() + VIETNAM_UTC_OFFSET_MS);
    const year = vietnamNow.getUTCFullYear();
    const month = vietnamNow.getUTCMonth();
    const day = vietnamNow.getUTCDate();
    const dayOfWeek = vietnamNow.getUTCDay();
    const daysSinceMonday = (dayOfWeek + 6) % 7;
    const toVietnamMidnightIso = (date: number) =>
        new Date(Date.UTC(year, month, date) - VIETNAM_UTC_OFFSET_MS).toISOString();

    return {
        week: {
            start: toVietnamMidnightIso(day - daysSinceMonday),
            end: toVietnamMidnightIso(day - daysSinceMonday + 7),
        },
        month: {
            start: toVietnamMidnightIso(1),
            end: new Date(Date.UTC(year, month + 1, 1) - VIETNAM_UTC_OFFSET_MS).toISOString(),
        },
    };
};

const anonymizeName = (name: string) => {
    const characters = Array.from(name.trim());
    if (characters.length === 0) return 'Khách hàng';
    return `${characters.slice(0, Math.min(2, characters.length)).join('')}***`;
};

const getTopDepositors = async (range?: DateRange) => {
    const conditions = [
        eq(transactions.type, 'deposit'),
        eq(transactions.status, 'completed'),
    ];

    if (range) {
        conditions.push(gte(transactions.createdAt, range.start));
        conditions.push(lt(transactions.createdAt, range.end));
    }

    const totalDeposit = sql<number>`sum(${transactions.amount})`;
    const rows = await db.select({
        userId: users.id,
        name: users.name,
        totalDeposit,
        depositCount: sql<number>`count(${transactions.id})`,
    })
        .from(transactions)
        .innerJoin(users, eq(transactions.userId, users.id))
        .where(and(...conditions))
        .groupBy(users.id, users.name)
        .orderBy(desc(totalDeposit), asc(users.id))
        .limit(5);

    return rows.map((row, index) => ({
        rank: index + 1,
        display_name: anonymizeName(row.name),
        total_deposit: Number(row.totalDeposit),
        deposit_count: Number(row.depositCount),
    }));
};

// Get public shop info (name, logo, banner, contact)
router.get('/info', async (req, res) => {
    try {
        const result = await db.select().from(settings).where(
            sql`${settings.key} IN ('shop_name', 'shop_logo', 'shop_banner', 'contact_zalo', 'contact_messenger', 'contact_hotline')`
        );

        const info: Record<string, string | null> = {
            shop_name: 'AOV Shop',
            shop_logo: null,
            shop_banner: null,
            contact_zalo: null,
            contact_messenger: null,
            contact_hotline: null,
        };
        result.forEach(s => {
            if (s.value) info[s.key] = s.value;
        });

        res.json(info);
    } catch (error) {
        console.error(error);
        res.json({ shop_name: 'AOV Shop', shop_logo: null, shop_banner: null, contact_zalo: null, contact_messenger: null, contact_hotline: null });
    }
});

// Public top 5 deposit leaderboard. Only completed deposit transactions count.
router.get('/top-deposit', async (req, res) => {
    try {
        const ranges = getVietnamDateRanges();
        const [week, month, all] = await Promise.all([
            getTopDepositors(ranges.week),
            getTopDepositors(ranges.month),
            getTopDepositors(),
        ]);

        res.json({
            timezone: 'Asia/Ho_Chi_Minh',
            periods: {
                week: { ...ranges.week, leaderboard: week },
                month: { ...ranges.month, leaderboard: month },
                all: { leaderboard: all },
            },
        });
    } catch (error) {
        console.error('Failed to load top deposit leaderboard:', error);
        res.status(500).json({ message: 'Không thể tải bảng xếp hạng nạp tiền' });
    }
});

// Get public notification settings
router.get('/notification', async (req, res) => {
    try {
        const result = await db.select().from(settings).where(
            sql`${settings.key} IN ('notification_enabled', 'notification_type', 'notification_text')`
        );

        const notificationSettings: Record<string, string | null> = {};
        result.forEach(s => {
            notificationSettings[s.key] = s.value;
        });

        // Only return if enabled
        if (notificationSettings.notification_enabled === 'true' && notificationSettings.notification_text) {
            res.json({
                enabled: true,
                type: notificationSettings.notification_type || 'info',
                text: notificationSettings.notification_text,
            });
        } else {
            res.json({ enabled: false });
        }
    } catch (error) {
        console.error(error);
        res.json({ enabled: false });
    }
});

// Web Push - Get Public Key
router.get('/push/public-key', async (req, res) => {
    try {
        const key = await db.query.settings.findFirst({
            where: eq(settings.key, 'vapid_public_key'),
        });
        res.json({ publicKey: key?.value });
    } catch (error) {
        res.status(500).json({ message: 'Error' });
    }
});

// Web Push - Subscribe
router.post('/push/subscribe', async (req: any, res) => {
    try {
        const { subscription } = req.body;
        const success = await PushService.subscribe(null, subscription, req.headers['user-agent']);
        res.json({ success });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// Web Push - Subscribe (Authenticated)
router.post('/push/subscribe-auth', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { subscription } = req.body;
        const success = await PushService.subscribe(req.user!.id, subscription, req.headers['user-agent']);
        res.json({ success });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// Helper to map product fields
const mapProduct = (p: any) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price,
    sale_price: p.salePrice,
    stock: p.stock,
    sold_count: p.soldCount,
    image: p.image,
    images: p.images || [],
    category_id: p.categoryId,
    active: p.active,
    is_preorder: p.isPreorder || false,
    preorder_placeholder: p.preorderPlaceholder,
    daily_buy_limit: p.dailyBuyLimit || null,
    minimum_order_quantity: p.minimumOrderQuantity || null,
    checkpass_hours: p.checkpassHours || null,
    created_at: p.createdAt,
    category: p.category,
});

// Get all categories
router.get('/categories', async (req, res) => {
    try {
        const result = await db.query.categories.findMany({
            where: eq(categories.active, true),
            with: {
                products: {
                    where: eq(products.active, true),
                },
            },
        });

        const categoriesWithCount = result.map(cat => ({
            id: cat.id,
            name: cat.name,
            description: cat.description,
            image: cat.image,
            active: cat.active,
            created_at: cat.createdAt,
            products_count: cat.products.length,
        }));

        res.json(categoriesWithCount);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Get all products
router.get('/products', async (req, res) => {
    try {
        const { category_id, search, sort, per_page = '12', page = '1' } = req.query;

        const perPage = parseInt(per_page as string);
        const currentPage = parseInt(page as string);
        const offset = (currentPage - 1) * perPage;

        // Build sort order
        let orderByClause: any = desc(products.id);
        if (sort === 'price_asc') orderByClause = asc(products.price);
        else if (sort === 'price_desc') orderByClause = desc(products.price);

        // Build where conditions
        const conditions: any[] = [eq(products.active, true)];
        if (category_id) conditions.push(eq(products.categoryId, parseInt(category_id as string)));
        if (search) conditions.push(like(products.name, `%${search}%`));

        // Get total count first
        const [{ total }] = await db
            .select({ total: sql<number>`count(*)` })
            .from(products)
            .where(and(...conditions));

        // Fetch only the page we need
        const result = await db.query.products.findMany({
            where: and(...conditions),
            with: { category: true },
            orderBy: orderByClause,
            limit: perPage,
            offset,
        });

        res.json({
            data: result.map(mapProduct),
            meta: {
                current_page: currentPage,
                per_page: perPage,
                total: Number(total),
                last_page: Math.ceil(Number(total) / perPage),
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});


// Get featured products
router.get('/products/featured', async (req, res) => {
    try {
        const result = await db.query.products.findMany({
            where: and(
                eq(products.active, true),
                isNotNull(products.salePrice)
            ),
            with: {
                category: true,
            },
            limit: 8,
            orderBy: desc(products.createdAt),
        });

        res.json(result.map(mapProduct));
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Get new products
router.get('/products/new', async (req, res) => {
    try {
        const result = await db.query.products.findMany({
            where: eq(products.active, true),
            with: {
                category: true,
            },
            limit: 8,
            orderBy: desc(products.id),
        });

        res.json(result.map(mapProduct));
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Get single product
router.get('/products/:id', async (req, res) => {
    try {
        const product = await db.query.products.findFirst({
            where: eq(products.id, parseInt(req.params.id)),
            with: {
                category: true,
                images: true,
            },
        });

        if (!product) {
            return res.status(404).json({ message: 'Sản phẩm không tồn tại' });
        }

        res.json(mapProduct(product));
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Get recent orders for live feed (public, anonymized)
router.get('/recent-orders', async (req, res) => {
    try {
        const recentOrders = await db.query.orders.findMany({
            where: eq(orders.status, 'completed'),
            with: {
                user: true,
                items: true,
            },
            orderBy: desc(orders.id),
            limit: 10,
        });

        // Anonymize user names and format for frontend
        const feed = recentOrders.map(order => {
            const userName = order.user?.name || 'Khách hàng';
            // Anonymize: "Nguyen Van A" -> "Nguyen V***"
            const parts = userName.split(' ');
            const anonymized = parts.length > 1
                ? `${parts[0]} ${parts[parts.length - 1][0]}***`
                : `${userName[0]}***`;

            const productName = order.items[0]?.productName || 'Sản phẩm';

            // Calculate time ago
            const createdAt = new Date(order.createdAt || Date.now());
            const now = new Date();
            const diffMs = now.getTime() - createdAt.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMins / 60);

            let timeAgo = 'vừa xong';
            if (diffHours > 0) {
                timeAgo = `${diffHours} giờ trước`;
            } else if (diffMins > 0) {
                timeAgo = `${diffMins} phút trước`;
            }

            return {
                user: anonymized,
                product: productName,
                time: timeAgo,
            };
        });

        res.json(feed);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

export default router;
