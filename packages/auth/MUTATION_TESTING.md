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

```
File                     | % score | killed | survived
-------------------------|---------|--------|---------
auth-provider.ts         |  100.00 |      6 |        0
file-user-manager.ts     |  100.00 |     66 |        0
http-auth.ts             |  100.00 |     43 |        0
middleware.ts            |  100.00 |     40 |        0
user-manager.ts          |  100.00 |     12 |        0
providers/local          |  100.00 |      4 |        0
providers/static-token   |  100.00 |     23 |        0
providers/multi-user     |  100.00 |     25 |        0
providers/supabase       |  100.00 |     73 |        0
-------------------------|---------|--------|---------
All files                |  100.00 |    292 |        0
```

The config gate (`stryker.config.json`) **breaks below 90%**, mirroring
`packages/security`, so a regression in test quality fails fast.

## How the suite was hardened

Mutation testing surfaced gaps that line coverage hid. The tests added to close
them pin *observable behaviour*, not implementation details (each test asserts
one externally-meaningful property and reads as Arrange/Act/Assert):

- **Operator-facing error messages** (`user-manager`, `middleware`, `http-auth`):
  tests asserted *that* a throw/401 happened but not *what* it said, so blanking
  or rerouting a message survived. They now pin the exact text — e.g. the
  no-token middleware 401 must name `Authorization: Bearer <token>`, and a
  provider's own rejection message must reach the caller (`error ?? default`).
- **Token-parsing whitespace** (`auth-provider`, `http-auth`): `split(/\s+/)` is
  exercised with a *run* of whitespace (`"Bearer  tok"`) so the `/\s+/` → `/\s/`
  mutant, which would split a double space into three parts, is caught.
- **Empty / non-string credential edge cases**: an empty `STATIC_AUTH_TOKEN`
  must not become a credential that accepts the empty bearer token; a JWT with a
  blank `sub` is rejected by the `|| !userId` arm; a *numeric* user-id claim is
  rejected by the `typeof !== "string"` arm (each kills a different operand
  mutant in the same guard).
- **Default-value short-circuits**: a provider that returns `ok:true` with no
  `tokenType` proves the `?? TokenType.STATIC` default; an accept-everything
  provider proves `authenticateRequest`'s `if (!token) return null` runs *before*
  `verifyToken`.
- **401 wire format** (`http-auth`): the response body (`{ detail: … }`) and the
  `Content-Type` / `WWW-Authenticate` challenge headers are asserted so the
  object/string literals can't be emptied.
- **Persistence & path resolution** (`file-user-manager`): the users file is
  asserted to carry `version: "1.0"`; `resetToken` must preserve the stored
  record's id/username/role; and a mocked `homedir()` pins the per-platform
  default path (`~/.config/...`, `%APPDATA%/...`, `~/AppData/Roaming/...`) plus
  the `USERS_FILE` override.
- **Supabase cache & client** (`providers/supabase`): the TTL boundary is tested
  at exactly `now === expiresAt` (kills `>=` → `>`); a null `data` response must
  yield the domain error rather than a TypeError (`data?.user`); and a mocked
  `@supabase/supabase-js` exercises the real lazy-client creation path, asserting
  the client is created once and reused.

## Equivalent & non-behavioral mutants

Some mutants **cannot** be killed because they don't change observable behaviour.
Chasing them is wasted effort, so they're suppressed at the source with a
line-scoped `// Stryker disable` comment that documents *why*:

- **`"utf-8"` encoding arguments** (`file-user-manager` read/write) — Node returns
  a Buffer for an empty/invalid encoding and JSON.parse coerces it via the default
  utf8 decoding, so `"utf8"` and `""` are byte-identical.
- **`parts[1].trim()`** (`auth-provider`, `http-auth`) — `split(/\s+/)` already
  yields tokens with no surrounding whitespace, so the trim is a no-op.
- **Case-insensitive `Headers` fallback** (`auth-provider`) — `Headers.get` is
  case-insensitive, so the capitalized fallback always resolves to the same value
  as the primary lookup; every mutant on those two lines is equivalent.
- **`STATIC_AUTH_TOKENS` parse guard** (`static-token`) — a falsy value makes
  `JSON.parse` throw into the swallowing catch, so forcing the branch registers
  no tokens either way.
- **Supabase cache fast-paths** (`supabase-provider`) — the `cacheTtl<=0` /
  `cacheMax<=0` guards are redundant with, respectively, the matching read gate in
  `_getCachedUser` and the `size > cacheMax` eviction (an add-then-evict at
  `max=0` leaves the cache unchanged); the `oldest !== undefined` check can never
  be false because eviction only runs on a non-empty map.

One redundant check was *removed* rather than suppressed: the `error !== null`
clause in the Supabase error path was dead code (the enclosing `if (error)`
already guarantees a truthy, non-null value), so deleting it both simplifies the
code and eliminates the equivalent mutant.

Each suppression is line-scoped and carries a reason, so the headline 100% score
reflects the quality of the tests over *behavioural* code rather than being
inflated by mutants no test could legitimately catch.
