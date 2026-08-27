import 'dotenv/config';
import { db } from '../src/db/index.js';
import { TelegramService } from '../src/services/telegram.js';

async function testNotification() {
    console.log('--- Đang gửi thông báo thử nghiệm ---');
    try {
        await TelegramService.sendMessage('🔔 <b>THÔNG BÁO THỬ NGHIỆM TỪ ANTIGRAVITY</b>\n\nĐây là tin nhắn mẫu để kiểm tra kết nối bot Telegram của bạn. Nếu bạn thấy tin nhắn này, hệ thống đã cấu hình đúng!');
        console.log('✅ Đã gửi yêu cầu gửi tin nhắn. Vui lòng kiểm tra Telegram của bạn.');
    } catch (error) {
        console.error('❌ Lỗi khi gửi thông báo:', error);
    }
    process.exit(0);
}

testNotification();
