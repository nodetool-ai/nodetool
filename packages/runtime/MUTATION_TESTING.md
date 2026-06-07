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

The package is large (60+ source files, most of them thin per-vendor API
adapters), so a whole-package run is slow and dominated by transport branches
that aren't behaviourally pinned yet. Rather than gate on a number nobody can
keep green, the config's `mutate` glob lists only the **hardened, gated**
modules, and the set grows as each module is brought up to the bar — the same
incremental discipline `packages/security` used. The `break` threshold then
*means something*: a regression in those modules fails fast.

To explore any other file ad-hoc (Stryker's `-m` overrides the config glob):

```bash
npx stryker run -m "src/media-ref-bytes.ts"
npx stryker run -m "src/providers/base-provider.ts"
```

### Next modules to harden (highest blast radius first)

1. **`media-ref-bytes.ts`** — the inline-vs-`uri`-vs-`asset_id` resolution order
   and the `data.length > 0` guards on every inline branch.
2. **`providers/base-provider.ts`** — the terminal `{ done: true }` chunk emitted
   for *every* stream-termination reason, and usage-token accounting.

## Current status

```
File               | % score | killed | survived | ignored
-------------------|---------|--------|----------|--------
cost-calculator.ts |   88.59 |    132 |       17 |      20
```

The config gate (`stryker.config.json`) **breaks below 80%**, leaving headroom
above the current score so an unrelated edit doesn't trip it while still
catching a real regression in test quality.

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

### Known remaining survivors (not suppressed)

Left visible rather than hidden, because they're either order-preserving or
externally coupled:

- **`GENAI_PROVIDER_MAP` value strings** — the NodeTool→genai-prices provider-id
  remapping is real behaviour, but its only observable effect is which entry of
  the external (and intentionally un-pinned, because volatile) price catalog is
  hit. Asserting it would couple a unit test to those tables.
- **Order-preserving sort/filter arithmetic** in the longest-prefix scan — e.g.
  subtracting a constant `providerPrefix.length` from both sides of the
  comparator doesn't change ordering.
