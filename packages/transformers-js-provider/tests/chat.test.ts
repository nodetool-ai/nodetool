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

vi.mock("@nodetool-ai/transformers-js-nodes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@nodetool-ai/transformers-js-nodes")>()),
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

  it("renders the prompt itself with thinking off when the turn has no tools", async () => {
    const applyChatTemplate = vi.fn(() => "PROMPT");
    Object.assign(fakePipeline, { tokenizer: { apply_chat_template: applyChatTemplate } });
    fakePipeline.mockResolvedValue([{ generated_text: "hello" }]);
    const message = await generateMessage({
      messages: [{ role: "user", content: "hi" }],
      model: "fake-model"
    });
    expect(applyChatTemplate).toHaveBeenCalledWith(
      [{ role: "user", content: "hi" }],
      { tokenize: false, add_generation_prompt: true, enable_thinking: false }
    );
    expect(fakePipeline).toHaveBeenCalledWith(
      "PROMPT",
      expect.objectContaining({ add_special_tokens: false, return_full_text: false })
    );
    expect(message).toEqual({ role: "assistant", content: "hello" });
  });

  it("renders tools through a native template and returns the calls", async () => {
    const applyChatTemplate = vi.fn(() => "PROMPT");
    Object.assign(fakePipeline, {
      tokenizer: {
        apply_chat_template: applyChatTemplate,
        get_chat_template: () => "{% if tools %}{{ tools }}{% endif %}"
      }
    });
    fakePipeline.mockResolvedValue([
      {
        generated_text:
          'Let me check.\n<tool_call>\n{"name": "some_tool", "arguments": {"q": "x"}}\n</tool_call>'
      }
    ]);
    const message = await generateMessage({
      messages: [{ role: "user", content: "hi" }],
      model: "fake-model",
      tools: [{ name: "some_tool", inputSchema: { type: "object" } }]
    });

    expect(applyChatTemplate.mock.calls[0][1]).toMatchObject({
      tools: [{ type: "function", function: { name: "some_tool" } }],
      add_generation_prompt: true
    });
    expect(fakePipeline).toHaveBeenCalledWith(
      "PROMPT",
      expect.objectContaining({ add_special_tokens: false, return_full_text: false })
    );
    expect(message.content).toBe("Let me check.");
    expect(message.toolCalls).toMatchObject([{ name: "some_tool", args: { q: "x" } }]);
  });

  it("puts the tools in the system prompt for a template without tool support", async () => {
    const applyChatTemplate = vi.fn((_messages: unknown, _opts: unknown) => "PROMPT");
    Object.assign(fakePipeline, {
      tokenizer: {
        apply_chat_template: applyChatTemplate,
        get_chat_template: () => "{{ message['content'] }}"
      }
    });
    fakePipeline.mockResolvedValue([{ generated_text: "Hello." }]);
    const message = await generateMessage({
      messages: [{ role: "user", content: "hi" }],
      model: "fake-model",
      tools: [{ name: "some_tool", inputSchema: { type: "object" } }]
    });

    const [messages, opts] = applyChatTemplate.mock.calls[0] as [
      Array<{ role: string; content: string }>,
      Record<string, unknown>
    ];
    expect(opts.tools).toBeUndefined();
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("<tools>");
    expect(message).toEqual({ role: "assistant", content: "Hello." });
  });
});

describe("generateMessage with a strict template", () => {
  it("retries with user-role tool results when the template rejects the tool role", async () => {
    const applyChatTemplate = vi.fn((messages: Array<{ role: string }>) => {
      if (messages.some((m) => m.role === "tool")) {
        throw new Error("Conversation roles must alternate user/assistant");
      }
      return "PROMPT";
    });
    Object.assign(fakePipeline, {
      tokenizer: { apply_chat_template: applyChatTemplate, get_chat_template: () => "" }
    });
    fakePipeline.mockResolvedValue([{ generated_text: "Sunny." }]);
    const message = await generateMessage({
      messages: [
        { role: "user", content: "weather?" },
        { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "some_tool", args: {} }] },
        { role: "tool", toolCallId: "c1", content: "sunny" }
      ],
      model: "fake-model",
      tools: [{ name: "some_tool", inputSchema: { type: "object" } }]
    });
    expect(applyChatTemplate).toHaveBeenCalledTimes(2);
    expect(message.content).toBe("Sunny.");
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
    Object.assign(fakePipeline, { tokenizer: { apply_chat_template: () => "PROMPT" } });

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

  it("streams the text before a tool call and yields the call, not its JSON", async () => {
    fakePipeline.mockImplementation(
      async (_prompt: unknown, opts: { streamer?: { cb?: (t: string) => void } }) => {
        for (const token of ["On it.", " <tool", '_call>{"name": "some_tool", ', '"arguments": {}}']) {
          opts.streamer?.cb?.(token);
        }
        return [{ generated_text: "" }];
      }
    );
    Object.assign(fakePipeline, {
      tokenizer: {
        apply_chat_template: () => "PROMPT",
        get_chat_template: () => "{{ tools }}"
      }
    });

    const text: string[] = [];
    const calls: string[] = [];
    for await (const item of generateMessages({
      messages: [{ role: "user", content: "go" }],
      model: "fake-model",
      tools: [{ name: "some_tool", inputSchema: { type: "object" } }]
    })) {
      if ("type" in item && item.type === "chunk") {
        if (item.content) text.push(item.content);
      } else if ("name" in item) {
        calls.push(item.name);
      }
    }
    expect(text.join("")).toBe("On it. ");
    expect(calls).toEqual(["some_tool"]);
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
    Object.assign(fakePipeline, { tokenizer: { apply_chat_template: () => "PROMPT" } });

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

describe("TeapotLLM chat", () => {
  it("passes context and question as plain text with encoder special tokens enabled", async () => {
    const applyChatTemplate = vi.fn(() => { throw new Error("No chat template"); });
    Object.assign(fakePipeline, { tokenizer: { apply_chat_template: applyChatTemplate } });
    fakePipeline.mockResolvedValue([{ generated_text: "330 meters." }]);
    const result = await generateMessage({
      model: "teapotai/teapotllm",
      messages: [
        { role: "system", content: "The Eiffel Tower is 330 meters tall." },
        { role: "user", content: "How tall is it?" }
      ]
    });
    expect(result.content).toBe("330 meters.");
    expect(applyChatTemplate).not.toHaveBeenCalled();
    expect(fakePipeline).toHaveBeenCalledWith(
      "The Eiffel Tower is 330 meters tall.\n\nHow tall is it?",
      { max_new_tokens: 512, do_sample: false }
    );
  });

  it("rejects tools that text-to-text models cannot execute", async () => {
    await expect(generateMessage({
      model: "teapotai/teapotllm",
      messages: [{ role: "user", content: "Search for it." }],
      tools: [{ name: "search", description: "Search", inputSchema: { type: "object", properties: {} } }]
    })).rejects.toThrow("Text-to-text models do not support chat tool calls.");
    expect(fakePipeline).not.toHaveBeenCalled();
  });

  it("streams text-to-text output without applying a chat template", async () => {
    Object.assign(fakePipeline, { tokenizer: {} });
    fakePipeline.mockImplementation(async (_input, options) => {
      options.streamer.cb("330 meters.");
      return [{ generated_text: "330 meters." }];
    });
    const items = [];
    for await (const item of generateMessages({
      model: "teapotai/teapotllm",
      messages: [{ role: "user", content: "How tall is it?" }]
    })) {
      items.push(item);
    }
    expect(items).toEqual([
      { type: "chunk", content_type: "text", content: "330 meters.", done: false },
      { type: "chunk", content_type: "text", content: "", done: true }
    ]);
  });
});
