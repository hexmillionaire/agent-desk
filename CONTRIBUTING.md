# Contributing

Use Node 24.8+ and Git. Run `npm test` and `npm run demo`, then verify search, filters, task details, handoff copy, empty states, and a narrow browser layout. Real data must come from configured repositories; sample data must remain visibly labeled.

Keep writes limited to task metadata in configured repositories. Bind to loopback, preserve origin, token and Host checks, and use `textContent` for repository/task data. Demo and explicit read-only modes must stay read-only. Never infer running agent processes or verified tests from manually recorded task metadata. Report engine changes belong in Agent Lanes first; update both vendored modules and their hashes deliberately.

Run `npm run test:vendor` and `npm run test:package` too. UI changes should cover draft ownership, pending responses, repository changes, conflict review and a second concurrent conflict. Template data never executes commands or silently changes existing task scopes. Start a first contribution with a fictional fixture, a narrow accessibility fix, clearer error text or a minimized request race.
