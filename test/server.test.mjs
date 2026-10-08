import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createDesk } from '../src/server.mjs';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

async function realFixture(t, extra = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'desk-write-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { windowsHide: true });
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, 'src/app.js'), 'baseline\n');
  git('add', '.'); git('commit', '-qm', 'Fixture');
  const { server, url } = await fixture(t, { repositories: [{ id: 'repo-1', name: 'Fixture', path: root }], ...extra });
  const session = await (await fetch(`${url}/api/session`)).json();
  const headers = { Origin: url, 'Content-Type': 'application/json', 'X-Agent-Desk-Token': session.token || '' };
  const create = { repository: 'repo-1', task: { id: 'fix', goal: 'Fix the app', allow: ['src/**'], deny: [] } };
  const request = (method, value, overrides = {}) => fetch(`${url}/api/tasks`, { method, headers: { ...headers, ...overrides }, body: JSON.stringify(value) });
  return { root, url, server, session, headers, create, request };
}

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

test('create, edit, and fresh scope audits work without editing source files', async t => {
  const { root, url, create, request } = await realFixture(t);
  const response = await request('POST', create);
  assert.equal(response.status, 201);
  const task = await response.json();
  assert.equal(task.state, 'planned');
  const update = await request('PATCH', { repository: 'repo-1', expectedUpdatedAt: task.updatedAt, task: { id: 'fix', state: 'working', summary: 'Started', next: 'Test' } });
  assert.equal(update.status, 200);
  const saved = await update.json();
  assert.notEqual(saved.updatedAt, task.updatedAt);
  assert.deepEqual(saved.allow, ['src/**']);
  assert.equal(saved.base, task.base);
  assert.equal(await readFile(path.join(root, 'src/app.js'), 'utf8'), 'baseline\n');
  let data = await (await fetch(`${url}/api/overview`)).json();
  assert.equal(data.repositories[0].reports[0].task.state, 'working');
  await writeFile(path.join(root, 'outside.txt'), 'outside\n');
  data = await (await fetch(`${url}/api/overview`)).json();
  assert.equal(data.repositories[0].reports[0].ok, false);
  assert.match(await (await fetch(`${url}/api/handoff?repo=repo-1&task=fix`)).text(), /outside.txt/);
});

test('writes require the session token and Origin, and reject unconfigured paths', async t => {
  const { create, request } = await realFixture(t);
  assert.equal((await request('POST', create, { 'X-Agent-Desk-Token': '' })).status, 403);
  assert.equal((await request('POST', create, { Origin: '' })).status, 403);
  assert.equal((await request('POST', create, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await request('POST', { ...create, repository: '/arbitrary/path' })).status, 404);
  assert.equal((await request('POST', { ...create, task: { ...create.task, id: '../escape' } })).status, 400);
  assert.equal((await request('POST', { ...create, task: { ...create.task, path: '/arbitrary/path' } })).status, 400);
});

test('duplicate IDs and stale updates return conflicts; updates cannot widen scope', async t => {
  const { create, request } = await realFixture(t);
  const task = await (await request('POST', create)).json();
  assert.equal((await request('POST', create)).status, 409);
  const update = { repository: 'repo-1', expectedUpdatedAt: task.updatedAt, task: { id: 'fix', state: 'review' } };
  assert.equal((await request('PATCH', update)).status, 200);
  assert.equal((await request('PATCH', update)).status, 409);
  assert.equal((await request('PATCH', { ...update, task: { id: 'fix', allow: ['**'] } })).status, 400);
});

test('read-only and sample modes provide no write token', async t => {
  const { session, create, request } = await realFixture(t, { readOnly: true });
  assert.equal(session.writable, false);
  assert.equal(session.token, null);
  assert.equal((await request('POST', create)).status, 405);
  const { url } = await fixture(t);
  assert.equal((await (await fetch(`${url}/api/session`)).json()).token, null);
});

test('writes reject oversized bodies and unsupported content types', async t => {
  const { create, request } = await realFixture(t);
  assert.equal((await request('POST', create, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await request('POST', { ...create, padding: 'x'.repeat(17000) })).status, 413);
});
