# @nodetool-ai/<package-name>

> Template for package READMEs. Copy to `packages/<name>/README.md`, fill in the
> sections, and delete this note. Several core packages already have READMEs
> (protocol, runtime, kernel, node-sdk, base-nodes, agents, websocket, models) —
> use them as worked examples.

One-sentence description (mirror the `description` in package.json).

## Responsibilities

- What this package owns. Bullet the main exports / concepts.
- Note any cross-package contracts it depends on or provides.

## Usage

```ts
import { Something } from "@nodetool-ai/<package-name>";
```

## Develop

```bash
npm run build --workspace=packages/<package-name>
npm run test  --workspace=packages/<package-name>
npm run lint  --workspace=packages/<package-name>   # tsc --noEmit
```

> Imports use `@nodetool-ai/<package>`; never import from `dist/`. Packages that
> use decorators (node-sdk, *-nodes) load from `dist/` — run
> `npm run build:packages` after changing them. See the root
> [CLAUDE.md](../../CLAUDE.md) for build order and conventions.
