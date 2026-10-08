import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { checkAll, checkTask, readTask, handoff } from '../vendor/agent-lanes.mjs';
import { demoOverview } from './demo.mjs';

const assets = new Map([['/', ['index.html', 'text/html; charset=utf-8']], ['/style.css', ['style.css', 'text/css; charset=utf-8']], ['/app.js', ['app.js', 'text/javascript; charset=utf-8']]]);
export function createDesk({ repositories = [], demo = false } = {}) {
  let inflight;
  let cached;
  let cachedAt = 0;
  async function overview() {
    if (demo) return demoOverview();
    if (cached && Date.now() - cachedAt < 2000) return cached;
    if (!inflight) inflight = (async () => {
      const entries = [];
      for (const repo of repositories) {
        try { entries.push({ id: repo.id, name: repo.name, reports: await checkAll(repo.path) }); }
        catch (error) { entries.push({ id: repo.id, name: repo.name, reports: [], error: error.message }); }
      }
      cached = { demo: false, checkedAt: new Date().toISOString(), repositories: entries };
      cachedAt = Date.now();
      return cached;
    })().finally(() => { inflight = undefined; });
    return inflight;
  }
  const server = createServer(async (req, res) => {
    const port = server.address()?.port;
    const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    const origin = req.headers.origin;
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'" };
    function send(status, body, type = 'application/json; charset=utf-8') { res.writeHead(status, { ...headers, 'Content-Type': type }); res.end(body); }
    if (!allowedHosts.includes(req.headers.host) || (origin && !allowedHosts.some(host => origin === `http://${host}`)) || req.headers['sec-fetch-site'] === 'cross-site') return send(403, JSON.stringify({ error: 'Local origin required.' }));
    if (req.method !== 'GET') return send(405, JSON.stringify({ error: 'This dashboard is read-only.' }));
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (assets.has(url.pathname)) {
        const [name, type] = assets.get(url.pathname);
        return send(200, await readFile(new URL(`../public/${name}`, import.meta.url)), type);
      }
      if (url.pathname === '/api/overview') return send(200, JSON.stringify(await overview()));
      if (url.pathname === '/api/handoff') {
        const repoId = url.searchParams.get('repo');
        const taskId = url.searchParams.get('task');
        let report;
        if (demo) report = demoOverview().repositories.find(repo => repo.id === repoId)?.reports.find(item => item.task.id === taskId);
        else {
          const repo = repositories.find(item => item.id === repoId);
          if (repo) report = await checkTask(repo.path, await readTask(repo.path, taskId));
        }
        if (!report) return send(404, JSON.stringify({ error: 'Task not found.' }));
        return send(200, handoff(report), 'text/markdown; charset=utf-8');
      }
      return send(404, JSON.stringify({ error: 'Not found.' }));
    } catch (error) { return send(400, JSON.stringify({ error: error.message })); }
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  return server;
}
