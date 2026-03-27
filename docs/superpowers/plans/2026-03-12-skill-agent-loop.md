# Skill Agent Loop Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** All 19 skill nodes run an agent loop with tool calling (execute_bash + set_output_*), matching Python behavior.

**Architecture:** Extract a standalone `runAgentLoop()` function in `agents.ts` that streams provider responses, executes tool calls, and loops until done. `SkillNode.process()` calls it with skill-specific tools and reads output sinks to produce asset refs. The existing `AgentNode.genProcess()` keeps its inline loop for streaming.

**Tech Stack:** TypeScript, vitest, node:child_process for bash execution, existing `@nodetool/runtime` provider/message types.

**Spec:** `docs/superpowers/specs/2026-03-12-skill-agent-loop-design.md`

---

## Chunk 1: runAgentLoop + skill tools

### Task 1: Export helper functions from agents.ts

These functions are currently module-private. They need to be exported so `skills.ts` can import them (or so `runAgentLoop` can use them from outside).

**Files:**
- Modify: `packages/base-nodes/src/nodes/agents.ts`

- [ ] **Step 1: Export the needed types and functions**

Add `export` to these existing declarations:

```typescript
// Line 18 — ToolLike type
export type ToolLike = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  process?: (context: ProcessingContext, params: Record<string, unknown>) => Promise<unknown>;
  toProviderTool?: () => { name: string; description?: string; inputSchema?: Record<string, unknown> };
};

// Line 470 — isChunkItem
export function isChunkItem(item: ProviderStreamItem): item is Chunk { ... }

// Line 474 — isToolCallItem
export function isToolCallItem(item: ProviderStreamItem): item is ToolCall { ... }

// Line 486 — toProviderTools
export function toProviderTools(tools: ToolLike[]): Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> { ... }

// Line 498 — serializeToolResult
export function serializeToolResult(value: unknown): unknown { ... }
```

Also export the `streamProviderMessages` async generator (line 171).

- [ ] **Step 2: Verify build**

Run: `cd /Users/mg/workspace/nodetool && npx tsc -p packages/base-nodes/tsconfig.json --noEmit 2>&1 | head -20`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add packages/base-nodes/src/nodes/agents.ts
git commit -m "refactor: export agent loop helpers from agents.ts for reuse"
```

---

### Task 2: Create runAgentLoop function

**Files:**
- Modify: `packages/base-nodes/src/nodes/agents.ts`
- Create: `packages/base-nodes/tests/agent-loop.test.ts`

- [ ] **Step 1: Write failing test for runAgentLoop — no tools, single text response**

```typescript
// packages/base-nodes/tests/agent-loop.test.ts
import { describe, it, expect, vi } from "vitest";
import { runAgentLoop } from "../src/nodes/agents.js";
import type { ProcessingContext } from "@nodetool/runtime";

function createMockContext(providerFactory: () => any): ProcessingContext {
  return {
    getProvider: vi.fn().mockImplementation(async () => providerFactory()),
  } as unknown as ProcessingContext;
}

/** Provider that yields a sequence of items per call. */
function makeMockProvider(callSequences: Array<Array<any>>) {
  let callIndex = 0;
  return () => ({
    provider: "mock",
    generateMessages: async function* () {
      const items = callSequences[callIndex++] ?? [];
      for (const item of items) yield item;
    },
    async *generateMessagesTraced(...args: any[]) {
      yield* (this as any).generateMessages(...args);
    },
  });
}

describe("runAgentLoop", () => {
  it("returns text from single LLM call (no tools)", async () => {
    const provider = makeMockProvider([
      [
        { type: "chunk", content: "Hello ", done: false },
        { type: "chunk", content: "world", done: true },
      ],
    ]);
    const context = createMockContext(provider);
    const result = await runAgentLoop({
      context,
      providerId: "mock",
      modelId: "test-model",
      systemPrompt: "You are helpful.",
      prompt: "Say hello",
      tools: [],
    });
    expect(result.text).toBe("Hello world");
    expect(result.messages.length).toBeGreaterThanOrEqual(2); // system + user
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/mg/workspace/nodetool && npx vitest run packages/base-nodes/tests/agent-loop.test.ts 2>&1 | tail -20`
Expected: FAIL — `runAgentLoop` is not exported / does not exist.

- [ ] **Step 3: Implement runAgentLoop**

Add to `agents.ts` after the `serializeToolResult` function (~line 507):

```typescript
export interface AgentLoopOptions {
  context: ProcessingContext;
  providerId: string;
  modelId: string;
  systemPrompt: string;
  prompt: string;
  tools: ToolLike[];
  contentParts?: MessageContent[];  // pre-built multimodal parts
  maxTokens?: number;
  maxIterations?: number;
}

export interface AgentLoopResult {
  text: string;
  messages: Message[];
}

export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const {
    context,
    providerId,
    modelId,
    systemPrompt,
    prompt,
    tools,
    contentParts,
    maxTokens = 4096,
    maxIterations = 10,
  } = options;

  if (!context || typeof context.getProvider !== "function") {
    throw new Error("Processing context with provider access is required");
  }

  // Build initial user message content
  const userContent: MessageContent[] = [{ type: "text", text: prompt }];
  if (contentParts) {
    userContent.push(...contentParts);
  }

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];

  const providerTools = tools.length > 0 ? toProviderTools(tools) : undefined;
  let accumulatedText = "";
  let iteration = 0;
  let shouldContinue = true;

  while (shouldContinue && iteration < maxIterations) {
    shouldContinue = false;
    iteration++;

    const provider = await context.getProvider(providerId);
    const assistantToolCalls: ToolCall[] = [];
    let assistantText = "";

    for await (const item of streamProviderMessages(provider, {
      messages,
      model: modelId,
      tools: providerTools,
      maxTokens,
    })) {
      if (isChunkItem(item)) {
        if (!item.thinking) {
          assistantText += item.content ?? "";
        }
      }
      if (isToolCallItem(item)) {
        assistantToolCalls.push(item);
      }
    }

    if (assistantText) {
      accumulatedText = assistantText;
    }

    if (assistantText || assistantToolCalls.length > 0) {
      messages.push({
        role: "assistant",
        content: [{ type: "text", text: assistantText }],
        toolCalls: assistantToolCalls.length > 0 ? assistantToolCalls : null,
      });
    }

    for (const toolCall of assistantToolCalls) {
      const tool = tools.find((t) => t.name === toolCall.name);
      if (!tool || typeof tool.process !== "function") {
        messages.push({
          role: "tool",
          toolCallId: toolCall.id,
          content: JSON.stringify({ error: `Unknown tool: ${toolCall.name}` }),
        });
        shouldContinue = true;
        continue;
      }
      const result = await tool.process(context, toolCall.args);
      messages.push({
        role: "tool",
        toolCallId: toolCall.id,
        content: JSON.stringify(serializeToolResult(result)),
      });
      shouldContinue = true;
    }
  }

  if (iteration >= maxIterations) {
    log.warn("runAgentLoop reached max iterations", { maxIterations, providerId, modelId });
  }

  return { text: accumulatedText, messages };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/mg/workspace/nodetool && npx vitest run packages/base-nodes/tests/agent-loop.test.ts 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Write test — tool call + second LLM call**

Add to `agent-loop.test.ts`:

```typescript
it("executes tool and loops for second LLM call", async () => {
  const toolProcessFn = vi.fn().mockResolvedValue({ success: true, stdout: "42\n" });
  const tools: any[] = [{
    name: "execute_bash",
    description: "Run a bash command",
    inputSchema: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
    process: toolProcessFn,
  }];

  const provider = makeMockProvider([
    // Call 1: LLM returns a tool call
    [
      { type: "chunk", content: "Let me check", done: false },
      { id: "tc_1", name: "execute_bash", args: { command: "echo 42" } },
    ],
    // Call 2: LLM returns final text
    [
      { type: "chunk", content: "The answer is 42", done: true },
    ],
  ]);

  const context = createMockContext(provider);
  const result = await runAgentLoop({
    context,
    providerId: "mock",
    modelId: "test-model",
    systemPrompt: "You are helpful.",
    prompt: "What is the answer?",
    tools,
  });

  expect(toolProcessFn).toHaveBeenCalledOnce();
  expect(toolProcessFn).toHaveBeenCalledWith(expect.anything(), { command: "echo 42" });
  expect(result.text).toBe("The answer is 42");
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd /Users/mg/workspace/nodetool && npx vitest run packages/base-nodes/tests/agent-loop.test.ts 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 7: Write test — stops after maxIterations**

```typescript
it("stops after maxIterations", async () => {
  // Provider always returns a tool call
  const provider = makeMockProvider(
    Array.from({ length: 5 }, () => [
      { type: "chunk", content: "thinking...", done: false },
      { id: "tc_loop", name: "execute_bash", args: { command: "echo loop" } },
    ])
  );

  const tools: any[] = [{
    name: "execute_bash",
    process: vi.fn().mockResolvedValue({ success: true, stdout: "loop\n" }),
    inputSchema: {},
  }];

  const context = createMockContext(provider);
  const result = await runAgentLoop({
    context,
    providerId: "mock",
    modelId: "test-model",
    systemPrompt: "sys",
    prompt: "go",
    tools,
    maxIterations: 3,
  });

  // Should have stopped at 3 iterations, not 5
  expect(tools[0].process).toHaveBeenCalledTimes(3);
  expect(result.text).toBeTruthy();
});
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd /Users/mg/workspace/nodetool && npx vitest run packages/base-nodes/tests/agent-loop.test.ts 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 9: Write test — contentParts are included in user message**

```typescript
it("includes contentParts in user message", async () => {
  let capturedMessages: any[] = [];
  const provider = () => ({
    provider: "mock",
    generateMessages: async function* (args: any) {
      capturedMessages = args.messages;
      yield { type: "chunk" as const, content: "I see the image", done: true };
    },
    async *generateMessagesTraced(...args: any[]) { yield* (this as any).generateMessages(...args); },
  });

  const context = createMockContext(provider);
  const imagePart = { type: "image" as const, image: { data: "abc123", mimeType: "image/png" } };

  const result = await runAgentLoop({
    context,
    providerId: "mock",
    modelId: "test-model",
    systemPrompt: "sys",
    prompt: "describe this",
    tools: [],
    contentParts: [imagePart],
  });

  expect(result.text).toBe("I see the image");
  // User message should have text + image parts
  const userMsg = capturedMessages.find((m: any) => m.role === "user");
  expect(Array.isArray(userMsg?.content)).toBe(true);
  expect(userMsg.content).toHaveLength(2);
  expect(userMsg.content[1].type).toBe("image");
});
```

- [ ] **Step 10: Write test — multiple tool calls in one iteration**

```typescript
it("handles multiple tool calls in one iteration", async () => {
  const toolA = vi.fn().mockResolvedValue({ result: "a" });
  const toolB = vi.fn().mockResolvedValue({ result: "b" });
  const tools: any[] = [
    { name: "tool_a", process: toolA, inputSchema: {} },
    { name: "tool_b", process: toolB, inputSchema: {} },
  ];

  const provider = makeMockProvider([
    // Call 1: LLM returns two tool calls at once
    [
      { id: "tc_a", name: "tool_a", args: { x: 1 } },
      { id: "tc_b", name: "tool_b", args: { y: 2 } },
    ],
    // Call 2: final text
    [
      { type: "chunk", content: "Both done", done: true },
    ],
  ]);

  const context = createMockContext(provider);
  const result = await runAgentLoop({
    context,
    providerId: "mock",
    modelId: "test-model",
    systemPrompt: "sys",
    prompt: "do both",
    tools,
  });

  expect(toolA).toHaveBeenCalledOnce();
  expect(toolB).toHaveBeenCalledOnce();
  expect(result.text).toBe("Both done");
});
```

- [ ] **Step 11: Write test — throws when provider resolution fails**

```typescript
it("throws when provider resolution fails", async () => {
  const context = {
    getProvider: vi.fn().mockRejectedValue(new Error("No such provider")),
  } as unknown as ProcessingContext;

  await expect(
    runAgentLoop({
      context,
      providerId: "nonexistent",
      modelId: "test-model",
      systemPrompt: "sys",
      prompt: "go",
      tools: [],
    })
  ).rejects.toThrow("No such provider");
});
```

- [ ] **Step 12: Run all agent-loop tests**

Run: `cd /Users/mg/workspace/nodetool && npx vitest run packages/base-nodes/tests/agent-loop.test.ts 2>&1 | tail -20`
Expected: All PASS

- [ ] **Step 13: Commit**

```bash
git add packages/base-nodes/src/nodes/agents.ts packages/base-nodes/tests/agent-loop.test.ts
git commit -m "feat: add runAgentLoop() extracted from AgentNode for reuse by skills"
```

---

### Task 3: Create skill tool factories

**Files:**
- Modify: `packages/base-nodes/src/nodes/skills.ts`

- [ ] **Step 1: Write tests for makeExecuteBashTool and makeSetOutputTool**

Add these imports at the top of the existing `packages/base-nodes/tests/skills.test.ts` and add the new describe blocks at the end:

```typescript
// Add to existing imports at top of file:
import { vi, beforeEach, afterEach } from "vitest";
import { makeExecuteBashTool, makeSetOutputTool } from "../src/nodes/skills.js";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

describe("makeExecuteBashTool", () => {
  let workspaceDir: string;

  beforeEach(async () => {
    workspaceDir = await mkdtemp(path.join(tmpdir(), "skill-test-"));
  });

  afterEach(async () => {
    await rm(workspaceDir, { recursive: true, force: true });
  });

  it("executes command and returns stdout", async () => {
    const tool = makeExecuteBashTool(workspaceDir);
    const result = await tool.process!({} as any, { command: "echo hello" });
    expect(result).toMatchObject({ success: true, stdout: "hello\n" });
  });

  it("returns error for failing command", async () => {
    const tool = makeExecuteBashTool(workspaceDir);
    const result = await tool.process!({} as any, { command: "exit 1" });
    expect(result).toMatchObject({ success: false });
  });

  it("runs in workspace directory", async () => {
    const tool = makeExecuteBashTool(workspaceDir);
    const result = (await tool.process!({} as any, { command: "pwd" })) as any;
    expect(result.stdout.trim()).toBe(workspaceDir);
  });

  it("has correct tool metadata", () => {
    const tool = makeExecuteBashTool(workspaceDir);
    expect(tool.name).toBe("execute_bash");
    expect(tool.inputSchema).toBeDefined();
    expect(tool.inputSchema!.required).toContain("command");
  });
});

describe("makeSetOutputTool", () => {
  let workspaceDir: string;

  beforeEach(async () => {
    workspaceDir = await mkdtemp(path.join(tmpdir(), "skill-test-"));
  });

  afterEach(async () => {
    await rm(workspaceDir, { recursive: true, force: true });
  });

  it("records path in output sink", async () => {
    const sink: string[] = [];
    const tool = makeSetOutputTool("set_output_image", "Set output image", sink, workspaceDir);
    await writeFile(path.join(workspaceDir, "out.png"), Buffer.from("fake-png"));
    const result = await tool.process!({} as any, { path: "out.png" });
    expect(result).toMatchObject({ success: true });
    expect(sink).toEqual(["out.png"]);
  });

  it("rejects path outside workspace", async () => {
    const sink: string[] = [];
    const tool = makeSetOutputTool("set_output_image", "Set output image", sink, workspaceDir);
    const result = await tool.process!({} as any, { path: "../../etc/passwd" });
    expect(result).toMatchObject({ success: false });
    expect(sink).toHaveLength(0);
  });

  it("rejects non-existent file", async () => {
    const sink: string[] = [];
    const tool = makeSetOutputTool("set_output_image", "Set output image", sink, workspaceDir);
    const result = await tool.process!({} as any, { path: "nonexistent.png" });
    expect(result).toMatchObject({ success: false });
    expect(sink).toHaveLength(0);
  });

  it("has correct tool metadata", () => {
    const sink: string[] = [];
    const tool = makeSetOutputTool("set_output_image", "Set output image", sink, workspaceDir);
    expect(tool.name).toBe("set_output_image");
    expect(tool.inputSchema).toBeDefined();
    expect(tool.inputSchema!.required).toContain("path");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/mg/workspace/nodetool && npx vitest run packages/base-nodes/tests/skills.test.ts 2>&1 | tail -20`
Expected: FAIL — `makeExecuteBashTool` and `makeSetOutputTool` not exported.

- [ ] **Step 3: Implement makeExecuteBashTool**

Add to `skills.ts` after the `resolveApiKey` function (before the `callChatCompletionDirect` function):

```typescript
import type { ToolLike } from "./agents.js";
import { exec } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";

export function makeExecuteBashTool(workspaceDir: string, timeoutMs = 120_000): ToolLike {
  return {
    name: "execute_bash",
    description: "Execute a bash command in the workspace directory.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Bash command to execute" },
      },
      required: ["command"],
    },
    process: async (_context, params) => {
      const command = String(params.command ?? "");
      if (!command) return { success: false, error: "No command provided" };
      return new Promise((resolve) => {
        exec(command, { cwd: workspaceDir, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
          resolve({
            success: !error,
            stdout: stdout ?? "",
            stderr: stderr ?? "",
            ...(error ? { error: error.message } : {}),
          });
        });
      });
    },
  };
}
```

- [ ] **Step 4: Implement makeSetOutputTool**

```typescript
export function makeSetOutputTool(
  toolName: string,
  description: string,
  outputSink: string[],
  workspaceDir: string
): ToolLike {
  return {
    name: toolName,
    description,
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Workspace-relative path to the output file." },
      },
      required: ["path"],
    },
    process: async (_context, params) => {
      const relPath = String(params.path ?? "");
      if (!relPath) return { success: false, error: "No path provided" };
      const absPath = path.resolve(workspaceDir, relPath);
      // Security: ensure path is within workspace
      if (!absPath.startsWith(path.resolve(workspaceDir))) {
        return { success: false, error: "Path is outside workspace directory" };
      }
      // Verify file exists
      try {
        await access(absPath);
      } catch {
        return { success: false, error: `File not found: ${relPath}` };
      }
      outputSink.push(relPath);
      return { success: true, path: relPath };
    },
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/mg/workspace/nodetool && npx vitest run packages/base-nodes/tests/skills.test.ts 2>&1 | tail -20`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add packages/base-nodes/src/nodes/skills.ts packages/base-nodes/tests/skills.test.ts
git commit -m "feat: add makeExecuteBashTool and makeSetOutputTool for skill agent loop"
```

---

## Chunk 2: SkillNode.process() + getTools() overrides

### Task 4: Replace SkillNode.process() with agent loop

**Files:**
- Modify: `packages/base-nodes/src/nodes/skills.ts`

- [ ] **Step 1: Write integration test — skill with agent loop returns text**

Add to `packages/base-nodes/tests/skills.test.ts`:

```typescript
import { runAgentLoop } from "../src/nodes/agents.js";

// We'll test via ShellAgentSkillNode which is the simplest skill
describe("SkillNode agent loop integration", () => {
  it("ShellAgentSkill calls runAgentLoop and returns text", async () => {
    const node = new ShellAgentSkillNode();

    // Mock context with provider that returns text
    const context = {
      getProvider: vi.fn().mockResolvedValue({
        provider: "mock",
        generateMessages: async function* () {
          yield { type: "chunk" as const, content: "Done.", done: true };
        },
        async *generateMessagesTraced(...args: any[]) {
          yield* (this as any).generateMessages(...args);
        },
      }),
      workspaceDir: await mkdtemp(path.join(tmpdir(), "skill-int-")),
    } as any;

    const result = await node.process(
      {
        prompt: "Say hello",
        model: { provider: "mock", id: "test-model" },
      },
      context
    );

    expect(result.text).toBe("Done.");
    await rm(context.workspaceDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/mg/workspace/nodetool && npx vitest run packages/base-nodes/tests/skills.test.ts -t "ShellAgentSkill calls runAgentLoop" 2>&1 | tail -20`
Expected: FAIL — current `SkillNode.process()` doesn't use runAgentLoop.

- [ ] **Step 3: Add getTools method to SkillNode base class**

```typescript
// In SkillNode class, add:
  /** Override in subclasses to provide skill-specific tools. */
  getTools(workspaceDir: string): ToolLike[] {
    return [makeExecuteBashTool(workspaceDir, (this.timeout_seconds ?? 120) * 1000)];
  }
```

- [ ] **Step 4: Replace SkillNode.process() implementation**

Replace the entire `process()` method in `SkillNode` (lines 442-495) with:

```typescript
  async process(
    inputs: Record<string, unknown>,
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const prompt = String(inputs.prompt ?? this.prompt ?? "").trim();
    if (!prompt) throw new Error("Prompt is required");

    const model = (inputs.model ?? this.model ?? {}) as Record<string, unknown>;
    const providerId = String(model.provider || "").toLowerCase();
    const modelId = String(model.id || "");
    if (!providerId || !modelId) {
      throw new Error("Select a model for this skill.");
    }
    if (!context || typeof context.getProvider !== "function") {
      throw new Error("Processing context with provider access is required");
    }

    // Determine workspace directory
    const workspaceDir = (context as any).workspaceDir
      ?? path.join(tmpdir(), `nodetool-skill-${Date.now()}`);
    await mkdir(workspaceDir, { recursive: true });

    // Collect multimodal asset inputs
    const self = this as unknown as Record<string, unknown>;
    const assets = collectAssets(inputs, self);
    const assetParts = await buildAssetContentParts(assets, context, "image");

    // Build tools
    const tools = this.getTools(workspaceDir);

    // Build content parts from asset parts (convert to runtime MessageContent format)
    const contentParts = assetParts.map((part) => {
      if (part.type === "image") {
        return { type: "image" as const, image: { data: part.image.data, mimeType: part.image.mimeType } };
      }
      if (part.type === "audio") {
        return { type: "audio" as const, audio: { data: part.audio.data, mimeType: part.audio.mimeType } };
      }
      return { type: "text" as const, text: (part as any).text ?? "" };
    });

    const systemPrompt = (this.constructor as typeof SkillNode)._systemPrompt;
    const { text } = await runAgentLoop({
      context,
      providerId,
      modelId,
      systemPrompt,
      prompt,
      tools,
      contentParts: contentParts.length > 0 ? contentParts : undefined,
      maxTokens: 4096,
      maxIterations: 10,
    });

    return { text, ...this.readOutputSinks(workspaceDir) };
  }

  /** Read output sinks populated by set_output_* tools during the loop. Override in subclasses. */
  protected async readOutputSinks(_workspaceDir: string): Promise<Record<string, unknown>> {
    return {};
  }
```

- [ ] **Step 5: Add imports at top of skills.ts**

```typescript
import { runAgentLoop } from "./agents.js";
import type { ToolLike } from "./agents.js";
import { exec } from "node:child_process";
import { access, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
```

- [ ] **Step 6: Remove old functions that are no longer needed**

Delete these functions from skills.ts:
- `callChatCompletionDirect()` (lines 256-364)
- `callChatCompletion()` (lines 370-428)
- `toOpenAIContent()` (lines 220-238)
- `toAnthropicContent()` (lines 241-254)
- `resolveApiKey()` (lines 205-213)
- `secretsMap()` (lines 46-52)
- `PROVIDER_KEY_MAP` constant (lines 54-59)
- `ProviderLike` type (lines 27-33)
- `ProviderMessage` type (lines 23-26)

Keep these functions (still needed for asset processing):
- `isAssetRef()`
- `inferAssetKind()`
- `guessMime()`
- `getAssetBytes()`
- `collectAssets()`
- `buildAssetContentParts()`
- `MessageContentPart` type
- `AssetRef` type

- [ ] **Step 7: Run test to verify it passes**

Run: `cd /Users/mg/workspace/nodetool && npx vitest run packages/base-nodes/tests/skills.test.ts -t "ShellAgentSkill calls runAgentLoop" 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 8: Run all existing skill tests to verify no regressions**

Run: `cd /Users/mg/workspace/nodetool && npx vitest run packages/base-nodes/tests/skills.test.ts 2>&1 | tail -30`
Expected: All PASS (the "process throws when prompt is empty" test should still pass)

- [ ] **Step 9: Verify build**

Run: `cd /Users/mg/workspace/nodetool && npx tsc -p packages/base-nodes/tsconfig.json --noEmit 2>&1 | head -20`
Expected: No new errors.

- [ ] **Step 10: Commit**

```bash
git add packages/base-nodes/src/nodes/skills.ts packages/base-nodes/tests/skills.test.ts
git commit -m "feat: replace SkillNode.process() with runAgentLoop agent loop"
```

---

### Task 5: Add getTools overrides and output sinks to skill subclasses

**Files:**
- Modify: `packages/base-nodes/src/nodes/skills.ts`

Skill subclasses that produce non-text output (image, audio, video, document) need:
1. `getTools()` override returning the appropriate `set_output_*` tools
2. Output sink management — mutable arrays that tools push paths into
3. `readOutputSinks()` override to load files from sinks

- [ ] **Step 1: Create a SkillWithOutputSinks mixin pattern**

Rather than duplicating sink+tool+load logic in each subclass, add a helper method to SkillNode and let subclasses declare their output types:

```typescript
// In SkillNode class, add:

  /** Override to declare output sink names. Keys are output handle names, values are tool names. */
  static readonly _outputSinkConfig: Record<string, string> = {};

  /** Transient storage for output paths set during agent loop. */
  private _outputSinks: Record<string, string[]> = {};

  getTools(workspaceDir: string): ToolLike[] {
    const tools: ToolLike[] = [
      makeExecuteBashTool(workspaceDir, (this.timeout_seconds ?? 120) * 1000),
    ];
    const config = (this.constructor as typeof SkillNode)._outputSinkConfig;
    this._outputSinks = {};
    for (const [outputName, toolName] of Object.entries(config)) {
      const sink: string[] = [];
      this._outputSinks[outputName] = sink;
      tools.push(makeSetOutputTool(
        toolName,
        `Set the ${outputName} output file path.`,
        sink,
        workspaceDir,
      ));
    }
    return tools;
  }

  protected async readOutputSinks(workspaceDir: string): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    for (const [outputName, sink] of Object.entries(this._outputSinks)) {
      if (sink.length === 0) continue;
      const absPath = path.resolve(workspaceDir, sink[0]);
      try {
        const bytes = await readFile(absPath);
        const base64 = Buffer.from(bytes).toString("base64");
        result[outputName] = {
          type: outputName,
          data: base64,
          uri: pathToFileURL(absPath).toString(),
        };
      } catch {
        // File doesn't exist or can't be read — skip
      }
    }
    return result;
  }
```

Update `process()` to use `await this.readOutputSinks(workspaceDir)`:

```typescript
    return { text, ...(await this.readOutputSinks(workspaceDir)) };
```

- [ ] **Step 2: Add _outputSinkConfig to each skill subclass that produces assets**

```typescript
// ImageSkillNode
static readonly _outputSinkConfig = { image: "set_output_image" };

// MediaSkillNode
static readonly _outputSinkConfig = { audio: "set_output_audio", video: "set_output_video" };

// FfmpegSkillNode
static readonly _outputSinkConfig = { audio: "set_output_audio", video: "set_output_video" };

// DocumentSkillNode
static readonly _outputSinkConfig = { document: "set_output_document" };

// DocxSkillNode
static readonly _outputSinkConfig = { document: "set_output_document" };

// PdfLibSkillNode
static readonly _outputSinkConfig = { document: "set_output_document" };

// PptxSkillNode
static readonly _outputSinkConfig = { document: "set_output_document" };

// SpreadsheetSkillNode — no asset output, text only

// HtmlSkillNode — output handle is "html" per metadataOutputTypes
static readonly _outputSinkConfig = { html: "set_output_html" };

// YtDlpDownloaderSkillNode
static readonly _outputSinkConfig = { video: "set_output_video" };
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/mg/workspace/nodetool && npx tsc -p packages/base-nodes/tsconfig.json --noEmit 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 4: Write integration test — ImageSkill produces image output**

Add to `packages/base-nodes/tests/skills.test.ts`:

```typescript
it("ImageSkill runs agent loop and produces image output", async () => {
  const workspaceDir = await mkdtemp(path.join(tmpdir(), "skill-img-"));

  let callIndex = 0;
  const context = {
    getProvider: vi.fn().mockResolvedValue({
      provider: "mock",
      generateMessages: async function* () {
        callIndex++;
        if (callIndex === 1) {
          // First call: LLM creates an image file via bash
          yield { id: "tc_1", name: "execute_bash", args: { command: `echo -n "fake-png" > ${workspaceDir}/output.png` } };
        } else if (callIndex === 2) {
          // Second call: LLM sets the output
          yield { id: "tc_2", name: "set_output_image", args: { path: "output.png" } };
        } else {
          // Third call: final text
          yield { type: "chunk" as const, content: "Created image.", done: true };
        }
      },
      async *generateMessagesTraced(...args: any[]) {
        yield* (this as any).generateMessages(...args);
      },
    }),
    workspaceDir,
  } as any;

  const node = new ImageSkillNode();
  const result = await node.process(
    { prompt: "Create an image", model: { provider: "mock", id: "test-model" } },
    context
  );

  expect(result.text).toBe("Created image.");
  expect(result.image).toBeDefined();
  expect((result.image as any).type).toBe("image");
  expect((result.image as any).data).toBeTruthy();

  await rm(workspaceDir, { recursive: true, force: true });
});
```

- [ ] **Step 5: Run integration test**

Run: `cd /Users/mg/workspace/nodetool && npx vitest run packages/base-nodes/tests/skills.test.ts -t "ImageSkill runs agent loop" 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 6: Run all tests**

Run: `cd /Users/mg/workspace/nodetool && npx vitest run packages/base-nodes/tests/skills.test.ts 2>&1 | tail -30`
Expected: All PASS

Run: `cd /Users/mg/workspace/nodetool && npx vitest run packages/base-nodes/tests/agent-loop.test.ts 2>&1 | tail -20`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add packages/base-nodes/src/nodes/skills.ts packages/base-nodes/tests/skills.test.ts
git commit -m "feat: add output sinks and getTools overrides to all skill subclasses"
```

---

## Chunk 3: Final verification

### Task 6: Full test suite + build verification

**Files:** None (verification only)

- [ ] **Step 1: Run full base-nodes test suite**

Run: `cd /Users/mg/workspace/nodetool && npm test -w packages/base-nodes 2>&1 | tail -40`
Expected: All tests pass (except pre-existing failures in coverage-100pct-remaining.test.ts and module resolution issues).

- [ ] **Step 2: Run TypeScript build check**

Run: `cd /Users/mg/workspace/nodetool && npx tsc -p packages/base-nodes/tsconfig.json --noEmit 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Verify agent-loop tests pass**

Run: `cd /Users/mg/workspace/nodetool && npx vitest run packages/base-nodes/tests/agent-loop.test.ts 2>&1 | tail -20`
Expected: All PASS

- [ ] **Step 4: Verify skills tests pass**

Run: `cd /Users/mg/workspace/nodetool && npx vitest run packages/base-nodes/tests/skills.test.ts 2>&1 | tail -20`
Expected: All PASS
