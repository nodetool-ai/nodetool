# Replace ClaudeQuerySession with Claude Agent SDK

## Overview

Replace the `ClaudeQuerySession` class in `electron/src/agent.ts` — which spawns the `claude` CLI as a child process and communicates via stdin/stdout JSON streams — with the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) used as a library.

## Motivation

- **Reliability/simplicity:** The CLI pipe approach is fragile (process management, stream parsing, corrective messages for unknown tools, suppressing misleading text).
- **SDK features:** Native streaming, programmatic session control, proper tool definitions, interruption via API.
- **Simplify CLI dependency:** The SDK bundles its own CLI binary, so users no longer need to separately install the `claude` CLI. The SDK still spawns it internally, but manages the process lifecycle itself.

## Architecture

### Current State

```
ClaudeQuerySession
  ├── Spawns `claude` CLI with --input-format stream-json --output-format stream-json
  ├── Parses stdout JSON lines for text, tool_use, result messages
  ├── Bridges ui_* tools by intercepting tool_use, executing via IPC, writing tool_result to stdin
  └── ~520 lines of process management, corrective messages, tool state tracking
```

### Target State

```
ClaudeAgentSession
  ├── Calls query() from @anthropic-ai/claude-agent-sdk
  ├── Registers ui_* tools as MCP server via createSdkMcpServer() + tool()
  ├── Iterates async generator, converts SDK messages to AgentMessage format
  └── ~80 lines, no process management, no hacks
```

### Component Diagram

```
AgentQuerySession (interface)
  ├── ClaudeAgentSession  (NEW — uses Agent SDK query())
  └── CodexQuerySession   (unchanged — uses Codex app-server RPC)
```

### Feature Flag

Environment variable `NODETOOL_AGENT_USE_CLI=1` falls back to the old `ClaudeQuerySession` (renamed to `ClaudeCliSession`) during the migration period. Default is the new SDK path. This allows rollback without code changes.

### Frontend Tool Bridging

Frontend tools (ui_search_nodes, ui_add_node, etc.) are registered as an in-process MCP server. When Claude calls a tool, the SDK routes it through the MCP server, which executes it via IPC to the renderer.

```
Claude Agent SDK
  ├── Built-in tools (disallowed: Read, Write, Bash, etc.)
  └── MCP Server: "nodetool-ui"
        ├── ui_search_nodes  ──→ IPC ──→ Renderer
        ├── ui_add_node      ──→ IPC ──→ Renderer
        └── ... (all non-hidden ui_* tools)
```

Hidden tools (e.g., `ui_graph` with `hidden: true`) are excluded from the MCP server registration. They remain callable via IPC for backwards compatibility but are not exposed to the LLM.

## Shared Tool Schemas

Tool parameter schemas are defined once as `ZodRawShape` objects in `@nodetool/protocol` and imported by both the Electron main process (for MCP server registration) and the renderer (for FrontendToolRegistry validation).

```
packages/protocol/src/toolSchemas.ts   ← single source of truth (ZodRawShape)
  ├── electron/src/agent.ts            ← imports for MCP server tool()
  └── web/src/lib/tools/builtin/*.ts   ← wraps with z.object() + .refine() etc.
```

This eliminates the lossy Zod → JSON Schema → Zod round-trip that would otherwise occur over IPC.

### Schema Structure

The SDK's `tool()` function takes a `ZodRawShape` — a plain object of Zod types, not a `z.object()` instance. The shared schemas export this flat shape format:

```typescript
// packages/protocol/src/toolSchemas.ts
import { z } from "zod";

export const uiSearchNodesParams = {
  query: z.string(),
  input_type: z.string().optional(),
  output_type: z.string().optional(),
  include_properties: z.boolean().optional(),
  include_outputs: z.boolean().optional(),
  limit: z.number().min(1).max(100).optional(),
};

export const uiAddNodeParams = {
  id: z.string(),
  type: z.string().optional(),
  node_type: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }),
  properties: z.record(z.string(), z.any()).optional(),
  workflow_id: z.string().optional(),
};

// Registry of all non-hidden tool schemas for MCP server registration
export const uiToolSchemas = {
  ui_search_nodes: {
    description: "Search available node types by query/type filters.",
    parameters: uiSearchNodesParams,
  },
  ui_add_node: {
    description: "Add a node to the current workflow graph.",
    parameters: uiAddNodeParams,
  },
  // ... all non-hidden ui_* tools
} as const;
```

### Frontend Usage

Frontend tools import the shared shape and can extend it with refinements, preprocessing, or additional validation that the SDK doesn't need:

```typescript
// web/src/lib/tools/builtin/addNode.ts
import { uiAddNodeParams } from "@nodetool/protocol/toolSchemas";

const addNodeSchema = z.object({
  ...uiAddNodeParams,
  node: nodeInputSchema.optional(),  // frontend-only convenience field
}).refine(
  (data) => data.node || (data.id && data.position),
  { message: "Either 'node' or both 'id' and 'position' required" }
);

FrontendToolRegistry.register({
  name: "ui_add_node",
  parameters: addNodeSchema,
  execute: async (args) => { ... }
});
```

### Zod Version

The SDK imports from `zod/v4`. Pin `zod` to `^4.x` in `@nodetool/protocol` to ensure compatibility. The project already uses Zod 4.x.

## ClaudeAgentSession Implementation

```typescript
class ClaudeAgentSession implements AgentQuerySession {
  private activeQuery: Query | null = null;
  private resolvedSessionId: string | null;
  private readonly model: string;
  private readonly workspacePath: string;
  private readonly systemPrompt: string;
  private inFlight = false;

  async send(message, webContents, sessionId, manifest, onMessage?) {
    if (this.closed) throw new Error("Cannot send to a closed session");
    if (this.inFlight) throw new Error("A request is already in progress");

    this.inFlight = true;
    try {
      const mcpServer = webContents
        ? buildMcpServer(webContents, sessionId)
        : undefined;

      const allowedTools = mcpServer
        ? Object.keys(uiToolSchemas).map(n => `mcp__nodetool-ui__${n}`)
        : [];

      const queryHandle = query({
        prompt: message,
        options: {
          model: this.model,
          cwd: this.workspacePath,
          systemPrompt: {
            type: "preset",
            preset: "claude_code",
            append: this.systemPrompt,
          },
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          disallowedTools: DISALLOWED_TOOLS,
          allowedTools,
          maxTurns: 50,
          ...(mcpServer && { mcpServers: { "nodetool-ui": mcpServer } }),
          ...(this.resolvedSessionId && { resume: this.resolvedSessionId }),
        },
      });
      this.activeQuery = queryHandle;

      const outputMessages: AgentMessage[] = [];
      for await (const msg of queryHandle) {
        // Capture session ID early, before conversion
        if (msg.type === "system" && msg.subtype === "init") {
          this.resolvedSessionId = msg.session_id;
        }

        const agentMsg = convertSdkMessage(msg, this.resolvedSessionId ?? sessionId);
        if (!agentMsg) continue;

        outputMessages.push(agentMsg);
        onMessage?.(agentMsg);
      }
      return outputMessages;
    } catch (error) {
      const errorMsg: AgentMessage = {
        type: "result",
        uuid: randomUUID(),
        session_id: this.resolvedSessionId ?? sessionId,
        subtype: "error",
        is_error: true,
        errors: [error instanceof Error ? error.message : String(error)],
      };
      onMessage?.(errorMsg);
      return [errorMsg];
    } finally {
      this.activeQuery = null;
      this.inFlight = false;
    }
  }

  async interrupt(): Promise<void> {
    this.activeQuery?.interrupt();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.activeQuery?.close();
    this.activeQuery = null;
  }
}
```

### System Prompt Strategy

The current CLI approach uses `--append-system-prompt`, which appends to Claude Code's built-in system prompt. The SDK equivalent is:

```typescript
systemPrompt: {
  type: "preset",
  preset: "claude_code",
  append: this.systemPrompt,  // HELP_SYSTEM_PROMPT or FAST_WORKFLOW_SYSTEM_PROMPT
}
```

This preserves the same behavior — Claude Code's built-in capabilities plus the workflow-specific instructions.

### SDK Message → AgentMessage Conversion

| SDK Message Type | AgentMessage |
|---|---|
| `assistant` with text content | `type: "assistant"`, `content: [{type: "text", text}]` |
| `assistant` with tool_use blocks | `type: "assistant"`, `tool_calls: [...]` |
| `stream_event` (partial text) | `type: "assistant"`, streamed to renderer for real-time display |
| `result` (success) | `type: "result"`, `subtype: "success"` with final text |
| `result` (error) | `type: "result"`, `is_error: true`, `errors: [...]` |
| `system` (init) | Capture `session_id`, don't forward to renderer |
| Other (rate_limit, status, etc.) | Ignored |

### MCP Server Builder

```typescript
function buildMcpServer(webContents: WebContents, sessionId: string) {
  const tools = Object.entries(uiToolSchemas).map(([name, schema]) =>
    tool(name, schema.description, schema.parameters, async (args) => {
      const result = await executeFrontendTool(
        webContents, sessionId, randomUUID(), name, args
      );
      const text = typeof result === "string"
        ? result : JSON.stringify(result ?? null);
      return { content: [{ type: "text" as const, text }] };
    })
  );
  return createSdkMcpServer({ name: "nodetool-ui", version: "1.0.0", tools });
}
```

### MCP Tool Naming Convention

The SDK prefixes MCP tools as `mcp__{serverName}__{toolName}` (double underscore separators). For the "nodetool-ui" server, tools become `mcp__nodetool-ui__ui_search_nodes`, etc. These names go in the `allowedTools` list.

### Search Result Caching

The current `uiSearchCache` is removed. If repeated identical searches become a latency issue, caching can be added inside the MCP tool handler. For now, keep it simple — the IPC round-trip is fast and caching adds complexity.

## What Gets Removed

From `ClaudeQuerySession` (~520 lines):
- `getClaudeCodeExecutablePath()` — CLI lookup
- `createClaudeProcess()` — process spawning with args
- All stdout/stdin JSON stream parsing
- Corrective message injection for unknown tools
- Tool state tracking maps (`toolUseStateById`, `toolNameByUseId`, `pendingFrontendToolCalls`)
- Search result caching (`uiSearchCache`)
- "Suppress misleading text" regex hack
- Process signal handling (SIGINT/SIGTERM)

Note: `ClaudeQuerySession` is not deleted but renamed to `ClaudeCliSession` and kept behind the `NODETOOL_AGENT_USE_CLI=1` feature flag during migration.

## What Stays Unchanged

- `AgentQuerySession` interface
- `CodexQuerySession` + `codexAgent.ts`
- All exported functions (`createAgentSession`, `sendAgentMessageStreaming`, etc.)
- IPC channel definitions, `AgentMessage` type in `types.d.ts`
- Frontend tool IPC bridge (`frontendToolsIpc.ts`) — still needed for CodexQuerySession
- `FrontendToolRegistry` class and logic
- System prompts (`HELP_SYSTEM_PROMPT`, `CODEX_SYSTEM_PROMPT`, `FAST_WORKFLOW_SYSTEM_PROMPT`)

## File Changes

### Create
- `packages/protocol/src/toolSchemas.ts` — shared Zod tool schemas (ZodRawShape format)

### Modify
- `electron/package.json` — upgrade `@anthropic-ai/claude-agent-sdk` to latest, add `@nodetool/protocol`, `zod`
- `packages/protocol/package.json` — add `zod` ^4.x dependency
- `packages/protocol/src/index.ts` — re-export tool schemas
- `electron/src/agent.ts` — add `ClaudeAgentSession`, rename `ClaudeQuerySession` to `ClaudeCliSession`, add feature flag toggle in `createAgentSession`
- `web/src/lib/tools/builtin/*.ts` (12 non-hidden tool files) — import schemas from `@nodetool/protocol`

### Unchanged
- `electron/src/codexAgent.ts`
- `electron/src/types.d.ts`
- `web/src/lib/tools/frontendTools.ts`
- `web/src/lib/tools/frontendToolsIpc.ts`

## Dependencies

- `@anthropic-ai/claude-agent-sdk`: `^0.2.37` → latest (verify version exists before install)
- `zod`: `^4.x` — add to `@nodetool/protocol` and `electron`
- `@nodetool/protocol`: add to `electron/package.json`

## Error Handling

- **SDK initialization failures** (missing API key, invalid model): Caught by try/catch in `send()`, returned as `AgentMessage` with `is_error: true`.
- **Network timeouts mid-conversation**: The SDK's async iterator will throw, caught by the same try/catch.
- **MCP tool execution failures**: Returned as MCP error responses so Claude can recover gracefully.
- **IPC timeout**: `executeFrontendTool` already has a 15-second timeout via `FRONTEND_TOOLS_RESPONSE_TIMEOUT_MS`. All current tools complete well within this window.
