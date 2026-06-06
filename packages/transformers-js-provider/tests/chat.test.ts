import { afterEach, describe, expect, it, vi } from "vitest";

const { fakePipeline, loadTransformers } = vi.hoisted(() => ({
  fakePipeline: vi.fn(),
  loadTransformers: vi.fn(async () => ({
    TextStreamer: class {
      cb?: (t: string) => void;
      constructor(
        _tokenizer: unknown,
        opts: { callback_function?: (t: string) => void }
      ) {
        this.cb = opts.callback_function;
      }
    }
  }))
}));

vi.mock("@nodetool-ai/transformers-js-nodes", () => ({
  getPipeline: vi.fn(async () => fakePipeline),
  loadTransformers
}));

import { generateMessage, generateMessages, normalizeMessages } from "../src/chat.js";

afterEach(() => {
  fakePipeline.mockReset();
  loadTransformers.mockClear();
});

describe("normalizeMessages", () => {
  it("drops tool messages and stringifies multimodal text content", () => {
    const out = normalizeMessages([
      { role: "system", content: "you are helpful" },
      { role: "user", content: [{ type: "text", text: "hi" }] },
      { role: "tool", content: "ignored" },
      { role: "assistant", content: "hello" }
    ]);
    expect(out).toEqual([
      { role: "system", content: "you are helpful" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" }
    ]);
  });
});

describe("generateMessage", () => {
  it("extracts assistant text from chat-array generated_text", async () => {
    fakePipeline.mockResolvedValue([
      {
        generated_text: [
          { role: "user", content: "hi" },
          { role: "assistant", content: "hello there" }
        ]
      }
    ]);
    const message = await generateMessage({
      messages: [{ role: "user", content: "hi" }],
      model: "fake-model"
    });
    expect(message).toEqual({ role: "assistant", content: "hello there" });
  });

  it("throws AbortError when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      generateMessage({
        messages: [{ role: "user", content: "hi" }],
        model: "fake-model",
        signal: controller.signal
      })
    ).rejects.toThrow(/abort/i);
  });

  it("ignores tools without throwing", async () => {
    fakePipeline.mockResolvedValue([
      { generated_text: [{ role: "assistant", content: "ok" }] }
    ]);
    const message = await generateMessage({
      messages: [{ role: "user", content: "hi" }],
      model: "fake-model",
      tools: [{ name: "some_tool", inputSchema: { type: "object" } }]
    });
    expect(message.content).toBe("ok");
  });
});

describe("generateMessages", () => {
  it("yields tokens via the streamer callback then a done chunk", async () => {
    fakePipeline.mockImplementation(async (_msgs: unknown, opts: { streamer?: { cb?: (t: string) => void } }) => {
      const cb = opts.streamer?.cb;
      cb?.("Hello ");
      cb?.("world");
      return [{ generated_text: [{ role: "assistant", content: "Hello world" }] }];
    });
    // Pretend the pipeline has a tokenizer.
    Object.assign(fakePipeline, { tokenizer: {} });

    const chunks: string[] = [];
    let doneSeen = false;
    for await (const item of generateMessages({
      messages: [{ role: "user", content: "say hi" }],
      model: "fake-model"
    })) {
      if (item.type === "chunk") {
        if (item.done) doneSeen = true;
        else if (item.content) chunks.push(item.content);
      }
    }
    expect(chunks).toEqual(["Hello ", "world"]);
    expect(doneSeen).toBe(true);
  });

  it("passes stopping_criteria and interrupts generation on abort", async () => {
    let releaseGeneration: () => void = () => {};
    const generationDone = new Promise<void>((resolve) => {
      releaseGeneration = resolve;
    });
    const interrupt = vi.fn(() => releaseGeneration());

    // Expose an InterruptableStoppingCriteria for this run only.
    loadTransformers.mockImplementationOnce(async () => ({
      TextStreamer: class {
        cb?: (t: string) => void;
        constructor(
          _tokenizer: unknown,
          opts: { callback_function?: (t: string) => void }
        ) {
          this.cb = opts.callback_function;
        }
      },
      InterruptableStoppingCriteria: class {
        interrupt = interrupt;
      }
    }));

    fakePipeline.mockImplementation(
      async (
        _msgs: unknown,
        opts: {
          streamer?: { cb?: (t: string) => void };
          stopping_criteria?: { interrupt(): void };
        }
      ) => {
        expect(opts.stopping_criteria).toBeDefined();
        opts.streamer?.cb?.("tok");
        // Long-running generation that only ends once interrupted.
        await generationDone;
        return [{ generated_text: [{ role: "assistant", content: "tok" }] }];
      }
    );
    Object.assign(fakePipeline, { tokenizer: {} });

    const controller = new AbortController();
    const gen = generateMessages({
      messages: [{ role: "user", content: "hi" }],
      model: "fake-model",
      signal: controller.signal
    });

    const first = await gen.next();
    expect(first.value).toMatchObject({ content: "tok", done: false });

    controller.abort();
    await expect(gen.next()).rejects.toThrow(/abort/i);
    expect(interrupt).toHaveBeenCalledTimes(1);
  });
});
