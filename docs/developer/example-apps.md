---
layout: page
title: "Example Apps"
description: "Runnable example apps in the repository that embed NodeTool: a chat client, Next.js apps for Vercel and Cloudflare Workers, and a static workflow runner."
---

The `examples/` folder holds small apps that show how to use NodeTool from your own code. Each one builds on the monorepo packages, which are not published to npm, so build them from the repository root first:

```bash
nvm use
npm install
npm run build:packages
```

| Example | Shows | Runs against |
|---|---|---|
| [`chat_app`](#chat_app) | A React chat client built on the SDK | A running NodeTool server |
| [`nextjs-vercel`](#nextjs-vercel) | Workflows run inside a Next.js route on Vercel | No separate server |
| [`nextjs-cloudflare`](#nextjs-cloudflare) | The same app on Cloudflare Workers | No separate server |
| [`workflow_runner`](#workflow_runner) | A static page that runs workflows over the WebSocket API | A running NodeTool server |

## chat_app

[Source on GitHub](https://github.com/nodetool-ai/nodetool/tree/main/examples/chat_app)

A chat client for the NodeTool server, built with Vite, React 19, Tailwind and vendored shadcn/ui components. It shows how to use the typed tRPC client and the streaming chat WebSocket from `createNodetoolClient()`: listing threads and messages, picking a language model, and streaming assistant replies.

**Packages:** `@nodetool-ai/sdk`.

**Run it.** Start the server with the fake provider enabled, then start the example in a second terminal:

```bash
NODETOOL_ENABLE_FAKE_PROVIDER=1 npm run dev:nodetool -- serve --port 7777
npm run dev --workspace=@nodetool-ai/example-chat-app
```

Open `http://localhost:5173`. The Vite dev server proxies `/trpc`, `/api` and `/ws` to `http://localhost:7777`. Set `PROXY_API_TARGET` if the server runs elsewhere.

**Smoke test.** With the server running, this drives the chat flow without a browser and prints PASS or FAIL for each stage:

```bash
npm run live-test --workspace=@nodetool-ai/example-chat-app
```

## nextjs-vercel

[Source on GitHub](https://github.com/nodetool-ai/nodetool/tree/main/examples/nextjs-vercel)

A Next.js App Router app that runs NodeTool workflows on the server and streams the result to the browser as Server-Sent Events. The route wraps a `NodeRegistry` in `createWorkflowHandler` from `@nodetool-ai/workflow-runner`, so no separate backend runs. The registry imports node groups from per-file subpaths such as `@nodetool-ai/core-nodes/nodes/*`, because the package index pulls in native bindings that cannot deploy serverless. An optional OpenAI Web Search sample reads `OPENAI_API_KEY` from the server environment, so the key never reaches the browser.

**Packages:** `@nodetool-ai/workflow-runner`, `@nodetool-ai/node-sdk`, `@nodetool-ai/runtime`, `@nodetool-ai/protocol`, `@nodetool-ai/core-nodes`, `@nodetool-ai/llm-nodes`.

**Run it:**

```bash
cd examples/nextjs-vercel
npm run dev
```

Open `http://localhost:3002`. For the LLM sample, put `OPENAI_API_KEY=sk-...` in `.env.local` first.

**Deploy to Vercel:**

```bash
npm i -g vercel
vercel
vercel --prod
```

Other scripts in `package.json`: `build`, `start` (port 3002), `lint` and `typecheck`.

## nextjs-cloudflare

[Source on GitHub](https://github.com/nodetool-ai/nodetool/tree/main/examples/nextjs-cloudflare)

The same app as `nextjs-vercel`, deployed to Cloudflare Workers through [OpenNext](https://opennext.js.org/cloudflare). The runner uses `platform: "workers"` and `registry.forPlatform("workers")` keeps only Workers-compatible nodes. `wrangler.jsonc` enables `nodejs_compat`, and OpenNext bundles the `@nodetool-ai/*` packages into the Worker. Nodes that need native modules or `child_process` (image, video, audio, vector, and code runners) are excluded.

**Packages:** the same six as `nextjs-vercel`, plus `@opennextjs/cloudflare` and `wrangler` as dev dependencies.

**Run it:**

```bash
cd examples/nextjs-cloudflare
npm run dev        # Next dev server on http://localhost:3003
npm run preview    # build and run on a local workerd
```

For the LLM sample, put `OPENAI_API_KEY=sk-...` in `.dev.vars` before `npm run preview`.

**Deploy to Cloudflare:**

```bash
npx wrangler login
npm run deploy
```

Set the key on the deployed Worker with `npx wrangler secret put OPENAI_API_KEY`. The `cf-typegen` script regenerates the Cloudflare environment types.

## workflow_runner

[Source on GitHub](https://github.com/nodetool-ai/nodetool/tree/main/examples/workflow_runner)

A static HTML and JavaScript page that connects to the NodeTool server over the WebSocket API, loads a workflow, runs it, and shows progress, outputs and a graph view. It has no `package.json` and uses no `@nodetool-ai` packages. See [Workflow Runner](workflow-runner.md) for the files, protocol and how to run it.
