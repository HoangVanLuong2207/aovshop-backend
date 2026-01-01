import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.js';
import shopRoutes from './routes/shop.js';
import ordersRoutes from './routes/orders.js';
import depositRoutes from './routes/deposit.js';
import adminRoutes from './routes/admin.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting - General: 100 requests per minute per IP
const generalLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    message: { message: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiting - Auth: 5 requests per minute per IP (stricter for login/register)
const authLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5,
    message: { message: 'Too many authentication attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Middleware
app.use(cors({
    origin: true, // Allow all origins for webhooks from payment providers
    credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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

// Routes
app.use('/api/auth', authLimiter, authRoutes); // Stricter rate limit for auth
app.use('/api/shop', shopRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/deposit', depositRoutes);
app.use('/api/admin', adminRoutes);

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
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
