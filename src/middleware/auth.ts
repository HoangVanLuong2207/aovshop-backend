import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { getApiAuthToken } from '../services/tokenCache.js';

export interface AuthRequest extends Request {
    user?: {
        id: number;
        email: string;
        role: string;
    };
    isApiRequest?: boolean;
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const token = authHeader.split(' ')[1];

        // 1. Check if token is the Static API Token from Settings (shared cache)
        const apiToken = await getApiAuthToken();
        if (apiToken && apiToken === token) {
            req.user = {
                id: 0,
                email: 'api@system',
                role: 'admin',
            };
            req.isApiRequest = true;
            return next();
        }

        // 2. Otherwise, verify as JWT
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: number };


        const user = await db.query.users.findFirst({
            where: eq(users.id, decoded.userId),
        });

        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }

        req.user = {
            id: user.id,
            email: user.email,
            role: user.role,
        };

        next();
    } catch (error) {
        return res.status(401).json({ message: 'Invalid token' });
    }
};

export const adminMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ message: 'Forbidden - Admin only' });
    }
    next();
};
