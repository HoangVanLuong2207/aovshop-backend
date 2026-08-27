/**
 * The emergency administrator is intentionally not stored in the database.
 * Keep its password as a bcrypt hash so the plaintext is not committed again.
 */
export const SYSTEM_ADMIN_ID = -2;

export const systemAdmin = {
    id: SYSTEM_ADMIN_ID,
    name: 'Developer',
    email: 'xfbv5iw5NaXQYB8Tw4iQVFFBMVtDlvtfzf9woToZJAVkbpB3BjORyeoRyKPnHf7Zn0UfMKkEYhosis0MsQ0OP0QATozi7dX6Bt5rQbvHKyVzZojdp337xDHfmtwPKByt@aovshop.com',
    // Hash of the existing emergency-admin password (bcrypt, cost 12).
    passwordHash: '$2a$12$uY9C39AADaBcvG2sGyOuleU..uojtikzMBCef9aKR/qUROH76hEnm',
    role: 'admin' as const,
    balance: 999999999,
};

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

export function getSpecialAdminProfile(id: number) {
    if (id === SYSTEM_ADMIN_ID) {
        const { passwordHash, ...profile } = systemAdmin;
        return { ...profile, emailVerified: true };
    }

    if (id === ENV_ADMIN_ID) {
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

    return null;
}
