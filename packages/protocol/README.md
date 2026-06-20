# @nodetool-ai/protocol

Shared message types and protocol definitions for the NodeTool workflow runtime.

This is the base dependency for nearly every other package — it defines the wire
types (graph nodes/edges, processing messages, type metadata, API schemas) that
the kernel, runtime, websocket server, and clients all agree on.

## Responsibilities

- Graph transport types (`NodeDescriptor`, `Edge`) and correlation/lineage signals.
- Processing message union (`output_update`, `edge_update`, `job_update`, …).
- `TypeMetadata` parser and type-compatibility checks.
- Zod schemas for the REST/tRPC boundary (`api-schemas/`).

## Usage

```ts
import type { NodeDescriptor, Edge } from "@nodetool-ai/protocol";
import { graphNode } from "@nodetool-ai/protocol";
```

## Develop

```bash
npm run build --workspace=packages/protocol   # tsc build
npm run test  --workspace=packages/protocol   # vitest
npm run lint  --workspace=packages/protocol   # tsc --noEmit
```

Imports use `@nodetool-ai/<package>`; never import from `dist/`. See the root
[CLAUDE.md](../../CLAUDE.md) for the monorepo build order.
