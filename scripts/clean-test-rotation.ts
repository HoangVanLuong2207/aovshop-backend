import 'dotenv/config';
import { db } from '../src/db/index.js';
import { deposits } from '../src/db/schema.js';
import { like } from 'drizzle-orm';

async function main() {
    console.log('--- Đang xóa dữ liệu test xoay vòng ngân hàng ---');
    try {
        const result = await db.delete(deposits).where(like(deposits.reference, 'TEST_ROTATION_%'));
        console.log('✅ Đã xóa các đơn hàng test thành công.');
    } catch (e) {
        console.error('Lỗi khi xóa dữ liệu:', e);
    }
    process.exit(0);
}

main().catch(console.error);
