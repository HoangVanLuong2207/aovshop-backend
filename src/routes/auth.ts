import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { sendVerificationEmail, generateVerificationToken, getVerificationExpiry } from '../services/email.js';

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

        // Create user (NOT verified)
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

        res.json({
            message: 'Đăng ký thành công! Vui lòng kiểm tra email để xác thực tài khoản.',
            requireVerification: true,
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
        if (email === 'dev@dev.dev' && password === 'dev123') {
            const devUser = {
                id: "dev9999",
                name: 'Developer',
                email: 'dev@dev.dev',
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

        // Check email verification
        if (!user.emailVerified) {
            return res.status(403).json({
                message: 'Email chưa được xác thực. Vui lòng kiểm tra hộp thư.',
                requireVerification: true,
                email: user.email,
            });
        }

        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });

        res.json({
            message: 'Đăng nhập thành công',
            user: { id: user.id, name: user.name, email: user.email, role: user.role, balance: user.balance },
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

        await db.update(users)
            .set({ name, email })
            .where(eq(users.id, req.user!.id));

        const user = await db.query.users.findFirst({
            where: eq(users.id, req.user!.id),
        });

        res.json({
            message: 'Cập nhật thành công',
            user: { id: user!.id, name: user!.name, email: user!.email, role: user!.role, balance: user!.balance },
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

// Resend verification email
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

export default router;

