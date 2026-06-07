# Mutation Testing — `@nodetool-ai/node-sdk`

node-sdk is the type-system core of NodeTool: `BaseNode`, the `NodeRegistry`,
node validation, platform gating, the third-party pack trust model, and the
TS↔Python metadata bridge. A silent regression here mis-registers nodes, lets
unsupported nodes onto a platform, or corrupts metadata for every downstream
package — so the tests are verified with **mutation testing** on top of ordinary
coverage. Line coverage only proves code *ran*; mutation testing proves the
tests would actually *fail* if the behaviour changed.

## Running it

```bash
npm run test:mutation --workspace=packages/node-sdk
# or, from packages/node-sdk:
npx stryker run
```

The HTML report lands in `reports/mutation/mutation.html` (git-ignored).

## Current status

```
File                       | % score | killed | survived
---------------------------|---------|--------|---------
field-classification.ts    |  100.00 |     12 |        0
correlation-validation.ts  |   92.78 |     90 |        7
validation.ts              |   90.96 |    171 |        9
pricing-bundle.ts          |   89.47 |     17 |        2
decorators.ts              |   88.46 |     22 |        3
search.ts                  |   87.50 |     77 |        9
base-node.ts               |   85.71 |    174 |       27
class-name-to-title.ts     |   82.61 |     38 |        8
registry.ts                |   78.16 |    161 |       32
pack-loader.ts             |   76.72 |    176 |       44
metadata.ts                |   76.34 |    170 |       45
node-metadata.ts           |   75.98 |    191 |       52
package-registry-client.ts |   70.00 |     42 |       17
---------------------------|---------|--------|---------
All files                  |   81.39 |   1341 |      255
```

The config gate (`stryker.config.json`) **breaks below 80%**, so a regression in
test quality fails CI fast. 80 is the current ratchet floor, not the ceiling —
when the remaining behavioural survivors in `node-metadata.ts` / `metadata.ts` /
`pack-loader.ts` are closed, raise the `break` threshold to lock the gain in.

## Monorepo specifics

Two settings in `stryker.config.json` exist for reasons specific to this package
and are not in the security package's config:

- **`"inPlace": true`** — **required, do not remove.** `vitest.config.ts` aliases
  sibling workspaces to their *source* (`@nodetool-ai/config` →
  `../config/src/index.ts`, likewise kernel / runtime / protocol). Stryker's
  default sandbox copies only `packages/node-sdk`, so those `../<pkg>/src` paths
  resolve outside the sandbox and every test file that imports them (registry,
  metadata, node-metadata, pack-loader, …) fails to load — silently dropping
  ~45% of the suite and reporting whole files as "no coverage". Running in place
  keeps the relative source aliases resolvable. Stryker restores the mutated
  files when the run finishes; the sibling sources are never in the mutate set,
  so they stay constant. (The security package needs no alias — it resolves
  siblings through symlinked `node_modules`, which works inside a sandbox.)
- **`"ignoreStatic": true`** — `metadata.ts` resolves its Node built-ins through a
  top-level `await` so it loads in browser/Edge runtimes. That makes many
  module-load-time constants "static" mutants, which Stryker can only test by
  reloading the whole module graph against the full suite (Stryker warns about
  them and recommends ignoring). They are module-init constants
  (`PROVIDER_NAMESPACES`, `ASSET_TYPES`, `FIELD_WEIGHTS`, regex literals), not
  request-path behaviour, so ignoring them keeps the score honest and the run
  fast.

## What is mutated

`mutate` covers `src/**/*.ts` minus:

- **`src/index.ts`, `src/docs/index.ts`** — pure re-export barrels.
- **`src/nodes/test-nodes.ts`** — test fixtures, not shipped behaviour.
- **`src/docs/**`** — the markdown documentation *generators*. Their output is
  human-facing text, not a behavioural contract (the same reason the security
  package does not assert log strings), so the doc generators are exercised by
  `docs-*.test.ts` for correctness but excluded from the mutation gate.
- **`src/python-package-scan.ts`** — only reachable by spawning a real
  `nodetool-core` Python process; its test is `describe.skip` unless a conda
  `nodetool` env is present, so it has no coverage in unit CI. It is covered by
  the gated integration test, not by mutation.

## How the suite was hardened

Mutation testing surfaced gaps that line coverage hid. The tests added to close
them (`tests/*-hardening.test.ts`) target *observable behaviour*, each pinning
one externally-meaningful property as Arrange/Act/Assert:

- **Validation emptiness boundaries** (`validation-hardening.test.ts`): every
  asset "set" signal (`uri` / `asset_id` / `temp_id` / inline `data`, plus the
  empty-string / empty-array boundaries) and every model "unset" signal
  (missing/`empty` provider, missing/empty id), plus the exact
  `formatValidationIssues` text for each id/type combination.
- **`hasStreamingOutput` resolution order** (`base-node-hardening.test.ts`): the
  flag → `genProcess` override → `forward`/`iteration`/`chunk` correlation
  precedence, the `assign()` default deep-copy and reserved-key routing, the
  secret-injection branches (present / absent / no-context / no-requiredSettings)
  and the conditional shape of `toDescriptor`.
- **Registry contracts** (`registry-hardening.test.ts`): the platform-validator
  message and its `node` fallback, exact-vs-`Node`-suffix metadata resolution,
  and the full `descriptorDefaults` / `propertyMeta` shape the graph resolver
  emits.
- **Metadata bridge** (`metadata-hardening.test.ts`, `node-metadata-hardening.test.ts`):
  scalar-name mapping, the recursive generic type parser, Python backfill
  precedence (incl. the `"default"` body sentinel), `NaN`/`Infinity`
  sanitisation, node_type validation + duplicate detection, the metadata
  **cache** round-trip (served-from-cache vs re-parse on change), and the nested
  directory walk + `maxDepth`.
- **Pack trust model** (`pack-loader-hardening.test.ts`): trust-resolution
  precedence (options → env → config file → prod default), and the guarded
  registry's reserved-namespace / collision / api-version / missing-export gates.
- **Search ranking** (`search-hardening.test.ts`): the exact-token bonus,
  per-field score accumulation, `namespacePrefix` `startsWith` filtering, and the
  deterministic alphabetical tiebreak.

## Equivalent & non-behavioral mutants

Some survivors **cannot** be killed because they don't change observable
behaviour. Chasing them is wasted effort:

- **`mergeMetadata` `layout` backfill** — `getNodeMetadata` always emits a
  `layout` string (`"default"` when unset), so `tsMetadata.layout ?? py.layout`
  never reaches the Python side. The backfill is dead for `layout` (only `body`
  has the sentinel-aware path), so its mutant is equivalent.
- **`collectDeclaredProps` prototype-walk guard** — a class constructor's
  prototype chain always terminates at `Function.prototype`, so the
  `typeof current === "function"` guard never decides the loop; mutating it does
  not change the walk.
- **Diagnostic `console.warn`/`console.error` text** — operator log strings are
  for humans, not a contract, so their exact wording is deliberately not
  asserted.

The headline score therefore reflects the quality of the tests over
*behavioural* code rather than being penalised by mutants no test could
legitimately catch.
