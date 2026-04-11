import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// Users table
export const users = sqliteTable('users', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    password: text('password').notNull(),
    role: text('role', { enum: ['admin', 'user'] }).default('user').notNull(),
    balance: real('balance').default(0).notNull(),
    emailVerified: integer('email_verified', { mode: 'boolean' }).default(true).notNull(), // default true for existing users
    verificationToken: text('verification_token'),
    verificationExpires: text('verification_expires'),
    resetPasswordToken: text('reset_password_token'),
    resetPasswordExpires: text('reset_password_expires'),
    createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// Categories table
export const categories = sqliteTable('categories', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    description: text('description'),
    image: text('image'),
    active: integer('active', { mode: 'boolean' }).default(true).notNull(),
    createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// Products table
export const products = sqliteTable('products', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    categoryId: integer('category_id').references(() => categories.id),
    name: text('name').notNull(),
    description: text('description'),
    price: real('price').notNull(),
    salePrice: real('sale_price'),
    stock: integer('stock').default(0).notNull(),
    soldCount: integer('sold_count').default(0).notNull(),
    image: text('image'),
    active: integer('active', { mode: 'boolean' }).default(true).notNull(),
    createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// Promotions table
export const promotions = sqliteTable('promotions', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),
    type: text('type', { enum: ['percent', 'fixed'] }).notNull(),
    value: real('value').notNull(),
    minOrder: real('min_order').default(0),
    maxDiscount: real('max_discount'),
    usageLimit: integer('usage_limit'),
    usedCount: integer('used_count').default(0),
    startDate: text('start_date'),
    endDate: text('end_date'),
    active: integer('active', { mode: 'boolean' }).default(true).notNull(),
    createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// Orders table
export const orders = sqliteTable('orders', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').references(() => users.id).notNull(),
    status: text('status', { enum: ['pending', 'completed', 'cancelled'] }).default('pending').notNull(),
    subtotal: real('subtotal').notNull(),
    discount: real('discount').default(0),
    total: real('total').notNull(),
    promoCode: text('promo_code'),
    note: text('note'),
    createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
}, (table) => ({
    userIdIdx: index('idx_orders_user_id').on(table.userId),
    createdAtIdx: index('idx_orders_created_at').on(table.createdAt),
}));

// Order items table
export const orderItems = sqliteTable('order_items', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    orderId: integer('order_id').references(() => orders.id).notNull(),
    productId: integer('product_id').references(() => products.id),
    productName: text('product_name').notNull(),
    quantity: integer('quantity').notNull(),
    price: real('price').notNull(),
    total: real('total').notNull(),
});

// Transactions table
export const transactions = sqliteTable('transactions', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').references(() => users.id).notNull(),
    type: text('type', { enum: ['deposit', 'purchase', 'refund'] }).notNull(),
    amount: real('amount').notNull(),
    balanceBefore: real('balance_before').notNull(),
    balanceAfter: real('balance_after').notNull(),
    status: text('status', { enum: ['pending', 'completed', 'failed'] }).default('completed').notNull(),
    description: text('description'),
    reference: text('reference'),
    orderId: integer('order_id').references(() => orders.id),
    createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
}, (table) => ({
    userIdIdx: index('idx_transactions_user_id').on(table.userId),
    referenceIdx: index('idx_transactions_reference').on(table.reference),
    createdAtIdx: index('idx_transactions_created_at').on(table.createdAt),
}));

// Settings table (key-value store for admin configurations)
export const settings = sqliteTable('settings', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    key: text('key').notNull().unique(),
    value: text('value'),
    description: text('description'),
    updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// Deposits table (pending deposit requests)
export const deposits = sqliteTable('deposits', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').references(() => users.id).notNull(),
    amount: real('amount').notNull(),
    status: text('status', { enum: ['pending', 'completed', 'failed', 'expired'] }).default('pending').notNull(),
    reference: text('reference').notNull().unique(),
    transactionId: text('transaction_id'),
    bankId: integer('bank_id').references(() => paymentAccounts.id),
    createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
}, (table) => ({
    userIdIdx: index('idx_deposits_user_id').on(table.userId),
    bankStatusCreatedIdx: index('idx_deposits_bank_status_created').on(table.bankId, table.status, table.createdAt),
    statusCreatedIdx: index('idx_deposits_status_created').on(table.status, table.createdAt),
}));

// Product accounts (the actual digital goods)
export const productAccounts = sqliteTable('product_accounts', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    productId: integer('product_id').references(() => products.id).notNull(),
    orderId: integer('order_id').references(() => orders.id), // Link to order when sold
    data: text('data').notNull().unique(), // user|pass|mail — unique across all products
    status: text('status', { enum: ['available', 'sold'] }).default('available').notNull(),
    createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
}, (table) => ({
    productStatusIdx: index('idx_product_accounts_product_status').on(table.productId, table.status),
    orderIdIdx: index('idx_product_accounts_order_id').on(table.orderId),
}));

// Product images (gallery)
export const productImages = sqliteTable('product_images', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    productId: integer('product_id').references(() => products.id).notNull(),
    url: text('url').notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// Payment accounts (multiple banks)
export const paymentAccounts = sqliteTable('payment_accounts', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    bankName: text('bank_name').notNull(), // e.g., MB, VCB
    accountNumber: text('account_number').notNull(),
    accountName: text('account_name').notNull(),
    merchantId: text('merchant_id'), // Individual Merchant ID
    secretKey: text('secret_key'),   // Individual Secret Key
    description: text('description'),
    image: text('image'), // Bank logo URL
    isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
    createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
}, (table) => ({
    bankNameActiveIdx: index('idx_payment_accounts_bank_name_active').on(table.bankName, table.isActive),
    activeIdx: index('idx_payment_accounts_is_active').on(table.isActive),
}));

// Site statistics table for traffic analytics
export const siteStats = sqliteTable('site_stats', {
    date: text('date').primaryKey(), // YYYY-MM-DD
    visitors: integer('visitors').default(0).notNull(),
    pageViews: integer('page_views').default(0).notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
    orders: many(orders),
    transactions: many(transactions),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
    products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
    category: one(categories, {
        fields: [products.categoryId],
        references: [categories.id],
    }),
    accounts: many(productAccounts),
    images: many(productImages),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
    user: one(users, {
        fields: [orders.userId],
        references: [users.id],
    }),
    items: many(orderItems),
    accounts: many(productAccounts),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
    order: one(orders, {
        fields: [orderItems.orderId],
        references: [orders.id],
    }),
    product: one(products, {
        fields: [orderItems.productId],
        references: [products.id],
    }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
    user: one(users, {
        fields: [transactions.userId],
        references: [users.id],
    }),
    order: one(orders, {
        fields: [transactions.orderId],
        references: [orders.id],
    }),
}));

export const productAccountsRelations = relations(productAccounts, ({ one }) => ({
    product: one(products, {
        fields: [productAccounts.productId],
        references: [products.id],
    }),
    order: one(orders, {
        fields: [productAccounts.orderId],
        references: [orders.id],
    }),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
    product: one(products, {
        fields: [productImages.productId],
        references: [products.id],
    }),
}));

export const depositsRelations = relations(deposits, ({ one }) => ({
    user: one(users, {
        fields: [deposits.userId],
        references: [users.id],
    }),
    bank: one(paymentAccounts, {
        fields: [deposits.bankId],
        references: [paymentAccounts.id],
    }),
}));

