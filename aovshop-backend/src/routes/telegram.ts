import { Router } from 'express';
import { TelegramService } from '../services/telegram.js';

const router = Router();

router.post('/webhook', async (req, res) => {
    try {
        const secret = req.header('x-telegram-bot-api-secret-token');
        if (!await TelegramService.verifyWebhookSecret(secret)) {
            return res.status(401).json({ message: 'Invalid Telegram webhook secret' });
        }
        await TelegramService.handleUpdate(req.body);
        return res.sendStatus(200);
    } catch (error) {
        console.error('[Telegram] Webhook processing error:', error);
        return res.sendStatus(500);
    }
});

export default router;
