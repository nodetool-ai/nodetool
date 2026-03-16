# Claude Agent SDK Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `ClaudeQuerySession` (CLI pipe approach) with the Claude Agent SDK `query()` API, using shared Zod tool schemas and an in-process MCP server for frontend tool bridging.

**Architecture:** New `ClaudeAgentSession` class uses `query()` async iterator from `@anthropic-ai/claude-agent-sdk`. Frontend `ui_*` tools are registered as MCP tools via `createSdkMcpServer()`. Zod schemas shared via `@nodetool/protocol`. Old `ClaudeQuerySession` renamed to `ClaudeCliSession` behind a feature flag.

**Tech Stack:** `@anthropic-ai/claude-agent-sdk` (latest), `zod` ^4.x, `@nodetool/protocol`

**Spec:** `docs/superpowers/specs/2026-03-17-claude-agent-sdk-migration-design.md`

---

## File Structure

### New Files
- `packages/protocol/src/toolSchemas.ts` — Shared Zod tool schemas (ZodRawShape format) for all non-hidden `ui_*` tools

### Modified Files
- `packages/protocol/package.json` — Add `zod` ^4.x dependency
- `packages/protocol/src/index.ts` — Re-export tool schemas
- `electron/package.json` — Upgrade SDK, add `@nodetool/protocol`, `zod`
- `electron/src/agent.ts` — Add `ClaudeAgentSession`, rename old class, add feature flag
- `web/src/lib/tools/builtin/searchNodes.ts` — Import shared schema
- `web/src/lib/tools/builtin/addNode.ts` — Import shared schema
- `web/src/lib/tools/builtin/connectNodes.ts` — Import shared schema
- `web/src/lib/tools/builtin/getGraph.ts` — Import shared schema
- `web/src/lib/tools/builtin/updateNodeData.ts` — Import shared schema
- `web/src/lib/tools/builtin/deleteNode.ts` — Import shared schema
- `web/src/lib/tools/builtin/deleteEdge.ts` — Import shared schema
- `web/src/lib/tools/builtin/moveNode.ts` — Import shared schema
- `web/src/lib/tools/builtin/setNodeTitle.ts` — Import shared schema
- `web/src/lib/tools/builtin/setNodeSyncMode.ts` — Import shared schema
- `web/src/lib/tools/builtin/uiActions.ts` — Import shared schemas
- `web/src/lib/tools/builtin/workflow.ts` — Move `optionalWorkflowIdSchema` to protocol, re-export

### Intentionally Unchanged
- `web/src/lib/tools/builtin/graph.ts` — Hidden tool (`ui_graph`). Not in MCP registry. Keeps its own schema. Still imports `optionalWorkflowIdSchemaCompact` from `workflow.ts` which is unchanged.

---

## Chunk 1: Shared Tool Schemas

### Task 1: Add zod to @nodetool/protocol

**Files:**
- Modify: `packages/protocol/package.json`

- [ ] **Step 1: Add zod dependency**

Add `zod` to `dependencies` in `packages/protocol/package.json`:

```json
{
  "dependencies": {
    "zod": "^4.0.0"
  }
}
```

- [ ] **Step 2: Install from workspace root**

This is an npm workspaces monorepo — install from the root to update the shared lockfile:

Run: `cd /Users/mg/workspace/nodetool && npm install`

- [ ] **Step 3: Commit**

```bash
git add packages/protocol/package.json package-lock.json
git commit -m "chore: add zod dependency to @nodetool/protocol"
```

---

### Task 2: Create shared tool schemas

**Files:**
- Create: `packages/protocol/src/toolSchemas.ts`

All schemas are exported as `ZodRawShape` (plain objects of Zod types), which the Agent SDK's `tool()` function requires. Frontend tools wrap these with `z.object()` and add refinements as needed.

- [ ] **Step 1: Create toolSchemas.ts**

```typescript
// packages/protocol/src/toolSchemas.ts
//
// Shared Zod tool schemas for frontend UI tools.
// Exported as ZodRawShape (plain objects of Zod types) for:
//   - Agent SDK MCP server registration (electron/src/agent.ts)
//   - Frontend tool validation (web/src/lib/tools/builtin/*.ts wraps with z.object())
//
// If you update a schema here, update the corresponding builtin tool file too.

import { z } from "zod";

// --- Shared sub-schemas ---

export const xyPositionSchema = z.object({ x: z.number(), y: z.number() });
export const positionInputSchema = z.union([xyPositionSchema, z.string()]);
export const nodePropertySchema = z.record(z.string(), z.any());
export const optionalWorkflowIdSchema = z
  .string()
  .nullable()
  .optional()
  .describe("Optional workflow id; when omitted/null, the current workflow is used.");

// --- Tool parameter shapes (ZodRawShape for SDK tool()) ---

export const uiSearchNodesParams = {
  query: z.string(),
  input_type: z.string().optional(),
  output_type: z.string().optional(),
  strict_match: z.boolean().optional(),
  include_properties: z.boolean().optional(),
  include_outputs: z.boolean().optional(),
  limit: z.number().min(1).max(100).optional(),
};

export const uiAddNodeParams = {
  id: z.string().optional(),
  type: z.string().optional(),
  node_type: z.string().optional(),
  position: positionInputSchema.optional(),
  properties: nodePropertySchema.optional(),
  workflow_id: optionalWorkflowIdSchema,
};

export const uiConnectNodesParams = {
  source_id: z.string(),
  source_handle: z.string(),
  target_id: z.string(),
  target_handle: z.string(),
  workflow_id: optionalWorkflowIdSchema,
};

export const uiGetGraphParams = {
  workflow_id: optionalWorkflowIdSchema,
};

export const uiUpdateNodeDataParams = {
  node_id: z.string(),
  data: z.record(z.string(), z.any()),
  workflow_id: optionalWorkflowIdSchema,
};

export const uiDeleteNodeParams = {
  node_id: z.string(),
  workflow_id: optionalWorkflowIdSchema,
};

export const uiDeleteEdgeParams = {
  edge_id: z.string(),
  workflow_id: optionalWorkflowIdSchema,
};

export const uiMoveNodeParams = {
  node_id: z.string(),
  position: xyPositionSchema,
  workflow_id: optionalWorkflowIdSchema,
};

export const uiSetNodeTitleParams = {
  node_id: z.string(),
  title: z.string(),
  workflow_id: optionalWorkflowIdSchema,
};

export const uiSetNodeSyncModeParams = {
  node_id: z.string(),
  mode: z.enum(["on_any", "zip_all"]),
  workflow_id: optionalWorkflowIdSchema,
};

export const uiOpenWorkflowParams = {
  workflow_id: z.string().optional().describe("Workflow id to target."),
  id: z.string().optional().describe("Alias for workflow_id."),
};

export const uiRunWorkflowParams = {
  workflow_id: z.string().optional().describe("Workflow id to target."),
  id: z.string().optional().describe("Alias for workflow_id."),
  params: z.record(z.string(), z.unknown()).optional().describe("Optional workflow run parameters."),
};

export const uiSwitchTabParams = {
  tab_index: z.number().int().min(0).describe("Zero-based tab index (0 is the first tab)."),
};

export const uiCopyParams = {
  text: z.string().describe("The text to copy to clipboard."),
};

export const uiPasteParams = {};

// --- Registry for MCP server registration ---
// Only non-hidden tools. ui_graph (hidden) is excluded.

export interface UiToolSchema {
  description: string;
  parameters: Record<string, z.ZodTypeAny>;
}

export const uiToolSchemas: Record<string, UiToolSchema> = {
  ui_search_nodes: {
    description: "Search available node types from metadata store by query/type filters.",
    parameters: uiSearchNodesParams,
  },
  ui_add_node: {
    description: "Add a node to the current workflow graph.",
    parameters: uiAddNodeParams,
  },
  ui_connect_nodes: {
    description: "Connect two nodes via their handles.",
    parameters: uiConnectNodesParams,
  },
  ui_get_graph: {
    description: "Get the current workflow graph (nodes and edges).",
    parameters: uiGetGraphParams,
  },
  ui_update_node_data: {
    description: "Update an existing node's data/properties.",
    parameters: uiUpdateNodeDataParams,
  },
  ui_delete_node: {
    description: "Delete a node from the workflow graph.",
    parameters: uiDeleteNodeParams,
  },
  ui_delete_edge: {
    description: "Delete an edge from the workflow graph.",
    parameters: uiDeleteEdgeParams,
  },
  ui_move_node: {
    description: "Move a node to a new position.",
    parameters: uiMoveNodeParams,
  },
  ui_set_node_title: {
    description: "Set a node's display title.",
    parameters: uiSetNodeTitleParams,
  },
  ui_set_node_sync_mode: {
    description: "Set a node's sync mode (on_any or zip_all).",
    parameters: uiSetNodeSyncModeParams,
  },
  ui_open_workflow: {
    description: "Open a workflow by ID in a new tab.",
    parameters: uiOpenWorkflowParams,
  },
  ui_run_workflow: {
    description: "Run a workflow, optionally passing parameters.",
    parameters: uiRunWorkflowParams,
  },
  ui_switch_tab: {
    description: "Switch to a workflow tab by index.",
    parameters: uiSwitchTabParams,
  },
  ui_copy: {
    description: "Copy text to the clipboard.",
    parameters: uiCopyParams,
  },
  ui_paste: {
    description: "Paste text from the clipboard.",
    parameters: uiPasteParams,
  },
};
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/mg/workspace/nodetool/packages/protocol && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/protocol/src/toolSchemas.ts
git commit -m "feat: add shared Zod tool schemas for UI tools"
```

---

### Task 3: Export tool schemas from protocol index

**Files:**
- Modify: `packages/protocol/src/index.ts`

- [ ] **Step 1: Add re-export**

Add this line at the end of `packages/protocol/src/index.ts`:

```typescript
export * from "./toolSchemas.js";
```

- [ ] **Step 2: Build protocol package**

Run: `cd /Users/mg/workspace/nodetool/packages/protocol && npm run build`
Expected: Builds successfully

- [ ] **Step 3: Commit**

```bash
git add packages/protocol/src/index.ts
git commit -m "chore: re-export tool schemas from protocol index"
```

---

### Task 4: Update frontend tools to import shared schemas

**Files:**
- Modify: `web/src/lib/tools/builtin/workflow.ts`
- Modify: `web/src/lib/tools/builtin/searchNodes.ts`
- Modify: `web/src/lib/tools/builtin/addNode.ts`
- Modify: `web/src/lib/tools/builtin/connectNodes.ts`
- Modify: `web/src/lib/tools/builtin/getGraph.ts`
- Modify: `web/src/lib/tools/builtin/updateNodeData.ts`
- Modify: `web/src/lib/tools/builtin/deleteNode.ts`
- Modify: `web/src/lib/tools/builtin/deleteEdge.ts`
- Modify: `web/src/lib/tools/builtin/moveNode.ts`
- Modify: `web/src/lib/tools/builtin/setNodeTitle.ts`
- Modify: `web/src/lib/tools/builtin/setNodeSyncMode.ts`
- Modify: `web/src/lib/tools/builtin/uiActions.ts`

For each file, import the shared schema and use it instead of inline Zod definitions. The `execute` functions and any `.refine()` / `.preprocess()` wrappers stay in the frontend files.

**Pattern for simple tools** (connectNodes, getGraph, updateNodeData, deleteNode, deleteEdge, moveNode, setNodeTitle, setNodeSyncMode):

Replace the inline `z.object({...})` parameters with `z.object(importedParams)`.

Example for `connectNodes.ts`:

```typescript
// Before:
import { z } from "zod";
import { optionalWorkflowIdSchema } from "./workflow";

FrontendToolRegistry.register({
  name: "ui_connect_nodes",
  parameters: z.object({
    source_id: z.string(),
    source_handle: z.string(),
    target_id: z.string(),
    target_handle: z.string(),
    workflow_id: optionalWorkflowIdSchema
  }),
  ...
});

// After:
import { z } from "zod";
import { uiConnectNodesParams } from "@nodetool/protocol";

FrontendToolRegistry.register({
  name: "ui_connect_nodes",
  parameters: z.object(uiConnectNodesParams),
  ...
});
```

**Pattern for tools with refinements** (addNode, uiActions tools):

The shared schemas intentionally omit `.refine()` because the SDK's `tool()` takes a flat `ZodRawShape`. Frontend tools re-apply refinements after importing. On the SDK side, if Claude omits a required ID, the error surfaces at runtime in the execute handler — acceptable since Claude gets a clear error response.

```typescript
// addNode.ts — wrap shared params and add refinement
import { uiAddNodeParams, positionInputSchema, nodePropertySchema } from "@nodetool/protocol";

const nodeInputSchema = z.object({
  id: z.string(),
  type: z.string().optional(),
  node_type: z.string().optional(),
  position: positionInputSchema,
  properties: nodePropertySchema.optional(),
});

const addNodeParametersSchema = z
  .object({
    node: nodeInputSchema.optional(),
    ...uiAddNodeParams,
  })
  .refine(
    (data) => data.node || (data.id !== undefined && data.position !== undefined),
    { message: "Either 'node' object or both 'id' and 'position' must be provided" }
  );
```

```typescript
// uiActions.ts — ui_open_workflow and ui_run_workflow re-apply refinements
import { uiOpenWorkflowParams, uiRunWorkflowParams } from "@nodetool/protocol";

const openWorkflowSchema = z.object(uiOpenWorkflowParams).refine(
  (value) => Boolean(value.workflow_id ?? value.id),
  { message: "workflow_id (or id) is required" }
);

const runWorkflowSchema = z.object(uiRunWorkflowParams).refine(
  (value) => Boolean(value.workflow_id ?? value.id),
  { message: "workflow_id (or id) is required" }
);
```

**Pattern for searchNodes** (has `booleanLikeOptional` preprocessor):

```typescript
// searchNodes.ts — wrap shared params, add preprocess for string→boolean coercion
import { uiSearchNodesParams } from "@nodetool/protocol";

const booleanLikeOptional = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const n = value.trim().toLowerCase();
    if (n === "true") return true;
    if (n === "false") return false;
  }
  return value;
}, z.boolean().optional());

// Override boolean fields with preprocess version for frontend resilience
const searchNodesSchema = z.object({
  ...uiSearchNodesParams,
  strict_match: booleanLikeOptional,
  include_properties: booleanLikeOptional,
  include_outputs: booleanLikeOptional,
});
```

**workflow.ts:** Replace the local `optionalWorkflowIdSchema` definition with a re-export from protocol. Keep the existing `optionalWorkflowIdSchemaCompact` line unchanged (used by `graph.ts`). Keep `resolveWorkflowId` unchanged.

```typescript
// Before (lines 1-10):
import { z } from "zod";
import type { FrontendToolState } from "../frontendTools";

export const optionalWorkflowIdSchema = z
  .string()
  .nullable()
  .optional()
  .describe("Optional workflow id; when omitted/null, the current workflow is used.");

export const optionalWorkflowIdSchemaCompact = z.string().nullable().optional();

// After:
import { z } from "zod";
import type { FrontendToolState } from "../frontendTools";
export { optionalWorkflowIdSchema } from "@nodetool/protocol";

export const optionalWorkflowIdSchemaCompact = z.string().nullable().optional();
// rest of file (resolveWorkflowId) unchanged
```

- [ ] **Step 1: Update workflow.ts**
- [ ] **Step 2: Update searchNodes.ts**
- [ ] **Step 3: Update addNode.ts**
- [ ] **Step 4: Update connectNodes.ts**
- [ ] **Step 5: Update getGraph.ts**
- [ ] **Step 6: Update updateNodeData.ts**
- [ ] **Step 7: Update deleteNode.ts**
- [ ] **Step 8: Update deleteEdge.ts**
- [ ] **Step 9: Update moveNode.ts**
- [ ] **Step 10: Update setNodeTitle.ts**
- [ ] **Step 11: Update setNodeSyncMode.ts**
- [ ] **Step 12: Update uiActions.ts**

- [ ] **Step 13: Verify web builds**

Run: `cd /Users/mg/workspace/nodetool/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 14: Run existing frontend tool tests**

Run: `cd /Users/mg/workspace/nodetool/web && npx jest --testPathPattern="tools" --no-coverage`
Expected: All tests pass

- [ ] **Step 15: Commit**

```bash
git add web/src/lib/tools/builtin/
git commit -m "refactor: import shared tool schemas from @nodetool/protocol"
```

---

## Chunk 2: ClaudeAgentSession

### Task 5: Update electron dependencies

**Files:**
- Modify: `electron/package.json`

- [ ] **Step 1: Update dependencies**

In `electron/package.json`, update:
- `"@anthropic-ai/claude-agent-sdk"`: change from `"^0.2.37"` to `"latest"` (then lock to specific version after install)
- Add `"@nodetool/protocol": "*"`
- Add `"zod": "^4.0.0"`

- [ ] **Step 2: Install from workspace root**

Run: `cd /Users/mg/workspace/nodetool && npm install`
Expected: Installs successfully. Note the resolved SDK version in the lockfile.

- [ ] **Step 3: Commit**

```bash
git add electron/package.json package-lock.json
git commit -m "chore: upgrade claude-agent-sdk, add protocol and zod deps"
```

---

### Task 6: Implement ClaudeAgentSession

**Files:**
- Modify: `electron/src/agent.ts`

This is the core change. We add the new `ClaudeAgentSession` class and wire it in.

- [ ] **Step 1: Add imports**

Add at top of `electron/src/agent.ts`:

```typescript
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type { Query } from "@anthropic-ai/claude-agent-sdk";
import { uiToolSchemas } from "@nodetool/protocol";
```

- [ ] **Step 2: Add buildMcpServer function**

Add after the system prompt constants, before the `ClaudeQuerySession` class:

```typescript
function buildMcpServer(
  webContents: WebContents,
  sessionId: string,
): ReturnType<typeof createSdkMcpServer> {
  const tools = Object.entries(uiToolSchemas).map(([name, schema]) =>
    tool(name, schema.description, schema.parameters, async (args) => {
      const result = await executeFrontendTool(
        webContents,
        sessionId,
        randomUUID(),
        name,
        args,
      );
      const text =
        typeof result === "string" ? result : JSON.stringify(result ?? null);
      return { content: [{ type: "text" as const, text }] };
    }),
  );

  return createSdkMcpServer({ name: "nodetool-ui", version: "1.0.0", tools });
}
```

- [ ] **Step 3: Add convertSdkMessage function**

```typescript
function convertSdkMessage(
  msg: { type: string; [key: string]: unknown },
  sessionId: string,
): AgentMessage | null {
  const uuid = randomUUID();

  if (msg.type === "assistant") {
    const message = msg.message as Record<string, unknown> | undefined;
    const content = message?.content;
    if (!Array.isArray(content)) return null;

    const textBlocks: Array<{ type: string; text: string }> = [];
    const toolCalls: AgentMessage["tool_calls"] = [];

    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      if (b.type === "text" && typeof b.text === "string") {
        textBlocks.push({ type: "text", text: b.text });
      } else if (
        b.type === "tool_use" &&
        typeof b.id === "string" &&
        typeof b.name === "string"
      ) {
        toolCalls.push({
          id: b.id,
          type: "function",
          function: {
            name: b.name,
            arguments: JSON.stringify(b.input ?? {}),
          },
        });
      }
    }

    if (textBlocks.length === 0 && toolCalls.length === 0) return null;

    return {
      type: "assistant",
      uuid,
      session_id: sessionId,
      content: textBlocks.length > 0 ? textBlocks : undefined,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  if (msg.type === "result") {
    const subtype = msg.subtype as string | undefined;
    if (subtype === "success") {
      return {
        type: "result",
        uuid,
        session_id: sessionId,
        subtype: "success",
        text: typeof msg.result === "string" ? msg.result : undefined,
      };
    }
    return {
      type: "result",
      uuid,
      session_id: sessionId,
      subtype: subtype ?? "error",
      is_error: true,
      errors: Array.isArray(msg.errors)
        ? (msg.errors as string[])
        : [String(msg.result ?? "Unknown error")],
    };
  }

  // system init — handled by caller for session ID capture
  if (msg.type === "system") return null;

  // stream_event — partial assistant message for real-time streaming
  if (msg.type === "stream_event") {
    const event = msg as Record<string, unknown>;
    // Extract partial text if available
    const partial = event.message as Record<string, unknown> | undefined;
    const content = partial?.content;
    if (Array.isArray(content)) {
      const textBlocks: Array<{ type: string; text: string }> = [];
      for (const block of content) {
        if (block && typeof block === "object") {
          const b = block as Record<string, unknown>;
          if (b.type === "text" && typeof b.text === "string") {
            textBlocks.push({ type: "text", text: b.text });
          }
        }
      }
      if (textBlocks.length > 0) {
        return {
          type: "assistant",
          uuid,
          session_id: sessionId,
          content: textBlocks,
        };
      }
    }
    return null;
  }

  return null;
}
```

- [ ] **Step 4: Add ClaudeAgentSession class**

Reuse the existing `CLAUDE_DISALLOWED_TOOLS` constant (already defined in `agent.ts` at line 292). Do NOT create a duplicate.

```typescript
class ClaudeAgentSession implements AgentQuerySession {
  private closed = false;
  private readonly model: string;
  private readonly workspacePath: string;
  private readonly systemPrompt: string;
  private resolvedSessionId: string | null;
  private inFlight = false;
  private activeQuery: Query | null = null;

  constructor(options: {
    model: string;
    workspacePath: string;
    resumeSessionId?: string;
    systemPrompt?: string;
  }) {
    this.model = options.model;
    this.workspacePath = options.workspacePath;
    this.systemPrompt = options.systemPrompt ?? FAST_WORKFLOW_SYSTEM_PROMPT;
    this.resolvedSessionId = options.resumeSessionId ?? null;
  }

  async send(
    message: string,
    webContents: WebContents | null,
    sessionId: string,
    _manifest: FrontendToolManifest[],
    onMessage?: (message: AgentMessage) => void,
  ): Promise<AgentMessage[]> {
    if (this.closed) {
      throw new Error("Cannot send to a closed session");
    }
    if (this.inFlight) {
      throw new Error("A request is already in progress for this session");
    }

    this.inFlight = true;

    try {
      const mcpServer = webContents
        ? buildMcpServer(webContents, sessionId)
        : undefined;

      const allowedTools = mcpServer
        ? Object.keys(uiToolSchemas).map((n) => `mcp__nodetool-ui__${n}`)
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
          disallowedTools: CLAUDE_DISALLOWED_TOOLS,
          allowedTools,
          maxTurns: 50,
          ...(mcpServer && { mcpServers: { "nodetool-ui": mcpServer } }),
          ...(this.resolvedSessionId && { resume: this.resolvedSessionId }),
        },
      });
      this.activeQuery = queryHandle;

      const outputMessages: AgentMessage[] = [];
      for await (const msg of queryHandle) {
        if (
          msg.type === "system" &&
          (msg as Record<string, unknown>).subtype === "init"
        ) {
          this.resolvedSessionId =
            (msg as Record<string, unknown>).session_id as string;
        }

        const agentMsg = convertSdkMessage(
          msg as Record<string, unknown>,
          this.resolvedSessionId ?? sessionId,
        );
        if (!agentMsg) continue;

        outputMessages.push(agentMsg);
        if (onMessage) {
          onMessage(agentMsg);
        }
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
      if (onMessage) {
        onMessage(errorMsg);
      }
      return [errorMsg];
    } finally {
      this.activeQuery = null;
      this.inFlight = false;
    }
  }

  async interrupt(): Promise<void> {
    if (this.activeQuery) {
      this.activeQuery.interrupt();
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    if (this.activeQuery) {
      this.activeQuery.close();
      this.activeQuery = null;
    }
  }
}
```

**Notes:**
- `_manifest` parameter is unused in `ClaudeAgentSession.send()` since schemas come from the shared package. `sendAgentMessageStreaming` still fetches the manifest for `CodexQuerySession` compatibility — this is acceptable overhead (single IPC call).
- The `stream_event` handler in `convertSdkMessage` is best-effort. Validate its structure against actual SDK output during manual testing (Task 8). If the SDK's partial message format differs, adjust the handler.

- [ ] **Step 5: Rename ClaudeQuerySession to ClaudeCliSession**

In `electron/src/agent.ts`, rename the existing `ClaudeQuerySession` class to `ClaudeCliSession`. This is a find-and-replace of the class name only — no logic changes.

- [ ] **Step 6: Add feature flag to createAgentSession**

Update the `createAgentSession` function to choose between the two implementations:

```typescript
// In createAgentSession, replace the existing claude session creation:
const useCliAgent = process.env.NODETOOL_AGENT_USE_CLI === "1";

const session: AgentQuerySession =
  provider === "codex"
    ? new CodexQuerySession({
        model: options.model,
        workspacePath: options.workspacePath,
        resumeSessionId: options.resumeSessionId,
        systemPrompt: CODEX_SYSTEM_PROMPT,
      })
    : useCliAgent
      ? new ClaudeCliSession({
          model: options.model,
          workspacePath: options.workspacePath,
          resumeSessionId: options.resumeSessionId,
          systemPrompt:
            process.env.NODETOOL_AGENT_VERBOSE_PROMPT === "1"
              ? HELP_SYSTEM_PROMPT
              : FAST_WORKFLOW_SYSTEM_PROMPT,
        })
      : new ClaudeAgentSession({
          model: options.model,
          workspacePath: options.workspacePath,
          resumeSessionId: options.resumeSessionId,
          systemPrompt:
            process.env.NODETOOL_AGENT_VERBOSE_PROMPT === "1"
              ? HELP_SYSTEM_PROMPT
              : FAST_WORKFLOW_SYSTEM_PROMPT,
        });
```

- [ ] **Step 7: Verify electron compiles**

Run: `cd /Users/mg/workspace/nodetool/electron && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add electron/src/agent.ts
git commit -m "feat: add ClaudeAgentSession using Agent SDK query() API"
```

---

### Task 7: Update model listing for SDK path

**Files:**
- Modify: `electron/src/agent.ts`

The `listAgentModels` function currently returns hardcoded models for the Claude provider. The SDK provides a `supportedModels()` method on the query handle. For now, keep the hardcoded list but update the model IDs to current values.

- [ ] **Step 1: Update DEFAULT_CLAUDE_MODELS**

```typescript
const DEFAULT_CLAUDE_MODELS: AgentModelDescriptor[] = [
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    isDefault: true,
  },
  {
    id: "claude-opus-4-6",
    label: "Claude Opus 4.6",
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
  },
];
```

- [ ] **Step 2: Commit**

```bash
git add electron/src/agent.ts
git commit -m "chore: update default Claude model list to current models"
```

---

## Chunk 3: Testing and Verification

### Task 8: Test the Agent SDK integration manually

- [ ] **Step 1: Build all packages**

```bash
cd /Users/mg/workspace/nodetool/packages/protocol && npm run build
cd /Users/mg/workspace/nodetool/electron && npx tsc --noEmit
cd /Users/mg/workspace/nodetool/web && npx tsc --noEmit
```

Expected: All compile without errors.

- [ ] **Step 2: Run existing agent tests**

Run: `cd /Users/mg/workspace/nodetool/electron && npx jest --no-coverage`
Expected: All existing tests pass.

- [ ] **Step 3: Run existing frontend tool tests**

Run: `cd /Users/mg/workspace/nodetool/web && npx jest --testPathPattern="tools" --no-coverage`
Expected: All tests pass.

- [ ] **Step 4: Test CLI fallback**

Set `NODETOOL_AGENT_USE_CLI=1` and verify the old path still works (if `claude` CLI is installed).

- [ ] **Step 5: Final commit if any test fixes needed**

```bash
git add -A
git commit -m "fix: address test issues from SDK migration"
```

---

### Task 9: Cleanup and documentation

- [ ] **Step 1: Add comment to ClaudeCliSession**

Add a comment above `ClaudeCliSession`:

```typescript
/**
 * Legacy Claude session using CLI pipe approach.
 * Kept behind NODETOOL_AGENT_USE_CLI=1 for rollback.
 * Will be removed after SDK migration is validated.
 */
```

- [ ] **Step 2: Remove unused imports**

Check `electron/src/agent.ts` for any imports that are only used by `ClaudeCliSession` when it's not the default path. Keep them since the class is still in the file.

- [ ] **Step 3: Commit**

```bash
git add electron/src/agent.ts
git commit -m "docs: add deprecation comment to ClaudeCliSession"
```
