export const ENV_ADMIN_ID = -1;

export function normalizeEmail(email: unknown): string | null {
    if (typeof email !== 'string') return null;
    const normalized = email.trim().toLowerCase();
    return normalized || null;
}

export function getEnvAdminCredentials() {
    const email = normalizeEmail(process.env.ADMIN_EMAIL);
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) return null;
    return { email, password };
}

export function getEnvAdminProfile(id: number) {
    if (id !== ENV_ADMIN_ID) return null;

    const credentials = getEnvAdminCredentials();
    if (!credentials) return null;
    return {
        id: ENV_ADMIN_ID,
        name: 'Admin',
        email: credentials.email,
        role: 'admin' as const,
        balance: 0,
        emailVerified: true,
    };
}
