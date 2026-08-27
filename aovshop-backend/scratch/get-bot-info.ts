import 'dotenv/config';

async function getBotInfo(token: string) {
    console.log(`--- Đang lấy thông tin Bot... ---`);
    try {
        const url = `https://api.telegram.org/bot${token}/getMe`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.ok) {
            console.log(`✅ Thông tin Bot:`);
            console.log(`- Name: ${data.result.first_name}`);
            console.log(`- Username: @${data.result.username}`);
            console.log(`- ID: ${data.result.id}`);
        } else {
            console.error('❌ Lỗi từ Telegram API:', data.description);
        }
    } catch (error) {
        console.error('❌ Lỗi mạng:', error);
    }
    process.exit(0);
}

const token = '8664395369:AAEabTEsr-P5epkERobww-kxFGy_YXMb4kg';
getBotInfo(token);
