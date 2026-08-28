# @nodetool-ai/protocol

Shared message types and protocol definitions for the NodeTool workflow runtime.

This is the base dependency for nearly every other package — it defines the wire
types (graph nodes/edges, processing messages, type metadata, API schemas) that
the kernel, runtime, websocket server, and clients all agree on.

## Responsibilities

- Graph transport types (`NodeDescriptor`, `Edge`) and correlation/lineage signals.
- Processing message union (`output_update`, `edge_update`, `job_update`, …),
  Zod-first: every `ProcessingMessage` variant in `src/messages.ts` is a Zod
  schema, with its TypeScript type derived via `z.infer` (the two shapes Zod
  can't infer exactly — the recursive `TaskRef`/`StepRef` pair — keep a
  hand-written interface with a `z.ZodType<...>`-annotated schema instead).
  `processingMessageSchema` is the single `z.discriminatedUnion("type", ...)`
  validator for the whole union; `processingMessageSchemas` indexes the
  per-type schemas by discriminator; `is*` guard functions (`isJobUpdate`,
  `isChunk`, …) do a cheap discriminant-only check, and `isProcessingMessage`
  does full structural validation.
- `TypeMetadata` parser and type-compatibility checks.
- Zod schemas for the REST/tRPC boundary (`api-schemas/`).

## Usage

```ts
import type { NodeDescriptor, Edge } from "@nodetool-ai/protocol";
import { graphNode } from "@nodetool-ai/protocol";
```

## Develop

```bash
npm run build --workspace=packages/protocol   # tsc build, then the JSON Schema step below
npm run test  --workspace=packages/protocol   # vitest
npm run lint  --workspace=packages/protocol   # tsc --noEmit
```

Imports use `@nodetool-ai/<package>`; never import from `dist/`. See the root
[AGENTS.md](../../AGENTS.md) for the monorepo build order.

## Generated processing-messages JSON Schema

`npm run build` (via `generate:processing-messages-schema`, wired in after the
`tsc` step) converts `processingMessageSchema` to JSON Schema with
`z.toJSONSchema` and writes it to `dist/processing-messages.schema.json` — a
build artifact (`dist/` is gitignored, like the rest of this package's output),
regenerated on every build rather than checked in. Non-TypeScript consumers —
the Python worker, external SDKs — validate wire messages against this file
instead of hand-copying the TS shapes (RELIABILITY_ARCHITECTURE.md §8.2).

```bash
npm run generate:processing-messages-schema --workspace=packages/protocol       # (re)write it
npm run check:processing-messages-schema   --workspace=packages/protocol       # verify, no write (CI)
```
