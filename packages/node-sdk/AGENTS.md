# node-sdk — BaseNode, NodeRegistry, Type System

**Navigation**: [packages/AGENTS.md](../AGENTS.md) → **node-sdk**

> Read [packages/AGENTS.md](../AGENTS.md) first — the **Node Authoring — Bug Patterns to Avoid** section there is the contract every node must satisfy (output slots, media refs, bounds, defaults). This overlay covers the `BaseNode` internals that enforce it.

## Framework-injected internals vs. user dynamic props

The framework injects internals into a node before `process()` runs — resolved
`_secrets` (API keys), `_control_context`, `__node_id`, `__node_name`. These must
**never** mix with user-supplied dynamic inputs:

- **Route every reserved `_`-prefixed key to the private `_internalProps` map**
  (in `assign`/`setDynamic`/`getDynamic`), not `dynamicProps`. If they land in
  `dynamicProps` they leak three ways: `serialize()` persists API keys into graph
  state; `Object.fromEntries(this.dynamicProps)` pulls secrets into prompt-template
  variables; and per-node arg builders forward them to provider requests.
- **Gate on the `_` prefix, not a hardcoded skip-list.** The old guard
  (`["__node_id", "__node_name", "_secrets"]`) omitted `_control_context` and
  needed a per-package `SKIP_KEYS` workaround. Prefix-gating covers any new
  internal automatically.
- **Regression-test the boundary**: assert `serialize()` excludes internals and
  that prompt-variable iteration (`dynamicProps`) doesn't see `_secrets` /
  `_control_context`.

## Node output & streaming contract

These are defined here (in `BaseNode`/the registry) and enforced for every node —
see [packages/AGENTS.md § Output contract](../AGENTS.md#output-contract):

- Every key returned from `process()`/`genProcess()` must be a declared
  `metadataOutputTypes` slot, or it's unreachable in the editor.
- A `chunk` (streaming) output requires an `async *genProcess` generator with
  `outputCorrelation` set to `iteration` (chunks) / `single` (aggregate).
- `yield` structured results so the kernel routes them to dynamic output handles;
  a value `return`ed from a generator is discarded by `yield*`.

## Mutation testing

This package's behavioural core (validation, registry, metadata bridge, pack
trust model) is gated by **mutation testing** — `npm run test:mutation` breaks
below 80%. When you change `BaseNode`, the registry, validation, or the metadata
loaders, add a test that pins the exact new behaviour, then re-run the gate. Two
config settings are load-bearing and explained in
[MUTATION_TESTING.md](./MUTATION_TESTING.md): `inPlace: true` (the source aliases
in `vitest.config.ts` break Stryker's sandbox) and `ignoreStatic: true` (the
top-level `await` in `metadata.ts` makes module-load constants slow static
mutants). `src/docs/**` and `src/python-package-scan.ts` are excluded — see the doc.
