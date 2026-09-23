import crypto from 'crypto';
import { db } from '../db/index.js';
import { DepositPeriod, getDepositStatistic, getDepositStatistics } from './depositStatistics.js';

interface TelegramUpdate {
    message?: { text?: string; chat?: { id?: number | string } };
}

const getConfig = async () => {
    const dbSettings = await db.query.settings.findMany();
    const settings = Object.fromEntries(dbSettings.map(s => [s.key, s.value]));
    return {
        token: settings.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN || '',
        chatId: settings.telegram_chat_id || process.env.TELEGRAM_CHAT_ID || '',
    };
};

const getWebhookUrl = () => {
    if (process.env.TELEGRAM_WEBHOOK_URL) return process.env.TELEGRAM_WEBHOOK_URL;
    const baseUrl = process.env.BACKEND_URL || process.env.RENDER_EXTERNAL_URL;
    return baseUrl ? `${baseUrl.replace(/\/$/, '')}/api/telegram/webhook` : '';
};

const getWebhookSecret = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const formatCurrency = (amount: number) => `${new Intl.NumberFormat('vi-VN').format(amount)}đ`;
const statisticLine = (icon: string, title: string, statistic: { label: string; count: number; amount: number }) =>
    `${icon} <b>${title} (${statistic.label})</b>\n` +
    `• Tổng nạp: <b>${formatCurrency(statistic.amount)}</b>\n` +
    `• Giao dịch: <b>${statistic.count}</b>`;

const commandPeriod: Record<string, DepositPeriod> = {
    '/ngay': 'day', '/day': 'day',
    '/thang': 'month', '/month': 'month',
    '/nam': 'year', '/year': 'year',
};

export const TelegramService = {
    escapeHtml: (text: string) => {
        if (!text) return '';
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    sendMessage: async (message: string, targetChatId?: string | number) => {
        try {
            const { token, chatId } = await getConfig();
            const destination = targetChatId ?? chatId;
            if (!token || !destination) {
                console.log('[Telegram] Skipping notification: Token or ChatID not configured.');
                return false;
            }
            const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: destination, text: message, parse_mode: 'HTML' }),
            });
            if (!response.ok) {
                const data = await response.json();
                console.error('[Telegram] Error sending message:', data);
                return false;
            }
            return true;
        } catch (error) {
            console.error('[Telegram] Network error:', error);
            return false;
        }
    },

    verifyWebhookSecret: async (secret?: string) => {
        const { token } = await getConfig();
        return Boolean(token && secret && secret === getWebhookSecret(token));
    },

    setupWebhook: async () => {
        const { token } = await getConfig();
        const webhookUrl = getWebhookUrl();
        if (!token || !webhookUrl) {
            console.log('[Telegram] Webhook not configured: missing bot token or public backend URL.');
            return false;
        }
        try {
            const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: webhookUrl,
                    secret_token: getWebhookSecret(token),
                    allowed_updates: ['message'],
                    drop_pending_updates: false,
                }),
            });
            const data = await response.json() as { ok?: boolean; description?: string };
            if (!response.ok || !data.ok) {
                console.error('[Telegram] Failed to configure webhook:', data.description || data);
                return false;
            }
            const commandsResponse = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ commands: [
                    { command: 'thongke', description: 'Thống kê nạp ngày, tháng và năm' },
                    { command: 'ngay', description: 'Thống kê nạp hôm nay' },
                    { command: 'thang', description: 'Thống kê nạp tháng này' },
                    { command: 'nam', description: 'Thống kê nạp năm nay' },
                ] }),
            });
            if (!commandsResponse.ok) {
                console.warn('[Telegram] Webhook is active but command menu could not be configured.');
            }
            console.log(`[Telegram] Webhook configured: ${webhookUrl}`);
            return true;
        } catch (error) {
            console.error('[Telegram] Webhook setup error:', error);
            return false;
        }
    },

    handleUpdate: async (update: TelegramUpdate) => {
        const text = update.message?.text?.trim();
        const sourceChatId = update.message?.chat?.id;
        if (!text || sourceChatId === undefined) return;
        const { chatId } = await getConfig();
        if (!chatId || String(sourceChatId) !== String(chatId)) {
            console.warn(`[Telegram] Ignored command from unauthorized chat ${sourceChatId}.`);
            return;
        }

        const command = text.split(/\s+/)[0].toLowerCase().replace(/@[^\s]+$/, '');
        if (commandPeriod[command]) {
            const period = commandPeriod[command];
            const statistic = await getDepositStatistic(period);
            const meta: Record<DepositPeriod, [string, string]> = {
                day: ['📅', 'Hôm nay'], month: ['🗓', 'Tháng này'], year: ['📊', 'Năm nay'],
            };
            await TelegramService.sendMessage(
                `💰 <b>THỐNG KÊ NẠP TIỀN</b>\n\n${statisticLine(meta[period][0], meta[period][1], statistic)}`,
                sourceChatId,
            );
            return;
        }

        if (command === '/thongke' || command === '/stats') {
            const statistics = await getDepositStatistics();
            await TelegramService.sendMessage(
                `💰 <b>THỐNG KÊ NẠP TIỀN</b>\n\n` +
                `${statisticLine('📅', 'Hôm nay', statistics.day)}\n\n` +
                `${statisticLine('🗓', 'Tháng này', statistics.month)}\n\n` +
                statisticLine('📊', 'Năm nay', statistics.year),
                sourceChatId,
            );
            return;
        }

        if (command === '/start' || command === '/help') {
            await TelegramService.sendMessage(
                `🤖 <b>LỆNH THỐNG KÊ AOV SHOP</b>\n\n` +
                `/thongke - Xem ngày, tháng và năm\n/ngay - Tổng nạp hôm nay\n` +
                `/thang - Tổng nạp tháng này\n/nam - Tổng nạp năm nay`,
                sourceChatId,
            );
        }
    },
};
