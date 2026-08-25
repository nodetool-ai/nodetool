import { describe, it, expect, vi } from "vitest";
import { ProcessingContext, BaseProvider } from "@nodetool-ai/runtime";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import {
  BackgroundSubtaskRegistry,
  StartSubtaskTool,
  WaitSubtasksTool,
  SUBTASK_DEPTH_KEY,
  TOOL_CALL_ID_FIELD
} from "../src/index.js";

function makeCtx(): ProcessingContext {
  return new ProcessingContext({ jobId: "test-job", userId: "test" });
}

type StreamItem =
  | { type: "chunk"; content: string; done?: boolean }
  | { id: string; name: string; args: Record<string, unknown> };

/**
 * Minimal mock BaseProvider — the same shape run-subtask-tool.test.ts uses.
 * `gates` holds one promise per generateMessages call, resolved by the test
 * to hold the child loop open before its scripted response plays.
 */
function createMockProvider(gates: Array<Promise<void>> = []) {
  let callIndex = 0;
  const responseSequence: Array<Array<StreamItem>> = [
    [{ type: "chunk", content: "late answer", done: true }]
  ];
  return {
    provider: "mock",
    hasToolSupport: async () => true,
    generateMessages: async function* () {
      const gate = gates[callIndex];
      callIndex++;
      if (gate) await gate;
      const items = responseSequence[0] ?? [];
      for (const item of items) yield item;
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

describe("BackgroundSubtaskRegistry", () => {
  it("tracks start → settle → snapshot", () => {
    const registry = new BackgroundSubtaskRegistry();
    registry.start("a", "Research X", 1);
    registry.start("b", "Draft Y", 1);
    expect(registry.size).toBe(2);
    expect(registry.runningCount).toBe(2);

    registry.settle("a", { ok: true, result: "done" });
    registry.settle("b", { ok: false, error: "boom" });

    const rows = registry.snapshot();
    expect(rows.map((r) => [r.subtask_id, r.status])).toEqual([
      ["a", "completed"],
      ["b", "failed"]
    ]);
    expect(registry.runningCount).toBe(0);
  });

  it("marks an aborted settlement and ignores double settles", () => {
    const registry = new BackgroundSubtaskRegistry();
    registry.start("a", "X", 1);
    registry.settle("a", { aborted: true });
    registry.settle("a", { ok: true, result: "late" });
    const [row] = registry.snapshot();
    expect(row.status).toBe("aborted");
    expect(row.result).toBeUndefined();
  });

  it("wait resolves when every requested record settles", async () => {
    const registry = new BackgroundSubtaskRegistry();
    registry.start("a", "X", 1);
    const pending = registry.wait({ ids: ["a"], timeoutMs: 5_000 });
    registry.settle("a", { ok: true, result: 42 });
    const rows = await pending;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ subtask_id: "a", status: "completed", result: 42 });
  });

  it("wait reports unknown ids without blocking", async () => {
    const registry = new BackgroundSubtaskRegistry();
    const rows = await registry.wait({ ids: ["ghost"], timeoutMs: 1_000 });
    expect(rows).toEqual([{ subtask_id: "ghost", status: "unknown" }]);
  });

  it("wait returns running statuses on timeout", async () => {
    const registry = new BackgroundSubtaskRegistry();
    registry.start("a", "X", 1);
    const rows = await registry.wait({ timeoutMs: 50 });
    expect(rows[0].status).toBe("running");
  });

  it("wait resolves immediately when nothing is running", async () => {
    const registry = new BackgroundSubtaskRegistry();
    registry.start("a", "X", 1);
    registry.settle("a", { ok: false, error: "nope" });
    const rows = await registry.wait({ timeoutMs: 5_000 });
    expect(rows[0].status).toBe("failed");
  });

  it("wait honors an abort signal", async () => {
    const registry = new BackgroundSubtaskRegistry();
    registry.start("a", "X", 1);
    const controller = new AbortController();
    const pending = registry.wait({
      timeoutMs: 30_000,
      signal: controller.signal
    });
    controller.abort();
    const rows = await pending;
    expect(rows[0].status).toBe("running");
  });
});

describe("StartSubtaskTool", () => {
  function makeTool(
    provider: ReturnType<typeof createMockProvider>,
    registry: BackgroundSubtaskRegistry | undefined,
    forwarded: ProcessingMessage[] = []
  ): StartSubtaskTool {
    return new StartSubtaskTool({
      provider,
      model: "mock",
      parentTools: () => [],
      forwardMessage: (m) => {
        forwarded.push(m);
      },
      background: registry
    });
  }

  it("declares the start_subtask identity and schema", () => {
    const tool = makeTool(createMockProvider(), new BackgroundSubtaskRegistry());
    expect(tool.name).toBe("start_subtask");
    expect(tool.needsToolCallId).toBe(true);
    const schema = tool.inputSchema as Record<string, unknown>;
    expect(schema.required).toEqual(["description", "prompt"]);
  });

  it("refuses without a background registry", async () => {
    const tool = makeTool(createMockProvider(), undefined);
    const result = (await tool.process(makeCtx(), {
      description: "d",
      prompt: "p"
    })) as Record<string, unknown>;
    expect(result.error).toBe("background_unavailable");
  });

  it("still enforces the recursion depth gate", async () => {
    const tool = makeTool(createMockProvider(), new BackgroundSubtaskRegistry());
    const ctx = makeCtx();
    ctx.set(SUBTASK_DEPTH_KEY, 3);
    const result = (await tool.process(ctx, {
      description: "deep",
      prompt: "recurse"
    })) as Record<string, unknown>;
    expect(result.error).toBe("max_recursion_depth_reached");
  });

  it("returns a receipt immediately and settles the record later", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const provider = createMockProvider([gate]);
    const registry = new BackgroundSubtaskRegistry();
    const forwarded: ProcessingMessage[] = [];
    const tool = makeTool(provider, registry, forwarded);
    const ctx = makeCtx();

    const receipt = (await Promise.race([
      tool.process(ctx, {
        description: "Research",
        prompt: "go do research",
        [TOOL_CALL_ID_FIELD]: "tc_root"
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("process() blocked")), 1_000)
      )
    ])) as Record<string, unknown>;

    expect(receipt.status).toBe("running");
    expect(typeof receipt.subtask_id).toBe("string");
    expect(registry.runningCount).toBe(1);

    // Child events stream while the parent moved on.
    release();
    await vi.waitFor(() => expect(registry.runningCount).toBe(0));

    const [row] = registry.snapshot();
    expect(row.status).toBe("completed");
    expect(row.description).toBe("Research");
    expect(row.depth).toBe(1);
    expect(row.result).toContain("late answer");

    const tagged = forwarded.find(
      (m) =>
        (m as { parent_tool_call_id?: string }).parent_tool_call_id ===
        "tc_root"
    ) as { subtask_depth?: number } | undefined;
    expect(tagged?.subtask_depth).toBe(1);
  });

  it("reports a failed child through wait_subtasks", async () => {
    // An empty provider sequence yields no final message → no_result failure.
    const provider = createMockProvider();
    (provider as { generateMessages: unknown }).generateMessages =
      async function* () {
        // yields nothing at all
      };
    const registry = new BackgroundSubtaskRegistry();
    const tool = makeTool(provider, registry);
    const ctx = makeCtx();

    const receipt = (await tool.process(ctx, {
      description: "dies quietly",
      prompt: "p"
    })) as Record<string, unknown>;

    const rows = (await new WaitSubtasksTool({ background: registry }).process(
      ctx,
      { ids: [receipt.subtask_id], timeout_ms: 5_000 }
    )) as { subtasks: Array<{ status: string; error?: string }> };
    expect(rows.subtasks[0].status).toBe("failed");
  });
});

describe("WaitSubtasksTool", () => {
  it("refuses without a registry", async () => {
    const tool = new WaitSubtasksTool({});
    const result = (await tool.process(makeCtx(), {})) as Record<
      string,
      unknown
    >;
    expect(result.error).toBe("background_unavailable");
  });

  it("answers with guidance when nothing was started", async () => {
    const tool = new WaitSubtasksTool({ background: new BackgroundSubtaskRegistry() });
    const result = (await tool.process(makeCtx(), {})) as Record<string, unknown>;
    expect(result.subtasks).toEqual([]);
    expect(String(result.message)).toContain("No background subtasks");
  });

  it("collects results for the whole turn", async () => {
    const registry = new BackgroundSubtaskRegistry();
    registry.start("a", "First", 1);
    registry.start("b", "Second", 1);
    registry.settle("a", { ok: true, result: "one" });

    const tool = new WaitSubtasksTool({ background: registry });
    // b never settles → the timeout path reports it as still running.
    const result = (await tool.process(makeCtx(), { timeout_ms: 100 })) as {
      subtasks: Array<{ subtask_id: string; status: string }>;
      all_settled: boolean;
    };
    expect(result.subtasks.map((r) => r.subtask_id)).toEqual(["a", "b"]);
    expect(result.all_settled).toBe(false);
  });

  it("collects only requested ids", async () => {
    const registry = new BackgroundSubtaskRegistry();
    registry.start("a", "First", 1);
    registry.start("b", "Second", 1);
    registry.settle("a", { ok: true, result: "one" });
    registry.settle("b", { aborted: true });

    const tool = new WaitSubtasksTool({ background: registry });
    const result = (await tool.process(makeCtx(), {
      ids: ["b"]
    })) as { subtasks: Array<{ subtask_id: string; status: string }> };
    expect(result.subtasks).toEqual([
      { subtask_id: "b", depth: 1, description: "Second", status: "aborted" }
    ]);
  });

  it("returns promptly when the turn aborts mid-wait", async () => {
    const registry = new BackgroundSubtaskRegistry();
    registry.start("slow", "Slow", 1);
    const tool = new WaitSubtasksTool({ background: registry });
    const ctx = makeCtx();
    const controller = new AbortController();
    // `signal` is a plain mutable field; swap in one we control.
    (ctx as { signal: AbortSignal }).signal = controller.signal;
    const started = Date.now();
    const pending = tool.process(ctx, {});
    setTimeout(() => controller.abort(), 20);
    await pending;
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
