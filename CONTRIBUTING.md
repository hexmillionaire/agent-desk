# Contributing

Use Node 24.8+ and Git. Run `npm test` and `npm run demo`, then verify search, filters, task details, handoff copy, empty states, and a narrow browser layout. Real data must come from configured repositories; sample data must remain visibly labeled.

Keep the dashboard read-only, bind to loopback, preserve origin and Host checks, and use `textContent` for repository/task data. Never infer running agent processes or verified tests from manually recorded task metadata. Report engine changes belong in Agent Lanes first; update the vendored copy deliberately.
