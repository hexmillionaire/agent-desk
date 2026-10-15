import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const bin = fileURLToPath(new URL('../bin/agent-desk.mjs', import.meta.url));
const run = args => new Promise(resolve => {
  execFile(process.execPath, [bin, ...args], { timeout: 20000, windowsHide: true }, (error, stdout, stderr) => resolve({ code: error ? error.code : 0, stdout, stderr }));
});

test('--version prints the package version without starting a server', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const result = await run(['--version']);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.trim(), manifest.version);
});

test('rejects empty or malformed ports instead of choosing a random one', async () => {
  for (const port of ['', '12abc', '-1', '1e3', '70000']) {
    const result = await run(['--demo', `--port=${port}`]);
    assert.equal(result.code, 1, `port ${JSON.stringify(port)}`);
    assert.match(result.stderr, /Port must be between 0 and 65535/);
  }
});

test('config entries without a path string fail with an actionable message', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'desk-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const config = path.join(dir, 'desk.json');
  for (const repositories of [[null], [{ name: 'x' }], [{ path: 42 }]]) {
    await writeFile(config, JSON.stringify({ repositories }));
    const result = await run(['--config', config]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Each config repository needs a "path" string/);
  }
});
