/**
 * Model lifetime and tool-call ids for the in-process llama.cpp provider.
 * Provider instances are rebuilt per ProcessingContext and per
 * configured-providers refresh, so a model must be loaded once per process,
 * concurrent first uses must share one load, and call ids must stay unique
 * across rounds so replayed history pairs each call with its own result.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadModel = vi.fn();
const disposeModel = vi.fn(async () => {});
const promptOptions: Array<Record<string, unknown>> = [];
const capturedHistories: unknown[][] = [];

vi.mock("@nodetool-ai/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nodetool-ai/config")>();
  return {
    ...actual,
    importOptionalModule: async () => ({
      getLlama: async () => ({ loadModel }),
      defineChatSessionFunction: (definition: unknown) => definition,
      LlamaChatSession: class {
        setChatHistory(history: unknown[]): void {
          capturedHistories.push(history);
        }
        async prompt(
          _text: string,
          options: Record<string, unknown> & {
            functions?: Record<
              string,
              { handler: (p: Record<string, unknown>) => Promise<string> }
            >;
            onTextChunk?: (chunk: string) => void;
          }
        ): Promise<string> {
          promptOptions.push(options);
          const fn = options.functions?.lookup;
          if (fn) {
            await fn.handler({ q: "x" });
            options.onTextChunk?.("calling");
            return "calling";
          }
          options.onTextChunk?.("ok");
          return "ok";
        }
      }
    })
  };
});

import {
  NodeLlamaCppProvider,
  disposeNodeLlamaCppModels
} from "../../src/providers/node-llama-cpp-provider.js";

const fakeModel = () => ({
  createContext: async () => ({
    getSequence: () => ({}),
    dispose: async () => {}
  }),
  createEmbeddingContext: async () => ({
    getEmbeddingFor: async () => ({ vector: [1, 2] }),
    dispose: async () => {}
  }),
  dispose: disposeModel
});

beforeEach(async () => {
  await disposeNodeLlamaCppModels();
  loadModel.mockReset();
  disposeModel.mockClear();
  promptOptions.length = 0;
  capturedHistories.length = 0;
});

describe("NodeLlamaCppProvider model cache", () => {
  it("loads a model once across provider instances", async () => {
    loadModel.mockImplementation(async () => fakeModel());
    for (let i = 0; i < 3; i++) {
      const provider = new NodeLlamaCppProvider();
      await provider.generateMessage({
        messages: [{ role: "user", content: "hi" }],
        model: "/models/a.gguf"
      });
    }
    expect(loadModel).toHaveBeenCalledTimes(1);
  });

  it("shares one load between concurrent first uses", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    loadModel.mockImplementation(async () => {
      await gate;
      return fakeModel();
    });
    const provider = new NodeLlamaCppProvider();
    const runs = [
      provider.generateMessage({
        messages: [{ role: "user", content: "a" }],
        model: "/models/a.gguf"
      }),
      new NodeLlamaCppProvider().generateEmbedding({
        text: "b",
        model: "/models/a.gguf"
      })
    ];
    await new Promise((resolve) => setTimeout(resolve, 10));
    release();
    await Promise.all(runs);
    expect(loadModel).toHaveBeenCalledTimes(1);
  });

  it("retries a load that failed instead of caching the failure", async () => {
    loadModel
      .mockImplementationOnce(async () => {
        throw new Error("out of memory");
      })
      .mockImplementation(async () => fakeModel());
    const provider = new NodeLlamaCppProvider();
    const args = {
      messages: [{ role: "user" as const, content: "hi" }],
      model: "/models/a.gguf"
    };
    await expect(provider.generateMessage(args)).rejects.toThrow(/out of memory/);
    await expect(provider.generateMessage(args)).resolves.toMatchObject({
      content: "ok"
    });
    expect(loadModel).toHaveBeenCalledTimes(2);
  });

  it("disposes loaded models on disposeNodeLlamaCppModels", async () => {
    loadModel.mockImplementation(async () => fakeModel());
    await new NodeLlamaCppProvider().generateEmbedding({
      text: "x",
      model: "/models/a.gguf"
    });
    await disposeNodeLlamaCppModels();
    expect(disposeModel).toHaveBeenCalledTimes(1);
  });
});

describe("NodeLlamaCppProvider generation", () => {
  it("defaults the output cap to 8192 tokens, not 1024", async () => {
    loadModel.mockImplementation(async () => fakeModel());
    await new NodeLlamaCppProvider().generateMessage({
      messages: [{ role: "user", content: "hi" }],
      model: "/models/a.gguf"
    });
    expect(promptOptions[0]?.maxTokens).toBe(8192);
  });

  it("mints a distinct call id in every round", async () => {
    loadModel.mockImplementation(async () => fakeModel());
    const provider = new NodeLlamaCppProvider();
    const tools = [{ name: "lookup", inputSchema: { type: "object" } }];
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const message = await provider.generateMessage({
        messages: [{ role: "user", content: "hi" }],
        model: "/models/a.gguf",
        tools
      });
      ids.push(...(message.toolCalls ?? []).map((tc) => tc.id));
    }
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("pairs replayed calls with the results of their own round", async () => {
    loadModel.mockImplementation(async () => fakeModel());
    // History persisted before ids were unique: both rounds used `call_1`.
    await new NodeLlamaCppProvider().generateMessage({
      messages: [
        { role: "user", content: "search" },
        {
          role: "assistant",
          content: null,
          toolCalls: [{ id: "call_1", name: "search", args: { q: "a" } }]
        },
        { role: "tool", toolCallId: "call_1", content: "R1" },
        {
          role: "assistant",
          content: null,
          toolCalls: [{ id: "call_1", name: "search", args: { q: "b" } }]
        },
        { role: "tool", toolCallId: "call_1", content: "R2" }
      ],
      model: "/models/a.gguf"
    });
    const results = (capturedHistories[0] as Array<{
      type: string;
      response?: Array<{ result?: unknown }>;
    }>)
      .filter((item) => item.type === "model")
      .map((item) => item.response?.[0]?.result);
    expect(results).toEqual(["R1", "R2"]);
  });
});
