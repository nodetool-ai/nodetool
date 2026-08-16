# anti-slop (vendored)

Oxlint plugin from [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop),
copied at upstream commit `446268e5d15baa968eaec669ff65358d36ae6259` by that
repo's `install-anti-slop` skill. MIT, see `LICENSE`. Upstream ships it to be
vendored and edited, not consumed as a dependency.

Fourteen rules that reject low-evidence TypeScript: `unknown` in parameters,
returns and dictionary values, type-assertion chains, assertions without a
`SAFETY:` comment, runtime `typeof` narrowing, conditional empty-object spread,
module mocking, `Reflect.get`/`Reflect.apply`.

Upstream ships a fifteenth, `no-shape-in-symbol-names`, which bans the
substring "shape" in every identifier. It is deleted here. NodeTool draws
shapes: the sketch editor's `ShapeTool`, `drawShape` and `ShapeSettings` name a
rectangle or an ellipse, not a structure. The rest of its 921 findings were
tensor `shape` fields read out of safetensors headers and third-party contracts
(tRPC's `DefaultErrorShape`, Zod's raw shape) that cannot be renamed at all.
Vendoring exists so a rule that does not fit can go.

## Local edits

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

`.oxlintrc.anti-slop.json` registers the plugin and enables all fourteen rules at
`error`. It is a **separate config**, run only by `npm run lint:anti-slop`:

```bash
npm run lint:anti-slop   # whole repo, exits 1 while findings remain

# One directory — npm *appends* extra args to the script's own path list, so
# passing a path to `lint:anti-slop` still lints everything. Call oxlint direct:
npx oxlint --config .oxlintrc.anti-slop.json packages/cli/src
```

`npm run lint` and CI do not run it. The rules find 26,238 violations in the
current tree, so folding them into the main gate would leave it permanently red.
Treat this as a backlog to work down, not a merge blocker.

`.oxlintrc.anti-slop-enforced.json` is the other half: the rules already at zero,
run as part of `npm run lint` so they cannot regress. A rule is promoted by
moving its entry from the backlog config into the enforced one, in the same PR
that gets it to zero. The two configs partition the fourteen rules — a rule
belongs to exactly one.

Promotion goes through the enforced config rather than `.oxlintrc.json` because
`web/`, `electron/` and `mobile/` each carry their own `.oxlintrc.json`, and
oxlint resolves the nearest config per file: a rule added at the root would
silently skip those trees. Running with `--config` disables that resolution and
covers everything.

## Updating

Re-run upstream's installer against a fresh clone and diff:

```bash
node <clone>/skills/install-anti-slop/scripts/install.mjs --force
```

`@oxlint/plugins` and `oxlint` must stay on the same version (currently 1.78.0).
