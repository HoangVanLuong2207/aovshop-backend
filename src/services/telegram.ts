export const TelegramService = {
    sendMessage: async (message: string) => {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;

        if (!token || !chatId) {
            return; // Skip silently if not configured
        }

        try {
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
