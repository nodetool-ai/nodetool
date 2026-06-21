# NodeTool server-side workflow runner — Next.js on Vercel

A minimal Next.js (App Router) app that executes NodeTool workflows **on the
server** and streams the result to the browser. It uses
[`@nodetool-ai/workflow-runner`](../../packages/workflow-runner)'s
`createWorkflowHandler` — a Web-standard `(Request) => Response` — so there is
**no separate backend server**: the workflow runs inside the Next.js route.

> Looking for the Cloudflare Workers version? See
> [`../nextjs-cloudflare`](../nextjs-cloudflare). The app code is identical; only
> the deploy config and the runner's `platform` differ.

## How it works

```
Browser ──POST /api/run { graph }──▶ Next.js route (Node runtime)
                                       │  createWorkflowHandler({ registry, platform: "node" })
                                       │     └─ runs the graph, streams ProcessingMessages
       ◀──────── text/event-stream ────┘     ends with `event: result` (RunResult)
```

- **`lib/registry.ts`** builds a `NodeRegistry` from a curated, dependency-light
  node set (constants, lists, comparisons, control, inputs, validation,
  datetime). It imports node groups from their **per-file subpaths**
  (`@nodetool-ai/core-nodes/nodes/*`), never the package index — the index pulls
  in `sqlite-vec`/`better-sqlite3` native bindings that can't deploy serverless.
  `registry.forPlatform("node")` keeps only platform-compatible nodes.
- **`app/api/run/route.ts`** wraps the registry in `createWorkflowHandler` and
  streams the run as Server-Sent Events.
- **`app/page.tsx`** posts a sample graph and renders the streamed messages and
  final outputs.

`RunResult.outputs` is collected from every **terminal** node (no outgoing data
edge), keyed by `name ?? id` — so even a single constant node yields a result.

## Run locally

These packages are part of the NodeTool monorepo and are **not published to
npm**, so build them once from the repo root first:

```bash
# from the monorepo root
npm install
npm run build:packages

# then, in this folder
cd examples/nextjs-vercel
npm run dev          # http://localhost:3002
```

## Deploy to Vercel

```bash
npm i -g vercel
vercel            # first run links/creates the project
vercel --prod
```

Notes:
- The route runs on the **Node.js runtime** (`export const runtime = "nodejs"`)
  for full compatibility with the kernel/runtime stack.
- `export const maxDuration = 60` in the route raises the function timeout for
  longer workflows (Hobby caps lower; Pro allows more).
- `next.config.mjs` marks the `@nodetool-ai/*` packages as
  `serverExternalPackages` so Vercel runs them as real Node modules.

## Add an LLM node (server-side secrets)

The real advantage of running server-side is that **API keys never reach the
browser**. To add a fetch-based LLM node:

1. Import its group in `lib/registry.ts` (alongside the core groups) — LLM/HTTP
   nodes are tagged `node + workers + edge`, so they survive `forPlatform`.
2. Provide secrets per request via the handler's `createContext` hook:

   ```ts
   import { createWorkflowHandler } from "@nodetool-ai/workflow-runner";
   import { ProcessingContext } from "@nodetool-ai/runtime/context";

   const handler = createWorkflowHandler({
     registry: createEdgeRegistry("node"),
     platform: "node",
     createContext: () =>
       new ProcessingContext({
         environment: { OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "" }
       })
   });
   ```

   Set `OPENAI_API_KEY` in the Vercel project's Environment Variables.
