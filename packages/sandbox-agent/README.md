# @nodetool-ai/sandbox-agent

In-container tool server: a Fastify HTTP service exposing file, shell, browser, and desktop tools to the host sandbox for [NodeTool](https://nodetool.ai).

The server that runs *inside* a NodeTool sandbox container. There is no separate sandbox image: the main nodetool Docker image bundles this server as `backend/sandbox-agent.mjs`, and the sandbox entrypoint (`docker/entrypoint.sh`, installed as `/usr/local/bin/sandbox-agent-entrypoint.sh`) starts the desktop stack and the tool server instead of the main server. The host side (`@nodetool-ai/sandbox`) starts containers with that entrypoint and drives the server over HTTP through `ToolClient`. Routes are validated against the shared Zod schemas in `@nodetool-ai/sandbox/schemas`, so host and container never drift.

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

## Environment

Read inside the container, by the entrypoint and by the tool server. The host
provider (`@nodetool-ai/sandbox`) sets four itself when it creates the container
(`NODETOOL_SESSION_ID`, `NODETOOL_TOOL_PORT`, `NODETOOL_VNC_PORT`,
`NODETOOL_USER_SERVICE_PORTS`); the rest are yours to set, and every one has a
working default.

| Variable | Default | What it does |
| --- | --- | --- |
| `NODETOOL_TOOL_PORT` | `7788` | Port the tool server binds on `0.0.0.0`. The container is the isolation boundary — the published host port is already bound to `127.0.0.1` |
| `NODETOOL_WORKSPACE` | `/workspace` | Root the file tools read and write under |
| `NODETOOL_HEADLESS` | `0` | `1` skips the desktop stack (Xvfb, fluxbox, x11vnc, websockify). The tool server still starts and browser tools launch headless Chromium on demand; `desktop_*` tools have nothing to act on |
| `NODETOOL_VNC_PORT` | `6080` | websockify port serving noVNC |
| `NODETOOL_VNC_DISPLAY` | `:99` | X display the stack creates and the browser/desktop tools render to |
| `NODETOOL_VNC_GEOMETRY` | `1280x900x24` | Xvfb screen geometry |
| `NODETOOL_BROWSER_HEADLESS` | follows `DISPLAY` | `true` or `false` overrides the default, which renders to the X display when one is attached so you can watch over noVNC, and goes headless when none is |
| `NODETOOL_SHELL_VNC` | on | `0` stops each shell session from opening an xterm on the display. The xterm is what makes the agent's keystrokes visible over noVNC; it is never opened without a `DISPLAY` anyway |
| `NODETOOL_SEARCH_PROVIDER` | `tavily` | Backend for the `POST /search/web` route: `tavily`, `brave`, `serper`, or `mock`. An unrecognized value falls back to `tavily`. Each provider reads its own key — `TAVILY_API_KEY`, `BRAVE_API_KEY`, `SERPER_API_KEY` |

Set them through `SandboxOptions.env`, which the provider spreads into the
container's environment after its own four:

```ts
import { DockerSandboxProvider } from "@nodetool-ai/sandbox";

const sandbox = await new DockerSandboxProvider().acquire({
  sessionId: "demo",
  env: {
    // Tools only: no X server, no VNC, headless Chromium
    NODETOOL_HEADLESS: "1",
    NODETOOL_SEARCH_PROVIDER: "brave",
    BRAVE_API_KEY: process.env.BRAVE_API_KEY ?? ""
  }
});
```

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
