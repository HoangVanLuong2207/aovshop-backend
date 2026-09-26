import crypto, { timingSafeEqual, randomBytes } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { and, desc, eq, gt, lt, sql, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import {
    balanceHolds,
    checkpassBillingOperations,
    checkpassEntitlements,
    checkpassSsoTickets,
    deposits,
    orderItems,
    orders,
    paymentAccounts,
    settings,
    transactions,
    users,
} from '../db/schema.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import {
    CHECKPASS_BLOCK_MINUTES,
    CHECKPASS_BLOCK_PRICE_TENTHS,
    CHECKPASS_FAIL_PRICE_TENTHS,
    CHECKPASS_MAX_BLOCKS,
    CHECKPASS_OK_PRICE_TENTHS,
    CHECKPASS_VVIP_BLOCK_PRICE_TENTHS,
    fromTenths,
    storedBalanceTenths,
} from '../services/money.js';

const ticketLifetimeMs = 60_000;
const holdLifetimeMs = 24 * 60 * 60 * 1000;
const externalReference = z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/);
const count = z.number().int().min(0).max(10_000_000);
const serviceTierSchema = z.enum(['normal', 'vvip']);
type ServiceTier = z.infer<typeof serviceTierSchema>;

const asyncRoute = (handler: (req: any, res: any, next: NextFunction) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) => { void handler(req, res, next).catch(next); };

function ticketHash(code: string) {
    return crypto.createHash('sha256').update(code).digest('hex');
}

function allowedReturnUrl(raw: string): URL | null {
    try {
        const url = new URL(raw);
        const configured = (process.env.CHECKPASS_ALLOWED_ORIGINS || 'https://check.sp1s.shop,http://localhost:8787')
            .split(',').map(value => value.trim()).filter(Boolean);
        if (!configured.includes(url.origin) || url.pathname !== '/auth/callback') return null;
        const state = url.searchParams.get('state');
        url.search = '';
        if (state && /^[A-Za-z0-9_-]{20,128}$/.test(state)) url.searchParams.set('state', state);
        url.hash = '';
        return url;
    } catch {
        return null;
    }
}

function serviceAuth(req: Request, res: Response, next: NextFunction) {
    const expectedValue = process.env.CHECKPASS_SERVICE_TOKEN || '';
    const header = req.get('authorization') || '';
    const suppliedValue = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!expectedValue || !suppliedValue) return res.status(503).json({ ok: false, error: 'Checkpass integration is not configured' });
    const expected = Buffer.from(expectedValue);
    const supplied = Buffer.from(suppliedValue);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
    }
    next();
}

async function activeEntitlement(tx: any, userId: number, serviceTier: ServiceTier = 'normal', now = new Date()) {
    return tx.query.checkpassEntitlements.findFirst({
        where: and(
            eq(checkpassEntitlements.userId, userId),
            eq(checkpassEntitlements.status, 'active'),
            eq(checkpassEntitlements.serviceTier, serviceTier),
            gt(checkpassEntitlements.expiresAt, now.toISOString()),
        ),
        orderBy: desc(checkpassEntitlements.expiresAt),
    });
}

async function accountSnapshot(tx: any, userId: number) {
    const user = await tx.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) return null;
    const held = await tx.select({ total: sql<number>`COALESCE(SUM(${balanceHolds.amountTenths}), 0)` })
        .from(balanceHolds)
        .where(and(
            eq(balanceHolds.userId, userId),
            eq(balanceHolds.status, 'active'),
            gt(balanceHolds.expiresAt, new Date().toISOString()),
        ));
    const balanceTenths = storedBalanceTenths(user);
    const heldTenths = Number(held[0]?.total || 0);
    const entitlement = await activeEntitlement(tx, userId, 'normal');
    const vvipEntitlement = await activeEntitlement(tx, userId, 'vvip');
    return {
        user,
        balanceTenths,
        heldTenths,
        availableTenths: Math.max(0, balanceTenths - heldTenths),
        entitlement,
        vvipEntitlement,
    };
}

function publicEntitlement(entitlement: any) {
    return entitlement ? {
        id: entitlement.id,
        starts_at: entitlement.startsAt,
        expires_at: entitlement.expiresAt,
        block_count: entitlement.blockCount,
        duration_minutes: entitlement.durationMinutes,
        service_tier: entitlement.serviceTier || 'normal',
    } : null;
}

function publicSnapshot(snapshot: NonNullable<Awaited<ReturnType<typeof accountSnapshot>>>) {
    const isAdmin = snapshot.user.role === 'admin';
    return {
        user: {
            id: snapshot.user.id,
            name: snapshot.user.name,
            email: snapshot.user.email,
            role: snapshot.user.role,
        },
        is_admin: isAdmin,
        balance: fromTenths(snapshot.balanceTenths),
        held_balance: fromTenths(snapshot.heldTenths),
        available_balance: fromTenths(snapshot.availableTenths),
        entitlement: publicEntitlement(snapshot.entitlement),
        vvip_entitlement: publicEntitlement(snapshot.vvipEntitlement),
        entitlements: {
            normal: publicEntitlement(snapshot.entitlement),
            vvip: publicEntitlement(snapshot.vvipEntitlement),
        },
    };
}

export const userCheckpassRouter = Router();

userCheckpassRouter.post('/sso/ticket', authMiddleware, asyncRoute(async (req: AuthRequest, res) => {
    const parsed = z.object({ return_url: z.string().url().max(1000) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Return URL không hợp lệ' });
    const target = allowedReturnUrl(parsed.data.return_url);
    if (!target) return res.status(400).json({ message: 'Return URL không được phép' });

    let userId = req.user!.id;
    if (userId <= 0 && req.user?.email) {
        const u = await db.query.users.findFirst({ where: eq(users.email, req.user.email) });
        if (u) userId = u.id;
    }

    const code = crypto.randomBytes(32).toString('base64url');
    const now = new Date();
    await db.delete(checkpassSsoTickets).where(lt(checkpassSsoTickets.expiresAt, now.toISOString()));
    await db.insert(checkpassSsoTickets).values({
        codeHash: ticketHash(code),
        userId,
        audience: 'checkpass',
        returnUrl: target.toString(),
        expiresAt: new Date(now.getTime() + ticketLifetimeMs).toISOString(),
        createdAt: now.toISOString(),
    });
    target.searchParams.set('code', code);
    res.json({ redirect_url: target.toString(), expires_in: ticketLifetimeMs / 1000 });
}));

userCheckpassRouter.get('/status', authMiddleware, asyncRoute(async (req: AuthRequest, res) => {
    const snapshot = await accountSnapshot(db, req.user!.id);
    if (!snapshot) return res.status(404).json({ message: 'User not found' });
    res.json({ ok: true, ...publicSnapshot(snapshot) });
}));

export const checkpassIntegrationRouter = Router();
checkpassIntegrationRouter.use(serviceAuth);

checkpassIntegrationRouter.post('/sso/exchange', asyncRoute(async (req, res) => {
    const parsed = z.object({ code: z.string().min(20).max(256) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: 'SSO code không hợp lệ' });
    const now = new Date().toISOString();
    const result = await db.transaction(async tx => {
        const ticket = await tx.query.checkpassSsoTickets.findFirst({
            where: eq(checkpassSsoTickets.codeHash, ticketHash(parsed.data.code)),
        });
        if (!ticket || ticket.audience !== 'checkpass' || ticket.consumedAt || ticket.expiresAt <= now) return null;
        const consumed = await tx.update(checkpassSsoTickets).set({ consumedAt: now }).where(and(
            eq(checkpassSsoTickets.id, ticket.id),
            sql`${checkpassSsoTickets.consumedAt} IS NULL`,
        )).returning({ id: checkpassSsoTickets.id });
        if (consumed.length !== 1) return null;
        return accountSnapshot(tx, ticket.userId);
    });
    if (!result) return res.status(401).json({ ok: false, error: 'SSO code đã hết hạn hoặc đã sử dụng' });
    res.json({ ok: true, ...publicSnapshot(result) });
}));

checkpassIntegrationRouter.get('/account/:userId', asyncRoute(async (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(400).json({ ok: false, error: 'user_id không hợp lệ' });
    const snapshot = await accountSnapshot(db, userId);
    if (!snapshot) return res.status(404).json({ ok: false, error: 'User not found' });
    res.json({ ok: true, ...publicSnapshot(snapshot) });
}));

checkpassIntegrationRouter.post('/quote', asyncRoute(async (req, res) => {
    const parsed = z.discriminatedUnion('mode', [
        z.object({ mode: z.literal('quantity'), user_id: z.number().int().positive(), submitted_count: count }),
        z.object({ mode: z.literal('time'), user_id: z.number().int().positive(), block_count: z.number().int().min(1).max(CHECKPASS_MAX_BLOCKS) }),
        z.object({ mode: z.literal('vvip'), user_id: z.number().int().positive(), block_count: z.number().int().min(1).max(CHECKPASS_MAX_BLOCKS) }),
    ]).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: 'Dữ liệu báo giá không hợp lệ' });
    const snapshot = await accountSnapshot(db, parsed.data.user_id);
    if (!snapshot) return res.status(404).json({ ok: false, error: 'User not found' });
    const serviceTier: ServiceTier = parsed.data.mode === 'vvip' ? 'vvip' : 'normal';
    const unitPriceTenths = parsed.data.mode === 'quantity'
        ? CHECKPASS_OK_PRICE_TENTHS
        : parsed.data.mode === 'vvip'
            ? CHECKPASS_VVIP_BLOCK_PRICE_TENTHS
            : CHECKPASS_BLOCK_PRICE_TENTHS;
    const amountTenths = parsed.data.mode === 'quantity'
        ? parsed.data.submitted_count * unitPriceTenths
        : parsed.data.block_count * unitPriceTenths;
    const scopedEntitlement = serviceTier === 'vvip' ? snapshot.vvipEntitlement : snapshot.entitlement;
    const coveredByTime = parsed.data.mode !== 'quantity' && Boolean(scopedEntitlement);
    const payableTenths = coveredByTime ? 0 : amountTenths;
    res.json({
        ...publicSnapshot(snapshot),
        ok: true,
        mode: parsed.data.mode,
        service_tier: serviceTier,
        amount: fromTenths(payableTenths),
        amount_tenths: payableTenths,
        maximum_amount: fromTenths(amountTenths),
        maximum_amount_tenths: amountTenths,
        covered_by_time: coveredByTime,
        affordable: snapshot.availableTenths >= payableTenths,
        unit_price: fromTenths(unitPriceTenths),
        duration_minutes: parsed.data.mode === 'quantity' ? null : parsed.data.block_count * CHECKPASS_BLOCK_MINUTES,
        entitlement: publicEntitlement(scopedEntitlement),
    });
}));

checkpassIntegrationRouter.post('/quantity/reserve', asyncRoute(async (req, res) => {
    const parsed = z.object({
        user_id: z.number().int().positive(),
        external_job_reference: externalReference,
        submitted_count: count,
        idempotency_key: externalReference,
    }).safeParse(req.body);
    if (!parsed.success || parsed.data.submitted_count < 1) return res.status(400).json({ ok: false, error: 'Dữ liệu giữ tiền không hợp lệ' });
    try {
        const result = await db.transaction(async tx => {
            const previous = await tx.query.checkpassBillingOperations.findFirst({
                where: eq(checkpassBillingOperations.externalJobReference, parsed.data.external_job_reference),
            });
            if (previous) {
                if (previous.userId !== parsed.data.user_id || previous.billingMode !== 'quantity') throw new Error('REFERENCE_CONFLICT');
                const snapshot = await accountSnapshot(tx, parsed.data.user_id);
                return { previous, snapshot };
            }
            const snapshot = await accountSnapshot(tx, parsed.data.user_id);
            if (!snapshot) throw new Error('USER_NOT_FOUND');
            const amountTenths = parsed.data.submitted_count * CHECKPASS_OK_PRICE_TENTHS;
            if (!Number.isSafeInteger(amountTenths) || snapshot.availableTenths < amountTenths) throw new Error('INSUFFICIENT_BALANCE');
            const now = new Date();
            const [hold] = await tx.insert(balanceHolds).values({
                userId: parsed.data.user_id,
                externalReference: parsed.data.external_job_reference,
                amountTenths,
                expiresAt: new Date(now.getTime() + holdLifetimeMs).toISOString(),
                createdAt: now.toISOString(),
                updatedAt: now.toISOString(),
            }).returning();
            const [operation] = await tx.insert(checkpassBillingOperations).values({
                externalJobReference: parsed.data.external_job_reference,
                userId: parsed.data.user_id,
                billingMode: 'quantity',
                submittedCount: parsed.data.submitted_count,
                unitPriceTenths: CHECKPASS_OK_PRICE_TENTHS,
                estimatedAmountTenths: amountTenths,
                holdId: hold.id,
                status: 'reserved',
                idempotencyKey: parsed.data.idempotency_key,
                createdAt: now.toISOString(),
            }).returning();
            return { previous: operation, snapshot: await accountSnapshot(tx, parsed.data.user_id) };
        });
        res.json({
            ok: true,
            status: result.previous.status,
            hold_id: result.previous.holdId,
            estimated_amount: fromTenths(result.previous.estimatedAmountTenths),
            estimated_amount_tenths: result.previous.estimatedAmountTenths,
            ...publicSnapshot(result.snapshot!),
        });
    } catch (error: any) {
        const code = String(error?.message || '');
        if (code === 'INSUFFICIENT_BALANCE') return res.status(409).json({ ok: false, code, error: 'Số dư khả dụng không đủ' });
        if (code === 'USER_NOT_FOUND') return res.status(404).json({ ok: false, code, error: 'User not found' });
        if (code === 'REFERENCE_CONFLICT') return res.status(409).json({ ok: false, code, error: 'Mã job đã được sử dụng' });
        throw error;
    }
}));

checkpassIntegrationRouter.post('/quantity/settle', asyncRoute(async (req, res) => {
    const parsed = z.object({
        user_id: z.number().int().positive(),
        external_job_reference: externalReference,
        ok_count: count,
        fail_count: count,
        uncheckable_count: count,
        idempotency_key: externalReference,
        master_job_id: z.number().int().positive().optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: 'Dữ liệu quyết toán không hợp lệ' });
    try {
        const result = await db.transaction(async tx => {
            const operation = await tx.query.checkpassBillingOperations.findFirst({
                where: eq(checkpassBillingOperations.externalJobReference, parsed.data.external_job_reference),
            });
            if (!operation || operation.userId !== parsed.data.user_id || operation.billingMode !== 'quantity') throw new Error('OPERATION_NOT_FOUND');
            if (operation.status === 'settled') {
                const snapshot = await accountSnapshot(tx, operation.userId);
                return { operation, snapshot };
            }
            if (operation.status !== 'reserved' || !operation.holdId) throw new Error('INVALID_STATE');
            if (parsed.data.ok_count + parsed.data.fail_count + parsed.data.uncheckable_count > operation.submittedCount) throw new Error('INVALID_COUNTS');
            const actualTenths = (
                parsed.data.ok_count * operation.unitPriceTenths
                + parsed.data.fail_count * CHECKPASS_FAIL_PRICE_TENTHS
            );
            if (actualTenths > operation.estimatedAmountTenths) throw new Error('AMOUNT_EXCEEDS_HOLD');
            const user = await tx.query.users.findFirst({ where: eq(users.id, operation.userId) });
            if (!user) throw new Error('USER_NOT_FOUND');
            const beforeTenths = storedBalanceTenths(user);
            if (beforeTenths < actualTenths) throw new Error('INSUFFICIENT_BALANCE');
            const afterTenths = beforeTenths - actualTenths;
            const now = new Date().toISOString();
            const charged = await tx.update(users).set({
                balanceTenths: afterTenths,
                balance: fromTenths(afterTenths),
                updatedAt: now,
            }).where(and(
                eq(users.id, operation.userId),
                sql`COALESCE(${users.balanceTenths}, ROUND(${users.balance} * 10)) >= ${actualTenths}`,
            )).returning({ id: users.id });
            if (charged.length !== 1) throw new Error('INSUFFICIENT_BALANCE');
            const metadata = JSON.stringify({
                type: 'checkban_quantity',
                master_job_id: parsed.data.master_job_id || null,
                external_job_reference: operation.externalJobReference,
                submitted_count: operation.submittedCount,
                ok_count: parsed.data.ok_count,
                fail_count: parsed.data.fail_count,
                uncheckable_count: parsed.data.uncheckable_count,
                unit_price: fromTenths(operation.unitPriceTenths),
                ok_unit_price: fromTenths(operation.unitPriceTenths),
                fail_unit_price: fromTenths(CHECKPASS_FAIL_PRICE_TENTHS),
            });
            const [order] = await tx.insert(orders).values({
                userId: operation.userId,
                status: 'completed',
                orderType: 'instant',
                subtotal: fromTenths(actualTenths),
                discount: 0,
                total: fromTenths(actualTenths),
                subtotalTenths: actualTenths,
                discountTenths: 0,
                totalTenths: actualTenths,
                source: 'checkban_quantity',
                externalReference: operation.externalJobReference,
                metadata,
                deliveryData: metadata,
                deliveredAt: now,
                createdAt: now,
            }).returning();
            await tx.insert(orderItems).values({
                orderId: order.id,
                productName: `Checkban - ${parsed.data.ok_count} đúng pass, ${parsed.data.fail_count} không thể log`,
                quantity: 1,
                price: fromTenths(actualTenths),
                total: fromTenths(actualTenths),
                priceTenths: actualTenths,
                totalTenths: actualTenths,
            });
            await tx.insert(transactions).values({
                userId: operation.userId,
                type: 'purchase',
                amount: -fromTenths(actualTenths),
                amountTenths: -actualTenths,
                balanceBefore: fromTenths(beforeTenths),
                balanceAfter: fromTenths(afterTenths),
                balanceBeforeTenths: beforeTenths,
                balanceAfterTenths: afterTenths,
                status: 'completed',
                description: `Quyết toán Checkban #${parsed.data.master_job_id || operation.externalJobReference}`,
                reference: operation.externalJobReference,
                orderId: order.id,
            });
            await tx.update(balanceHolds).set({
                status: 'captured', capturedAmountTenths: actualTenths, updatedAt: now,
            }).where(eq(balanceHolds.id, operation.holdId));
            const [settled] = await tx.update(checkpassBillingOperations).set({
                okCount: parsed.data.ok_count,
                failCount: parsed.data.fail_count,
                uncheckableCount: parsed.data.uncheckable_count,
                finalAmountTenths: actualTenths,
                orderId: order.id,
                status: 'settled',
                settledAt: now,
            }).where(eq(checkpassBillingOperations.id, operation.id)).returning();
            return { operation: settled, snapshot: await accountSnapshot(tx, operation.userId) };
        });
        res.json({
            ok: true,
            status: result.operation.status,
            order_id: result.operation.orderId,
            final_amount: fromTenths(result.operation.finalAmountTenths),
            final_amount_tenths: result.operation.finalAmountTenths,
            ...publicSnapshot(result.snapshot!),
        });
    } catch (error: any) {
        const code = String(error?.message || '');
        const known: Record<string, string> = {
            OPERATION_NOT_FOUND: 'Không tìm thấy khoản giữ tiền',
            INVALID_STATE: 'Job không ở trạng thái có thể quyết toán',
            INVALID_COUNTS: 'Số lượng kết quả không hợp lệ',
            AMOUNT_EXCEEDS_HOLD: 'Chi phí vượt khoản đã giữ',
            USER_NOT_FOUND: 'User not found',
            INSUFFICIENT_BALANCE: 'Số dư không đủ để quyết toán',
        };
        if (known[code]) return res.status(409).json({ ok: false, code, error: known[code] });
        throw error;
    }
}));

checkpassIntegrationRouter.post('/quantity/release', asyncRoute(async (req, res) => {
    const parsed = z.object({ user_id: z.number().int().positive(), external_job_reference: externalReference }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: 'Dữ liệu giải phóng không hợp lệ' });
    const result = await db.transaction(async tx => {
        const operation = await tx.query.checkpassBillingOperations.findFirst({
            where: eq(checkpassBillingOperations.externalJobReference, parsed.data.external_job_reference),
        });
        if (!operation || operation.userId !== parsed.data.user_id) return null;
        if (operation.status === 'reserved') {
            if (operation.holdId) await tx.update(balanceHolds).set({ status: 'released', updatedAt: new Date().toISOString() }).where(eq(balanceHolds.id, operation.holdId));
            await tx.update(checkpassBillingOperations).set({ status: 'released', settledAt: new Date().toISOString() }).where(eq(checkpassBillingOperations.id, operation.id));
        }
        return accountSnapshot(tx, operation.userId);
    });
    if (!result) return res.status(404).json({ ok: false, error: 'Không tìm thấy billing operation' });
    res.json({ ok: true, status: 'released', ...publicSnapshot(result) });
}));

checkpassIntegrationRouter.post('/time/activate', asyncRoute(async (req, res) => {
    const parsed = z.object({
        user_id: z.number().int().positive(),
        external_job_reference: externalReference,
        block_count: z.number().int().min(1).max(CHECKPASS_MAX_BLOCKS),
        idempotency_key: externalReference,
        extend: z.boolean().optional().default(false),
        master_job_id: z.number().int().positive().optional(),
        service_tier: serviceTierSchema.optional().default('normal'),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: 'Dữ liệu thuê thời gian không hợp lệ' });
    try {
        const result = await db.transaction(async tx => {
            const serviceTier = parsed.data.service_tier;
            const billingMode = serviceTier === 'vvip' ? 'vvip' : 'time';
            const blockPriceTenths = serviceTier === 'vvip'
                ? CHECKPASS_VVIP_BLOCK_PRICE_TENTHS
                : CHECKPASS_BLOCK_PRICE_TENTHS;
            const previous = await tx.query.checkpassBillingOperations.findFirst({
                where: eq(checkpassBillingOperations.externalJobReference, parsed.data.external_job_reference),
            });
            if (previous) {
                if (previous.userId !== parsed.data.user_id || previous.billingMode !== billingMode || previous.serviceTier !== serviceTier) throw new Error('REFERENCE_CONFLICT');
                const entitlement = previous.entitlementId
                    ? await tx.query.checkpassEntitlements.findFirst({ where: eq(checkpassEntitlements.id, previous.entitlementId) })
                    : null;
                return { operation: previous, entitlement, snapshot: await accountSnapshot(tx, previous.userId), charged: previous.finalAmountTenths > 0 };
            }
            const current = await activeEntitlement(tx, parsed.data.user_id, serviceTier);
            const now = new Date();
            if (current && !parsed.data.extend) {
                const [operation] = await tx.insert(checkpassBillingOperations).values({
                    externalJobReference: parsed.data.external_job_reference,
                    userId: parsed.data.user_id,
                    billingMode,
                    serviceTier,
                    entitlementId: current.id,
                    status: 'covered',
                    idempotencyKey: parsed.data.idempotency_key,
                    createdAt: now.toISOString(),
                    settledAt: now.toISOString(),
                }).returning();
                return { operation, entitlement: current, snapshot: await accountSnapshot(tx, parsed.data.user_id), charged: false };
            }
            const amountTenths = parsed.data.block_count * blockPriceTenths;
            const user = await tx.query.users.findFirst({ where: eq(users.id, parsed.data.user_id) });
            if (!user) throw new Error('USER_NOT_FOUND');
            const snapshotBefore = await accountSnapshot(tx, parsed.data.user_id);
            if (!snapshotBefore || snapshotBefore.availableTenths < amountTenths) throw new Error('INSUFFICIENT_BALANCE');
            const beforeTenths = storedBalanceTenths(user);
            const afterTenths = beforeTenths - amountTenths;
            const charged = await tx.update(users).set({
                balanceTenths: afterTenths,
                balance: fromTenths(afterTenths),
                updatedAt: now.toISOString(),
            }).where(and(
                eq(users.id, user.id),
                sql`COALESCE(${users.balanceTenths}, ROUND(${users.balance} * 10)) >= ${amountTenths}`,
            )).returning({ id: users.id });
            if (charged.length !== 1) throw new Error('INSUFFICIENT_BALANCE');
            const startsAt = current && parsed.data.extend ? new Date(current.expiresAt) : now;
            const expiresAt = new Date(startsAt.getTime() + parsed.data.block_count * CHECKPASS_BLOCK_MINUTES * 60_000);
            const metadata = JSON.stringify({
                type: serviceTier === 'vvip' ? 'checkban_vvip' : 'checkban_time',
                service_tier: serviceTier,
                master_job_id: parsed.data.master_job_id || null,
                external_job_reference: parsed.data.external_job_reference,
                block_count: parsed.data.block_count,
                duration_minutes: parsed.data.block_count * CHECKPASS_BLOCK_MINUTES,
                starts_at: startsAt.toISOString(),
                expires_at: expiresAt.toISOString(),
            });
            const [order] = await tx.insert(orders).values({
                userId: user.id,
                status: 'completed',
                orderType: 'instant',
                subtotal: fromTenths(amountTenths), discount: 0, total: fromTenths(amountTenths),
                subtotalTenths: amountTenths, discountTenths: 0, totalTenths: amountTenths,
                source: serviceTier === 'vvip' ? 'checkban_vvip' : 'checkban_time', externalReference: parsed.data.external_job_reference,
                metadata, deliveryData: metadata, deliveredAt: now.toISOString(), createdAt: now.toISOString(),
            }).returning();
            await tx.insert(orderItems).values({
                orderId: order.id,
                productName: `Thuê Checkban${serviceTier === 'vvip' ? ' VVIP' : ''} ${parsed.data.block_count * CHECKPASS_BLOCK_MINUTES} phút`,
                quantity: parsed.data.block_count,
                price: fromTenths(blockPriceTenths),
                total: fromTenths(amountTenths),
                priceTenths: blockPriceTenths,
                totalTenths: amountTenths,
            });
            const [entitlement] = await tx.insert(checkpassEntitlements).values({
                userId: user.id,
                blockCount: parsed.data.block_count,
                durationMinutes: parsed.data.block_count * CHECKPASS_BLOCK_MINUTES,
                startsAt: startsAt.toISOString(),
                expiresAt: expiresAt.toISOString(),
                orderId: order.id,
                serviceTier,
                source: serviceTier === 'vvip' ? 'checkpass_vvip' : 'checkpass',
                externalReference: parsed.data.external_job_reference,
                createdAt: now.toISOString(),
            }).returning();
            await tx.insert(transactions).values({
                userId: user.id, type: 'purchase', amount: -fromTenths(amountTenths), amountTenths: -amountTenths,
                balanceBefore: fromTenths(beforeTenths), balanceAfter: fromTenths(afterTenths),
                balanceBeforeTenths: beforeTenths, balanceAfterTenths: afterTenths,
                status: 'completed', description: `Thuê Checkban${serviceTier === 'vvip' ? ' VVIP' : ''} ${entitlement.durationMinutes} phút`,
                reference: parsed.data.external_job_reference, orderId: order.id,
            });
            const [operation] = await tx.insert(checkpassBillingOperations).values({
                externalJobReference: parsed.data.external_job_reference,
                userId: user.id,
                billingMode,
                serviceTier,
                unitPriceTenths: blockPriceTenths,
                estimatedAmountTenths: amountTenths,
                finalAmountTenths: amountTenths,
                entitlementId: entitlement.id,
                orderId: order.id,
                status: 'settled',
                idempotencyKey: parsed.data.idempotency_key,
                createdAt: now.toISOString(), settledAt: now.toISOString(),
            }).returning();
            return { operation, entitlement, snapshot: await accountSnapshot(tx, user.id), charged: true };
        });
        const entitlementPayload = publicEntitlement(result.entitlement);
        res.json({
            ...publicSnapshot(result.snapshot!),
            ok: true,
            status: result.operation.status,
            service_tier: result.operation.serviceTier || 'normal',
            charged: result.charged,
            amount: fromTenths(result.operation.finalAmountTenths),
            amount_tenths: result.operation.finalAmountTenths,
            order_id: result.operation.orderId,
            entitlement: entitlementPayload,
            activated_entitlement: entitlementPayload,
        });
    } catch (error: any) {
        const code = String(error?.message || '');
        if (code === 'INSUFFICIENT_BALANCE') return res.status(409).json({ ok: false, code, error: 'Số dư khả dụng không đủ' });
        if (code === 'USER_NOT_FOUND') return res.status(404).json({ ok: false, code, error: 'User not found' });
        if (code === 'REFERENCE_CONFLICT') return res.status(409).json({ ok: false, code, error: 'Mã job đã được sử dụng' });
        throw error;
    }
}));

checkpassIntegrationRouter.get('/operations/:reference', asyncRoute(async (req, res) => {
    const reference = String(req.params.reference || '');
    const operation = await db.query.checkpassBillingOperations.findFirst({
        where: eq(checkpassBillingOperations.externalJobReference, reference),
    });
    if (!operation) return res.status(404).json({ ok: false, error: 'Operation not found' });
    res.json({
        ok: true,
        status: operation.status,
        mode: operation.billingMode,
        order_id: operation.orderId,
        final_amount: fromTenths(operation.finalAmountTenths),
        entitlement_id: operation.entitlementId,
    });
}));

// --- In-Checkpass Direct Deposit Endpoints ---
const DEFAULT_MIN_DEPOSIT = 10000;
const MAX_DEPOSIT = 1000000000;

async function fetchMinDeposit(): Promise<number> {
    const s = await db.query.settings.findFirst({ where: eq(settings.key, 'minimum_deposit_amount') });
    const n = Number(s?.value);
    return Number.isSafeInteger(n) && n > 0 && n <= MAX_DEPOSIT ? n : DEFAULT_MIN_DEPOSIT;
}

checkpassIntegrationRouter.get('/deposit/config', asyncRoute(async (req, res) => {
    const min = await fetchMinDeposit();
    res.json({ ok: true, minimum_deposit_amount: min });
}));

checkpassIntegrationRouter.post('/deposit/create', asyncRoute(async (req, res) => {
    const parsed = z.object({
        user_id: z.number().int().positive(),
        amount: z.number().int().positive(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: 'Dữ liệu nạp tiền không hợp lệ' });

    const { user_id: userId, amount } = parsed.data;
    const min = await fetchMinDeposit();
    if (amount < min || amount > MAX_DEPOSIT) {
        return res.status(400).json({
            ok: false,
            error: `Số tiền nạp tối thiểu là ${new Intl.NumberFormat('vi-VN').format(min)}đ`,
            minimum_deposit_amount: min,
        });
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) return res.status(404).json({ ok: false, error: 'User không tồn tại' });

    const allActiveBanks = await db.query.paymentAccounts.findMany({
        where: eq(paymentAccounts.isActive, true),
    });
    if (allActiveBanks.length === 0) {
        return res.status(503).json({ ok: false, error: 'Hiện không có cổng ngân hàng nào hoạt động' });
    }

    const bankIds = allActiveBanks.map(b => b.id);
    const countRows = await db.select({
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

    const countsMap = new Map<number, number>(countRows.map(r => [r.bankId as number, r.count || 0]));

    const sortedBanks = [...allActiveBanks].map(b => {
        const c = countsMap.get(b.id) || 0;
        return { ...b, count: c, cycle: Math.floor(c / 50) };
    }).sort((a, b) => a.cycle !== b.cycle ? a.cycle - b.cycle : a.count - b.count);

    const selectedBank = sortedBanks[0];
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const timestamp = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear().toString().slice(-2)}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const reference = `NAP${timestamp}${randomBytes(8).toString('hex')}U${userId}`;

    const [newDep] = await db.insert(deposits).values({
        userId,
        amount,
        reference,
        bankId: selectedBank.id,
        status: 'pending',
    }).returning();

    const qrUrl = `https://img.vietqr.io/image/${selectedBank.bankName}-${selectedBank.accountNumber}-compact2.png?amount=${amount}&addInfo=${reference}&accountName=${encodeURIComponent(selectedBank.accountName)}`;

    res.json({
        ok: true,
        deposit_id: newDep.id,
        reference,
        amount,
        bank_name: selectedBank.bankName,
        account_number: selectedBank.accountNumber,
        account_name: selectedBank.accountName,
        qr_url: qrUrl,
    });
}));

checkpassIntegrationRouter.get('/deposit/status/:reference', asyncRoute(async (req, res) => {
    const reference = String(req.params.reference || '');
    const dep = await db.query.deposits.findFirst({
        where: eq(deposits.reference, reference),
    });
    if (!dep) return res.status(404).json({ ok: false, error: 'Đơn nạp không tồn tại' });
    const userSnapshot = dep.status === 'completed' ? await accountSnapshot(db, dep.userId) : null;
    res.json({
        ok: true,
        reference: dep.reference,
        status: dep.status,
        amount: dep.amount,
        created_at: dep.createdAt,
        user_snapshot: userSnapshot ? publicSnapshot(userSnapshot) : null,
    });
}));
