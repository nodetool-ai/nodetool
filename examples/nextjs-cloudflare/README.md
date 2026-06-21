# NodeTool server-side workflow runner — Next.js on Cloudflare Workers

A minimal Next.js (App Router) app that executes NodeTool workflows **on
Cloudflare Workers** and streams the result to the browser. It uses
[`@nodetool-ai/workflow-runner`](../../packages/workflow-runner)'s
`createWorkflowHandler` — a Web-standard `(Request) => Response` — so there is
**no separate backend server**: the workflow runs inside the Worker (deployed
via [OpenNext](https://opennext.js.org/cloudflare)).

> Looking for the Vercel version? See [`../nextjs-vercel`](../nextjs-vercel). The
> app code is identical; only the deploy config and the runner's `platform`
> differ (`"workers"` here vs `"node"` there).

## How it works

```
Browser ──POST /api/run { graph }──▶ Worker (workerd + nodejs_compat)
                                       │  createWorkflowHandler({ registry, platform: "workers" })
                                       │     └─ runs the graph, streams ProcessingMessages
       ◀──────── text/event-stream ────┘     ends with `event: result` (RunResult)
```

- **`lib/registry.ts`** builds a `NodeRegistry` from a curated, dependency-light
  node set, importing node groups from their **per-file subpaths**
  (`@nodetool-ai/core-nodes/nodes/*`) — never the package index, which pulls in
  `sqlite-vec`/`better-sqlite3` native bindings that can't run in a V8 isolate.
  `registry.forPlatform("workers")` keeps only Workers-compatible nodes.
- **`app/api/run/route.ts`** wraps the registry in `createWorkflowHandler` and
  streams the run as Server-Sent Events.
- **`app/page.tsx`** posts a sample graph and renders the streamed messages and
  final outputs.

`RunResult.outputs` is collected from every **terminal** node (no outgoing data
edge), keyed by `name ?? id` — so even a single constant node yields a result.

## Cloudflare specifics

- **`wrangler.jsonc`** sets `nodejs_compat`, which supplies the Node built-ins
  the kernel/runtime stack lazy-loads. Without it the Worker bundle fails on
  `node:*` imports.
- **`open-next.config.ts`** drives the OpenNext → Workers build.
- Unlike the Vercel example, `next.config.mjs` does **not** mark the
  `@nodetool-ai/*` packages external — OpenNext bundles everything into the
  Worker.

> **Bundle note:** this example ships only pure-JS nodes, which bundle cleanly
> for workerd. Node groups that need native modules or `child_process` (image
> via `sharp`, video/audio via `ffmpeg`, vector via `sqlite-vec`, code runners
> via Docker) are **not** Workers-compatible and are intentionally excluded.

## Run locally

These packages are part of the NodeTool monorepo and are **not published to
npm**, so build them once from the repo root first:

```bash
# from the monorepo root
npm install
npm run build:packages

# then, in this folder
cd examples/nextjs-cloudflare
npm run dev          # http://localhost:3003 (Next dev)
npm run preview      # build + run on a local workerd (closest to production)
```

## Deploy to Cloudflare

```bash
npx wrangler login
npm run deploy       # opennextjs-cloudflare build && deploy
```

## Add an LLM node (server-side secrets)

The real advantage of running server-side is that **API keys never reach the
browser**. To add a fetch-based LLM node:

1. Import its group in `lib/registry.ts` (alongside the core groups) — LLM/HTTP
   nodes are tagged `node + workers + edge`, so they survive `forPlatform`.
2. Provide secrets per request via the handler's `createContext` hook, reading
   from the Worker env:

   ```ts
   import { createWorkflowHandler } from "@nodetool-ai/workflow-runner";
   import { ProcessingContext } from "@nodetool-ai/runtime/context";
   import { getCloudflareContext } from "@opennextjs/cloudflare";

   const handler = createWorkflowHandler({
     registry: createEdgeRegistry("workers"),
     platform: "workers",
     createContext: () => {
       const { env } = getCloudflareContext();
       return new ProcessingContext({
         environment: { OPENAI_API_KEY: env.OPENAI_API_KEY ?? "" }
       });
     }
   });
   ```

   Add the secret with `npx wrangler secret put OPENAI_API_KEY`.
