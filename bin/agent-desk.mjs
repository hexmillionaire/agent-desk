#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { createDesk } from '../src/server.mjs';
import { repoRoot } from '../vendor/agent-lanes.mjs';

try {
  const { values } = parseArgs({ strict: true, options: { repo: { type: 'string', multiple: true }, config: { type: 'string' }, port: { type: 'string' }, demo: { type: 'boolean' }, help: { type: 'boolean' } } });
  if (values.help) {
    console.log('Agent Desk: --repo <path> (repeatable), --config <JSON>, --port <number>, --demo\nDefault: serve the current Git repo at http://127.0.0.1:4317\nConfig format: {"repositories":[{"name":"My project","path":"/absolute/path"}]}');
  } else {
    if (values.demo && (values.repo || values.config)) throw new Error('--demo cannot be combined with repositories.');
    if (values.repo && values.config) throw new Error('Use --repo or --config, not both.');
    let repositories = [];
    if (!values.demo) {
      if (values.config) {
        const config = JSON.parse(await readFile(values.config, 'utf8'));
        if (!Array.isArray(config.repositories)) throw new Error('Config needs a repositories array.');
        repositories = config.repositories;
      } else repositories = (values.repo || [process.cwd()]).map(directory => ({ path: directory }));
      if (repositories.length < 1 || repositories.length > 20) throw new Error('Configure 1-20 trusted repositories.');
      repositories = await Promise.all(repositories.map(async (entry, i) => ({ id: `repo-${i + 1}`, name: String(entry.name || `Repository ${i + 1}`).slice(0, 120), path: await repoRoot(entry.path) })));
    }
    const port = values.port === undefined ? 4317 : Number(values.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be between 0 and 65535.');
    const server = createDesk({ repositories, demo: values.demo });
    server.on('error', error => { console.error(`Agent Desk: ${error.message}`); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => console.log(`Agent Desk running at http://127.0.0.1:${server.address().port}${values.demo ? ' (sample data)' : ''}`));
    const stop = () => server.close(() => process.exit());
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  }
} catch (error) { console.error(`Agent Desk: ${error.message}`); process.exitCode = 1; }
