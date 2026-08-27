import 'dotenv/config';
import { db } from '../src/db/index.js';
import { settings } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

async function updateTelegramToken(token: string) {
    console.log('--- Đang cập nhật Token Telegram vào Database ---');
    try {
        const key = 'telegram_bot_token';
        const existing = await db.query.settings.findFirst({
            where: eq(settings.key, key),
        });

        if (existing) {
            await db.update(settings)
                .set({ value: token, updatedAt: new Date().toISOString() })
                .where(eq(settings.key, key));
            console.log('✅ Đã cập nhật Token hiện có.');
        } else {
            await db.insert(settings).values({
                key,
                value: token,
            });
            console.log('✅ Đã thêm Token mới.');
        }
    } catch (error) {
        console.error('❌ Lỗi khi cập nhật Database:', error);
    }
    process.exit(0);
}

const token = '8664395369:AAEabTEsr-P5epkERobww-kxFGy_YXMb4kg';
updateTelegramToken(token);
