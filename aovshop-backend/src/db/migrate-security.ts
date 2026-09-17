import 'dotenv/config';
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';
import { migrateSecurity } from './securityMigration.js';

dotenv.config({ path: '.env.local', override: true });
if (!process.env.TURSO_DATABASE_URL) throw new Error('TURSO_DATABASE_URL is required');
const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
try {
    await migrateSecurity(client);
    console.log('Security migration completed');
} finally {
    client.close();
}
