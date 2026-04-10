import { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.js';
import { siteStats } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';

export const analyticsMiddleware = async (req: any, res: Response, next: NextFunction) => {
    // 1. Skip if it's an API tool request (already marked by authMiddleware if used)
    if (req.isApiRequest) return next();

    // 2. Skip if it's an admin path or common asset/internal path
    const path = req.path;
    if (path.startsWith('/api/admin') || path.startsWith('/uploads') || path.startsWith('/static')) {
        return next();
    }

    // 3. Identification of Unique Visitors via a simple cookie (valid for 24h)
    const hasVisitedToday = req.cookies && req.cookies['_v_today'];
    const today = new Date().toISOString().split('T')[0];

    try {
        // Ensure the row for today exists
        const stats = await db.query.siteStats.findFirst({
            where: eq(siteStats.date, today),
        });

        if (!stats) {
            await db.insert(siteStats).values({
                date: today,
                visitors: 1,
                pageViews: 1,
            }).onConflictDoNothing();
        } else {
            // Increment logic
            const updates: any = {
                pageViews: sql`${siteStats.pageViews} + 1`,
            };

            if (!hasVisitedToday) {
                updates.visitors = sql`${siteStats.visitors} + 1`;
            }

            await db.update(siteStats)
                .set(updates)
                .where(eq(siteStats.date, today));
        }

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
