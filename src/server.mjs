import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { checkAll, checkTask, readTask, readTemplates, handoff, startTask, updateTask } from '../vendor/agent-lanes.mjs';
import { demoOverview } from './demo.mjs';

const assets = new Map([['/', ['index.html', 'text/html; charset=utf-8']], ['/style.css', ['style.css', 'text/css; charset=utf-8']], ['/app.js', ['app.js', 'text/javascript; charset=utf-8']]]);
function inputError(message, status = 400) { return Object.assign(new Error(message), { status }); }
async function body(req) {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw inputError('Use application/json.', 415);
  if (Number(req.headers['content-length']) > 16384) throw inputError('Request exceeds 16 KiB.', 413);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) throw inputError('Request exceeds 16 KiB.', 413);
    chunks.push(chunk);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw inputError('Request needs a JSON object.');
  return value;
}
function fields(value, accepted) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw inputError('Task fields need an object.');
  for (const key of Object.keys(value)) if (!accepted.includes(key)) throw inputError(`Unsupported field: ${key}`);
  return value;
}
const taskFields = ['version', 'id', 'goal', 'base', 'allow', 'deny', 'state', 'agent', 'summary', 'next', 'createdAt', 'updatedAt'];
function publicTask(task) { return Object.fromEntries(taskFields.map(key => [key, task[key]])); }

export function createDesk({ repositories = [], demo = false, readOnly = false } = {}) {
  const writable = !demo && !readOnly;
  const token = randomBytes(32).toString('hex');
  // Serialize writes so two UI updates cannot silently overwrite each other.
  let pendingWrite = Promise.resolve();
  let overviewFlight;
  function mutate(fn) {
    const result = pendingWrite.then(fn);
    pendingWrite = result.catch(() => {});
    return result;
  }
  function overview() {
    if (demo) return Promise.resolve({ ...demoOverview(), writable: false });
    const barrier = pendingWrite;
    // Multiple tabs share only an active audit. The next request always audits Git
    // again, and a task write invalidates any snapshot still being collected.
    if (overviewFlight?.barrier === barrier) return overviewFlight.promise;
    const flight = { barrier };
    flight.promise = (async () => {
      await barrier;
      const entries = new Array(repositories.length);
      let next = 0;
      async function collect() {
        while (next < repositories.length) {
          const index = next++;
          const repo = repositories[index];
          try { entries[index] = { id: repo.id, name: repo.name, reports: (await checkAll(repo.path)).map(report => ({ ...report, task: publicTask(report.task) })) }; }
          catch (error) { entries[index] = { id: repo.id, name: repo.name, reports: [], error: error.message }; }
        }
      }
      // Bound Git process pressure while allowing independent repositories to run.
      await Promise.all(Array.from({ length: Math.min(2, repositories.length) }, collect));
      if (barrier !== pendingWrite) return overview();
      return { demo: false, writable, checkedAt: new Date().toISOString(), repositories: entries };
    })().finally(() => { if (overviewFlight === flight) overviewFlight = undefined; });
    overviewFlight = flight;
    return flight.promise;
  }
  const server = createServer(async (req, res) => {
    const port = server.address()?.port;
    const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    const origin = req.headers.origin;
    // CORP/COOP stop other local pages from embedding responses or holding a
    // window reference; form-action/object-src are not covered by default-src.
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin', 'Cross-Origin-Opener-Policy': 'same-origin', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'" };
    function send(status, body, type = 'application/json; charset=utf-8') { res.writeHead(status, { ...headers, 'Content-Type': type }); res.end(body); }
    if (!allowedHosts.includes(req.headers.host) || (origin && !allowedHosts.some(host => origin === `http://${host}`)) || req.headers['sec-fetch-site'] === 'cross-site') return send(403, JSON.stringify({ error: 'Local origin required.' }));
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (req.method !== 'GET') {
        if (!writable) return send(405, JSON.stringify({ error: 'This dashboard is read-only.' }));
        if (!['POST', 'PATCH'].includes(req.method) || url.pathname !== '/api/tasks') return send(405, JSON.stringify({ error: 'Unsupported method.' }));
        const supplied = Buffer.from(String(req.headers['x-agent-desk-token'] || ''));
        const expected = Buffer.from(token);
        if (!origin || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return send(403, JSON.stringify({ error: 'Local origin and session token required.' }));
        const data = fields(await body(req), ['repository', 'task', 'expectedUpdatedAt']);
        const repo = repositories.find(item => item.id === data.repository);
        if (!repo) throw inputError('Repository is not configured.', 404);
        const task = await mutate(async () => {
          if (req.method === 'POST') {
            const options = fields(data.task, ['id', 'goal', 'allow', 'deny', 'agent', 'base']);
            return startTask(repo.path, options);
          }
          const options = fields(data.task, ['id', 'state', 'agent', 'summary', 'next']);
          const { id, ...updates } = options;
          if (!Object.keys(updates).length) throw inputError('Provide at least one note field.');
          if (typeof data.expectedUpdatedAt !== 'string' || !data.expectedUpdatedAt) throw inputError('A saved task revision is required.');
          return updateTask(repo.path, id, updates, { expectedUpdatedAt: data.expectedUpdatedAt });
        });
        return send(req.method === 'POST' ? 201 : 200, JSON.stringify(publicTask(task)));
      }
      if (url.pathname === '/api/session') return send(200, JSON.stringify({ writable, token: writable ? token : null, refreshInterval: 10000 }));
      if (assets.has(url.pathname)) {
        const [name, type] = assets.get(url.pathname);
        return send(200, await readFile(new URL(`../public/${name}`, import.meta.url)), type);
      }
      if (url.pathname === '/api/overview') return send(200, JSON.stringify(await overview()));
      if (url.pathname === '/api/templates') {
        const repo = repositories.find(item => item.id === url.searchParams.get('repo'));
        if (!repo) return send(404, JSON.stringify({ error: 'Repository is not configured.' }));
        try { return send(200, JSON.stringify({ repository: repo.id, ...await readTemplates(repo.path) })); }
        catch { return send(400, JSON.stringify({ error: 'Could not read scope templates. Check .agent-lanes-templates.json or enter custom paths.' })); }
      }
      if (url.pathname === '/api/handoff') {
        const repoId = url.searchParams.get('repo');
        const taskId = url.searchParams.get('task');
        let report;
        if (demo) report = demoOverview().repositories.find(repo => repo.id === repoId)?.reports.find(item => item.task.id === taskId);
        else {
          const repo = repositories.find(item => item.id === repoId);
          if (repo) {
            await pendingWrite;
            report = await checkTask(repo.path, await readTask(repo.path, taskId));
          }
        }
        if (!report) return send(404, JSON.stringify({ error: 'Task not found.' }));
        return send(200, handoff(report), 'text/markdown; charset=utf-8');
      }
      return send(404, JSON.stringify({ error: 'Not found.' }));
    } catch (error) {
      if (error.code === 'TASK_CONFLICT') return send(409, JSON.stringify({ error: 'Task notes changed while you were editing. Review the latest notes before saving.', currentTask: publicTask(error.currentTask) }));
      if (error.code === 'TASK_LOCKED') return send(423, JSON.stringify({ error: 'Task metadata is busy in another process. Try saving again after it finishes.' }));
      return send(error.code === 'EEXIST' ? 409 : error.status || 400, JSON.stringify({ error: error.message }));
    }
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  return server;
}
