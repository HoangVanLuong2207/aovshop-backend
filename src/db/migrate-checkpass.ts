import 'dotenv/config';
import { client } from './index.js';
import { migrateCheckpass } from './checkpassMigration.js';

try {
    await migrateCheckpass(client);
    console.log('Checkpass billing migration completed');
} finally {
    client.close();
}
