import { db } from '../db/index.js';

export const TelegramService = {
    sendMessage: async (message: string) => {
        try {
            const dbSettings = await db.query.settings.findMany();
            const config = Object.fromEntries(dbSettings.map(s => [s.key, s.value]));

            const token = config.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN;
            const chatId = config.telegram_chat_id || process.env.TELEGRAM_CHAT_ID;

            if (!token || !chatId) {
                return; // Skip silently if not configured
            }

            const url = `https://api.telegram.org/bot${token}/sendMessage`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: message,
                    parse_mode: 'HTML',
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                console.error('[Telegram] Error sending message:', data);
            }
        } catch (error) {
            console.error('[Telegram] Network error:', error);
        }
    }
};
