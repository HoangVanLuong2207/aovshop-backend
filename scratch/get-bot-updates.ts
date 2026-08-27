import 'dotenv/config';

async function getBotUpdates(token: string) {
    console.log(`--- Đang kiểm tra updates cho Bot: ${token.split(':')[0]}... ---`);
    try {
        const url = `https://api.telegram.org/bot${token}/getUpdates`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.ok) {
            if (data.result.length === 0) {
                console.log('❌ Bot không có update nào mới. Hãy gửi một tin nhắn cho Bot trước!');
            } else {
                console.log('✅ Tìm thấy các cuộc hội thoại gần đây:');
                data.result.forEach((update: any) => {
                    const chat = update.message?.chat || update.my_chat_member?.chat;
                    if (chat) {
                        console.log(`- Chat Name: ${chat.title || chat.first_name || 'N/A'}, ID: ${chat.id}, Type: ${chat.type}`);
                    }
                });
            }
        } else {
            console.error('❌ Lỗi từ Telegram API:', data.description);
        }
    } catch (error) {
        console.error('❌ Lỗi mạng:', error);
    }
    process.exit(0);
}

const token = '8664395369:AAEabTEsr-P5epkERobww-kxFGy_YXMb4kg';
getBotUpdates(token);
