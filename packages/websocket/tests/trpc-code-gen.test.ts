/**
 * codeGen router — the one-shot serving path for `CodePlanner`.
 *
 * The planner itself is real here; only the provider is scripted, so the test
 * covers the glue the router owns: auth, provider resolution, the per-user
 * in-flight cap, cancellation, and the rule that nothing the user typed and
 * nothing the model wrote reaches the log line.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { BaseProvider, ProviderStreamItem } from "@nodetool-ai/runtime";

const mocks = vi.hoisted(() => ({
  getProvider: vi.fn(),
  isProviderConfigured: vi.fn(async () => true),
  getSecret: vi.fn(async () => "test-key"),
  logs: [] as Array<{ level: string; message: string; args: unknown[] }>
}));

vi.mock("@nodetool-ai/config", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/config")>();
  return {
    ...actual,
    createLogger: (name: string) =>
      name === "nodetool.websocket.trpc.code-gen"
        ? {
            debug: (message: string, ...args: unknown[]) =>
              mocks.logs.push({ level: "debug", message, args }),
            info: (message: string, ...args: unknown[]) =>
              mocks.logs.push({ level: "info", message, args }),
            warn: (message: string, ...args: unknown[]) =>
              mocks.logs.push({ level: "warn", message, args }),
            error: (message: string, ...args: unknown[]) =>
              mocks.logs.push({ level: "error", message, args })
          }
        : actual.createLogger(name)
  };
});

vi.mock("@nodetool-ai/runtime", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/runtime")>();
  return {
    ...actual,
    getProvider: mocks.getProvider,
    isProviderConfigured: mocks.isProviderConfigured
  };
});

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return { ...actual, getSecret: mocks.getSecret };
});

import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import { resetCodeGenInFlight } from "../src/trpc/routers/code-gen.js";
import type { Context } from "../src/trpc/context.js";

const STR = { type: "str" };

const INSTRUCTION = "Split the acme-invoice text into words and count them.";
const CODE = 'const words = text.split(" ");\nreturn { words, count: words.length };';

const SUBMISSION = {
  title: "Split text into words",
  summary: "Splits the input text on whitespace and counts the words.",
  code: CODE,
  inputs: [{ name: "text", type: STR }],
  outputs: [
    { name: "words", type: { type: "list", type_args: [STR] } },
    { name: "count", type: { type: "int" } }
  ]
};

const REQUEST = {
  instruction: INSTRUCTION,
  inputs: [{ name: "text", type: STR }],
  provider: "scripted",
  model: "scripted-model"
};

/**
 * Provider that answers with one `submit_code` call. `gate` (when given) holds
 * the loop open so a test can keep generations in flight.
 */
function scriptedProvider(options: { gate?: Promise<void> } = {}): BaseProvider {
  let emit: ((msg: unknown) => void) | null = null;
  return {
    provider: "scripted",
    hasToolSupport: async () => true,
    getTotalCost: () => 0.0042,
    setMessageEmitter(fn: (msg: unknown) => void) {
      emit = fn;
    },
    async *generateLoop(args: {
      tools?: Array<{
        name: string;
        execute?: (a: Record<string, unknown>, id?: string) => Promise<unknown>;
      }>;
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      if (options.gate) await options.gate;
      if (args.signal?.aborted) return;
      emit?.({
        type: "llm_call",
        provider: "scripted",
        model: "scripted-model",
        messages: [{ role: "user", content: INSTRUCTION }],
        response: CODE,
        tokens_input: 120,
        tokens_output: 45,
        cost: 0.0042,
        duration_ms: 5,
        timestamp: new Date().toISOString()
      });
      const call = { id: "call-1", name: "submit_code", args: SUBMISSION };
      yield call as unknown as ProviderStreamItem;
      const tool = (args.tools ?? []).find((t) => t.name === "submit_code");
      await tool?.execute?.(call.args as Record<string, unknown>, call.id);
      yield { type: "chunk", content: "", done: true } as ProviderStreamItem;
    }
  } as unknown as BaseProvider;
}

const createCaller = createCallerFactory(appRouter);

function makeCtx(overrides: Partial<Context> = {}): Context {
  return {
    userId: "user-1",
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false,
    ...overrides
  } as Context;
}

describe("codeGen router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.logs.length = 0;
    mocks.isProviderConfigured.mockResolvedValue(true);
    mocks.getSecret.mockResolvedValue("test-key");
    resetCodeGenInFlight();
  });

  it("returns the validated submission for a configured provider", async () => {
    mocks.getProvider.mockResolvedValue(scriptedProvider());
    const caller = createCaller(makeCtx());

    const result = await caller.codeGen.generate(REQUEST);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.submission.title).toBe(SUBMISSION.title);
    expect(result.submission.code).toBe(CODE);
    expect(result.submission.outputs.map((o) => o.name)).toEqual([
      "words",
      "count"
    ]);
  });

  it("rejects an unauthenticated caller", async () => {
    mocks.getProvider.mockResolvedValue(scriptedProvider());
    const caller = createCaller(makeCtx({ userId: null }));

    await expect(caller.codeGen.generate(REQUEST)).rejects.toThrow(
      /Authentication required/
    );
    expect(mocks.getProvider).not.toHaveBeenCalled();
  });

  it("reports an unconfigured provider instead of throwing", async () => {
    mocks.isProviderConfigured.mockResolvedValue(false);
    const caller = createCaller(makeCtx());

    const result = await caller.codeGen.generate(REQUEST);

    expect(result).toMatchObject({
      status: "error",
      error: { code: "provider_unavailable", provider: "scripted" }
    });
  });

  it("rate-limits a third concurrent generation for the same user", async () => {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    mocks.getProvider.mockImplementation(async () => scriptedProvider({ gate }));
    const caller = createCaller(makeCtx());

    const first = caller.codeGen.generate(REQUEST);
    const second = caller.codeGen.generate(REQUEST);
    // Let both reach the provider loop and park on the gate.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const third = await caller.codeGen.generate(REQUEST);

    expect(third).toMatchObject({
      status: "error",
      error: { code: "rate_limited" }
    });
    if (third.status === "error" && third.error.code === "rate_limited") {
      expect(third.error.retryAfterMs).toBeGreaterThan(0);
    }

    open();
    expect((await first).status).toBe("ok");
    expect((await second).status).toBe("ok");

    // The slots are released, so a later request runs again.
    expect((await caller.codeGen.generate(REQUEST)).status).toBe("ok");
  });

  it("propagates the request abort signal to the planner", async () => {
    mocks.getProvider.mockResolvedValue(scriptedProvider());
    const controller = new AbortController();
    controller.abort();
    const caller = createCaller(makeCtx(), { signal: controller.signal });

    const result = await caller.codeGen.generate(REQUEST);

    expect(result).toMatchObject({
      status: "error",
      error: { code: "aborted" }
    });
  });

  it("logs usage metadata without the instruction or the generated code", async () => {
    mocks.getProvider.mockResolvedValue(scriptedProvider());
    const caller = createCaller(makeCtx());

    await caller.codeGen.generate(REQUEST);

    const line = mocks.logs.find((l) => l.message === "code generation finished");
    expect(line).toBeDefined();
    const payload = JSON.stringify(line);
    expect(payload).not.toContain("acme-invoice");
    expect(payload).not.toContain("split");
    expect(payload).not.toContain(SUBMISSION.title);
    expect(line?.args[0]).toMatchObject({
      provider: "scripted",
      model: "scripted-model",
      status: "ok",
      inputTokens: 120,
      outputTokens: 45,
      costUsd: 0.0042
    });
  });
});
