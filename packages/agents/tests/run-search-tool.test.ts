import { describe, it, expect, vi } from "vitest";
import { ProcessingContext, BaseProvider } from "@nodetool-ai/runtime";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import { RunSearchTool } from "../src/tools/run-search-tool.js";
import {
  SUBTASK_DEPTH_KEY,
  TOOL_CALL_ID_FIELD
} from "../src/tools/run-subtask-tool.js";
import { READ_ONLY_SEARCH_DESCRIPTION } from "../src/prompts/read-only-search-prompt.js";

function makeCtx(): ProcessingContext {
  return new ProcessingContext({ jobId: "test-job", userId: "test" });
}

/**
 * Minimal mock BaseProvider — just enough surface for the search's
 * StepExecutor. The provider replays a queued sequence of stream events per
 * `generateMessages` call. (Reused verbatim from run-subtask-tool.test.ts.)
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
    generateLoop(args: unknown) {
      return (
        BaseProvider.prototype as { generateLoop: (a: unknown) => unknown }
      ).generateLoop.call(this, args);
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

const makeTool = (name: string): any => ({
  name,
  description: name,
  inputSchema: { type: "object" },
  toProviderTool: () => ({ name, description: name, inputSchema: {} }),
  async process() {
    return {};
  }
});

/**
 * Wraps a mock provider so the tools array passed to `generateMessages` and the
 * full message list are captured for assertion. Returns the provider plus
 * getters for the captured state.
 */
function captureProvider(
  responseSequence: Parameters<typeof createMockProvider>[0]
) {
  const provider = createMockProvider(responseSequence);
  let capturedToolNames: string[] = [];
  let capturedMessagesText = "";
  const origGen = provider.generateMessages.bind(provider);
  provider.generateMessages = async function* (opts: any) {
    if (opts && Array.isArray(opts.tools)) {
      capturedToolNames = (opts.tools as Array<{ name: string }>).map(
        (t) => t.name
      );
    }
    if (opts && Array.isArray(opts.messages)) {
      capturedMessagesText = (opts.messages as Array<{ content?: unknown }>)
        .map((m) => (typeof m.content === "string" ? m.content : ""))
        .join("\n");
    }
    yield* origGen(opts);
  };
  return {
    provider,
    toolNames: () => capturedToolNames,
    messagesText: () => capturedMessagesText
  };
}

const VENDOR_NEEDLES = [
  "claude",
  "anthropic",
  "openai",
  "gpt",
  "gemini",
  "fable",
  "opus",
  "sonnet",
  "haiku"
];

describe("RunSearchTool", () => {
  describe("name + schema", () => {
    it("declares the run_search name, required query, and breadth enum", () => {
      const tool = new RunSearchTool({
        provider: createMockProvider([]),
        model: "mock",
        parentTools: () => [],
        forwardMessage: () => {}
      });
      expect(tool.name).toBe("run_search");
      expect(tool.description.length).toBeGreaterThan(0);

      const schema = tool.inputSchema as Record<string, unknown>;
      expect(schema.type).toBe("object");
      expect(schema.required).toEqual(["query"]);

      const props = schema.properties as Record<
        string,
        Record<string, unknown>
      >;
      expect(props.breadth.enum).toEqual(["medium", "very thorough"]);
      expect(props.breadth.default).toBe("medium");
    });

    it("uses vendor-neutral wording in the description", () => {
      const tool = new RunSearchTool({
        provider: createMockProvider([]),
        model: "mock",
        parentTools: () => [],
        forwardMessage: () => {}
      });
      const lower = tool.description.toLowerCase();
      for (const needle of VENDOR_NEEDLES) {
        expect(lower).not.toContain(needle);
      }
      // sanity: the exported constant is the source of the description.
      expect(tool.description).toBe(READ_ONLY_SEARCH_DESCRIPTION);
    });
  });

  describe("userMessage", () => {
    it("renders a status from the query and a fallback when absent", () => {
      const tool = new RunSearchTool({
        provider: createMockProvider([]),
        model: "mock",
        parentTools: () => [],
        forwardMessage: () => {}
      });
      expect(tool.userMessage({ query: "where is the gate" })).toBe(
        "Searching: where is the gate"
      );
      expect(tool.userMessage({})).toBe("Searching workspace");
    });
  });

  describe("input validation", () => {
    it("returns missing_query when query is empty/missing", async () => {
      const tool = new RunSearchTool({
        provider: createMockProvider([]),
        model: "mock",
        parentTools: () => [],
        forwardMessage: () => {}
      });
      const ctx = makeCtx();
      const result = (await tool.process(ctx, {})) as Record<string, unknown>;
      expect(result.error).toBe("missing_query");

      const blank = (await tool.process(ctx, {
        query: "   "
      })) as Record<string, unknown>;
      expect(blank.error).toBe("missing_query");
    });
  });

  describe("recursion depth enforcement", () => {
    it("refuses to spawn a search at or above max_depth", async () => {
      const tool = new RunSearchTool({
        provider: createMockProvider([]),
        model: "mock",
        parentTools: () => [],
        forwardMessage: () => {},
        maxDepth: 2
      });
      const ctx = makeCtx();
      ctx.set(SUBTASK_DEPTH_KEY, 2);
      const result = (await tool.process(ctx, {
        query: "Try to recurse",
        [TOOL_CALL_ID_FIELD]: "tc_outer"
      })) as Record<string, unknown>;
      expect(result.error).toBe("max_recursion_depth_reached");
      expect(result.depth).toBe(2);
      expect(result.max_depth).toBe(2);
    });
  });

  describe("read-only toolset filtering", () => {
    it("hands the child ONLY the read-only allowlist, never write/spawn tools", async () => {
      const parentTools = [
        makeTool("write_file"),
        makeTool("edit_file"),
        makeTool("browser"),
        makeTool("read_file"),
        makeTool("glob"),
        makeTool("grep"),
        makeTool("list_directory"),
        makeTool("memory_read"),
        makeTool("run_subtask")
      ];

      const cap = captureProvider([
        [{ type: "chunk", content: "ok", done: true }]
      ]);

      const tool = new RunSearchTool({
        provider: cap.provider,
        model: "mock",
        parentTools: () => parentTools,
        forwardMessage: () => {},
        maxDepth: 3
      });
      const ctx = makeCtx();
      ctx.set(SUBTASK_DEPTH_KEY, 0);

      await tool.process(ctx, {
        query: "find the gate",
        [TOOL_CALL_ID_FIELD]: "tc_outer"
      });

      const names = cap.toolNames();
      // Read-only allowlist (from the parent snapshot) is present.
      expect(names).toEqual(
        expect.arrayContaining([
          "read_file",
          "glob",
          "grep",
          "list_directory"
        ])
      );
      // Write / external tools are filtered out.
      expect(names).not.toContain("write_file");
      expect(names).not.toContain("edit_file");
      expect(names).not.toContain("browser");
    });

    it("does not stitch in run_subtask or run_search — the loop cannot spawn", async () => {
      const parentTools = [
        makeTool("read_file"),
        makeTool("grep"),
        makeTool("run_subtask")
      ];

      const cap = captureProvider([
        [{ type: "chunk", content: "ok", done: true }]
      ]);

      const tool = new RunSearchTool({
        provider: cap.provider,
        model: "mock",
        parentTools: () => parentTools,
        forwardMessage: () => {},
        maxDepth: 3
      });
      const ctx = makeCtx();
      ctx.set(SUBTASK_DEPTH_KEY, 0);

      await tool.process(ctx, {
        query: "anything",
        [TOOL_CALL_ID_FIELD]: "tc_outer"
      });

      const names = cap.toolNames();
      expect(names).not.toContain("run_subtask");
      expect(names).not.toContain("run_search");
    });
  });

  describe("breadth wiring", () => {
    it("embeds the medium breadth paragraph by default", async () => {
      const cap = captureProvider([
        [{ type: "chunk", content: "ok", done: true }]
      ]);
      const tool = new RunSearchTool({
        provider: cap.provider,
        model: "mock",
        parentTools: () => [makeTool("read_file")],
        forwardMessage: () => {},
        maxDepth: 3
      });
      const ctx = makeCtx();
      ctx.set(SUBTASK_DEPTH_KEY, 0);

      await tool.process(ctx, {
        query: "find X",
        [TOOL_CALL_ID_FIELD]: "tc_outer"
      });

      const text = cap.messagesText();
      expect(text).toContain("targeted search");
      expect(text).not.toContain("systematic sweep");
      // The query is embedded verbatim in the prompt.
      expect(text).toContain("find X");
    });

    it("embeds the very-thorough breadth paragraph when requested", async () => {
      const cap = captureProvider([
        [{ type: "chunk", content: "ok", done: true }]
      ]);
      const tool = new RunSearchTool({
        provider: cap.provider,
        model: "mock",
        parentTools: () => [makeTool("read_file")],
        forwardMessage: () => {},
        maxDepth: 3
      });
      const ctx = makeCtx();
      ctx.set(SUBTASK_DEPTH_KEY, 0);

      await tool.process(ctx, {
        query: "find X everywhere",
        breadth: "very thorough",
        [TOOL_CALL_ID_FIELD]: "tc_outer"
      });

      const text = cap.messagesText();
      expect(text).toContain("systematic sweep");
      expect(text).not.toContain("targeted search");
    });
  });

  describe("result capture (prose path)", () => {
    it("returns the no-tool-call assistant text and forwards tagged events", async () => {
      const report = "src/foo.ts:12 the gate lives here\nSummary: it is wired in foo.";
      const provider = createMockProvider([
        [{ type: "chunk", content: report, done: true }]
      ]);
      const forwarded: ProcessingMessage[] = [];
      const tool = new RunSearchTool({
        provider,
        model: "mock",
        parentTools: () => [makeTool("read_file")],
        forwardMessage: (m) => {
          forwarded.push(m);
        },
        maxDepth: 3
      });
      const ctx = makeCtx();
      ctx.set(SUBTASK_DEPTH_KEY, 0);

      const result = await tool.process(ctx, {
        query: "where is the gate",
        [TOOL_CALL_ID_FIELD]: "tc_outer"
      });

      expect(result).toBe(report);

      const sample = forwarded.find(
        (m) =>
          (m as { parent_tool_call_id?: string }).parent_tool_call_id ===
          "tc_outer"
      ) as { subtask_depth?: number; parent_tool_call_id?: string } | undefined;
      expect(sample).toBeDefined();
      expect(sample?.subtask_depth).toBe(1);
    });
  });

  describe("depth isolation", () => {
    it("does not mutate the caller's depth counter (child runs on a copy)", async () => {
      const provider = createMockProvider([
        [{ type: "chunk", content: "ok", done: true }]
      ]);
      const tool = new RunSearchTool({
        provider,
        model: "mock",
        parentTools: () => [makeTool("read_file")],
        forwardMessage: () => {},
        maxDepth: 3
      });
      const ctx = makeCtx();
      ctx.set(SUBTASK_DEPTH_KEY, 0);

      await tool.process(ctx, {
        query: "shallow look",
        [TOOL_CALL_ID_FIELD]: "tc_root"
      });

      expect(ctx.get<number>(SUBTASK_DEPTH_KEY)).toBe(0);
    });
  });
});
