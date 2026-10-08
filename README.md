# Agent Desk

A local dashboard for your coding tasks: scopes, changed files, blockers, and the next handoff in one view.

Works with task files created by [Agent Lanes](https://github.com/hexmillionaire/agent-lanes). Claude Code and Codex can both use the same tasks. There are no model API calls, telemetry, accounts, or runtime dependencies. Each repository can be cloned and run independently.

## Try it

Requires Node.js 24.8+ and Git.

```sh
git clone https://github.com/hexmillionaire/agent-desk.git
cd agent-desk
npm run demo
```

Open `http://127.0.0.1:4317`. Demo mode is labeled **SAMPLE DATA** and uses invented tasks. It reads no real repositories.

For your own work:

```sh
node bin/agent-desk.mjs --repo /absolute/path/to/project
node bin/agent-desk.mjs --repo /path/to/api --repo /path/to/cli --port 4317
```

Use quoted Windows paths on PowerShell. Create tasks with Agent Lanes first. The empty state explains what to do if no tasks exist. Task cards show progress, agent labels, Git branch, changed-file counts, and scope warnings. Search and filter tasks, select a repository, open a card to inspect changed paths, and copy a freshly generated Markdown handoff. Press Refresh after edits or notes; the dashboard does not poll automatically.

Agent labels and progress are manually recorded task metadata. Agent Desk does not inspect Claude/Codex app sessions, show live process status, run agents, edit repositories, verify tests, or infer completion. A `done` task label is not a test result. Shared working trees attribute all changes since each task's base to that task; use separate worktrees for concurrent work.

## Named repositories

Create an untracked `desk.config.json`:

```json
{
  "repositories": [
    { "name": "Atlas API", "path": "/absolute/path/to/api" },
    { "name": "Orbit CLI", "path": "/absolute/path/to/cli" }
  ]
}
```

Then run `node bin/agent-desk.mjs --config desk.config.json`. On Windows JSON paths must use `/` or escaped `\\`. Up to 20 trusted repositories can be configured. Errors remain visible instead of silently hiding failed audits.

## Local boundaries

The server binds only to `127.0.0.1`. It accepts read-only requests from local hosts, rejects cross-origin requests and unexpected Host headers, exposes only configured repositories, and serves a fixed asset list. All data stays on the machine until you copy or share it. Use only trusted repositories. This is a local developer tool, not a server to expose to the internet or other users. Same-user processes and browser extensions may access localhost; this is not isolation against them.

Copying a handoff requires clipboard permission in your browser. The report contains user-authored notes and file names, so review it before sharing.

## Development

Run `npm test`. The UI uses browser-native JavaScript and CSS; there is no build step. The report engine in `vendor/agent-lanes.mjs` is an unchanged MIT-licensed snapshot of Agent Lanes 0.1.0. It is vendored so a fresh clone runs without installing unpublished packages. Update the snapshot explicitly alongside its source tests when changing the task format.

Related: [Agent Lanes MCP](https://github.com/hexmillionaire/agent-lanes-mcp).
