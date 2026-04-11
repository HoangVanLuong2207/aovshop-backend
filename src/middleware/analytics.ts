import { Response, NextFunction } from 'express';
import { db } from '../db/index.js';
import { siteStats } from '../db/schema.js';
import { sql } from 'drizzle-orm';
import { getApiAuthToken } from '../services/tokenCache.js';

export const analyticsMiddleware = async (req: any, res: Response, next: NextFunction) => {
    // 1. Require fixed API token from settings for analytics updates.
    // Uses shared cache — no extra DB read if authMiddleware already fetched it.
    const fixedApiToken = await getApiAuthToken();
    if (!fixedApiToken) return next();

    const authHeader = req.headers.authorization;
    const requestToken = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : null;
    if (requestToken !== fixedApiToken) return next();

    // 2. Skip if it's an admin path or common asset/internal path
    const path = req.path;
    if (path.startsWith('/api/admin') || path.startsWith('/uploads') || path.startsWith('/static')) {
        return next();
    }

    // 3. Identification of Unique Visitors via a simple cookie (valid for 24h)
    const hasVisitedToday = req.cookies && req.cookies['_v_today'];
    const today = new Date().toISOString().split('T')[0];

    try {
        const visitorIncrement = hasVisitedToday ? 0 : 1;
        // Single statement UPSERT avoids a pre-read per request.
        await db.insert(siteStats).values({
            date: today,
            visitors: visitorIncrement,
            pageViews: 1,
        }).onConflictDoUpdate({
            target: siteStats.date,
            set: {
                visitors: sql`${siteStats.visitors} + ${visitorIncrement}`,
                pageViews: sql`${siteStats.pageViews} + 1`,
            },
        });

        // Set cookie if not present to mark UV for today
        if (!hasVisitedToday) {
            res.cookie('_v_today', '1', { 
                maxAge: 24 * 60 * 60 * 1000, // 24 hours
                httpOnly: true,
                sameSite: 'lax'
            });
        }

    } catch (error) {
        console.error('Analytics Error:', error);
    }

    next();
};
