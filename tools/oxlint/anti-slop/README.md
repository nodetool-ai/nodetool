# anti-slop (vendored)

Oxlint plugin from [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop),
copied at upstream commit `446268e5d15baa968eaec669ff65358d36ae6259` by that
repo's `install-anti-slop` skill. MIT, see `LICENSE`. Upstream ships it to be
vendored and edited, not consumed as a dependency.

Fifteen rules that reject low-evidence TypeScript: `unknown` in parameters,
returns and dictionary values, type-assertion chains, assertions without a
`SAFETY:` comment, runtime `typeof` narrowing, conditional empty-object spread,
module mocking, `Reflect.get`/`Reflect.apply`.

## How it is wired

`.oxlintrc.anti-slop.json` registers the plugin and enables all fifteen rules at
`error`. It is a **separate config**, run only by `npm run lint:anti-slop`:

```bash
npm run lint:anti-slop                       # whole repo, exits 1 while findings remain
npm run lint:anti-slop -- packages/cli/src   # one directory
```

`npm run lint` and CI do not run it. The rules find 28,689 violations in the
current tree, so folding them into the main gate would leave it permanently red.
Treat this as a backlog to work down, not a merge blocker.

`.oxlintrc.anti-slop-enforced.json` is the other half: the rules already at zero,
run as part of `npm run lint` so they cannot regress. A rule is promoted by
moving its entry from the backlog config into the enforced one, in the same PR
that gets it to zero. The two configs partition the fifteen rules — a rule
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
