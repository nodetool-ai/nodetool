# Skill Agent Loop Design

## Problem

Skill nodes (ImageSkill, MediaSkill, BrowserSkill, etc.) in the TS backend do a single chat completion call and return text. The Python implementation runs a full agent loop — the LLM can call tools (`execute_bash`, `set_output_image`, etc.), see results, and iterate until it produces output files. Without tools, the LLM can only describe what it would do; it cannot actually process images, run ffmpeg, or produce files.

## Goal

All 19 skill nodes run an agent loop with tool calling, matching Python behavior. The agent loop is extracted from the existing `AgentNode.genProcess()` in `agents.ts` and reused by `SkillNode.process()`.

## Architecture

### Component Overview

```
SkillNode.process(inputs, context)
  ├─ resolve provider + model from inputs
  ├─ collect assets (image, audio, video, document)
  ├─ call this.getTools(workspaceDir) → ToolLike[]
  ├─ build user message with prompt + multimodal assets
  └─ runAgentLoop({context, providerId, modelId, systemPrompt, prompt, tools, contentParts})
       ├─ resolve provider via context.getProvider()
       ├─ loop:
       │   ├─ stream provider response (chunks + tool calls)
       │   ├─ execute each tool call → append result to messages
       │   └─ continue if tools were called, else break
       └─ return { text, messages }
  ├─ read output sinks → load files as asset refs
  └─ return { text, image?, audio?, video?, document? }
```

### Key Design Decision: Reuse AgentNode Loop

The `AgentNode.genProcess()` at `agents.ts:1772-2051` already implements the complete agent loop:
- Provider streaming via `streamProviderMessages()`
- Tool call detection via `isChunkItem()` / `isToolCallItem()`
- Sequential tool execution with result serialization
- Message history accumulation
- Multi-iteration looping until no more tool calls

Rather than duplicating this or adding a dependency on `@nodetool/agents`, we extract the loop logic from `AgentNode.genProcess()` into a standalone `runAgentLoop()` function in the same `agents.ts` file. Both `AgentNode` and `SkillNode` call it.

## Detailed Design

### 1. `runAgentLoop()` — Extracted from AgentNode

**Location**: `packages/base-nodes/src/nodes/agents.ts`

```typescript
interface AgentLoopOptions {
  context: ProcessingContext;
  providerId: string;
  modelId: string;
  systemPrompt: string;
  prompt: string;
  tools: ToolLike[];
  contentParts?: MessageContentPart[];  // pre-built multimodal parts (images, audio, video, documents)
  maxTokens?: number;   // default 4096
  maxIterations?: number; // default 10
}

interface AgentLoopResult {
  text: string;           // accumulated assistant text
  messages: Message[];    // full message history
}

async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult>
```

**Behavior**:
1. Resolve provider via `context.getProvider(providerId)`
2. Build initial messages: `[system, user(prompt + contentParts)]` — the `contentParts` array can contain images, audio, video, and document parts built by the caller via `buildAssetContentParts()`
3. Convert tools to provider format via `toProviderTools()`
4. Loop (max `maxIterations`, default 10 — sufficient for focused skill tasks; individual skills can override):
   - Stream provider response, collect chunks + tool calls
   - Append assistant message to history
   - If tool calls present: execute each, append tool result messages, continue
   - If no tool calls: break
5. Return `{ text, messages }`

This is the same logic as `AgentNode.genProcess()`, minus streaming yields and thread persistence. `AgentNode.genProcess()` keeps its inline loop for streaming support.

**Exported**: Yes, so `skills.ts` can import it.

### 2. `SkillNode.process()` — Updated

**Location**: `packages/base-nodes/src/nodes/skills.ts`

```typescript
class SkillNode extends BaseNode {
  /** Override in subclasses to provide skill-specific tools. */
  getTools(workspaceDir: string): ToolLike[] {
    return [makeExecuteBashTool(workspaceDir)];
  }

  async process(inputs, context): Promise<Record<string, unknown>> {
    // 1. Resolve provider/model
    // 2. Determine workspace dir
    // 3. Build tools via this.getTools(workspaceDir)
    // 4. Collect multimodal assets from inputs + this
    // 5. Call runAgentLoop({...})
    // 6. Read output sinks from tools
    // 7. Load output files as asset refs
    // 8. Return { text, image?, audio?, video?, document? }
  }
}
```

### 3. Skill Tools

Skill tools conform to the existing `ToolLike` type from `agents.ts`, which has optional `process` and `toProviderTool` fields. Skill tool factories always set `process` (required for execution) and `name`/`description`/`inputSchema` (used by `toProviderTools()` to convert to provider format). The `toProviderTool` method is not needed since the default conversion in `toProviderTools()` handles plain objects.

#### `makeExecuteBashTool(workspaceDir)`

Runs a shell command in the workspace directory. Returns `{ success, stdout, stderr }`.

```typescript
{
  name: "execute_bash",
  description: "Execute a bash command in the workspace directory.",
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string", description: "Bash command to execute" }
    },
    required: ["command"]
  },
  process: async (context, params) => {
    const { execFile } = await import("node:child_process");
    // Execute in workspaceDir, capture stdout/stderr, timeout
    return { success, stdout, stderr };
  }
}
```

#### `makeSetOutputTool(name, outputSink, workspaceDir)`

Factory for `set_output_image`, `set_output_audio`, `set_output_video`, `set_output_document`.

```typescript
function makeSetOutputTool(
  toolName: string,        // e.g. "set_output_image"
  description: string,
  outputSink: string[],    // mutable array, tool pushes path here
  workspaceDir: string
): ToolLike
```

The tool validates the path exists in workspace, then pushes it to `outputSink`. After the loop, `SkillNode.process()` reads `outputSink[0]`, loads the file, and returns it as the corresponding asset ref.

### 4. Skill Subclass Tool Overrides

Each skill overrides `getTools()`:

| Skill | Tools | Output Sinks |
|-------|-------|-------------|
| ShellAgentSkill | `execute_bash` | — |
| ImageSkill | `execute_bash`, `set_output_image` | image |
| MediaSkill | `execute_bash`, `set_output_audio`, `set_output_video` | audio, video |
| FfmpegSkill | `execute_bash`, `set_output_audio`, `set_output_video` | audio, video |
| FilesystemSkill | `execute_bash` | — |
| BrowserSkill | `execute_bash` | — |
| DocumentSkill | `execute_bash`, `set_output_document` | document |
| DocxSkill | `execute_bash`, `set_output_document` | document |
| PdfLibSkill | `execute_bash`, `set_output_document` | document |
| PptxSkill | `execute_bash`, `set_output_document` | document |
| SpreadsheetSkill | `execute_bash`, `set_output_document` | document |
| HtmlSkill | `execute_bash`, `set_output_document` | document |
| HttpApiSkill | `execute_bash` | — |
| GitSkill | `execute_bash` | — |
| EmailSkill | `execute_bash` | — |
| SQLiteSkill | `execute_bash` | — |
| SupabaseSkill | `execute_bash` | — |
| VectorStoreSkill | `execute_bash` | — |
| YtDlpDownloaderSkill | `execute_bash`, `set_output_video` | video |

### 5. Workspace Directory

Skills need a workspace for file operations. The workspace path comes from:
1. `context.workspaceDir` if available
2. Fallback: `os.tmpdir() + '/nodetool-skill-' + jobId`

Created automatically if it doesn't exist. Cleaned up by the workflow runner after job completion (not the skill's responsibility). For the temp directory fallback, cleanup happens when the OS clears temp files.

### 6. Asset Output Loading

After the agent loop completes, `SkillNode.process()` checks each output sink:

```typescript
if (imageSink.length > 0) {
  const absPath = path.resolve(workspaceDir, imageSink[0]);
  const bytes = await readFile(absPath);
  result.image = { type: "image", data: Buffer.from(bytes).toString("base64"), uri: pathToFileURL(absPath).toString() };
}
```

Same pattern for audio, video, document.

## Refactoring AgentNode

`AgentNode.genProcess()` is refactored to use shared helpers but keeps its streaming behavior. The agent loop helpers become module-level functions:

- `buildUserMessage()` — already exists
- `toProviderTools()` — already exists
- `serializeToolResult()` — already exists
- `isChunkItem()` / `isToolCallItem()` — already exist
- `runAgentLoop()` — new, extracted from genProcess loop

`AgentNode.genProcess()` can either call `runAgentLoop()` (losing streaming) or continue using the inline loop for streaming support. The pragmatic choice: keep `AgentNode.genProcess()` as-is (it works and streams), and have `runAgentLoop()` be a non-streaming version of the same logic for skill nodes.

### 7. Provider Resolution

`runAgentLoop()` requires a registered provider via `context.getProvider(providerId)`. The existing `callChatCompletionDirect()` HTTP fallback in skills.ts is **removed** — it was a workaround for the lack of tool support and is no longer needed. All providers must be registered in the context. If provider resolution fails, the error propagates to the user with a clear message.

### 8. Output Sink Ownership

Output sinks (mutable `string[]` arrays) are created by the caller (`SkillNode.process()`) and passed into tool factories. Tools mutate the sinks during the agent loop. After the loop returns, the caller reads `sink[0]` to load output files. Sinks are **not** part of `AgentLoopResult` — the loop is agnostic to output semantics.

### 9. Cleanup of Existing Code

The following functions in `skills.ts` are **removed** after migration:
- `callChatCompletion()` — replaced by `runAgentLoop()`
- `callChatCompletionDirect()` — HTTP fallback no longer needed
- `toOpenAIContent()` / `toAnthropicContent()` — provider-specific formatting handled by provider layer

The asset collection helpers (`collectAssets`, `buildAssetContentParts`, `getAssetBytes`, etc.) are **kept** — they build the `contentParts` passed to `runAgentLoop()`.

### 10. Security: `execute_bash`

The `execute_bash` tool runs arbitrary shell commands provided by the LLM. This matches the Python implementation which also runs unsandboxed bash. Known risks:
- LLM can execute any command the process user can run
- No command filtering or allowlist
- Workspace directory provides loose containment but is not a security boundary

Mitigations for v1:
- Commands execute with a 120-second timeout (configurable)
- Working directory is set to workspace, limiting accidental file access
- Docker sandboxing is a future improvement (noted in "What This Does NOT Cover")

This is acceptable for the current use case (local desktop application with user-initiated workflows).

## Error Handling

- **Provider resolution fails**: throw with clear message
- **Tool execution fails**: return error result to LLM, let it retry or report
- **Max iterations reached**: return accumulated text, log warning
- **Timeout**: `setTimeout` wrapper around the loop, configurable via `timeout_seconds` property
- **Missing API key**: throw with env var name hint (existing behavior)

## Testing Strategy

Tests follow the established `createMockProvider(responseSequence)` pattern from `agents.test.ts`.

### Unit Tests for `runAgentLoop()`

```typescript
describe("runAgentLoop", () => {
  it("returns text from single LLM call (no tools)", async () => {
    // Provider returns text chunks, no tool calls
    // Verify: result.text contains accumulated text
  });

  it("executes tool and loops for second LLM call", async () => {
    // Provider call 1: returns tool call for execute_bash
    // Provider call 2: returns final text
    // Verify: tool was called, result.text is from second call
  });

  it("handles multiple tool calls in one iteration", async () => {
    // Provider returns two tool calls
    // Both executed, results appended, loop continues
  });

  it("stops after maxIterations", async () => {
    // Provider always returns tool calls
    // Verify: loop exits after maxIterations
  });

  it("throws when provider resolution fails", async () => {
    // context.getProvider throws
    // Verify: error propagates
  });
});
```

### Unit Tests for Skill Tools

```typescript
describe("makeExecuteBashTool", () => {
  it("executes command and returns stdout", async () => {
    const tool = makeExecuteBashTool("/tmp/test-workspace");
    const result = await tool.process({}, { command: "echo hello" });
    expect(result).toMatchObject({ success: true, stdout: "hello\n" });
  });

  it("returns error for failing command", async () => {
    const tool = makeExecuteBashTool("/tmp/test-workspace");
    const result = await tool.process({}, { command: "false" });
    expect(result).toMatchObject({ success: false });
  });
});

describe("makeSetOutputTool", () => {
  it("records path in output sink", async () => {
    const sink: string[] = [];
    const tool = makeSetOutputTool("set_output_image", "Set output image", sink, "/tmp/ws");
    // Create a test file
    await writeFile("/tmp/ws/out.png", Buffer.from("fake-png"));
    const result = await tool.process({}, { path: "out.png" });
    expect(result).toMatchObject({ success: true });
    expect(sink).toEqual(["out.png"]);
  });

  it("rejects path outside workspace", async () => {
    const sink: string[] = [];
    const tool = makeSetOutputTool("set_output_image", "Set output image", sink, "/tmp/ws");
    const result = await tool.process({}, { path: "../../etc/passwd" });
    expect(result).toMatchObject({ success: false });
  });
});
```

### Integration Tests for SkillNode

```typescript
describe("SkillNode agent loop integration", () => {
  it("ImageSkill runs agent loop and produces image output", async () => {
    // Mock provider: call 1 returns execute_bash tool call (creates image)
    //                call 2 returns set_output_image tool call
    //                call 3 returns final text
    // Verify: result has { text, image } with image data
  });

  it("ShellAgentSkill runs bash and returns text", async () => {
    // Mock provider: call 1 returns execute_bash tool call
    //                call 2 returns final text
    // Verify: result.text contains response
  });

  it("skill with no tools still returns text from LLM", async () => {
    // Provider returns text directly, no tool calls
    // Verify: result.text is set
  });
});
```

### What We Don't Test

- Actual LLM API calls (mocked)
- Actual image processing (mocked bash commands)
- Streaming behavior (skill nodes use process(), not genProcess())

## Files Changed

| File | Change |
|------|--------|
| `packages/base-nodes/src/nodes/agents.ts` | Extract `runAgentLoop()`, export it + helper functions |
| `packages/base-nodes/src/nodes/skills.ts` | Replace `callChatCompletion` with `runAgentLoop()`, add `getTools()`, add skill tools, add output sink loading |
| `packages/base-nodes/tests/skills.test.ts` | Add agent loop + tool tests |
| `packages/base-nodes/tests/agent-loop.test.ts` | New: unit tests for `runAgentLoop()` |

## What This Does NOT Cover

- **Browser/DOM tools** for BrowserSkill — these exist in `@nodetool/agents` and could be imported later. For now, BrowserSkill gets `execute_bash` only.
- **Docker execution** — Python skills can run in Docker containers. TS runs locally only.
- **Asset staging with manifests** — Python writes input/output manifests to `.nodetool/agent-runs/`. TS skips this; assets are passed directly via multimodal messages and output sinks.
- **Control tools** — Inter-node parameter control is AgentNode-specific, not needed for skills.
- **Streaming** — Skill nodes use `process()`, not `genProcess()`. The agent loop runs to completion.
