# Changelog

## 0.3.0

- Share overlapping overview audits, collect up to two repositories concurrently, and invalidate snapshots after writes.
- Preserve newer note/create drafts and keep delayed saves or handoffs from affecting a different task.
- Keep refresh/session errors visible, preserve keyboard focus, and refresh audits while notes are being edited.
- Update the shared engine to 0.3.0 and verify its version and hash in CI.

## 0.2.0

- Browser task creation and state, agent label, summary, and next-step editing.
- Same-origin authenticated writes, body limits, field allowlists, and stale-save conflicts.
- Automatic refresh every ten seconds while visible, with pause and draft preservation.
- Read-only launch option; sample mode stays read-only.
- Agent Lanes 0.2.0 engine, shared quickstart, and feedback templates.

## 0.1.0

- Local read-only task board across configured repositories.
- Task search, state and attention filters, changed paths, and handoff copy.
- Explicit demo data and empty/error states.
- Loopback Host/Origin restrictions and HTTP integration tests.
