# @nodetool-ai/sandbox

Host-side sandbox provisioning: Docker-backed isolated Linux computers for agents, with shell, file, browser, and desktop tools, for [NodeTool](https://nodetool.ai).

Provisions isolated Linux environments an agent can drive. The current backend is Docker; future backends (gVisor, Firecracker, E2B, Daytona) implement the same `SandboxProvider` interface. A typed `ToolClient` talks over HTTP to the in-container tool server (`@nodetool-ai/sandbox-agent`), and a `SessionStore` keeps one sandbox per session. Request/response schemas are shared Zod schemas under the `./schemas` subpath, so host and container never drift.

## Install

```bash
npm install @nodetool-ai/sandbox
```

## Exported symbols

| Symbol | Kind | Description |
| --- | --- | --- |
| `SandboxProvider` | interface | Backend contract — provision and manage sandboxes |
| `Sandbox` | interface | A running sandbox with its `client` and endpoints |
| `SandboxOptions` | interface | Provisioning options (image, memory, etc.) |
| `SandboxEndpoint` | interface | An exposed endpoint (URL + port) |
| `DockerSandbox` | class | A single Docker-backed sandbox |
| `DockerSandboxProvider` | class | Docker implementation of `SandboxProvider` |
| `ToolClient` | class | Typed HTTP client for the in-container tool server |
| `ToolClientOptions` | interface | Client options (endpoint URL, timeouts) |
| `ToolInvocationError` | class | Thrown when a tool call fails |
| `SessionStore` | class | Acquire / release one sandbox per session key |
| `SessionStoreOptions` | interface | Store options (provider, idle timeout) |
| `DEFAULT_SANDBOX_IMAGE` / `TOOL_SERVER_PORT` / `VNC_WS_PORT` | const | Image tag and port constants |
| `parseMemLimit` | function | Parse a memory-limit string to bytes |
| `./schemas` (subpath) | module | Shared Zod input/output schemas for every sandbox tool |

## Usage

```ts
import { DockerSandboxProvider, SessionStore } from "@nodetool-ai/sandbox";

const provider = new DockerSandboxProvider();
const store = new SessionStore({ provider });

const sandbox = await store.acquire("chat-123");

const { id } = await sandbox.client.shellExec({ command: "ls -la /workspace" });
const view = await sandbox.client.shellView({ id });
console.log(view.output);

await sandbox.release();
```

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
