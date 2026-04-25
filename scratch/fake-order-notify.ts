import 'dotenv/config';
import { TelegramService } from '../src/services/telegram.js';

async function sendFakeOrderNotification() {
    console.log('--- Đang bắn giả lập thông báo đơn hàng ---');
    try {
        const fakeUser = 'Khách Hàng Thử Nghiệm';
        const fakeOrderId = Math.floor(Math.random() * 10000);
        const fakeTotal = '250.000';
        
        const escapedUserName = TelegramService.escapeHtml(fakeUser);
        
        const telegramMsg = `🛒 <b>ĐƠN HÀNG MỚI (TEST)</b>\n\n👤 Khách hàng: <b>${escapedUserName}</b>\n📦 Đơn hàng: #${fakeOrderId}\n💰 Tổng tiền: <b>${fakeTotal}đ</b>\n🔗 Xem chi tiết trên trang Admin.`;
        
        await TelegramService.sendMessage(telegramMsg);
        console.log('✅ Đã bắn thông báo giả lập thành công!');
    } catch (error) {
        console.error('❌ Lỗi:', error);
    }
    process.exit(0);
}

sendFakeOrderNotification();
