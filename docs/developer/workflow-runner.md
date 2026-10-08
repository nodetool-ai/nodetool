---
layout: page
title: "Portable Workflow Runner"
permalink: /developer/workflow-runner
description: "Run a NodeTool workflow graph from a Web-standard request handler on Node, Bun, Deno, Vercel, Cloudflare Workers, or in the browser."
---

`@nodetool-ai/workflow-runner` runs a workflow graph without the NodeTool server. It wraps the kernel `WorkflowRunner` in two things: an async generator that yields live messages, and a `(Request) => Response` handler that streams those messages as Server-Sent Events. Both use only Web-standard APIs, so the same code runs on serverless and edge platforms. A separate `./browser` entry runs graphs inside a web page.

The runner has no file system, subprocess, or transport assumptions. You supply the graph, a node registry, and optionally a processing context. Storage, secrets, and the cache come in through the context.

## Install

```bash
npm install @nodetool-ai/workflow-runner
```

The package needs Node 22 or newer when it runs on Node. It exports two entries:

| Entry | Use |
|-------|-----|
| `@nodetool-ai/workflow-runner` | `runWorkflow`, `createWorkflowHandler`, `envSecretResolver`, and the browser helpers |
| `@nodetool-ai/workflow-runner/browser` | The browser helpers, built for page bundles |

## Exported symbols

| Symbol | What it does |
|--------|--------------|
| `runWorkflow(options)` | Runs a graph and yields each `ProcessingMessage` live. The generator's return value is the final `RunResult` |
| `createWorkflowHandler(options)` | Returns a `(Request) => Promise<Response>` handler that streams a run as Server-Sent Events |
| `envSecretResolver(env)` | Turns an environment-variable object into a secret resolver for a context |
| `createBrowserRegistry(nodeClasses)` | Builds a registry that keeps only classes that support the `browser` platform |
| `runBrowserWorkflow(options)` | Like `runWorkflow`, checked against the `browser` platform, with every message stamped with `job_id` and `workflow_id` |
| `graphRunsInRegistry(graph, registry)` | True when every node in the graph is in the registry, so the graph can run client-side |

## Build a registry

A registry decides which nodes the deployment can run. Register the node classes your graphs use, then optionally filter for a platform:

```ts
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import { CONSTANT_NODES, CONTROL_NODES } from "@nodetool-ai/core-nodes";

const registry = new NodeRegistry();
for (const nodeClass of [...CONSTANT_NODES, ...CONTROL_NODES]) {
  registry.register(nodeClass);
}
const edgeRegistry = registry.forPlatform("edge");
```

A graph is a list of nodes and edges. Each node has an `id`, a `type`, and `properties`. A `name` on a node names its entry in the result outputs.

## Run a workflow in Node

Call `runWorkflow` and read the messages:

```ts
import { runWorkflow } from "@nodetool-ai/workflow-runner";

const graph = {
  nodes: [
    {
      id: "s",
      type: "nodetool.constant.String",
      name: "text",
      properties: { value: "hello" }
    }
  ],
  edges: []
};

const run = runWorkflow({ graph, registry });
let next = await run.next();
while (!next.done) {
  console.log(next.value.type);
  next = await run.next();
}
console.log(next.value.status, next.value.outputs);
```

`for await` also works, but it discards the final `RunResult`. Pass `params` to set the values of input nodes, `signal` to cancel the run, and `workflowId` or `jobId` to label it.

`runWorkflow` builds a minimal context unless you pass one. To supply your own pieces without building a context, pass `storage`, `workspaceStorage`, `cache`, `environment`, `secretResolver`, or `sandboxModuleCatalog`. These are ignored when you pass a full `context`.

## Serve a workflow over HTTP

`createWorkflowHandler` takes a registry and returns a handler:

```ts
import { createWorkflowHandler } from "@nodetool-ai/workflow-runner";

export const handler = createWorkflowHandler({ registry, platform: "edge" });
```

The handler accepts a `POST` with a JSON body:

```json
{
  "graph": { "nodes": [], "edges": [] },
  "params": {},
  "workflow_id": "optional",
  "job_id": "optional"
}
```

The response is `text/event-stream`. Each message is a `data:` event, and the run ends with an `event: result` event that carries the `RunResult`. Request problems return JSON with a 4xx status: `405` for a method other than POST, `400` for invalid JSON, a missing `graph`, or a failing `beforeRun` hook. After the stream starts, a failure arrives as an `event: error` event with the message "Workflow execution failed" and the HTTP status stays 200.

| Option | What it does |
|--------|--------------|
| `registry` | The nodes available in this deployment |
| `createContext(req)` | Builds a `ProcessingContext` per request, for example with secrets and storage. Return nothing for a minimal context |
| `beforeRun(body, req)` | Authorizes or rewrites the parsed body. Throw to reject with a 400 |
| `platform` | Rejects graphs that contain nodes that do not support this platform, before any node starts |

Secrets come from the context. This builds one from environment variables:

```ts
import { ProcessingContext } from "@nodetool-ai/runtime/context";
import { createWorkflowHandler, envSecretResolver } from "@nodetool-ai/workflow-runner";

const handler = createWorkflowHandler({
  registry,
  createContext: () =>
    new ProcessingContext({
      jobId: crypto.randomUUID(),
      secretResolver: envSecretResolver(process.env)
    })
});
```

`createContext` must return a `ProcessingContext` instance. Any other value is ignored and the run uses a minimal context.

## Run on each platform

The README for the package lists Vercel (Node and Edge), Cloudflare Workers, Bun, and Deno. The handler is a plain fetch handler, so each platform wraps it in its own entry point. The platform wrappers below are standard for each runtime and are not shipped by the package.

| Platform | Entry point |
|----------|-------------|
| Vercel | `export const POST = handler;` in a route file |
| Cloudflare Workers | `export default { fetch: handler };` |
| Bun | `Bun.serve({ fetch: handler });` |
| Deno | `Deno.serve(handler);` |
| Node | Call `runWorkflow` directly, or adapt the handler with a Web-standard server of your choice |

On Cloudflare Workers, secrets arrive in the `env` argument of `fetch`, which the handler does not receive. Build the handler inside `fetch`, so `createContext` can use that `env`:

```ts
export default {
  fetch(req: Request, env: Record<string, string>) {
    return createWorkflowHandler({
      registry,
      platform: "workers",
      createContext: () =>
        new ProcessingContext({
          jobId: crypto.randomUUID(),
          secretResolver: envSecretResolver(env)
        })
    })(req);
  }
};
```

## Run in the browser

`runBrowserWorkflow` runs a graph of browser-safe nodes in a web page, with no server round trip. It checks the graph against the `browser` platform first, so a server-only node fails before any node starts. Every message carries `job_id` and `workflow_id`, so a client can route it through the same code as messages from the server.

```ts
import {
  createBrowserRegistry,
  graphRunsInRegistry,
  runBrowserWorkflow
} from "@nodetool-ai/workflow-runner/browser";
import { ALL_BROWSER_NODES } from "@nodetool-ai/base-nodes/platforms/browser";

const registry = createBrowserRegistry(ALL_BROWSER_NODES);

if (graphRunsInRegistry(graph, registry)) {
  const run = runBrowserWorkflow({ graph, registry, workflowId, jobId });
  let next = await run.next();
  while (!next.done) {
    deliver(next.value);
    next = await run.next();
  }
  const result = next.value;
}
```

When `graphRunsInRegistry` returns false, send the graph to a server instead. A Code node in the browser needs a `sandboxModuleCatalog`, because a browser has no process-wide catalog to resolve imports from.

## Which nodes run where

Each node class lists the platforms it supports. A node that lists none supports only `node`. Platforms are:

| Platform | Runtime |
|----------|---------|
| `node` | Full Node.js: native modules, subprocesses, file system. Electron, RunPod, Vercel Node functions, plain servers |
| `workers` | Cloudflare Workers and Durable Objects, with the Node compatibility layer. No native modules or subprocesses |
| `edge` | Web APIs only. Vercel Edge Runtime and Deno Deploy |
| `browser` | A browser page with WebGPU, the DOM, canvas, and IndexedDB |

In the repository, node groups are tagged like this:

- **All four platforms.** The constant, input, control, variable, compare, subgraph, app, workflow, and vector nodes in the core node package, the fake media nodes, and the Code node.
- **Node, Workers, and Edge.** Server-oriented groups such as the LLM provider nodes, document, text extras, data, sketch, storyboard, script, timeline, entity, and messaging nodes.
- **Node only.** Any node that declares nothing, and the nodes that say so. An image `Scale` node, for example, reports "not supported on platform 'browser' (supports: node)".

The curated browser set is `ALL_BROWSER_NODES`, exported from `@nodetool-ai/base-nodes/platforms/browser`. It holds the app, compare, constant, control, input, subgraph, vector, and workflow nodes, the placeholder and fake media nodes, and the Code node. Check a node's class for its exact `platforms` value before you rely on it.

## Limitations

- Only the registry you build is available. The package does not bundle any nodes, so a graph that names an unregistered node type is rejected.
- Nodes that need native modules, subprocesses, or the file system run only on `node`. The Blender nodes are an example. See [Blender Nodes](../blender.md).
- Browser runs cover only browser-tagged nodes. Graphs that use other nodes must run on a server.
- The handler sends no authentication and does not limit request size or run time. Add checks in `beforeRun` and in your platform.
- The request body is JSON, and the response is Server-Sent Events as text. It does not use the MsgPack WebSocket protocol of the NodeTool server.
- There is no persistence. Jobs, assets, and run history are not stored unless you pass a context with storage.
- Request cancellation passes through `req.signal`. A client that disconnects stops the run.

## See also

- [TypeScript DSL Guide](ts-dsl-guide.md) for building graphs in code
- [Custom Nodes Guide](custom-nodes-guide.md) for writing nodes and the `platforms` setting
- [Architecture](../architecture.md) for the kernel that does the execution
