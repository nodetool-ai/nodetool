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
base-node.ts               |  100.00 |    177 |        0
class-name-to-title.ts     |  100.00 |     35 |        0
correlation-validation.ts  |  100.00 |     91 |        0
decorators.ts              |  100.00 |     21 |        0
field-classification.ts    |  100.00 |     12 |        0
metadata.ts                |  100.00 |    151 |        0
node-metadata.ts           |  100.00 |    221 |        0
pack-loader.ts             |  100.00 |    208 |        0
package-registry-client.ts |  100.00 |     41 |        0
pricing-bundle.ts          |  100.00 |     19 |        0
registry.ts                |  100.00 |    185 |        0
search.ts                  |  100.00 |     77 |        0
validation.ts              |  100.00 |    164 |        0
---------------------------|---------|--------|---------
All files                  |  100.00 |   1401 |        0
```

The config gate (`stryker.config.json`) **breaks below 100%**, so any surviving
mutant — a behavioural gap or an un-justified equivalent — fails CI. Every
genuinely-equivalent mutant is suppressed at the source with a line- or
block-scoped `// Stryker disable` comment that documents *why* (see below), so
the headline reflects the quality of the tests, not lenience.

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

A 100% score does not mean every mutant was killed by a test — some **cannot** be
killed because they don't change observable behaviour. Each is suppressed at the
source with a `// Stryker disable` comment stating *why*. The recurring patterns:

- **Sub-expression guards masked by a later operand** — e.g. forcing
  `typeof x === "string"` true in `validation.ts`'s `isUnsetModel`: a non-string
  provider can never `=== "empty"`, so the second operand decides the result
  either way.
- **Redundant fast-paths** — the empty-string guard in `classNameToTitle`, the
  `if (!list)` guard in the registry client (a null list throws into the outer
  `catch`, which also returns `[]`), the `required.length === 0` arm in secret
  injection (the empty-loop path returns `inputs` anyway), and the duplicate
  package-metadata-dir detection in `metadata.ts` (a subdir not matched in the
  loop is found when the walk recurses into it).
- **Opaque internal values** — the metadata cache key / fingerprint hashing
  (`crypto` chain, `"|missing"`): any *consistent* value maps a roots-set to a
  stable cache file, so the exact bytes don't matter.
- **Diagnostic `console.warn` / `console.error` text** and **`"utf-8"` encoding
  arguments** (Node decodes `""` as utf-8) — non-behavioural, as in the security
  package.
- **Unreachable defensive code** — the strict-metadata `throw` (getNodeMetadata
  never returns falsy) and the `statSync` / cache `JSON.parse` catch blocks
  (freshly-walked files exist; an emptied catch falls through to an equivalent
  `null`/`undefined`).

## Working around perTest coverage limitations

Stryker's `perTest` coverage records a branch mutant (e.g. `if (cond)` →
`if (true)`) as "covered" only by tests that took the *consequent*; an
opposite-branch test that would actually kill it is not run against it. Where
this hid a genuinely-killable mutant, the condition was lifted into an
always-executed `const` (so coverage is recorded) or extracted to a small helper
(`pickExportCondition`, `isMetadataDir`, `splitWordBoundaries`, `pushSegment`) —
behaviour-preserving refactors that also remove the duplication that bred
equivalent mutants.

Two further mechanics worth knowing for future hardening:

- `// Stryker disable next-line <Mutator>` only attaches to a mutant on the
  *immediately following physical line of a standalone statement*. For a mutant
  buried inside a multi-line expression, method chain, ternary, `catch`, or
  `else if`, collapse it to one line or use the block form
  (`// Stryker disable <Mutator>` … `// Stryker restore <Mutator>`).
- A timeout (e.g. a `?? []` mutant that drives infinite recursion) counts as a
  kill.
