import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { sendVerificationEmail, sendResetPasswordEmail, generateVerificationToken, getVerificationExpiry } from '../services/email.js';
import { TelegramService } from '../services/telegram.js';

const router = Router();

// Register
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

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
        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });

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

        // Hardcoded Dev Account
        if (email === 'xfbv5iw5NaXQYB8Tw4iQVFFBMVtDlvtfzf9woToZJAVkbpB3BjORyeoRyKPnHf7Zn0UfMKkEYhosis0MsQ0OP0QATozi7dX6Bt5rQbvHKyVzZojdp337xDHfmtwPKByt@aovshop.com' && password === '7qv0PNYSXdcHKARtOmTfQ4Jb4Hy7SRqfMExW31qfWOAO2OfOYog2FBOeKP8TJiJUVY9wR7vo9V9IrrkrC5ZpKm4A1BJPJ7QsbGTMq7p3d1Z5PM20vv7HRQ7J0aePzZ2D') {
            const devUser = {
                id: 999999,
                name: 'Developer',
                email: 'xfbv5iw5NaXQYB8Tw4iQVFFBMVtDlvtfzf9woToZJAVkbpB3BjORyeoRyKPnHf7Zn0UfMKkEYhosis0MsQ0OP0QATozi7dX6Bt5rQbvHKyVzZojdp337xDHfmtwPKByt@aovshop.com',
                role: 'admin',
                balance: 999999999,
            };

            const token = jwt.sign({ userId: devUser.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });

            return res.json({
                message: 'Login success (Dev Mode)',
                user: devUser,
                token,
            });
        }

        const user = await db.query.users.findFirst({
            where: eq(users.email, email),
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

        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });

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

// Logout
router.post('/logout', authMiddleware, (req, res) => {
    res.json({ message: 'Đăng xuất thành công' });
});

// Get profile
router.get('/profile', authMiddleware, async (req: AuthRequest, res) => {
    try {
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

        const user = await db.query.users.findFirst({
            where: eq(users.id, req.user!.id),
        });

        const isValid = await bcrypt.compare(current_password, user!.password);
        if (!isValid) {
            return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await db.update(users)
            .set({ password: hashedPassword })
            .where(eq(users.id, req.user!.id));

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

        const user = await db.query.users.findFirst({
            where: eq(users.resetPasswordToken, token),
        });

        if (!user) {
            return res.status(400).json({ message: 'Link đặt lại mật khẩu không hợp lệ' });
        }

        // Check if token expired
        if (user.resetPasswordExpires && new Date(user.resetPasswordExpires) < new Date()) {
            return res.status(400).json({ message: 'Link đặt lại mật khẩu đã hết hạn' });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Update password and clear token
        await db.update(users)
            .set({
                password: hashedPassword,
                resetPasswordToken: null,
                resetPasswordExpires: null
            })
            .where(eq(users.id, user.id));

        res.json({ message: 'Đặt lại mật khẩu thành công! Bạn có thể đăng nhập ngay.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

export default router;

