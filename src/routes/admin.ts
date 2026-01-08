import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth.js';
import { Router } from 'express';
import { db } from '../db/index.js';
import { categories, products, promotions, orders, orderItems, transactions, users, settings, productAccounts } from '../db/schema.js';
import { eq, desc, sql, and, inArray, gte, lte, like } from 'drizzle-orm';


const router = Router();

// Apply auth and admin middleware to all routes
router.use(authMiddleware);
router.use(adminMiddleware);

// ==================== CATEGORIES ====================

router.get('/categories', async (req, res) => {
    try {
        const result = await db.query.categories.findMany({
            with: { products: true },
            orderBy: desc(categories.id),
        });

        const data = result.map(cat => ({
            ...cat,
            products_count: cat.products.length,
        }));

        res.json({ data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

router.get('/categories/all', async (req, res) => {
    try {
        const result = await db.query.categories.findMany({
            where: eq(categories.active, true),
        });
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

router.post('/categories', async (req, res) => {
    try {
        const { name, description, image, active } = req.body;

        const [category] = await db.insert(categories).values({
            name,
            description,
            image: image || null,
            active: active === '1' || active === 'true' || active === true,
        }).returning();
        res.json(category);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Category update
const handleCategoryUpdate = async (req: any, res: any) => {
    try {
        const { name, description, image, active } = req.body;
        const updateData: any = {
            name,
            description,
            active: active === '1' || active === 'true' || active === true
        };

        if (image !== undefined) {
            updateData.image = image || null;
        }

        await db.update(categories)
            .set(updateData)
            .where(eq(categories.id, parseInt(req.params.id)));

        const category = await db.query.categories.findFirst({
            where: eq(categories.id, parseInt(req.params.id)),
        });
        res.json(category);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
};

router.post('/categories/:id', handleCategoryUpdate);
router.put('/categories/:id', handleCategoryUpdate);

router.delete('/categories/:id', async (req, res) => {
    try {
        await db.delete(categories).where(eq(categories.id, parseInt(req.params.id)));
        res.json({ message: 'Đã xóa danh mục' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// ==================== PRODUCTS ====================

router.get('/products', async (req, res) => {
    try {
        const result = await db.query.products.findMany({
            with: { category: true },
            orderBy: desc(products.id),
        });
        res.json({ data: result });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

router.post('/products', async (req, res) => {
    try {
        const { category_id, name, description, price, sale_price, stock, image, active } = req.body;

        const [product] = await db.insert(products).values({
            categoryId: category_id ? parseInt(category_id) : null,
            name,
            description,
            price: parseFloat(price),
            salePrice: sale_price ? parseFloat(sale_price) : null,
            stock: stock ? parseInt(stock) : 0,
            image: image || null,
            active: active === '1' || active === 'true' || active === true,
        }).returning();
        res.json(product);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

const handleProductUpdate = async (req: any, res: any) => {
    try {
        const { category_id, name, description, price, sale_price, stock, image, active } = req.body;
        const updateData: any = {
            categoryId: category_id ? parseInt(category_id) : null,
            name,
            description,
            price: parseFloat(price),
            salePrice: sale_price ? parseFloat(sale_price) : null,
            stock: stock ? parseInt(stock) : 0,
            active: active === '1' || active === 'true' || active === true,
        };

        if (image !== undefined) {
            updateData.image = image || null;
        }

        await db.update(products)
            .set(updateData)
            .where(eq(products.id, parseInt(req.params.id)));

        const product = await db.query.products.findFirst({
            where: eq(products.id, parseInt(req.params.id)),
        });
        res.json(product);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
};

router.post('/products/:id', handleProductUpdate);
router.put('/products/:id', handleProductUpdate);

router.delete('/products/:id', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);

        // Delete available accounts (chưa bán - có thể xóa hoàn toàn)
        await db.delete(productAccounts).where(
            and(
                eq(productAccounts.productId, productId),
                eq(productAccounts.status, 'available')
            )
        );

        // Set productId to null for sold accounts (giữ lại lịch sử)
        await db.update(productAccounts)
            .set({ productId: null as any })
            .where(eq(productAccounts.productId, productId));

        // Set productId to null for order items (giữ lại lịch sử đơn hàng)
        await db.update(orderItems)
            .set({ productId: null })
            .where(eq(orderItems.productId, productId));

        // Now we can safely delete the product
        await db.delete(products).where(eq(products.id, productId));
        res.json({ message: 'Đã xóa sản phẩm' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// ==================== PRODUCT ACCOUNTS ====================

// Bulk upload accounts
router.post('/products/:id/accounts', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        const { accounts } = req.body;

        if (!accounts) {
            return res.status(400).json({ message: 'Thiếu danh sách tài khoản' });
        }

        // Handle both string (multi-line) and array
        const rawAccountList = typeof accounts === 'string'
            ? accounts.split('\n').map(line => line.trim()).filter(line => line.length > 0)
            : accounts;

        if (rawAccountList.length === 0) {
            return res.status(400).json({ message: 'Danh sách tài khoản trống' });
        }

        // Check for duplicates within the uploaded list itself
        const accountList = [...new Set(rawAccountList)] as string[];
        if (accountList.length < rawAccountList.length) {
            const internalDuplicates = rawAccountList.filter((item: any, index: number) => rawAccountList.indexOf(item) !== index);
            return res.status(400).json({
                message: `Phát hiện ${rawAccountList.length - accountList.length} tài khoản trùng lặp ngay trong danh sách dán vào: ${[...new Set(internalDuplicates)].join(', ')}`
            });
        }

        // Check for duplicates in database
        const existingAccounts = await db.query.productAccounts.findMany({
            where: inArray(productAccounts.data, accountList),
            with: {
                product: true
            }
        });

        if (existingAccounts.length > 0) {
            const duplicateInfo = existingAccounts.map((acc: any) =>
                `"${acc.data}" đã tồn tại trong sản phẩm "${acc.product?.name}"`
            ).join(', ');

            return res.status(400).json({
                message: `Phát hiện ${existingAccounts.length} tài khoản trùng lặp: ${duplicateInfo}`
            });
        }

        // Insert accounts
        const values = accountList.map((data: string) => ({
            productId,
            data,
            status: 'available' as const,
        }));

        await db.insert(productAccounts).values(values);

        // Update product stock
        const remainingCount = await db.select({ count: sql`count(*)` })
            .from(productAccounts)
            .where(and(
                eq(productAccounts.productId, productId),
                eq(productAccounts.status, 'available')
            ));

        await db.update(products)
            .set({ stock: Number(remainingCount[0]?.count || 0) })
            .where(eq(products.id, productId));

        const updatedAccounts = await db.query.productAccounts.findMany({
            where: eq(productAccounts.productId, productId),
            orderBy: desc(productAccounts.id),
        });

        res.json({
            message: `Đã thêm ${accountList.length} tài khoản thành công`,
            stock: Number(remainingCount[0]?.count || 0),
            accounts: updatedAccounts
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Get accounts for a product
router.get('/products/:id/accounts', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        const result = await db.query.productAccounts.findMany({
            where: eq(productAccounts.productId, productId),
            orderBy: desc(productAccounts.id),
        });

        res.json({ data: result });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Delete specific account
router.delete('/products/:productId/accounts/:accountId', async (req, res) => {
    try {
        const productId = parseInt(req.params.productId);
        const accountId = parseInt(req.params.accountId);

        await db.delete(productAccounts).where(eq(productAccounts.id, accountId));

        // Update product stock
        const remainingCount = await db.select({ count: sql`count(*)` })
            .from(productAccounts)
            .where(and(
                eq(productAccounts.productId, productId),
                eq(productAccounts.status, 'available')
            ));

        const newStock = Number(remainingCount[0]?.count || 0);
        await db.update(products)
            .set({ stock: newStock })
            .where(eq(products.id, productId));

        res.json({ message: 'Đã xóa tài khoản', stock: newStock });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Clear available accounts
router.post('/products/:id/accounts/clear', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);

        await db.delete(productAccounts).where(and(
            eq(productAccounts.productId, productId),
            eq(productAccounts.status, 'available')
        ));

        // Update product stock
        await db.update(products)
            .set({ stock: 0 })
            .where(eq(products.id, productId));

        res.json({ message: 'Đã xóa tất cả tài khoản chưa bán', stock: 0 });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});


// Search account by data
router.get('/accounts/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || typeof q !== 'string') {
            return res.status(400).json({ message: 'Thiếu từ khóa tìm kiếm' });
        }

        // Search in productAccounts table
        const result = await db.query.productAccounts.findFirst({
            where: like(productAccounts.data, `%${q}%`),
            with: {
                product: {
                    with: {
                        category: true
                    }
                },
            },
        });

        if (!result || !result.product) {
            return res.json({ found: false });
        }

        res.json({
            found: true,
            product: {
                id: result.product.id,
                name: result.product.name,
                category: (result.product as any).category ? {
                    id: (result.product as any).category.id,
                    name: (result.product as any).category.name,
                } : null
            },
            status: result.status,
            accountId: result.id,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});


// ==================== PROMOTIONS ====================

router.get('/promotions', async (req, res) => {
    try {
        const result = await db.query.promotions.findMany({
            orderBy: desc(promotions.id),
        });
        res.json({ data: result });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

router.post('/promotions', async (req, res) => {
    try {
        const { code, name, description, type, value, min_order, max_discount, usage_limit, start_date, end_date, active } = req.body;
        const [promo] = await db.insert(promotions).values({
            code,
            name,
            description,
            type,
            value: parseFloat(value),
            minOrder: min_order ? parseFloat(min_order) : null,
            maxDiscount: max_discount ? parseFloat(max_discount) : null,
            usageLimit: usage_limit ? parseInt(usage_limit) : null,
            startDate: start_date || null,
            endDate: end_date || null,
            active: active === '1' || active === true,
        }).returning();
        res.json(promo);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

router.put('/promotions/:id', async (req, res) => {
    try {
        const { code, name, description, type, value, min_order, max_discount, usage_limit, start_date, end_date, active } = req.body;
        await db.update(promotions)
            .set({
                code,
                name,
                description,
                type,
                value: parseFloat(value),
                minOrder: min_order ? parseFloat(min_order) : null,
                maxDiscount: max_discount ? parseFloat(max_discount) : null,
                usageLimit: usage_limit ? parseInt(usage_limit) : null,
                startDate: start_date || null,
                endDate: end_date || null,
                active: active === '1' || active === true,
            })
            .where(eq(promotions.id, parseInt(req.params.id)));

        const promo = await db.query.promotions.findFirst({
            where: eq(promotions.id, parseInt(req.params.id)),
        });
        res.json(promo);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

router.delete('/promotions/:id', async (req, res) => {
    try {
        await db.delete(promotions).where(eq(promotions.id, parseInt(req.params.id)));
        res.json({ message: 'Đã xóa khuyến mãi' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// ==================== ORDERS ====================

router.get('/orders', async (req, res) => {
    try {
        const result = await db.query.orders.findMany({
            with: { user: true, items: true },
            orderBy: desc(orders.id),
        });
        res.json({ data: result });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Order statistics endpoint (must be before /:id)
router.get('/orders/statistics', async (req, res) => {
    try {
        const { start_date, end_date } = req.query;

        // Build date filter conditions - dates are stored as ISO strings in SQLite
        const conditions = [];
        if (start_date) {
            conditions.push(gte(orders.createdAt, start_date as string));
        }
        if (end_date) {
            conditions.push(lte(orders.createdAt, end_date as string));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        // Get total orders count
        const totalOrdersResult = await db.select({ count: sql`count(*)` })
            .from(orders)
            .where(whereClause ? and(whereClause) : undefined);

        // Get completed orders and revenue
        const completedConditions = whereClause
            ? and(whereClause, eq(orders.status, 'completed'))
            : eq(orders.status, 'completed');

        const revenueResult = await db.select({
            count: sql`count(*)`,
            sum: sql`COALESCE(sum(total), 0)`
        }).from(orders).where(completedConditions);

        // Get pending orders count
        const pendingConditions = whereClause
            ? and(whereClause, eq(orders.status, 'pending'))
            : eq(orders.status, 'pending');

        const pendingResult = await db.select({ count: sql`count(*)` })
            .from(orders)
            .where(pendingConditions);

        res.json({
            total_orders: Number(totalOrdersResult[0]?.count || 0),
            completed_orders: Number(revenueResult[0]?.count || 0),
            pending_orders: Number(pendingResult[0]?.count || 0),
            total_revenue: Number(revenueResult[0]?.sum || 0),
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

router.get('/orders/:id', async (req, res) => {
    try {
        const order = await db.query.orders.findFirst({
            where: eq(orders.id, parseInt(req.params.id)),
            with: { user: true, items: true },
        });
        res.json(order);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

router.put('/orders/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        await db.update(orders)
            .set({ status })
            .where(eq(orders.id, parseInt(req.params.id)));

        const order = await db.query.orders.findFirst({
            where: eq(orders.id, parseInt(req.params.id)),
        });
        res.json(order);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// ==================== TRANSACTIONS ====================

router.get('/transactions', async (req, res) => {
    try {
        const result = await db.query.transactions.findMany({
            with: { user: true },
            orderBy: desc(transactions.id),
        });
        res.json({ data: result });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Transaction statistics endpoint
router.get('/transactions/statistics', async (req, res) => {
    try {
        // Get total deposits
        const depositsResult = await db.select({
            count: sql`count(*)`,
            sum: sql`COALESCE(sum(amount), 0)`
        }).from(transactions).where(
            and(
                eq(transactions.type, 'deposit'),
                eq(transactions.status, 'completed')
            )
        );

        // Get total purchases/spending
        const purchasesResult = await db.select({
            count: sql`count(*)`,
            sum: sql`COALESCE(sum(ABS(amount)), 0)`
        }).from(transactions).where(
            and(
                eq(transactions.type, 'purchase'),
                eq(transactions.status, 'completed')
            )
        );

        // Get pending deposits
        const pendingResult = await db.select({
            count: sql`count(*)`,
            sum: sql`COALESCE(sum(amount), 0)`
        }).from(transactions).where(
            and(
                eq(transactions.type, 'deposit'),
                eq(transactions.status, 'pending')
            )
        );

        res.json({
            total_deposits: Number(depositsResult[0]?.sum || 0),
            total_deposit_count: Number(depositsResult[0]?.count || 0),
            total_spending: Number(purchasesResult[0]?.sum || 0),
            total_purchase_count: Number(purchasesResult[0]?.count || 0),
            pending_deposits: Number(pendingResult[0]?.sum || 0),
            pending_deposit_count: Number(pendingResult[0]?.count || 0),
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Manual deposit (admin)
router.post('/transactions/deposit', async (req: AuthRequest, res) => {
    try {
        const { user_id, amount, description } = req.body;

        const user = await db.query.users.findFirst({
            where: eq(users.id, parseInt(user_id)),
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const newBalance = user.balance + parseFloat(amount);

        // Update balance
        await db.update(users)
            .set({ balance: newBalance })
            .where(eq(users.id, user.id));

        // Create transaction
        const [transaction] = await db.insert(transactions).values({
            userId: user.id,
            type: 'deposit',
            amount: parseFloat(amount),
            balanceBefore: user.balance,
            balanceAfter: newBalance,
            status: 'completed',
            description: description || 'Nạp tiền thủ công bởi Admin',
        }).returning();

        res.json({ message: 'Nạp tiền thành công', transaction });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// ==================== DASHBOARD STATS ====================

router.get('/stats', async (req, res) => {
    try {
        const totalOrders = await db.select({ count: sql`count(*)` }).from(orders);
        const totalProducts = await db.select({ count: sql`count(*)` }).from(products);
        const totalUsers = await db.select({ count: sql`count(*)` }).from(users);
        const totalRevenue = await db.select({ sum: sql`sum(total)` }).from(orders).where(eq(orders.status, 'completed'));

        res.json({
            total_orders: totalOrders[0].count,
            total_products: totalProducts[0].count,
            total_users: totalUsers[0].count,
            total_revenue: totalRevenue[0].sum || 0,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// ==================== SETTINGS ====================

router.get('/settings', async (req, res) => {
    try {
        const result = await db.query.settings.findMany();

        // Convert to key-value object
        const settingsObj: Record<string, string> = {};
        result.forEach(s => {
            settingsObj[s.key] = s.value || '';
        });

        res.json(settingsObj);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

router.post('/settings', async (req, res) => {
    try {
        const settingsData = req.body;

        for (const [key, value] of Object.entries(settingsData)) {
            // Upsert each setting
            const existing = await db.query.settings.findFirst({
                where: eq(settings.key, key),
            });

            if (existing) {
                await db.update(settings)
                    .set({ value: value as string })
                    .where(eq(settings.key, key));
            } else {
                await db.insert(settings).values({
                    key,
                    value: value as string,
                });
            }
        }

        res.json({ message: 'Cập nhật cài đặt thành công' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Get specific setting
router.get('/settings/:key', async (req, res) => {
    try {
        const setting = await db.query.settings.findFirst({
            where: eq(settings.key, req.params.key),
        });

        res.json({ value: setting?.value || null });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// ==================== USERS ====================

router.get('/users', async (req, res) => {
    try {
        const result = await db.query.users.findMany({
            orderBy: desc(users.id),
        });

        // Remove password from response
        const safeUsers = result.map(u => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            balance: u.balance,
            createdAt: u.createdAt,
        }));

        res.json({ data: safeUsers });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

router.get('/users/:id', async (req, res) => {
    try {
        const user = await db.query.users.findFirst({
            where: eq(users.id, parseInt(req.params.id)),
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            balance: user.balance,
            createdAt: user.createdAt,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

router.put('/users/:id', async (req: AuthRequest, res) => {
    try {
        const { name, email, role, addBalance } = req.body;
        const userId = parseInt(req.params.id);

        // Don't allow admin to change their own role
        if (req.user?.id === userId && role !== undefined) {
            return res.status(400).json({ message: 'Không thể thay đổi role của chính mình' });
        }

        // Get current user for balance calculation
        const currentUser = await db.query.users.findFirst({
            where: eq(users.id, userId),
        });

        if (!currentUser) {
            return res.status(404).json({ message: 'Không tìm thấy người dùng' });
        }

        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;
        if (role !== undefined) updateData.role = role;

        // Add to balance instead of overwriting
        if (addBalance !== undefined && addBalance !== 0) {
            const amount = parseFloat(addBalance);
            updateData.balance = currentUser.balance + amount;

            // Create transaction record for the balance change
            await db.insert(transactions).values({
                userId: userId,
                type: amount > 0 ? 'deposit' : 'purchase',
                amount: Math.abs(amount),
                balanceBefore: currentUser.balance,
                balanceAfter: currentUser.balance + amount,
                status: 'completed',
                description: amount > 0 ? 'Admin cộng số dư' : 'Admin trừ số dư',
            });
        }

        await db.update(users)
            .set(updateData)
            .where(eq(users.id, userId));

        const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
        });

        res.json({
            message: 'Cập nhật thành công',
            user: {
                id: user!.id,
                name: user!.name,
                email: user!.email,
                role: user!.role,
                balance: user!.balance,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

router.delete('/users/:id', async (req: AuthRequest, res) => {
    try {
        const userId = parseInt(req.params.id);

        // Don't allow admin to delete themselves
        if (req.user?.id === userId) {
            return res.status(400).json({ message: 'Không thể xóa tài khoản của chính mình' });
        }

        await db.delete(users).where(eq(users.id, userId));
        res.json({ message: 'Đã xóa người dùng' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

export default router;
