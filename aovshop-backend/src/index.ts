import 'dotenv/config';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.js';
import shopRoutes from './routes/shop.js';
import ordersRoutes from './routes/orders.js';
import depositRoutes, { cleanupExpiredDeposits } from './routes/deposit.js';
import adminRoutes from './routes/admin.js';
import telegramRoutes from './routes/telegram.js';
import { checkpassIntegrationRouter, userCheckpassRouter } from './routes/checkpass.js';
import { TelegramService } from './services/telegram.js';
import cookieParser from 'cookie-parser';
import { analyticsMiddleware } from './middleware/analytics.js';

import path from 'path';
import { fileURLToPath } from 'url';

// Local overrides keep secrets out of the shared environment file.
dotenv.config({ path: '.env.local', override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const isAuthenticatedCheckpassService = (req: express.Request) => {
    const expected = process.env.CHECKPASS_SERVICE_TOKEN || '';
    return Boolean(
        expected && req.path.startsWith('/api/integrations/checkpass') &&
        req.get('authorization') === `Bearer ${expected}`,
    );
};

// Trust proxy for Render/Cloudflare/Proxies
app.set('trust proxy', 1);

// Rate limiting - General: 100 requests per minute per IP
const generalLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    message: { message: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: isAuthenticatedCheckpassService,
});

// Rate limiting - Auth: 5 requests per minute per IP (stricter for login/register)
const authLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5,
    message: { message: 'Too many authentication attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiting - Deposit: 10 requests per minute (prevent spam deposits)
const depositLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { message: 'Too many deposit requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiting - Orders: 20 requests per minute (prevent order spam)
const ordersLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: { message: 'Too many order requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Master multiplexes all users through one server IP, so integration traffic
// needs a service budget instead of the customer-facing 20 req/min cap.
const checkpassServiceLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10000,
    message: { message: 'Checkpass service rate limit exceeded.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiting - Admin: 50 requests per minute
const adminLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 50,
    message: { message: 'Too many admin requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiting - Webhook: 30 requests per minute (for payment callbacks)
const webhookLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { message: 'Too many webhook requests.' },
    standardHeaders: true,
    legacyHeaders: false,
    // Skip rate limit check for trusted IPs (payment providers)
    skip: (req) => {
        const trustedIPs = ['127.0.0.1', '::1']; // Add SePay IPs here if known
        const clientIP = req.ip || req.socket.remoteAddress || '';
        return trustedIPs.includes(clientIP);
    }
});

// Middleware
app.use(cors({
    origin: true, // Allow all origins for webhooks from payment providers
    credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());
app.use(analyticsMiddleware); // Apply traffic tracking
app.use(generalLimiter); // Apply general rate limit to all routes

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check
app.get('/', (req, res) => {
    res.json({ message: 'AOV Shop API - TypeScript Backend', status: 'ok' });
});

app.get('/api', (req, res) => {
    res.json({ message: 'AOV Shop API v1.0', status: 'ok' });
});

// Health check for cron ping (minimal response)
app.get('/health', (req, res) => {
    res.send('ok');
});

// Health check for frontend traffic ping
app.get('/api/health', (req, res) => {
    res.send('ok');
});

// Routes with specific rate limits
app.use('/api/auth', authLimiter, authRoutes); // 5 req/min - prevent brute force
app.use('/api/shop', shopRoutes); // Uses general limit (100 req/min)
app.use('/api/orders', ordersLimiter, ordersRoutes); // 20 req/min - prevent order spam
app.use('/api/checkpass', ordersLimiter, userCheckpassRouter);
app.use('/api/integrations/checkpass', checkpassServiceLimiter, checkpassIntegrationRouter);

// Special handling for deposit: webhook needs its own limiter (or no limiter), while other routes need depositLimiter
app.use('/api/deposit/webhook', webhookLimiter); // Apply specific webhook limiter
app.use('/api/deposit', (req, res, next) => {
    // Skip general deposit limiter for the webhook path
    if (req.path === '/webhook' || req.path === '/webhook/') {
        return next();
    }
    return depositLimiter(req, res, next);
}, depositRoutes);
app.use('/api/admin', adminLimiter, adminRoutes); // 50 req/min
app.use('/api/telegram', telegramRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ message: `Route ${req.method} ${req.path} not found` });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
});

// Start server
app.listen(PORT, async () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🌐 Network: http://10.83.75.247:${PORT}`);

    // Cleanup expired deposits on startup
    const expiredCount = await cleanupExpiredDeposits();
    if (expiredCount > 0) {
        console.log(`✅ Startup cleanup: ${expiredCount} expired deposit(s) processed`);
    }
    await TelegramService.setupWebhook();
    TelegramService.startDailyReportScheduler();
});
