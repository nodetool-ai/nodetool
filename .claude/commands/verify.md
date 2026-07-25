---
description: Run the checks that must pass before committing (typecheck, lint, tests)
allowed-tools: Bash, Read, Edit, Grep, Glob
---

Run the pre-commit gate and fix what breaks.

Run these three, in this order, and stop at the first failure:

```bash
npm run typecheck
npm run lint
npm run test
```

Scope the work: if the change only touched one workspace, prefer the targeted
script (`npm run typecheck:web`, `npm test --workspace=web`) over the full
sweep, and only run everything before an actual commit.

If you changed anything under `packages/base-nodes`, `packages/node-sdk`,
`fal-nodes`, `replicate-nodes`, or `elevenlabs-nodes`, run
`npm run build:packages` first — those packages load from `dist/`, so stale
output produces confusing failures.

Fix every failure you find rather than reporting it back unfixed, then re-run
to confirm green. Report the actual final output — do not claim a pass you did
not observe.

$ARGUMENTS
