# mutator — Mutation Testing for TypeScript

**Navigation**: [packages/AGENTS.md](../AGENTS.md) → **mutator**

`nodetool-mutator` is a port of unclebob/mutator. Usage, the mutation table,
the snapshot format, and the differences from the original are in the
[README](README.md). The repository policy is in
[DEVELOPMENT_STANDARDS § Mutation testing policy](../../docs/DEVELOPMENT_STANDARDS.md#mutation-testing-policy).

- Keep the operator set in `src/sites.ts` aligned with mutator's TypeScript
  rules. A new operator changes every package's score, so it needs a reason
  and a test in `tests/sites.test.ts`.
- The snapshot keys in `src/snapshot.ts` match mutator's EDN keys. Do not
  rename them. `scripts/mutation-score.mjs` and the workflows read them.
- Never write to the project tree while mutating. Mutants run only inside the
  worker overlays in `src/workers.ts`.
- `tests/cli.test.ts` runs real mutants against a temporary package. Keep it
  passing without network or a build of other packages.
