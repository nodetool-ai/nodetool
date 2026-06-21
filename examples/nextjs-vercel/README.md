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

## LLM example (server-side secrets) — included

The real advantage of running server-side is that **API keys never reach the
browser**. This example already wires that up:

- **`lib/registry.ts`** registers `OPENAI_NODES` when `includeLlm` is set. They
  are tagged `node + workers + edge`, so they survive `forPlatform`. (We use the
  `@nodetool-ai/llm-nodes/openai` subpath — it imports cleanly, without the
  native OS-keychain chain that the `agents` nodes pull in.)
- **`app/api/run/route.ts`** supplies secrets per request via the handler's
  `createContext` hook:

  ```ts
  createContext: () =>
    new ProcessingContext({
      jobId: crypto.randomUUID(),
      secretResolver: envSecretResolver(process.env), // reads OPENAI_API_KEY
      retainMessageQueue: false
    })
  ```

  Each node declares its `requiredSettings` (e.g. `OPENAI_API_KEY`); the runtime
  resolves them through the context's `secretResolver` before `process()`, so
  the key is read from `process.env` on the server only.

The **"OpenAI Web Search"** sample (`openai.text.WebSearch`) demonstrates it.
Set the key and deploy:

```bash
# locally
echo "OPENAI_API_KEY=sk-..." > .env.local
npm run dev

# on Vercel
vercel env add OPENAI_API_KEY
```

Without the key, the run streams a clear `OPENAI_API_KEY is not configured`
error instead of crashing — the node still registers and passes platform
validation; only the provider call fails.
