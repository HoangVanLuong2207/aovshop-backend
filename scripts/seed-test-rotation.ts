import 'dotenv/config';
import { db } from '../src/db/index.js';
import { deposits } from '../src/db/schema.js';

async function main() {
    console.log('--- Đang giả lập 50 đơn hàng thành công cho ngân hàng ID 1 ---');
    try {
        for (let i = 1; i <= 50; i++) {
            await db.insert(deposits).values({
                userId: 1, // Giả định user ID 1
                amount: 10000,
                status: 'completed',
                reference: `TEST_ROTATION_${Date.now()}_${i}`,
                bankId: 1, // Ngân hàng cần test (ID 1)
            });
        }
        console.log('✅ Hoàn tất! Ngân hàng ID 1 đã đạt giới hạn 50 đơn trong tháng này.');
    } catch (e) {
        console.error('Lỗi khi chèn dữ liệu. Có thể do bank_id 1 không tồn tại.', e);
    }
    process.exit(0);
}

main().catch(console.error);
