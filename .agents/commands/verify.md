---
description: Run the checks that must pass before committing (typecheck, lint, tests)
allowed-tools: Bash, Read, Edit, Grep, Glob
---

Run the pre-commit gate and fix what breaks.

Run these three, in this order, and stop at the first failure:

```bash
npm run test:affected
npm run typecheck
npm run lint
```

These three are the whole gate. `npm run test:affected` runs only the suites
that depend on the diff — the affected backend packages through turbo, and
`jest --findRelatedTests` in web/electron/mobile (their whole suite when a
package they depend on changed). `npm run test:affected -- --dry-run` prints
the plan without running it, and `-- --all` is the full pass if you want it.
Do not run `npm run test` + `npm run test:packages` instead; CI runs those.

If you changed anything under `packages/base-nodes`, `packages/node-sdk`,
`fal-nodes`, `replicate-nodes`, or `elevenlabs-nodes`, run
`npm run build:packages` first — those packages load from `dist/`, so stale
output produces confusing failures.

Fix every failure you find rather than reporting it back unfixed, then re-run
to confirm green. Report the actual final output — do not claim a pass you did
not observe.

$ARGUMENTS
