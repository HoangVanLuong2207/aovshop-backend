import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

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

        // Create user
        const result = await db.insert(users).values({
            name,
            email,
            password: hashedPassword,
            role: 'user',
            balance: 0,
        }).returning();

        const user = result[0];

        // Generate token
        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });

        res.json({
            message: 'Đăng ký thành công',
            user: { id: user.id, name: user.name, email: user.email, role: user.role, balance: user.balance },
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

export default router;
