# @nodetool-ai/workflow-runner

Portable workflow runner — turns a graph + NodeRegistry into a `(Request) => Response` handler for Vercel, Cloudflare Workers, or any Web-standard runtime, for [NodeTool](https://nodetool.ai).

Wraps the kernel `WorkflowRunner` with a transport- and runtime-agnostic surface: an async-generator streaming API and a Server-Sent-Events HTTP handler built on Web-standard `Request`/`Response`/`ReadableStream`. Runs on Vercel (Node + Edge), Cloudflare Workers, Bun, and Deno. A `./browser` entry runs graphs entirely in-browser.

## Install

```bash
npm install @nodetool-ai/workflow-runner
```

## Exported symbols

| Symbol | Kind | Description |
| --- | --- | --- |
| `runWorkflow` | function | Run a graph against a `NodeRegistry`, yielding live `ProcessingMessage`s |
| `RunWorkflowOptions` | interface | Options: graph, registry, params, context, storage, secrets, signal |
| `GraphData` | type | `{ nodes, edges }` graph shape |
| `createWorkflowHandler` | function | Build a `(Request) => Response` SSE handler from a registry |
| `CreateWorkflowHandlerOptions` | interface | Handler options: registry, `createContext`, `beforeRun`, platform |
| `WorkflowRequestBody` | interface | Parsed request body (`graph`, `params`, `workflow_id`, `job_id`) |
| `envSecretResolver` | function | Secret resolver backed by environment variables |
| `createBrowserRegistry` | function | Build a `NodeRegistry` of browser-runnable nodes (`./browser`) |
| `runBrowserWorkflow` | function | Run a graph in the browser (`./browser`) |
| `graphRunsInRegistry` | function | Check whether a graph's nodes are all present in a registry (`./browser`) |

## Usage

```ts
import { createWorkflowHandler, envSecretResolver } from "@nodetool-ai/workflow-runner";
import { NodeRegistry } from "@nodetool-ai/node-sdk";

const registry = new NodeRegistry();
// ...register the nodes available in this deployment

// A Web-standard fetch handler — export it from a Vercel / Cloudflare route
export const POST = createWorkflowHandler({
  registry,
  createContext: () => ({ secretResolver: envSecretResolver }) as never
});
```

Or drive the run directly and stream messages:

```ts
import { runWorkflow } from "@nodetool-ai/workflow-runner";

for await (const message of runWorkflow({ graph, registry, params })) {
  console.log(message.type, message);
}
```

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
