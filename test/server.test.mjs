import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createDesk } from '../src/server.mjs';

async function fixture(t, options = { demo: true }) {
  const server = createDesk(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

test('demo shows explicit sample data and scope violations', async t => {
  const { url } = await fixture(t);
  const result = await fetch(`${url}/api/overview`);
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.equal(data.demo, true);
  assert.equal(data.repositories.length, 2);
  assert.equal(data.repositories[0].reports[0].ok, false);
  assert.equal(result.headers.get('cache-control'), 'no-store');
});

test('handoffs, static assets, and missing tasks have correct response types', async t => {
  const { url } = await fixture(t);
  const handoff = await fetch(`${url}/api/handoff?repo=repo-1&task=login-timeout`);
  assert.match(handoff.headers.get('content-type'), /text\/markdown/);
  assert.match(await handoff.text(), /config\/production.json/);
  assert.equal((await fetch(`${url}/api/handoff?repo=repo-1&task=missing`)).status, 404);
  const page = await fetch(url);
  assert.match(await page.text(), /Your work, in view/);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await fetch(`${url}/src/server.mjs`)).status, 404);
});

test('rejects writes and browser requests from other origins', async t => {
  const { url } = await fixture(t);
  assert.equal((await fetch(`${url}/api/overview`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${url}/api/overview`, { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await fetch(`${url}/api/overview`, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
});

test('rejects DNS rebinding host names', async t => {
  const { server } = await fixture(t);
  const status = await new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port: server.address().port, path: '/api/overview', headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject);
  });
  assert.equal(status, 403);
});

test('empty workspaces show no invented sessions', async t => {
  const { url } = await fixture(t, { repositories: [] });
  const data = await (await fetch(`${url}/api/overview`)).json();
  assert.equal(data.demo, false);
  assert.deepEqual(data.repositories, []);
});
