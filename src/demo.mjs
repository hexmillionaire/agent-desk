const base = 'a'.repeat(40);
function report(id, goal, state, agent, branch, changes, summary, next) {
  const task = { version: 1, id, goal, state, agent, base, allow: ['src/**', 'test/**'], deny: ['src/secrets/**'], summary, next, createdAt: '2026-10-07T14:00:00.000Z', updatedAt: '2026-10-07T15:30:00.000Z' };
  return { version: 1, task, branch, head: 'b'.repeat(40), checkedAt: new Date().toISOString(), changes, conflicts: [], submodules: [], ok: changes.every(file => file.verdict === 'allowed'), counts: { allowed: changes.filter(file => file.verdict === 'allowed').length, outside: changes.filter(file => file.verdict === 'outside').length, denied: changes.filter(file => file.verdict === 'denied').length } };
}
export function demoOverview() {
  return { demo: true, checkedAt: new Date().toISOString(), repositories: [
    { id: 'repo-1', name: 'Atlas API', reports: [
      report('login-timeout', 'Fix the login timeout', 'review', 'codex', 'fix/login-timeout', [{ path: 'src/auth/session.js', status: 'M', verdict: 'allowed' }, { path: 'test/session.test.js', status: 'A', verdict: 'allowed' }, { path: 'config/production.json', status: 'M', verdict: 'outside' }], 'Updated token refresh and added a regression test. A configuration edit needs review.', 'Review the production configuration change, then run the authentication tests.'),
      report('retry-backoff', 'Add retry backoff to the client', 'working', 'claude', 'feat/retry-backoff', [{ path: 'src/client/retry.js', status: 'A', verdict: 'allowed' }], 'Retry helper drafted.', 'Add a test for exhausted retries.'),
    ] },
    { id: 'repo-2', name: 'Orbit CLI', reports: [
      report('export-format', 'Support structured JSON exports', 'blocked', 'claude', 'feat/export-format', [], 'Waiting on the schema decision.', 'Choose which fields belong in the public export.'),
      report('error-copy', 'Make missing-config errors clearer', 'done', 'codex', 'fix/error-copy', [{ path: 'src/errors.js', status: 'M', verdict: 'allowed' }], 'Improved missing-config guidance.', 'Reviewer should verify behavior before merging.'),
    ] },
  ] };
}
