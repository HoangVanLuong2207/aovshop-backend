import webpush from 'web-push';
import { db } from '../db/index.js';
import { settings, pushSubscriptions } from '../db/schema.js';
import { eq, inArray } from 'drizzle-orm';

async function getPushConfig() {
    try {
        const result = await db.query.settings.findMany();
        const config = Object.fromEntries(result.map(s => [s.key, s.value]));
        
        return {
            enabled: config.push_enabled === 'true',
            publicKey: config.vapid_public_key,
            privateKey: config.vapid_private_key,
            subject: config.vapid_subject || 'mailto:admin@example.com'
        };
    } catch (error) {
        console.error('[Push] Error fetching config:', error);
        return { enabled: false, publicKey: '', privateKey: '', subject: '' };
    }
}

let isInitialized = false;

async function initWebPush() {
    if (isInitialized) return true;
    
    const config = await getPushConfig();
    if (!config.enabled || !config.publicKey || !config.privateKey) {
        return false;
    }

    webpush.setVapidDetails(
        config.subject,
        config.publicKey,
        config.privateKey
    );
    
    isInitialized = true;
    return true;
}

export const PushService = {
    subscribe: async (userId: number | null, subscription: any, userAgent?: string) => {
        try {
            const { endpoint, keys } = subscription;
            if (!endpoint || !keys?.p256dh || !keys?.auth) {
                throw new Error('Invalid subscription data');
            }

            await db.insert(pushSubscriptions).values({
                userId,
                endpoint,
                p256dh: keys.p256dh,
                auth: keys.auth,
                userAgent,
            }).onConflictDoUpdate({
                target: pushSubscriptions.endpoint,
                set: {
                    userId,
                    userAgent,
                    createdAt: new Date().toISOString()
                }
            });

            return true;
        } catch (error) {
            console.error('[Push] Subscribe error:', error);
            return false;
        }
    },

    unsubscribe: async (endpoint: string) => {
        try {
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
            return true;
        } catch (error) {
            console.error('[Push] Unsubscribe error:', error);
            return false;
        }
    },

    sendNotification: async (userId: number | null, payload: any) => {
        const initialized = await initWebPush();
        if (!initialized) return;

        try {
            // If userId is null, send to all admins? Or just use a specific logic.
            // For now, if userId is null, it might be for a broadcast or admin-only.
            const subs = await db.query.pushSubscriptions.findMany({
                where: userId ? eq(pushSubscriptions.userId, userId) : undefined,
            });

            const results = await Promise.allSettled(subs.map(async (sub) => {
                const pushSubscription = {
                    endpoint: sub.endpoint,
                    keys: {
                        p256dh: sub.p256dh,
                        auth: sub.auth,
                    }
                };

                try {
                    await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
                } catch (error: any) {
                    if (error.statusCode === 410 || error.statusCode === 404) {
                        // Subscription expired or invalid
                        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint));
                    }
                    throw error;
                }
            }));

            return results;
        } catch (error) {
            console.error('[Push] Send error:', error);
        }
    },

    notifyAdmin: async (payload: any) => {
        const initialized = await initWebPush();
        if (!initialized) return;

        try {
            // Find all admin subscriptions
            const adminUsers = await db.query.users.findMany({
                where: eq(users.role, 'admin'),
            });
            const adminIds = adminUsers.map(u => u.id);
            
            if (adminIds.length === 0) return;

            const subs = await db.query.pushSubscriptions.findMany({
                where: inArray(pushSubscriptions.userId, adminIds),
            });

            await Promise.allSettled(subs.map(async (sub) => {
                const pushSubscription = {
                    endpoint: sub.endpoint,
                    keys: {
                        p256dh: sub.p256dh,
                        auth: sub.auth,
                    }
                };
                try {
                    await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
                } catch (error: any) {
                    if (error.statusCode === 410 || error.statusCode === 404) {
                        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint));
                    }
                }
            }));
        } catch (error) {
            console.error('[Push] Admin Notify error:', error);
        }
    }
};

// Also need to import users for notifyAdmin
import { users } from '../db/schema.js';
