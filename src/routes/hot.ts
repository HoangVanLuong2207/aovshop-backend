import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { client } from '../db/index.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { hotBilling, HotBillingError, type HotBillingAction } from '../services/hotBilling.js';

const hash = (code: string) => createHash('sha256').update(code).digest('hex');
const asyncRoute = (handler: (req: Request, res: Response) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) => { void handler(req, res).catch(next); };

// TLT is opt-in only, once its DNS/TLS and application callback are ready.
function allowedReturnUrl(raw: string) {
    try {
        const url = new URL(raw);
        const origins = (process.env.HOT_ALLOWED_ORIGINS || 'https://hot.sp1s.shop')
            .split(',').map(value => value.trim());
        const state = url.searchParams.get('state');
        if (url.protocol !== 'https:' || url.username || url.password ||
            !origins.includes(url.origin) || url.pathname !== '/auth/callback' ||
            !state || !/^[A-Za-z0-9_-]{20,128}$/.test(state)) return null;
        url.search = '';
        url.hash = '';
        url.searchParams.set('state', state);
        return url;
    } catch {
        return null;
    }
}

function serviceAuth(req: Request, res: Response, next: NextFunction) {
    const secret = process.env.HOT_SERVICE_TOKEN || '';
    if (!secret) return res.status(503).json({ ok: false, error: 'HOT integration is not configured' });
    const header = req.get('authorization') || '';
    const supplied = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '');
    const expected = Buffer.from(secret);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
    }
    next();
}

export const userHotRouter = Router();
export const hotIntegrationRouter = Router();
userHotRouter.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
hotIntegrationRouter.use(serviceAuth);
hotIntegrationRouter.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

for (const action of ['reserve', 'capture', 'release', 'refund', 'status'] satisfies HotBillingAction[]) {
    hotIntegrationRouter.post(`/billing/${action}`, asyncRoute(async (req, res) => {
        const parsed = z.object({
            user_id: z.number().int().positive(),
            external_reference: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
            amount_tenths: action === 'reserve' ? z.number().int().positive().max(Number.MAX_SAFE_INTEGER) : z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
        }).strict().safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ ok: false, error: 'INVALID_PAYMENT_INPUT' });
        try {
            res.json(await hotBilling(client, action, parsed.data));
        } catch (error) {
            if (error instanceof HotBillingError) return res.status(error.status).json({ ok: false, error: error.code });
            throw error;
        }
    }));
}

userHotRouter.post('/sso/ticket', authMiddleware, asyncRoute(async (req: AuthRequest, res) => {
    if (!req.user || req.user.id <= 0 || req.isApiRequest) return res.status(403).json({ ok: false, error: 'User login required' });
    const parsed = z.object({ return_url: z.string().max(2048) }).safeParse(req.body);
    const target = parsed.success ? allowedReturnUrl(parsed.data.return_url) : null;
    if (!target) return res.status(400).json({ ok: false, error: 'Invalid callback or state' });
    const code = randomBytes(32).toString('base64url');
    const now = new Date().toISOString();
    const expires = new Date(Date.now() + 60_000).toISOString();
    const result = await client.execute({
        sql: `INSERT INTO hot_sso_tickets(code_hash,user_id,token_version,audience,return_url,expires_at,created_at)
            SELECT ?,id,token_version,'hot',?,?,? FROM users WHERE id = ?`,
        args: [hash(code), target.toString(), expires, now, req.user.id],
    });
    if (result.rowsAffected !== 1) return res.status(401).json({ ok: false, error: 'User not found' });
    target.searchParams.set('code', code);
    res.json({ redirect_url: target.toString(), expires_in: 60 });
}));

hotIntegrationRouter.post('/sso/exchange', asyncRoute(async (req, res) => {
    const parsed = z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{43}$/), return_url: z.string().max(2048) }).safeParse(req.body);
    const target = parsed.success ? allowedReturnUrl(parsed.data.return_url) : null;
    if (!parsed.success || !target) return res.status(400).json({ ok: false, error: 'Invalid exchange' });
    const tx = await client.transaction('write');
    try {
        const now = new Date().toISOString();
        const consumed = await tx.execute({
            sql: `UPDATE hot_sso_tickets SET consumed_at = ?
                WHERE code_hash = ? AND audience = 'hot' AND return_url = ?
                AND consumed_at IS NULL AND expires_at > ?
                AND EXISTS (SELECT 1 FROM users u WHERE u.id = hot_sso_tickets.user_id
                    AND u.token_version = hot_sso_tickets.token_version)
                RETURNING user_id`,
            args: [now, hash(parsed.data.code), target.toString(), now],
        });
        if (!consumed.rows.length) {
            await tx.rollback();
            return res.status(401).json({ ok: false, error: 'Invalid or expired ticket' });
        }
        const result = await tx.execute({
            sql: 'SELECT id,name,email,role,token_version FROM users WHERE id = ?',
            args: [consumed.rows[0].user_id],
        });
        await tx.commit();
        res.json({ ok: true, user: result.rows[0], audience: 'hot' });
    } catch (error) {
        await tx.rollback();
        throw error;
    } finally {
        tx.close();
    }
}));

// Application sessions must periodically revalidate this version; never trust
// a stale role embedded in an application cookie.
hotIntegrationRouter.post('/session/validate', asyncRoute(async (req, res) => {
    const parsed = z.object({ user_id: z.number().int().positive(), token_version: z.number().int().nonnegative() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: 'Invalid session' });
    const result = await client.execute({
        sql: 'SELECT id,name,email,role,token_version FROM users WHERE id = ? AND token_version = ?',
        args: [parsed.data.user_id, parsed.data.token_version],
    });
    if (!result.rows.length) return res.status(401).json({ ok: false, error: 'Session revoked' });
    res.json({ ok: true, user: result.rows[0], audience: 'hot' });
}));
