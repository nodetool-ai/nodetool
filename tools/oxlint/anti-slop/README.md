# anti-slop (vendored)

Oxlint plugin from [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop),
copied at upstream commit `446268e5d15baa968eaec669ff65358d36ae6259` by that
repo's `install-anti-slop` skill. MIT, see `LICENSE`. Upstream ships it to be
vendored and edited, not consumed as a dependency.

Sixteen rules that reject low-evidence TypeScript: `unknown` in parameters,
returns and dictionary values, hand-written `any`, inferred return types on
exports, type-assertion chains, assertions without a `SAFETY:` comment, runtime
`typeof` narrowing, conditional empty-object spread, module mocking,
`Reflect.get`/`Reflect.apply`.

Two of the sixteen are NodeTool's own: `no-hand-written-any` and
`no-implicit-return-type` (both below). Upstream
ships a rule this vendoring does not, `no-shape-in-symbol-names`, which bans the
substring "shape" in every identifier. It is deleted here. NodeTool draws
shapes: the sketch editor's `ShapeTool`, `drawShape` and `ShapeSettings` name a
rectangle or an ellipse, not a structure. The rest of its 921 findings were
tensor `shape` fields read out of safetensors headers and third-party contracts
(tRPC's `DefaultErrorShape`, Zod's raw shape) that cannot be renamed at all.
Vendoring exists so a rule that does not fit can go.

## Local edits

`no-hand-written-any` is written here, not vendored, and is enforced across
every tree. It reports `any` in annotation positions — parameters, returns,
variables, properties, type arguments — and skips three things on purpose:

- **`declare` class properties.** `declare postprocessing: any` is the ambient
  field the `@prop` decorator requires for a node property. It is 960 of the
  1,012 `: any` annotations in `packages/*/src` and none of them is fixable at
  the site. Decided from the AST (`PropertyDefinition` with `declare: true`), so
  a rename cannot smuggle a hand-written `any` past it.
- **`as any` and `<any>x`.** `require-safety-comment-for-type-assertion` already
  reports those, and asks a different question.
- **Anything `no-unsafe-dictionary-type` classifies.** `Record<string, any>` is
  one finding, from that rule. The dedup walks the same ancestor chain that rule
  does, so the split is exact rather than name-matched: `Record<string, any[]>`
  has an array value type, that rule classifies nothing, and this one reports.

`no-implicit-return-type` is also written here. It reports a return type left to
inference on a module's public surface — an exported function, an exported
`const` bound to one, and the non-`private` members of an exported class — and
exists because `.github/workflows/type-safety.yaml` was a whole nightly agent
kept alive by this one uncovered case. `no-unknown-returns` reports a return
typed `unknown`; this reports one typed nothing. Scope is the point: reporting
every function in the repo would have put it thousands deep with nothing
schedulable, the position `no-shape-in-symbol-names` was deleted from. Bounded
to exports it landed at 448 findings, already zero in 29 of 58 trees. Two limits
are pinned in `tests/no-implicit-return-type.test.ts`: it walks down from the
export declaration, so `export { f }` is out of reach, and an annotation on the
binding rather than the function counts as the answer.

`no-runtime-typeof` carries two exemptions upstream does not, both for checks that are
correct as written and that no predicate can replace:

- **Global-existence probes.** `typeof someUndeclaredName` is the only way to ask whether
  a global exists — reading the bare name throws `ReferenceError`, so `isString(window)`
  is not a rewrite of `typeof window !== "undefined"`, it is a crash. An operand that
  resolves to no variable in the scope chain is exempt. An operand that *does* resolve
  still reports, so `declare const window` or a parameter named `window` is not a loophole.
- **Value-producing `typeof`.** A `typeof` interpolated into a template literal or
  returned reports what a representation is. It narrows nothing, so there is no contract
  to parse instead. The exemption stops there: `const kind = typeof value` still reports,
  because narrowing laundered through a local is still narrowing.

Together they account for 157 of the 3,107 findings the rule had before this change.

`@oxlint/plugins` ships no `RuleTester`, so `tests/no-runtime-typeof.test.ts` lints real
files with the real binary: every case names the 1-based lines it expects reported, and
one `oxlint` run covers them all. Reverting either exemption turns four cases red. It runs
in `npm run test:packages` via the root `test:oxlint-rules` script.

## How it is wired

`.oxlintrc.anti-slop.json` registers the plugin and enables the nine rules with
findings left, at `error`. It is a **separate config**, run only by
`npm run lint:anti-slop`:

```bash
npm run lint:anti-slop   # whole repo, exits 1 while findings remain

# One directory — npm *appends* extra args to the script's own path list, so
# passing a path to `lint:anti-slop` still lints everything. Call oxlint direct:
npx oxlint --config .oxlintrc.anti-slop.json packages/cli/src
```

`npm run lint` and CI do not run it. The rules find 16,912 violations in the
current tree, so folding them into the main gate would leave it permanently red.
Treat this as a backlog to work down, not a merge blocker.

`.oxlintrc.anti-slop-enforced.json` is the other half, run as part of
`npm run lint` so what is won cannot regress. It carries the seven rules at zero
everywhere in its top-level `rules`, plus one generated override block per
backlog rule listing the trees already at zero for it — regenerate those with
`npm run lint:anti-slop:write`, never by hand. The two configs partition the
sixteen rules — a rule belongs to exactly one.

Promotion goes through the enforced config rather than `.oxlintrc.json` because
`web/`, `electron/` and `mobile/` each carry their own `.oxlintrc.json`, and
oxlint resolves the nearest config per file: a rule added at the root would
silently skip those trees. Running with `--config` disables that resolution and
covers everything.

## Working the backlog

The unit of enforcement is a **(rule, tree) pair**, not a rule: a rule still
thousands of findings deep across the repo is nonetheless finished in most
packages, and those are ratcheted now rather than after the last one lands.

`.github/workflows/anti-slop-ratchet.yaml` runs this loop daily: measure, fix
one tree, regenerate the overrides, and induce a failure to prove the new ones
bite. It opens a PR; it merges nothing.

Those override blocks are generated, never hand-edited:
`npm run lint:anti-slop:count` prints the current counts, `:targets` adds the
trees closest to zero, the cheapest remaining pairs, and the largest ones,
`:write` regenerates the overrides from a fresh measurement, and `:check` fails
when the config and the measurement disagree. Read the counts off `:targets`
rather than off a raw `oxlint` run — oxlint's own default rules report through
the same channel, so counting diagnostics instead of `anti-slop(...)` codes
overstates a tree by several times. Never record a count in a doc: the numbers
drift the day after they are written, which is how hand-maintained ones went
wrong before. The generator lints one tree per oxlint invocation and rejects
any tree whose scan touched zero files: oxlint does not expand `packages/*/src`
itself, and a glob that reaches it unexpanded lints nothing while reporting
nothing — which is indistinguishable from a clean tree, and would ratchet every
pair on a broken run.

A rule that does not fit NodeTool is deleted from the plugin instead — upstream
ships it to be vendored and edited. That is why `no-shape-in-symbol-names` is
gone: it banned the substring "shape" in every identifier, and here that is the
sketch editor's drawing tools, tensor shapes, and third-party contracts.

- **`no-runtime-typeof`** runs with `allowInTypeGuards: true`. A `typeof`
  directly inside a function returning `v is T` is the sanctioned form, so the
  work is consolidating repeated inline checks into named predicates (each tree
  has a predicate module: `packages/protocol/src/predicates.ts`,
  `web/src/utils/typePredicates.ts`, mobile's twin, per-package siblings),
  never deleting guards. `packages/protocol/src/typecheck.ts` is exempt: in the
  package that owns the schemas, an inline `typeof` means someone bypassed the
  parse. Predicates take `value: unknown`, so consolidation moves findings into
  `no-unknown-parameters`. Two shapes the rule does not flag, because no
  predicate can replace them: a `typeof` whose operand resolves to no variable
  in scope (a global-existence probe — reading the bare name throws
  `ReferenceError`), and one interpolated into a template literal or returned
  (a value, not a narrowing). An operand that *does* resolve still reports, and
  `const kind = typeof value` still reports — narrowing laundered through a
  local is still narrowing.
- **`require-safety-comment-for-type-assertion`** is present nearly everywhere
  and moves only when the values crossing a boundary get named.
- **`no-module-mocking`** is concentrated in the frontend test suites and is a
  test-seam problem, not a typing one — worth its own change rather than a slot
  in the typing work.
- **`no-hand-written-any`** and **`no-implicit-return-type`** are NodeTool's
  own rules, both enforced everywhere. The first reports `any` in annotation
  positions (parameters, returns, variables, properties, type arguments) and
  deliberately skips `declare` class properties — the ambient field `@prop`
  requires — plus `as any` and anything `no-unsafe-dictionary-type` already
  classifies. The second reports an inferred return type on a module's public
  surface: an exported function, an exported `const` bound to one, and the
  non-`private` members of an exported class. Inference inside a module is
  fine; across the boundary it means the contract is whatever today's
  implementation happens to produce. Annotating `unknown` to silence it just
  moves the finding to `no-unknown-returns`. Typing test doubles is what
  `web/src/test-utils/doubles.ts` is for.
- **`no-unknown-returns`** has stalled short of zero on one thing said many
  ways — a node output, an app-state slot, a stream item — for which NodeTool
  has no named type, plus the `Tool.process` contract that erases every tool's
  result to share one registry. Those sites carry a
  `HOLDOUT (anti-slop/no-unknown-returns)` comment saying so. Naming that value
  domain is a modelling change, not an annotation.

A large pair does not finish in one PR and only ratchets when it reaches zero.
Bound such a change to one directory and report the before/after count in the
PR rather than implying the win is already held.

## Updating

Re-run upstream's installer against a fresh clone and diff:

```bash
node <clone>/skills/install-anti-slop/scripts/install.mjs --force
```

`@oxlint/plugins` and `oxlint` must stay on the same version (currently 1.78.0).
