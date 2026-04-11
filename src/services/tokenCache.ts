import { db } from '../db/index.js';
import { settings } from '../db/schema.js';
import { eq } from 'drizzle-orm';

let cachedApiToken: string | null = null;
let cachedApiTokenAt = 0;
const API_TOKEN_CACHE_TTL_MS = 60 * 1000; // 1 minute

/**
 * Shared cache for api_auth_token from settings.
 * Both authMiddleware and analyticsMiddleware use this
 * to avoid duplicate DB reads on every request.
 */
export const getApiAuthToken = async (): Promise<string | null> => {
    const now = Date.now();
    if (cachedApiTokenAt && now - cachedApiTokenAt < API_TOKEN_CACHE_TTL_MS) {
        return cachedApiToken;
    }

    const tokenSetting = await db.query.settings.findFirst({
        where: eq(settings.key, 'api_auth_token'),
    });
    cachedApiToken = tokenSetting?.value || null;
    cachedApiTokenAt = now;
    return cachedApiToken;
};

/**
 * Call this after updating api_auth_token in DB
 * so the cache is invalidated immediately.
 */
export const invalidateApiTokenCache = () => {
    cachedApiTokenAt = 0;
    cachedApiToken = null;
};
