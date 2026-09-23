import crypto from 'crypto';
import { db } from '../db/index.js';
import { DepositPeriod, DepositStatistic, DepositTarget, getDepositStatistic, getDepositStatistics, getVietnamNowParts } from './depositStatistics.js';

type ChatId = string | number;
type InlineKeyboard = { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
interface TelegramUpdate {
    message?: { text?: string; chat?: { id?: ChatId } };
    callback_query?: { id: string; data?: string; message?: { chat?: { id?: ChatId } } };
}

const getConfig = async () => {
    const rows = await db.query.settings.findMany();
    const settings = Object.fromEntries(rows.map(row => [row.key, row.value]));
    return { token: settings.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN || '', chatId: settings.telegram_chat_id || process.env.TELEGRAM_CHAT_ID || '' };
};
const getWebhookUrl = () => {
    if (process.env.TELEGRAM_WEBHOOK_URL) return process.env.TELEGRAM_WEBHOOK_URL;
    const baseUrl = process.env.BACKEND_URL || process.env.RENDER_EXTERNAL_URL;
    return baseUrl ? `${baseUrl.replace(/\/$/, '')}/api/telegram/webhook` : '';
};
const getWebhookSecret = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const formatCurrency = (amount: number) => `${new Intl.NumberFormat('vi-VN').format(amount)}đ`;
const statisticLine = (icon: string, title: string, statistic: DepositStatistic) => `${icon} <b>${title} (${statistic.label})</b>\n• Tổng nạp: <b>${formatCurrency(statistic.amount)}</b>\n• Giao dịch: <b>${statistic.count}</b>`;
const titleByPeriod: Record<DepositPeriod, string> = { day: 'Ngày', month: 'Tháng', year: 'Năm' };

const chunk = <T>(items: T[], size: number) => items.reduce<T[][]>((rows, item, index) => {
    if (index % size === 0) rows.push([]);
    rows[rows.length - 1].push(item);
    return rows;
}, []);
const commandPeriod: Record<string, DepositPeriod> = { '/ngay': 'day', '/day': 'day', '/thang': 'month', '/month': 'month', '/nam': 'year', '/year': 'year' };

const parseTarget = (period: DepositPeriod, value?: string): DepositTarget | undefined => {
    if (!value) return undefined;
    const parts = value.split('/').map(Number);
    if ((period === 'day' && parts.length !== 3) || (period === 'month' && parts.length !== 2) || (period === 'year' && parts.length !== 1) || parts.some(part => !Number.isInteger(part))) throw new Error('Sai định dạng');
    return period === 'day' ? { day: parts[0], month: parts[1], year: parts[2] } : period === 'month' ? { month: parts[0], year: parts[1] } : { year: parts[0] };
};

const mainKeyboard = (): InlineKeyboard => ({ inline_keyboard: [
    [{ text: '📅 Chọn ngày', callback_data: 'deposit:pick:day' }, { text: '🗓 Chọn tháng', callback_data: 'deposit:pick:month' }],
    [{ text: '📊 Chọn năm', callback_data: 'deposit:pick:year' }, { text: '💰 Tổng quan', callback_data: 'deposit:summary' }],
] });

const pickerKeyboard = (period: DepositPeriod): InlineKeyboard => {
    const current = getVietnamNowParts();
    if (period === 'day') {
        const buttons = Array.from({ length: 7 }, (_, index) => {
            const date = new Date(Date.UTC(current.year, current.month - 1, current.day - index));
            const year = date.getUTCFullYear(), month = date.getUTCMonth() + 1, day = date.getUTCDate();
            return { text: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`, callback_data: `deposit:stat:day:${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
        });
        return { inline_keyboard: [...chunk(buttons, 2), [{ text: '↩️ Quay lại', callback_data: 'deposit:menu' }]] };
    }
    if (period === 'month') {
        const buttons = Array.from({ length: 6 }, (_, index) => {
            const date = new Date(Date.UTC(current.year, current.month - 1 - index, 1));
            const year = date.getUTCFullYear(), month = date.getUTCMonth() + 1;
            return { text: `${String(month).padStart(2, '0')}/${year}`, callback_data: `deposit:stat:month:${year}-${String(month).padStart(2, '0')}` };
        });
        return { inline_keyboard: [...chunk(buttons, 2), [{ text: '↩️ Quay lại', callback_data: 'deposit:menu' }]] };
    }
    const buttons = Array.from({ length: 5 }, (_, index) => ({ text: String(current.year - index), callback_data: `deposit:stat:year:${current.year - index}` }));
    return { inline_keyboard: [...chunk(buttons, 2), [{ text: '↩️ Quay lại', callback_data: 'deposit:menu' }]] };
};

export const TelegramService = {
    escapeHtml: (text: string) => text ? text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '',

    sendMessage: async (message: string, targetChatId?: ChatId, replyMarkup?: InlineKeyboard) => {
        try {
            const { token, chatId } = await getConfig();
            const destination = targetChatId ?? chatId;
            if (!token || !destination) return false;
            const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: destination, text: message, parse_mode: 'HTML', reply_markup: replyMarkup }) });
            if (!response.ok) console.error('[Telegram] Error sending message:', await response.json());
            return response.ok;
        } catch (error) { console.error('[Telegram] Network error:', error); return false; }
    },

    verifyWebhookSecret: async (secret?: string) => {
        const { token } = await getConfig();
        return Boolean(token && secret && secret === getWebhookSecret(token));
    },

    setupWebhook: async () => {
        const { token } = await getConfig(); const webhookUrl = getWebhookUrl();
        if (!token || !webhookUrl) { console.log('[Telegram] Webhook not configured: missing bot token or public backend URL.'); return false; }
        try {
            const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: webhookUrl, secret_token: getWebhookSecret(token), allowed_updates: ['message', 'callback_query'], drop_pending_updates: false }) });
            const data = await response.json() as { ok?: boolean; description?: string };
            if (!response.ok || !data.ok) { console.error('[Telegram] Failed to configure webhook:', data.description || data); return false; }
            await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commands: [
                { command: 'thongke', description: 'Chọn thống kê nạp tiền' }, { command: 'ngay', description: 'Thống kê ngày: dd/mm/yyyy' },
                { command: 'thang', description: 'Thống kê tháng: mm/yyyy' }, { command: 'nam', description: 'Thống kê năm: yyyy' }, { command: 'help', description: 'Hướng dẫn sử dụng' },
            ] }) });
            console.log(`[Telegram] Webhook configured: ${webhookUrl}`); return true;
        } catch (error) { console.error('[Telegram] Webhook setup error:', error); return false; }
    },

    handleUpdate: async (update: TelegramUpdate) => {
        const sourceChatId = update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;
        if (sourceChatId === undefined) return;
        const { chatId, token } = await getConfig();
        if (!chatId || String(sourceChatId) !== String(chatId)) { console.warn(`[Telegram] Ignored input from unauthorized chat ${sourceChatId}.`); return; }

        if (update.callback_query) {
            await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callback_query_id: update.callback_query.id }) });
            const data = update.callback_query.data || '';
            if (data === 'deposit:menu') return void await TelegramService.sendMessage('💰 <b>CHỌN KIỂU THỐNG KÊ</b>', sourceChatId, mainKeyboard());
            if (data === 'deposit:summary') {
                const stats = await getDepositStatistics();
                return void await TelegramService.sendMessage(`💰 <b>THỐNG KÊ NẠP TIỀN</b>\n\n${statisticLine('📅', 'Hôm nay', stats.day)}\n\n${statisticLine('🗓', 'Tháng này', stats.month)}\n\n${statisticLine('📊', 'Năm nay', stats.year)}`, sourceChatId, mainKeyboard());
            }
            const picker = data.match(/^deposit:pick:(day|month|year)$/);
            if (picker) {
                const period = picker[1] as DepositPeriod;
                const hint = period === 'day' ? '/ngay dd/mm/yyyy' : period === 'month' ? '/thang mm/yyyy' : '/nam yyyy';
                return void await TelegramService.sendMessage(`Chọn mốc gần đây bên dưới hoặc nhập <code>${hint}</code> để xem mốc bất kỳ.`, sourceChatId, pickerKeyboard(period));
            }
            const selected = data.match(/^deposit:stat:(day|month|year):(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/);
            if (selected) {
                const period = selected[1] as DepositPeriod;
                const target: DepositTarget = { year: Number(selected[2]), month: selected[3] ? Number(selected[3]) : undefined, day: selected[4] ? Number(selected[4]) : undefined };
                const statistic = await getDepositStatistic(period, new Date(), target);
                return void await TelegramService.sendMessage(`💰 <b>THỐNG KÊ NẠP TIỀN</b>\n\n${statisticLine(period === 'day' ? '📅' : period === 'month' ? '🗓' : '📊', titleByPeriod[period], statistic)}`, sourceChatId, mainKeyboard());
            }
            return;
        }

        const text = update.message?.text?.trim(); if (!text) return;
        const [rawCommand, ...argumentsList] = text.split(/\s+/);
        const command = rawCommand.toLowerCase().replace(/@[^\s]+$/, '');
        if (command === '/thongke' || command === '/stats') return void await TelegramService.sendMessage('💰 <b>CHỌN KIỂU THỐNG KÊ</b>', sourceChatId, mainKeyboard());
        if (commandPeriod[command]) {
            const period = commandPeriod[command];
            try {
                const statistic = await getDepositStatistic(period, new Date(), parseTarget(period, argumentsList[0]));
                return void await TelegramService.sendMessage(`💰 <b>THỐNG KÊ NẠP TIỀN</b>\n\n${statisticLine(period === 'day' ? '📅' : period === 'month' ? '🗓' : '📊', titleByPeriod[period], statistic)}`, sourceChatId, mainKeyboard());
            } catch { return void await TelegramService.sendMessage(`Sai định dạng. Dùng: <code>${period === 'day' ? '/ngay dd/mm/yyyy' : period === 'month' ? '/thang mm/yyyy' : '/nam yyyy'}</code>`, sourceChatId); }
        }
        if (command === '/start' || command === '/help') await TelegramService.sendMessage('🤖 <b>LỆNH THỐNG KÊ AOV SHOP</b>\n\n/thongke - Mở nút chọn ngày, tháng, năm\n/ngay 24/09/2026 - Thống kê ngày cụ thể\n/thang 09/2026 - Thống kê tháng cụ thể\n/nam 2026 - Thống kê năm cụ thể', sourceChatId, mainKeyboard());
    },
};
