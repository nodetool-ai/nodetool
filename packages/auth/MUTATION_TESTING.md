# Mutation Testing — `@nodetool-ai/auth`

This package is security-critical (token verification, auth middleware, user
roles), so its tests are verified with **mutation testing** in addition to
ordinary coverage. Line coverage only proves code *ran*; mutation testing proves
the tests would actually *fail* if the behaviour changed — exactly the property
you want from an auth layer, where a silently-weakened check is a vulnerability.

## Running it

```bash
npm run test:mutation --workspace=packages/auth
# or, from packages/auth:
npx stryker run
```

The HTML report lands in `reports/mutation/mutation.html` (git-ignored).

## Current status

Baseline (initial scaffold, before any mutation-driven hardening):

```
File                     | % score | killed | survived | no cov
-------------------------|---------|--------|----------|-------
local-provider.ts        |  100.00 |      4 |        0 |      0
static-token-provider.ts |   92.00 |     23 |        2 |      0
auth-provider.ts         |   89.83 |     53 |        6 |      0
multi-user-provider.ts   |   88.00 |     22 |        3 |      0
middleware.ts            |   85.00 |     34 |        5 |      1
supabase-provider.ts     |   84.78 |     78 |       13 |      1
http-auth.ts             |   81.82 |     36 |        8 |      0
user-manager.ts          |   75.00 |      9 |        3 |      0
file-user-manager.ts     |   72.06 |     49 |        6 |     13
-------------------------|---------|--------|----------|-------
All files                |   83.47 |    308 |       46 |     15
```

The config gate (`stryker.config.json`) **breaks below 90%**, mirroring
`packages/security`. The baseline is below that gate on purpose — it documents
the quality target. The surviving mutants are a concrete hardening backlog, not
noise.

## Hardening backlog (surviving / uncovered mutants)

The survivors cluster into a few familiar shapes — each is a real test gap, not
an equivalent mutant:

- **Unasserted error-message strings** (`user-manager.ts:43`,
  `file-user-manager.ts:73/76/82`, `http-auth.ts:65-69`, `middleware.ts:54`):
  tests assert *that* a throw/response happens but not *what* it says. Pin the
  operator-facing message so a reworded/blanked error fails.
- **Untested branch in `file-user-manager.ts:36-43`** (13 NoCoverage mutants):
  an entire validation/parse path that no test exercises. Needs a test that
  drives malformed/missing input through it.
- **Token-parsing regexes** (`auth-provider.ts:42/54`, `http-auth.ts:25`): the
  bearer/JWT shape checks. Feed malformed tokens (wrong segment count, bad
  scheme, extra whitespace) so a loosened regex is caught.
- **Boundary conditionals** (`static-token-provider.ts:35/40`,
  `multi-user-provider.ts:31/38`, `supabase-provider.ts`,
  `middleware.ts:48/63`): each needs the *other* side of the branch asserted.
- **`supabase-provider.ts` claim mapping** (13 survivors around L56-133): assert
  the exact shape/fields of the mapped user and the optional-chaining fallbacks.

## Equivalent & non-behavioral mutants

Where a mutant genuinely cannot change observable behaviour (e.g. diagnostic
log text, encoding arguments that decode identically), suppress it at the source
with a line-scoped `// Stryker disable` comment documenting *why*, so the
headline score reflects the quality of tests over behavioural code — the same
discipline applied in `packages/security`.
