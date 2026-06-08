# Mutation Testing — `@nodetool-ai/runtime`

The runtime package owns correctness-critical logic the rest of the system
trusts blindly — **cost / token accounting** first and foremost (a silent
off-by-one or `<`-vs-`<=` here is a production billing bug). Line coverage only
proves code *ran*; mutation testing proves the tests would actually *fail* if the
behaviour changed.

This mirrors the setup in
[`packages/security`](../security/MUTATION_TESTING.md): [StrykerJS](https://stryker-mutator.io/)
with the Vitest runner, a JSON/HTML report, and a `break` threshold that fails
the run if test quality regresses.

## Running it

```bash
npm run test:mutation --workspace=packages/runtime
# or, from packages/runtime:
npx stryker run
```

The HTML report lands in `reports/mutation/mutation.html` and the
machine-readable JSON in `reports/mutation/mutation.json` (both git-ignored via
the root `.gitignore`).

## Scope & rollout

The goal is **100% mutation score across the whole package**. The package is
large (60+ source files, several of them thin per-vendor API adapters), so it is
brought up to the bar **incrementally**: the config's `mutate` glob lists only
the modules already hardened to 100%, and the set grows file-by-file — the same
discipline `packages/security` used. The gate is `break: 100`, so any regression
on an already-hardened module fails the run immediately.

To explore a not-yet-listed file ad-hoc (Stryker's `-m` overrides the config glob):

```bash
npx stryker run -m "src/providers/base-provider.ts"
```

### Next modules to harden (highest blast radius first)

1. **`providers/provider-registry.ts`** — credential resolution order
   (secret → env → default) and the configured-check predicate.
2. **`providers/base-provider.ts`** — the terminal `{ done: true }` chunk emitted
   for *every* stream-termination reason, and usage-token accounting.

## Current status

Every module in the `mutate` glob is at **100%** (every behavioural mutant
killed; equivalents suppressed at source — see below):

```
File                 | % score | killed | ignored
---------------------|---------|--------|--------
cost-calculator.ts   |  100.00 |    129 |     38
media-ref-bytes.ts   |  100.00 |    141 |     15
recommended-models.ts|  100.00 |     95 |      0
context-packer.ts    |  100.00 |     51 |      0
image-codec.ts       |  100.00 |     16 |      ~
cost-reconciler.ts   |  100.00 |      2 |      0
provider-cache.ts    |  100.00 |      3 |      0
providers/defaults.ts|  100.00 |      2 |      0
```

The config gate (`stryker.config.json`) **breaks below 100%** on this set.

### How the suite was hardened

Mutation testing surfaced gaps that ordinary coverage hid. The tests added in
`cost-calculator-hardening.test.ts` target *observable behaviour*, not
implementation details — each pins one externally-meaningful property and reads
as Arrange/Act/Assert:

- **Every `MODEL_TO_TIER` × `PRICING_TIERS` mapping prices exactly** — a broken
  model→tier key, or an emptied tier object, now prices to the wrong number and
  fails (it used to fall silently through to token pricing = 0).
- **Local-free providers bill nothing even for a *priced* model id** — dropping a
  provider from the free set now makes a known model cost > 0. The earlier test
  used an unknown model, so removing a provider was undetectable (unknown = 0
  either way).
- **Longest-prefix tier matching** — a versioned model id resolves by prefix, the
  *longest* matching prefix wins (kills an inverted sort), and the provider
  segment scopes the scan.
- **Cache-write tokens cost a premium over plain input** — covers the previously
  uncovered `cacheWriteTokens` branch.
- **Dangling-tier and unknown-cost-type fall-throughs** — a model mapped to a
  missing tier falls back to token pricing instead of crashing; an unrecognized
  cost type returns 0.
- **The `gpt-image` per-image gate** — `gpt-image-1.5` and unrelated models do
  **not** use the legacy per-image table.

For the other modules: `media-ref-bytes.ts` pins the inline-vs-uri-vs-asset_id
resolution order, every inline guard, each uri scheme (data:/file://, absolute
path, asset://, storage candidates, http(s)), and the full per-type asset-id
extension list (asserted against a hardcoded table, never derived from the
source). `context-packer.ts` pins the token-budget arithmetic at exact keep/drop
boundaries for each content kind. `recommended-models.ts` is pinned by
structural invariants (non-empty id/name, known modality/type/task,
`downloaded === false`) so an emptied literal or entry dies without duplicating
the catalog.

## Equivalent & non-behavioral mutants

Some mutants cannot be killed because they don't change observable behaviour;
chasing them is wasted effort, so they're suppressed at the source with a
line-scoped `// Stryker disable` comment that documents *why*. The headline
score then reflects test quality over *behavioural* code:

- **Diagnostic logging** — the logger name and `log.warn` message strings are for
  humans, not a behavioural contract, so they're deliberately not asserted.
- **The exact-match fast path in `getTier`** — the longest-prefix scan that
  follows returns the identical tier for an exact id (a key is always a prefix of
  itself), so removing the fast path is a performance change, not a behaviour
  change.
- **The cache-count guards in `calcTokenPriceUsd`** — `@pydantic/genai-prices`
  prices a 0/undefined cache count identically to an absent one, so toggling the
  `> 0` / `&&` guards is behaviour-preserving; the discount/premium themselves
  are pinned by the cache tests.
- **`GENAI_PROVIDER_MAP` value strings** — the NodeTool→genai-prices provider-id
  remapping's only observable effect is which entry of the external (volatile,
  intentionally un-pinned) price catalog is hit; asserting it would couple a unit
  test to those tables.
- **Non-Node runtime guards** — `media-ref-bytes.ts` and `image-codec.ts` lazily
  load `node:` builtins / `sharp` and throw in a browser/edge runtime; those
  fallback branches are unreachable under the (always-Node) test runner.
- **`sharp` memoization** — the one-time `if (!_sharpPromise)` cache check;
  forcing it reloads on every call, which is behaviour-preserving.

> Note: the longest-prefix scan was *refactored* (sort by raw key length rather
> than stripped-substring length) so the previously order-preserving substring
> mutants no longer exist — preferred over suppressing them.
