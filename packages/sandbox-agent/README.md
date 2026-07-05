# @nodetool-ai/sandbox-agent

In-container tool server: a Fastify HTTP service exposing file, shell, browser, and desktop tools to the host sandbox for [NodeTool](https://nodetool.ai).

The server that runs *inside* a NodeTool sandbox container. It is baked into the sandbox Docker image and started by the container entrypoint; the host side (`@nodetool-ai/sandbox`) drives it over HTTP through `ToolClient`. Routes are validated against the shared Zod schemas in `@nodetool-ai/sandbox/schemas`, so host and container never drift.

This package is infrastructure — you normally interact with it through `@nodetool-ai/sandbox`, not directly.

## Install

```bash
npm install @nodetool-ai/sandbox-agent
```

## Exported symbols

| Symbol | Kind | Description |
| --- | --- | --- |
| `buildServer` | function | Build the Fastify instance exposing the file / shell / browser / desktop tool routes |
| `BuildServerOptions` | interface | Server options |
| `SANDBOX_AGENT_VERSION` | const | Version string reported by the tool server |

## Usage

```ts
import { buildServer } from "@nodetool-ai/sandbox-agent";

// Runs inside the sandbox container (via the image entrypoint)
const server = buildServer();
await server.listen({ host: "0.0.0.0", port: 8000 });
```

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
