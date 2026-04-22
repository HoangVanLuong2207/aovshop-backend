import { Router } from 'express';
import { db } from '../db/index.js';
import { categories, products, settings, orders } from '../db/schema.js';
import { eq, and, like, desc, asc, sql, isNotNull } from 'drizzle-orm';

const router = Router();

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
