import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
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
    createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
    updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
});

// Categories table
export const categories = sqliteTable('categories', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    description: text('description'),
    image: text('image'),
    active: integer('active', { mode: 'boolean' }).default(true).notNull(),
    createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
    updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
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
    createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
    updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
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
    createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
    updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
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
    createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
    updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
});

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
    createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
});

// Settings table (key-value store for admin configurations)
export const settings = sqliteTable('settings', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    key: text('key').notNull().unique(),
    value: text('value'),
    description: text('description'),
    updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
});

// Deposits table (pending deposit requests)
export const deposits = sqliteTable('deposits', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').references(() => users.id).notNull(),
    amount: real('amount').notNull(),
    status: text('status', { enum: ['pending', 'completed', 'failed', 'expired'] }).default('pending').notNull(),
    reference: text('reference').notNull().unique(),
    transactionId: text('transaction_id'),
    createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
    updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
});

// Product accounts (the actual digital goods)
export const productAccounts = sqliteTable('product_accounts', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    productId: integer('product_id').references(() => products.id).notNull(),
    orderId: integer('order_id').references(() => orders.id), // Link to order when sold
    data: text('data').notNull(), // username|password
    status: text('status', { enum: ['available', 'sold'] }).default('available').notNull(),
    createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
    updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
    orders: many(orders),
    transactions: many(transactions),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
    products: many(products),
}));

export const productsRelations = relations(products, ({ one }) => ({
    category: one(categories, {
        fields: [products.categoryId],
        references: [categories.id],
    }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
    user: one(users, {
        fields: [orders.userId],
        references: [users.id],
    }),
    items: many(orderItems),
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

export const productsRelationsExt = relations(products, ({ many }) => ({
    accounts: many(productAccounts),
}));

export const ordersRelationsExt = relations(orders, ({ many }) => ({
    accounts: many(productAccounts),
}));
