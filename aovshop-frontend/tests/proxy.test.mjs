import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('frontend preserves API and upload paths when proxying', { timeout: 15000 }, async () => {
    const backend = createServer(async (req, res) => {
        let body = '';
        for await (const chunk of req) body += chunk;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ path: req.url, method: req.method, body, authorization: req.headers.authorization }));
    });
    backend.listen(0, '127.0.0.1');
    await once(backend, 'listening');
    const reservation = createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    const child = spawn(process.execPath, ['server.js'], {
        cwd: new URL('..', import.meta.url),
        env: { ...process.env, PORT: String(port), BACKEND_URL: `http://127.0.0.1:${backend.address().port}/api` },
        stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    const exited = once(child, 'exit');
    try {
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Frontend startup timed out')), 8000);
            child.stdout.on('data', chunk => {
                if (chunk.toString().includes('Frontend server running')) { clearTimeout(timer); resolve(); }
            });
            child.once('error', error => { clearTimeout(timer); reject(error); });
            child.once('exit', code => { clearTimeout(timer); reject(new Error(`Frontend exited: ${code}`)); });
        });
        const body = JSON.stringify({ email: 'test@example.invalid', password: 'test-only' });
        const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body,
        });
        assert.deepEqual(await login.json(), { path: '/api/auth/login', method: 'POST', body });
        for (const path of ['/api/auth/profile', '/api/admin/users?page=2', '/uploads/example.png']) {
            const response = await fetch(`http://127.0.0.1:${port}${path}`, { headers: { authorization: 'Bearer test-token' } });
            assert.equal(response.status, 200);
            const data = await response.json();
            assert.equal(data.path, path);
            assert.equal(data.authorization, 'Bearer test-token');
        }
    } finally {
        child.kill();
        await exited;
        await new Promise(resolve => backend.close(resolve));
    }
});
