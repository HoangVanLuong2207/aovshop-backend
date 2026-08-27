import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../src/db/schema.js';
import webpush from 'web-push';
import dotenv from 'dotenv';
dotenv.config();

const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
});

const db = drizzle(client, { schema });

async function testPush() {
    console.log('Sending test notification to all subscribers...');
    
    // Fetch VAPID keys from DB
    const settings = await db.query.settings.findMany();
    const config = Object.fromEntries(settings.map(s => [s.key, s.value]));

    if (!config.vapid_public_key || !config.vapid_private_key) {
        console.error('VAPID keys not found in database');
        return;
    }

    webpush.setVapidDetails(
        config.vapid_subject || 'mailto:admin@example.com',
        config.vapid_public_key,
        config.vapid_private_key
    );

    const subs = await db.query.pushSubscriptions.findMany();
    console.log(`Found ${subs.length} subscriptions.`);

    const payload = JSON.stringify({
        title: '🔔 Test Thông Báo',
        body: 'Đây là thông báo thử nghiệm từ hệ thống!',
        icon: '/logo.png',
        data: { url: '/admin' }
    });

    const results = await Promise.allSettled(subs.map(sub => {
        const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
            }
        };
        return webpush.sendNotification(pushSubscription, payload);
    }));

    console.log('Results:', JSON.stringify(results, null, 2));
    process.exit(0);
}

testPush();
