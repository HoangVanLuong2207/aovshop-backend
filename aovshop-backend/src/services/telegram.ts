import crypto from 'crypto';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { deposits, orders, paymentAccounts, productAccounts, products, settings, users } from '../db/schema.js';
import { DepositPeriod, DepositStatistic, DepositTarget, getDepositStatistic, getDepositStatistics, getVietnamDepositRange, getVietnamNowParts } from './depositStatistics.js';

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
const DAILY_REPORT_SETTING = 'telegram_daily_report_enabled';
let dailyReportTimer: NodeJS.Timeout | undefined;

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

const getDashboard = async () => {
    const range = getVietnamDepositRange('day');
    const [depositsToday, completedOrders, pendingOrders, newUsers] = await Promise.all([
        getDepositStatistic('day'),
        db.select({ count: sql<number>`count(*)`, amount: sql<number>`coalesce(sum(${orders.total}), 0)` }).from(orders).where(and(eq(orders.status, 'completed'), gte(orders.createdAt, range.start))),
        db.select({ count: sql<number>`count(*)` }).from(orders).where(inArray(orders.status, ['pending', 'waiting'])),
        db.select({ count: sql<number>`count(*)` }).from(users).where(gte(users.createdAt, range.start)),
    ]);
    return { depositsToday, completedOrders: completedOrders[0], pendingOrders: Number(pendingOrders[0]?.count || 0), newUsers: Number(newUsers[0]?.count || 0) };
};

const dashboardMessage = async () => {
    const stats = await getDashboard();
    return `📊 <b>DASHBOARD HÔM NAY</b>\n\n` +
        `💰 Nạp: <b>${formatCurrency(stats.depositsToday.amount)}</b> (${stats.depositsToday.count} GD)\n` +
        `🛒 Đơn hoàn thành: <b>${Number(stats.completedOrders?.count || 0)}</b> — ${formatCurrency(Number(stats.completedOrders?.amount || 0))}\n` +
        `⏳ Đơn chờ: <b>${stats.pendingOrders}</b>\n👤 User mới: <b>${stats.newUsers}</b>`;
};

const pendingMessage = async () => {
    const [pendingOrders, pendingDeposits] = await Promise.all([
        db.select({ id: orders.id, total: orders.total, status: orders.status, createdAt: orders.createdAt }).from(orders).where(inArray(orders.status, ['pending', 'waiting'])).limit(10),
        db.select({ id: deposits.id, amount: deposits.amount, reference: deposits.reference, createdAt: deposits.createdAt }).from(deposits).where(eq(deposits.status, 'pending')).limit(10),
    ]);
    const orderLines = pendingOrders.length ? pendingOrders.map(order => `• #${order.id} — ${formatCurrency(order.total)} (${order.status})`).join('\n') : '• Không có';
    const depositLines = pendingDeposits.length ? pendingDeposits.map(deposit => `• #${deposit.id} — ${formatCurrency(deposit.amount)} — <code>${TelegramService.escapeHtml(deposit.reference)}</code>`).join('\n') : '• Không có';
    return `⏳ <b>TÁC VỤ ĐANG CHỜ</b>\n\n🛒 <b>Đơn hàng</b>\n${orderLines}\n\n💳 <b>Yêu cầu nạp</b>\n${depositLines}`;
};

const stockMessage = async () => {
    const available = sql<number>`coalesce(sum(case when ${productAccounts.status} = 'available' then 1 else 0 end), 0)`;
    const rows = await db.select({ id: products.id, name: products.name, isPreorder: products.isPreorder, available }).from(products)
        .leftJoin(productAccounts, eq(productAccounts.productId, products.id)).groupBy(products.id).orderBy(available).limit(15);
    const lines = rows.map(product => `• #${product.id} ${TelegramService.escapeHtml(product.name)}: <b>${Number(product.available)}</b>${product.isPreorder ? ' (preorder)' : ''}`);
    return `📦 <b>TỒN KHO THẤP NHẤT</b>\n\n${lines.length ? lines.join('\n') : 'Chưa có sản phẩm.'}`;
};

const healthMessage = async () => {
    const [database, banks] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(settings),
        db.select({ count: sql<number>`count(*)` }).from(paymentAccounts).where(eq(paymentAccounts.isActive, true)),
    ]);
    return `🟢 <b>HEALTH CHECK</b>\n\nBackend: <b>OK</b>\nDatabase: <b>OK</b> (${Number(database[0]?.count || 0)} settings)\nTài khoản nhận tiền đang bật: <b>${Number(banks[0]?.count || 0)}</b>\nThời gian: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`;
};

const getDailyReportEnabled = async () => (await db.query.settings.findFirst({ where: eq(settings.key, DAILY_REPORT_SETTING) }))?.value === 'true';
const setDailyReportEnabled = async (enabled: boolean) => {
    const existing = await db.query.settings.findFirst({ where: eq(settings.key, DAILY_REPORT_SETTING) });
    if (existing) await db.update(settings).set({ value: String(enabled), updatedAt: new Date().toISOString() }).where(eq(settings.id, existing.id));
    else await db.insert(settings).values({ key: DAILY_REPORT_SETTING, value: String(enabled), description: 'Gửi báo cáo Telegram lúc 08:00 giờ Việt Nam' });
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
                { command: 'dashboard', description: 'Tổng quan vận hành hôm nay' }, { command: 'doncho', description: 'Đơn hàng và yêu cầu nạp đang chờ' },
                { command: 'tonkho', description: 'Tồn kho sản phẩm thấp nhất' }, { command: 'health', description: 'Kiểm tra backend và database' },
                { command: 'baocao', description: 'Báo cáo nhanh; bat/tat báo cáo ngày' },
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
        if (command === '/dashboard') return void await TelegramService.sendMessage(await dashboardMessage(), sourceChatId);
        if (command === '/doncho') return void await TelegramService.sendMessage(await pendingMessage(), sourceChatId);
        if (command === '/tonkho') return void await TelegramService.sendMessage(await stockMessage(), sourceChatId);
        if (command === '/health') return void await TelegramService.sendMessage(await healthMessage(), sourceChatId);
        if (command === '/baocao') {
            const action = argumentsList[0]?.toLowerCase();
            if (action === 'bat') {
                await setDailyReportEnabled(true);
                return void await TelegramService.sendMessage('✅ Đã bật báo cáo tự động lúc <b>08:00</b> mỗi ngày (giờ Việt Nam).', sourceChatId);
            }
            if (action === 'tat') {
                await setDailyReportEnabled(false);
                return void await TelegramService.sendMessage('⏸ Đã tắt báo cáo tự động hằng ngày.', sourceChatId);
            }
            return void await TelegramService.sendMessage(`${await dashboardMessage()}\n\nDùng <code>/baocao bat</code> hoặc <code>/baocao tat</code> để quản lý báo cáo tự động.`, sourceChatId);
        }
        if (commandPeriod[command]) {
            const period = commandPeriod[command];
            try {
                const statistic = await getDepositStatistic(period, new Date(), parseTarget(period, argumentsList[0]));
                return void await TelegramService.sendMessage(`💰 <b>THỐNG KÊ NẠP TIỀN</b>\n\n${statisticLine(period === 'day' ? '📅' : period === 'month' ? '🗓' : '📊', titleByPeriod[period], statistic)}`, sourceChatId, mainKeyboard());
            } catch { return void await TelegramService.sendMessage(`Sai định dạng. Dùng: <code>${period === 'day' ? '/ngay dd/mm/yyyy' : period === 'month' ? '/thang mm/yyyy' : '/nam yyyy'}</code>`, sourceChatId); }
        }
        if (command === '/start' || command === '/help') await TelegramService.sendMessage('🤖 <b>LỆNH QUẢN TRỊ AOV SHOP</b>\n\n/thongke — chọn thống kê nạp\n/dashboard — tổng quan hôm nay\n/doncho — đơn và nạp đang chờ\n/tonkho — tồn kho thấp\n/health — trạng thái hệ thống\n/baocao — báo cáo nhanh\n/baocao bat|tat — bật/tắt báo cáo 08:00 mỗi ngày', sourceChatId, mainKeyboard());
    },

    startDailyReportScheduler: () => {
        if (dailyReportTimer) return;
        const scheduleNext = () => {
            const now = new Date();
            const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
            const next = new Date(Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate(), 8) - 7 * 60 * 60 * 1000);
            if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
            dailyReportTimer = setTimeout(async () => {
                try {
                    if (await getDailyReportEnabled()) await TelegramService.sendMessage(`📬 <b>BÁO CÁO TỰ ĐỘNG</b>\n\n${await dashboardMessage()}`);
                } catch (error) { console.error('[Telegram] Daily report error:', error); }
                scheduleNext();
            }, next.getTime() - now.getTime());
        };
        scheduleNext();
    },
};
