import 'dotenv/config';
import { db } from '../src/db/index.js';
import { settings } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { TelegramService } from '../src/services/telegram.js';

async function updateTelegramChatId(chatId: string) {
    console.log(`--- Đang cập nhật Chat ID: ${chatId} vào Database ---`);
    try {
        const key = 'telegram_chat_id';
        const existing = await db.query.settings.findFirst({
            where: eq(settings.key, key),
        });

        if (existing) {
            await db.update(settings)
                .set({ value: chatId, updatedAt: new Date().toISOString() })
                .where(eq(settings.key, key));
            console.log('✅ Đã cập nhật Chat ID hiện có.');
        } else {
            await db.insert(settings).values({
                key,
                value: chatId,
            });
            console.log('✅ Đã thêm Chat ID mới.');
        }

        // Sau khi cập nhật, thử gửi 1 thông báo mẫu
        console.log('--- Đang gửi thông báo kiểm tra cuối cùng ---');
        await TelegramService.sendMessage('🎉 <b>CHÚC MỪNG!</b>\n\nHệ thống thông báo Telegram cho shop AOV của bạn đã được cấu hình thành công. Từ giờ bạn sẽ nhận được thông báo ngay lập tức khi có đơn hàng hoặc tiền về!');
        console.log('✅ Đã gửi thông báo. Hãy kiểm tra Telegram!');

    } catch (error) {
        console.error('❌ Lỗi:', error);
    }
    process.exit(0);
}

const chatId = '1785115375';
updateTelegramChatId(chatId);
