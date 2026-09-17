import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.resolve(tmpdir());
const directory = await mkdtemp(path.join(root, 'aovshop-security-'));
try {
    const child = spawn(process.execPath, ['--import', 'tsx', '--test', 'tests/security.test.ts'], {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        env: { ...process.env, AOVSHOP_SECURITY_TEST_DB: pathToFileURL(path.join(directory, 'test.db')).href },
        stdio: 'inherit', windowsHide: true,
    });
    process.exitCode = await new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('exit', code => resolve(code ?? 1));
    });
} finally {
    // Native libSQL can retain file handles until the child process exits.
    if (path.dirname(path.resolve(directory)) !== root || !path.basename(directory).startsWith('aovshop-security-')) {
        throw new Error('Refusing cleanup outside the security test temporary directory');
    }
    await rm(directory, { recursive: true, force: true });
}
