import { describe, it, expect, vi } from "vitest";
import { ProcessingContext } from "@nodetool-ai/runtime";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import {
  RunSubtaskTool,
  SUBTASK_DEPTH_KEY,
  TOOL_CALL_ID_FIELD
} from "../src/tools/run-subtask-tool.js";

function makeCtx(): ProcessingContext {
  return new ProcessingContext({ jobId: "test-job", userId: "test" });
}

/**
 * Minimal mock BaseProvider — just enough surface for MultiModeAgent's
 * "loop" mode to drive a StepExecutor. The provider replays a queued
 * sequence of stream events per `generateMessages` call.
 */
function createMockProvider(
  responseSequence: Array<
    Array<
      | { type: "chunk"; content: string; done?: boolean }
      | { id: string; name: string; args: Record<string, unknown> }
    >
  >
) {
  let callIndex = 0;
  return {
    provider: "mock",
    hasToolSupport: async () => true,
    generateMessages: async function* () {
      const items = responseSequence[callIndex] ?? [];
      callIndex++;
      for (const item of items) {
        yield item;
      }
    },
    async *generateMessagesTraced(...args: any[]) {
      yield* (this as any).generateMessages(...args);
    },
    async generateMessageTraced(...args: any[]) {
      return (this as any).generateMessage(...args);
    },
    generateMessage: vi.fn(),
    getAvailableLanguageModels: vi.fn().mockResolvedValue([]),
    getAvailableImageModels: vi.fn().mockResolvedValue([]),
    getAvailableVideoModels: vi.fn().mockResolvedValue([]),
    getAvailableTTSModels: vi.fn().mockResolvedValue([]),
    getAvailableASRModels: vi.fn().mockResolvedValue([]),
    getAvailableEmbeddingModels: vi.fn().mockResolvedValue([]),
    getContainerEnv: () => ({}),
    textToImage: vi.fn(),
    imageToImage: vi.fn(),
    textToSpeech: vi.fn(),
    automaticSpeechRecognition: vi.fn(),
    textToVideo: vi.fn(),
    imageToVideo: vi.fn(),
    generateEmbedding: vi.fn(),
    isContextLengthError: () => false
  } as any;
}

describe("RunSubtaskTool", () => {
  describe("name + schema", () => {
    it("declares the run_subtask name and required fields", () => {
      const tool = new RunSubtaskTool({
        provider: createMockProvider([]),
        model: "mock",
        parentTools: () => [],
        forwardMessage: () => {}
      });
      expect(tool.name).toBe("run_subtask");
      expect(tool.description.length).toBeGreaterThan(0);
      const schema = tool.inputSchema as Record<string, unknown>;
      expect(schema.type).toBe("object");
      expect(schema.required).toEqual(["title", "instructions"]);
    });

    it("renders a useful userMessage using the title arg", () => {
      const tool = new RunSubtaskTool({
        provider: createMockProvider([]),
        model: "mock",
        parentTools: () => [],
        forwardMessage: () => {}
      });
      expect(tool.userMessage({ title: "Research X" })).toBe(
        "Running subtask: Research X"
      );
      expect(tool.userMessage({})).toBe("Running subtask");
    });
  });

  describe("input validation", () => {
    it("returns an error when instructions are missing", async () => {
      const tool = new RunSubtaskTool({
        provider: createMockProvider([]),
        model: "mock",
        parentTools: () => [],
        forwardMessage: () => {}
      });
      const ctx = makeCtx();
      const result = (await tool.process(ctx, {
        title: "hello"
      })) as Record<string, unknown>;
      expect(result.error).toBe("missing_instructions");
    });
  });

  describe("recursion depth enforcement", () => {
    it("refuses to spawn a subtask at or above max_depth", async () => {
      const tool = new RunSubtaskTool({
        provider: createMockProvider([]),
        model: "mock",
        parentTools: () => [],
        forwardMessage: () => {},
        maxDepth: 2
      });
      const ctx = makeCtx();
      ctx.set(SUBTASK_DEPTH_KEY, 2);
      const result = (await tool.process(ctx, {
        title: "deep",
        instructions: "Try to recurse",
        [TOOL_CALL_ID_FIELD]: "tc_outer"
      })) as Record<string, unknown>;
      expect(result.error).toBe("max_recursion_depth_reached");
      expect(result.depth).toBe(2);
      expect(result.max_depth).toBe(2);
    });

    it("permits spawning when below the depth limit", async () => {
      // Subtask emits a single chunk and then ends (no tool calls -> done,
      // text is the result).
      const provider = createMockProvider([
        [{ type: "chunk", content: "subtask answer", done: true }]
      ]);
      const forwarded: ProcessingMessage[] = [];
      const tool = new RunSubtaskTool({
        provider,
        model: "mock",
        parentTools: () => [],
        forwardMessage: (m) => {
          forwarded.push(m);
        },
        maxDepth: 3
      });
      const ctx = makeCtx();
      ctx.set(SUBTASK_DEPTH_KEY, 0);

      const result = await tool.process(ctx, {
        title: "answer-once",
        instructions: "Just say something",
        [TOOL_CALL_ID_FIELD]: "tc_outer"
      });

      // The subtask returned its text as the final result (loop mode terminates
      // when the LLM emits no tool calls).
      expect(typeof result === "string" || result !== null).toBe(true);
      // Child events were forwarded, tagged with the parent tool_call_id and
      // an incremented depth.
      const sample = forwarded.find(
        (m) =>
          (m as { parent_tool_call_id?: string }).parent_tool_call_id ===
          "tc_outer"
      ) as { subtask_depth?: number; parent_tool_call_id?: string } | undefined;
      expect(sample).toBeDefined();
      expect(sample?.subtask_depth).toBe(1);
    });
  });

  describe("nested recursion", () => {
    it("includes run_subtask in the child's toolset even when the root captured parentTools before adding it", async () => {
      // Mirrors what handleAgentMessage / handleChatMessage do: `baseTools`
      // is snapshotted BEFORE unshifting run_subtask, so `parentToolsFn()`
      // returns a list without it. The tool must heal this and ensure the
      // child still sees `run_subtask`.
      const make = (name: string): any => ({
        name,
        description: name,
        inputSchema: { type: "object" },
        toProviderTool: () => ({ name, description: name, inputSchema: {} }),
        async process() {
          return {};
        }
      });
      const baseTools = [make("browser")]; // intentionally NO run_subtask

      let capturedToolNames: string[] = [];
      const provider = createMockProvider([
        [{ type: "chunk", content: "ok", done: true }]
      ]);
      const origGen = provider.generateMessages.bind(provider);
      provider.generateMessages = async function* (opts: any) {
        if (opts && Array.isArray(opts.tools)) {
          capturedToolNames = (opts.tools as Array<{ name: string }>).map(
            (t) => t.name
          );
        }
        yield* origGen(opts);
      };

      const tool = new RunSubtaskTool({
        provider,
        model: "mock",
        parentTools: () => baseTools,
        forwardMessage: () => {},
        maxDepth: 3
      });
      const ctx = makeCtx();
      ctx.set(SUBTASK_DEPTH_KEY, 0);

      await tool.process(ctx, {
        title: "level-1",
        instructions: "do thing",
        [TOOL_CALL_ID_FIELD]: "tc_root"
      });

      expect(capturedToolNames).toContain("browser");
      expect(capturedToolNames).toContain("run_subtask");
    });

    it("does not mutate the caller's depth counter (each level gets a copy)", async () => {
      const provider = createMockProvider([
        [{ type: "chunk", content: "ok", done: true }]
      ]);
      const tool = new RunSubtaskTool({
        provider,
        model: "mock",
        parentTools: () => [],
        forwardMessage: () => {},
        maxDepth: 3
      });
      const ctx = makeCtx();
      ctx.set(SUBTASK_DEPTH_KEY, 0);

      await tool.process(ctx, {
        title: "shallow",
        instructions: "do a thing",
        [TOOL_CALL_ID_FIELD]: "tc_root"
      });

      // Caller's depth must remain 0 — the child runs against a context COPY
      // so depth mutations stay local. (Important: if this leaked, every
      // subsequent root turn would silently start at a higher depth.)
      expect(ctx.get<number>(SUBTASK_DEPTH_KEY)).toBe(0);
    });
  });

  describe("tool restriction", () => {
    it("filters parent tools to the allowlist (plus run_subtask + memory_*)", async () => {
      // Build a minimal Tool stub set
      const make = (name: string): any => ({
        name,
        description: name,
        inputSchema: { type: "object" },
        toProviderTool: () => ({ name, description: name, inputSchema: {} }),
        async process() {
          return {};
        }
      });
      const parentTools = [
        make("browser"),
        make("memory_read"),
        make("write_file"),
        make("run_subtask")
      ];

      // Capture which tools the child agent sees by reading the provider's
      // received `tools` argument on the first call.
      let capturedToolNames: string[] = [];
      const provider = createMockProvider([
        [{ type: "chunk", content: "ok", done: true }]
      ]);
      const origGen = provider.generateMessages.bind(provider);
      provider.generateMessages = async function* (opts: any) {
        if (opts && Array.isArray(opts.tools)) {
          capturedToolNames = (opts.tools as Array<{ name: string }>).map(
            (t) => t.name
          );
        }
        yield* origGen(opts);
      };

      const tool = new RunSubtaskTool({
        provider,
        model: "mock",
        parentTools: () => parentTools,
        forwardMessage: () => {},
        maxDepth: 3
      });
      const ctx = makeCtx();
      ctx.set(SUBTASK_DEPTH_KEY, 0);

      await tool.process(ctx, {
        title: "restricted",
        instructions: "do thing",
        tools: ["browser"],
        [TOOL_CALL_ID_FIELD]: "tc_outer"
      });

      // browser was allow-listed; memory_read and run_subtask are always
      // allowed; write_file should be filtered out.
      expect(capturedToolNames).toContain("browser");
      expect(capturedToolNames).toContain("memory_read");
      expect(capturedToolNames).toContain("run_subtask");
      expect(capturedToolNames).not.toContain("write_file");
    });
  });
});
