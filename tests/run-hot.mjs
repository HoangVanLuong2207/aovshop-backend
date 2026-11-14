import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

const directory = await mkdtemp(path.join(tmpdir(), 'aovshop-hot-'));
try {
    const child = spawn(process.execPath, ['--import', 'tsx', '--test', 'tests/hot.test.ts'], {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        env: { ...process.env, AOVSHOP_SECURITY_TEST_DB: pathToFileURL(path.join(directory, 'test.db')).href },
        stdio: 'inherit', windowsHide: true,
    });
    process.exitCode = await new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('exit', code => resolve(code ?? 1));
    });
} finally {
    await rm(directory, { recursive: true, force: true });
}
