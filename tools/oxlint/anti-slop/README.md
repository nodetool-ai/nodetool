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

`npm run lint` and CI do not run it. The rules find 15,264 violations in the
current tree, so folding them into the main gate would leave it permanently red.
Treat this as a backlog to work down, not a merge blocker.

To promote a rule to the main gate: get it to zero across
`packages/*/src web/src electron/src mobile/src`, then move that one rule (and
the `jsPlugins` entry, once) into `.oxlintrc.json`.

## Updating

Re-run upstream's installer against a fresh clone and diff:

```bash
node <clone>/skills/install-anti-slop/scripts/install.mjs --force
```

`@oxlint/plugins` and `oxlint` must stay on the same version (currently 1.78.0).
