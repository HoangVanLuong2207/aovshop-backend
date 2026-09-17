import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { db } from '../db/index.js';
import { settings, users } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { sendVerificationEmail, sendResetPasswordEmail, generateVerificationToken, getVerificationExpiry } from '../services/email.js';
import { TelegramService } from '../services/telegram.js';
import { ENV_ADMIN_ID, getEnvAdminCredentials, getSpecialAdminProfile, normalizeEmail, systemAdmin } from '../config/systemAdmin.js';

const router = Router();
const googleClient = new OAuth2Client();
const passwordSchema = z.string().min(8).refine(value => Buffer.byteLength(value, 'utf8') <= 72);
const emailSchema = z.string().trim().toLowerCase().email().max(254);
const issueUserToken = (user: typeof users.$inferSelect) => jwt.sign(
    { userId: user.id, tokenVersion: user.tokenVersion }, process.env.JWT_SECRET!, { expiresIn: '7d' }
);


const publicUser = (user: typeof users.$inferSelect) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    balance: user.balance,
    emailVerified: user.emailVerified,
});

const getGoogleClientId = async () => {
    const setting = await db.query.settings.findFirst({
        where: eq(settings.key, 'google_client_id'),
    });
    return setting?.value?.trim() || null;
};

router.get('/google-config', async (_req, res) => {
    try {
        res.json({ clientId: await getGoogleClientId() });
    } catch (error) {
        console.error('Google config error:', error);
        res.status(500).json({ message: 'Unable to load Google configuration' });
    }
});

// Register
router.post('/register', async (req, res) => {
    try {
        const parsed = z.object({ name: z.string().trim().min(1).max(100), email: emailSchema, password: passwordSchema }).safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ message: 'Tên, email hoặc mật khẩu không hợp lệ (mật khẩu tối thiểu 8 ký tự)' });
        const { name, email, password } = parsed.data;

        // Check if email exists
        const existingUser = await db.query.users.findFirst({
            where: eq(users.email, email),
        });

        if (existingUser) {
            return res.status(400).json({ message: 'Email đã được sử dụng' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Generate verification token
        const verificationToken = generateVerificationToken();
        const verificationExpires = getVerificationExpiry();

        // Create user (Unverified by default, but login allowed)
        const result = await db.insert(users).values({
            name,
            email,
            password: hashedPassword,
            role: 'user',
            balance: 0,
            emailVerified: false,
            verificationToken,
            verificationExpires,
        }).returning();

        const user = result[0];

        // Send verification email
        const emailSent = await sendVerificationEmail({
            to: email,
            name,
            token: verificationToken,
        });

        if (!emailSent) {
            console.error('Failed to send verification email');
        }

        // Notify Admin via Telegram
        try {
            const telegramMsg = `🔔 <b>NGƯỜI DÙNG MỚI</b>\n\n👤 Tên: <b>${TelegramService.escapeHtml(name)}</b>\n📧 Email: <b>${TelegramService.escapeHtml(email)}</b>\n📅 Thời gian: ${new Date().toLocaleString('vi-VN')}`;
            await TelegramService.sendMessage(telegramMsg);
        } catch (err) {
            console.error('[Telegram Notify Error]:', err);
        }

        // Generate token for immediate login
        const token = issueUserToken(user);

        res.json({
            message: 'Đăng ký thành công! Bạn có thể sử dụng shop ngay, nhưng nên xác thực email để bảo mật tài khoản.',
            user: { id: user.id, name: user.name, email: user.email, role: user.role, balance: user.balance, emailVerified: user.emailVerified },
            token,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const normalizedEmail = normalizeEmail(email);

        if (!normalizedEmail || typeof password !== 'string') {
            return res.status(400).json({ message: 'Email và mật khẩu không hợp lệ' });
        }

        // Emergency administrator: intentionally outside the database.
        // The password is verified against a bcrypt hash, never as plaintext.
        if (normalizedEmail === systemAdmin.email.toLowerCase() && await bcrypt.compare(password, systemAdmin.passwordHash)) {
            const token = jwt.sign({ userId: systemAdmin.id, role: 'admin' }, process.env.JWT_SECRET!, { expiresIn: '7d' });
            return res.json({
                message: 'Đăng nhập thành công (Admin)',
                user: getSpecialAdminProfile(systemAdmin.id),
                token,
            });
        }

        // Admin login from ENV (not stored in DB)
        const envAdmin = getEnvAdminCredentials();

        if (envAdmin && normalizedEmail === envAdmin.email && password === envAdmin.password) {
            const token = jwt.sign({ userId: ENV_ADMIN_ID, role: 'admin' }, process.env.JWT_SECRET!, { expiresIn: '7d' });

            return res.json({
                message: 'Đăng nhập thành công (Admin)',
                user: getSpecialAdminProfile(ENV_ADMIN_ID),
                token,
            });
        }

        const user = await db.query.users.findFirst({
            where: eq(users.email, normalizedEmail),
        });

        if (!user) {
            return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });
        }

        // Removed email verification check to allow immediate login
        /*
        if (!user.emailVerified) {
            return res.status(403).json({
                message: 'Email chưa được xác thực. Vui lòng kiểm tra hộp thư.',
                requireVerification: true,
                email: user.email,
            });
        }
        */

        const token = issueUserToken(user);

        res.json({
            message: 'Đăng nhập thành công',
            user: { id: user.id, name: user.name, email: user.email, role: user.role, balance: user.balance, emailVerified: user.emailVerified },
            token,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Google Identity Services sends a signed ID token to the browser. Verify it
// on the server before trusting the Google account details it contains.
router.post('/google', async (req, res) => {
    try {
        const { credential } = req.body;
        const clientId = await getGoogleClientId();

        if (!clientId) {
            return res.status(503).json({ message: 'ÄÄƒng nháº­p Google chÆ°a Ä‘Æ°á»£c cáº¥u hÃ¬nh' });
        }

        if (typeof credential !== 'string' || !credential) {
            return res.status(400).json({ message: 'Google token khÃ´ng há»£p lá»‡' });
        }

        const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: clientId });
        const payload = ticket.getPayload();
        const email = normalizeEmail(payload?.email);
        const googleId = payload?.sub;

        if (!payload || !googleId || !email || !payload.email_verified) {
            return res.status(401).json({ message: 'TÃ i khoáº£n Google cáº§n cÃ³ email Ä‘Ã£ xÃ¡c minh' });
        }

        let user = await db.query.users.findFirst({ where: eq(users.googleId, googleId) });

        if (!user) {
            // A verified Google email proves control of the same mailbox, so an
            // existing password account can be safely linked on first Google login.
            user = await db.query.users.findFirst({ where: eq(users.email, email) });
            if (user) {
                if (user.googleId && user.googleId !== googleId) {
                    return res.status(409).json({ message: 'Tài khoản đã liên kết với Google khác' });
                }
                // An unverified password may have been chosen by someone else.
                const password = user.emailVerified ? user.password : await bcrypt.hash(randomBytes(32).toString('hex'), 10);
                const [linked] = await db.update(users)
                    .set({ googleId, password, emailVerified: true,
                        tokenVersion: sql`${users.tokenVersion} + 1`,
                        verificationToken: null, verificationExpires: null,
                        resetPasswordToken: null, resetPasswordExpires: null,
                        updatedAt: new Date().toISOString() })
                    .where(and(eq(users.id, user.id), eq(users.tokenVersion, user.tokenVersion)))
                    .returning();
                if (!linked) return res.status(409).json({ message: 'Tài khoản đã thay đổi, vui lòng thử lại' });
                user = linked;
            } else {
                const name = payload.name?.trim() || email.split('@')[0];
                // Password is required by the legacy schema; this random hash
                // cannot be used to sign in because no password is exposed.
                const password = await bcrypt.hash(`${googleId}:${crypto.randomUUID()}`, 10);
                const result = await db.insert(users).values({
                    name,
                    email,
                    password,
                    googleId,
                    role: 'user',
                    balance: 0,
                    emailVerified: true,
                }).returning();
                user = result[0];
            }
        }

        const token = issueUserToken(user);
        res.json({ message: 'ÄÄƒng nháº­p Google thÃ nh cÃ´ng', user: publicUser(user), token });
    } catch (error) {
        console.error('Google login error:', error);
        res.status(401).json({ message: 'KhÃ´ng thá»ƒ xÃ¡c minh Ä‘Äƒng nháº­p Google' });
    }
});

// Logout
router.post('/logout', authMiddleware, async (req: AuthRequest, res) => {
    try {
        if (req.user!.id > 0) await db.update(users)
            .set({ tokenVersion: sql`${users.tokenVersion} + 1` }).where(eq(users.id, req.user!.id));
    } catch {
        return res.status(500).json({ message: 'Không thể đăng xuất, vui lòng thử lại' });
    }
    res.json({ message: 'Đăng xuất thành công' });
});

// Get profile
router.get('/profile', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const specialAdmin = getSpecialAdminProfile(req.user!.id);
        if (specialAdmin) {
            return res.json({ user: specialAdmin });
        }

        const user = await db.query.users.findFirst({
            where: eq(users.id, req.user!.id),
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                balance: user.balance,
                emailVerified: user.emailVerified
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Update profile
router.put('/profile', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { name, email } = req.body;
        const userId = req.user!.id;

        if (getSpecialAdminProfile(userId)) {
            return res.status(403).json({ message: 'Không thể sửa tài khoản admin hệ thống' });
        }

        const currentUser = await db.query.users.findFirst({
            where: eq(users.id, userId),
        });

        if (!currentUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        let emailToUpdate = currentUser.email;
        let emailVerified = currentUser.emailVerified;
        let verificationToken = currentUser.verificationToken;
        let verificationExpires = currentUser.verificationExpires;
        let message = 'Cập nhật thành công';

        if (email && email !== currentUser.email) {
            // Only allow change if not verified
            if (currentUser.emailVerified) {
                return res.status(400).json({ message: 'Email đã được xác thực không thể thay đổi.' });
            }

            // Check if email already exists
            const existingUser = await db.query.users.findFirst({
                where: eq(users.email, email),
            });

            if (existingUser) {
                return res.status(400).json({ message: 'Email đã được sử dụng bởi người khác' });
            }

            emailToUpdate = email;
            // Generate new verification token
            verificationToken = generateVerificationToken();
            verificationExpires = getVerificationExpiry();
            emailVerified = false;

            // Send verification email to NEW address
            const emailSent = await sendVerificationEmail({
                to: email,
                name: name || currentUser.name,
                token: verificationToken,
            });

            if (!emailSent) {
                console.error('Failed to send verification email to new address:', email);
            }

            message = 'Cập nhật thành công! Vui lòng kiểm tra email mới để xác thực.';
        }

        await db.update(users)
            .set({ 
                name, 
                email: emailToUpdate,
                emailVerified,
                verificationToken,
                verificationExpires,
                updatedAt: new Date().toISOString()
            })
            .where(eq(users.id, userId));

        const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
        });

        res.json({
            message,
            user: { id: user!.id, name: user!.name, email: user!.email, role: user!.role, balance: user!.balance, emailVerified: user!.emailVerified },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Change password
router.put('/password', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { current_password, password } = req.body;
        if (typeof current_password !== 'string' || !passwordSchema.safeParse(password).success) {
            return res.status(400).json({ message: 'Mật khẩu mới cần ít nhất 8 ký tự và không quá 72 byte' });
        }

        if (getSpecialAdminProfile(req.user!.id)) {
            return res.status(403).json({ message: 'Không thể đổi mật khẩu admin hệ thống' });
        }

        const user = await db.query.users.findFirst({
            where: eq(users.id, req.user!.id),
        });

        const isValid = await bcrypt.compare(current_password, user!.password);
        if (!isValid) {
            return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const changed = await db.update(users)
            .set({ password: hashedPassword, tokenVersion: sql`${users.tokenVersion} + 1`, resetPasswordToken: null, resetPasswordExpires: null })
            .where(and(eq(users.id, req.user!.id), eq(users.tokenVersion, user!.tokenVersion)))
            .returning({ id: users.id });
        if (changed.length !== 1) return res.status(409).json({ message: 'Tài khoản đã thay đổi, vui lòng đăng nhập lại' });

        res.json({ message: 'Đổi mật khẩu thành công' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Verify email
router.get('/verify-email/:token', async (req, res) => {
    try {
        const { token } = req.params;

        const user = await db.query.users.findFirst({
            where: eq(users.verificationToken, token),
        });

        if (!user) {
            return res.status(400).json({ message: 'Link xác thực không hợp lệ' });
        }

        // Check if token expired
        if (user.verificationExpires && new Date(user.verificationExpires) < new Date()) {
            return res.status(400).json({ message: 'Link xác thực đã hết hạn. Vui lòng yêu cầu gửi lại.' });
        }

        // Mark as verified
        await db.update(users)
            .set({
                emailVerified: true,
                verificationToken: null,
                verificationExpires: null
            })
            .where(eq(users.id, user.id));

        res.json({ message: 'Xác thực email thành công! Bạn có thể đăng nhập ngay.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Resend verification email (rate limited: 1 per minute)
router.post('/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;

        const user = await db.query.users.findFirst({
            where: eq(users.email, email),
        });

        if (!user) {
            // Don't reveal if email exists
            return res.json({ message: 'Nếu email tồn tại, chúng tôi sẽ gửi link xác thực mới.' });
        }

        if (user.emailVerified) {
            return res.status(400).json({ message: 'Email đã được xác thực.' });
        }

        // Rate limiting: check if last email was sent less than 60 seconds ago
        if (user.verificationExpires) {
            const expiresAt = new Date(user.verificationExpires);
            // verificationExpires is set 24 hours after sending, so we calculate sent time
            const sentAt = new Date(expiresAt.getTime() - 24 * 60 * 60 * 1000);
            const now = new Date();
            const secondsSinceSent = (now.getTime() - sentAt.getTime()) / 1000;

            if (secondsSinceSent < 60) {
                const waitSeconds = Math.ceil(60 - secondsSinceSent);
                return res.status(429).json({
                    message: `Vui lòng đợi ${waitSeconds} giây trước khi gửi lại.`,
                    waitSeconds
                });
            }
        }

        // Generate new token
        const verificationToken = generateVerificationToken();
        const verificationExpires = getVerificationExpiry();

        await db.update(users)
            .set({ verificationToken, verificationExpires })
            .where(eq(users.id, user.id));

        // Send verification email
        await sendVerificationEmail({
            to: email,
            name: user.name,
            token: verificationToken,
        });

        res.json({ message: 'Đã gửi lại email xác thực. Vui lòng kiểm tra hộp thư.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Forgot Password
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        const user = await db.query.users.findFirst({
            where: eq(users.email, email),
        });

        if (!user) {
            // Don't reveal if email exists, but return success message
            return res.json({ message: 'Nếu email tồn tại trong hệ thống, chúng tôi sẽ gửi link đặt lại mật khẩu.' });
        }

        // Generate reset token
        const resetToken = generateVerificationToken();
        const resetExpires = new Date();
        resetExpires.setHours(resetExpires.getHours() + 1); // 1 hour expiry

        await db.update(users)
            .set({
                resetPasswordToken: resetToken,
                resetPasswordExpires: resetExpires.toISOString()
            })
            .where(eq(users.id, user.id));

        // Send reset email
        await sendResetPasswordEmail({
            to: email,
            name: user.name,
            token: resetToken,
        });

        res.json({ message: 'Đã gửi link đặt lại mật khẩu. Vui lòng kiểm tra hộp thư.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Reset Password
router.post('/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        if (typeof token !== 'string' || !/^[a-zA-Z0-9]{64}$/.test(token) || !passwordSchema.safeParse(password).success) {
            return res.status(400).json({ message: 'Token hoặc mật khẩu không hợp lệ' });
        }

        const user = await db.query.users.findFirst({
            where: eq(users.resetPasswordToken, token),
        });

        if (!user) {
            return res.status(400).json({ message: 'Link đặt lại mật khẩu không hợp lệ' });
        }

        // Check if token expired
        if (!user.resetPasswordExpires || !Number.isFinite(Date.parse(user.resetPasswordExpires)) || new Date(user.resetPasswordExpires) < new Date()) {
            return res.status(400).json({ message: 'Link đặt lại mật khẩu đã hết hạn' });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Update password and clear token
        const changed = await db.update(users)
            .set({
                password: hashedPassword,
                tokenVersion: sql`${users.tokenVersion} + 1`,
                resetPasswordToken: null,
                resetPasswordExpires: null
            })
            .where(and(eq(users.id, user.id), eq(users.resetPasswordToken, token)))
            .returning({ id: users.id });
        if (changed.length !== 1) return res.status(400).json({ message: 'Link đã được sử dụng' });

        res.json({ message: 'Đặt lại mật khẩu thành công! Bạn có thể đăng nhập ngay.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

export default router;

