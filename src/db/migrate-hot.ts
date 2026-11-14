import 'dotenv/config';
import { client } from './index.js';
import { migrateHot } from './hotMigration.js';

try {
    await migrateHot(client);
    console.log('HOT integration migration completed');
} finally {
    client.close();
}
