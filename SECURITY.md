# Security

Use GitHub's private vulnerability reporting where available, or open a minimal issue asking for a private contact without publishing exploit details.

Agent Desk serves task notes and Git paths on loopback. It checks Host/Origin headers and accepts only configured repository IDs. Creating/editing tasks requires a same-origin request with a random session token. Writes are limited to task metadata, reject unknown fields and oversized bodies, and reject stale updates. Use `--read-only` to disable writes; sample mode is always read-only. Source code, committed CI policy, scope and bases on existing tasks cannot be edited through the dashboard.

The token protects browser requests against CSRF. Same-user processes/extensions can read localhost and edit task files; this is not isolation against them. CSP and text rendering reduce task-content injection risks. Only use this on a trusted single-user machine with trusted repositories, never as an internet-facing or multi-user server.

Review notes before sharing handoffs. No transcripts, environment files, or source file contents are collected by the dashboard. Task notes themselves may contain private data.
