# @nodetool-ai/sandbox-tools

Agent tool adapter: exposes a sandbox's `ToolClient` as a set of `@nodetool-ai/agents` Tool instances for [NodeTool](https://nodetool.ai).

Bridges `@nodetool-ai/sandbox` and `@nodetool-ai/agents`: `createSandboxTools` turns a sandbox `ToolClient` into ready-to-use agent tools — file, shell, browser, desktop, screen, mouse, keyboard, and web-search operations — each backed by the shared Zod schemas so the agent sees precise input contracts.

## Install

```bash
npm install @nodetool-ai/sandbox-tools
```

## Exported symbols

| Symbol | Kind | Description |
| --- | --- | --- |
| `createSandboxTools` | function | Build the full set of agent `Tool` instances from a `ToolClient` |
| `CreateSandboxToolsOptions` | interface | Options controlling which tools are created |
| `listSandboxToolNames` | function | List the names of every sandbox tool |
| `SandboxTool` | class | One agent tool that invokes a `ToolClient` method |
| `SandboxToolDefinition` | type | Definition of a sandbox tool (name, description, schema, method) |
| `toJsonSchema` | function | Convert a tool's Zod input schema to JSON Schema |

## Usage

```ts
import { DockerSandboxProvider, SessionStore } from "@nodetool-ai/sandbox";
import { createSandboxTools } from "@nodetool-ai/sandbox-tools";
import { Agent } from "@nodetool-ai/agents";

const provider = new DockerSandboxProvider();
const store = new SessionStore({ provider });
const sandbox = await store.acquire("chat-123");

const agent = new Agent({
  name: "researcher",
  objective: "Investigate the codebase in /workspace",
  provider,
  model,
  tools: createSandboxTools(sandbox.client)
});

// ...run the agent...
await sandbox.release();
```

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
