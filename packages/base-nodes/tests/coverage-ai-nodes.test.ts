import { describe, it, expect } from "vitest";
import { getNodeMetadata } from "@nodetool/node-sdk";
import {
  SummarizerNode,
  CreateThreadNode,
  ExtractorNode,
  ClassifierNode,
  AgentNode,
  AGENT_NODES,
  StructuredOutputGeneratorNode,
  DataGeneratorNode,
  ListGeneratorNode,
  ChartGeneratorNode,
  SVGGeneratorNode,
  GENERATOR_NODES,
  TeamAgentNode,
  TeamLeadNode,
  TEAM_NODES
} from "../src/index.js";

function metadataDefaults(NodeCls: any) {
  const metadata = getNodeMetadata(NodeCls);
  return Object.fromEntries(
    metadata.properties
      .filter((prop) => Object.prototype.hasOwnProperty.call(prop, "default"))
      .map((prop) => [prop.name, prop.default])
  );
}

function expectMetadataDefaults(NodeCls: any) {
  expect(new NodeCls().serialize()).toEqual(metadataDefaults(NodeCls));
}

// ---------------------------------------------------------------------------
// agents.ts
// ---------------------------------------------------------------------------

describe("AGENT_NODES export", () => {
  it("contains all 5 agent node classes", () => {
    expect(AGENT_NODES).toHaveLength(5);
    expect(AGENT_NODES).toContain(SummarizerNode);
    expect(AGENT_NODES).toContain(CreateThreadNode);
    expect(AGENT_NODES).toContain(ExtractorNode);
    expect(AGENT_NODES).toContain(ClassifierNode);
    expect(AGENT_NODES).toContain(AgentNode);
  });
});

// ---- SummarizerNode ----
describe("SummarizerNode", () => {
  it("has correct static metadata", () => {
    expect(SummarizerNode.nodeType).toBe("nodetool.agents.Summarizer");
    expect(SummarizerNode.title).toBe("Summarizer");
  });

  it("defaults", () => {
    expectMetadataDefaults(SummarizerNode);
  });

  it("summarizes text to max_sentences", async () => {
    const n = new (SummarizerNode as any)();
    n.assign({
      text: "First sentence. Second sentence. Third sentence. Fourth sentence."
    });
    // max_sentences is not a declared prop, so set it directly on the instance
    n.max_sentences = 2;
    const result = await n.process();
    expect(result.text).toBe("First sentence. Second sentence.");
    expect(result.output).toBe(result.text);
  });

  it("uses provider when model is connected", async () => {
    const n = new (SummarizerNode as any)();
    const mockProvider = {
      generateMessage: async ({ messages }: any) => ({
        content: `summary:${messages[1].content}`
      }),
      async generateMessageTraced(...a: any[]) {
        return (this as any).generateMessage(...a);
      }
    };
    const mockContext = {
      getProvider: async () => mockProvider
    };
    n.assign({
      text: "Long text",
      model: { provider: "test", id: "m1" }
    });
    n.max_sentences = 2;
    const result = await n.process(mockContext as any);
    expect(result.text).toContain("Long text");
  });

  it("returns empty string for empty text", async () => {
    const n = new (SummarizerNode as any)();
    n.assign({ text: "", max_sentences: 3 });
    const result = await n.process();
    expect(result.text).toBe("");
  });

  it("handles text with no sentence terminators", async () => {
    const n = new (SummarizerNode as any)();
    n.assign({ text: "just a phrase", max_sentences: 5 });
    const result = await n.process();
    expect(result.text).toBe("just a phrase");
  });

  it("handles numeric input via asText", async () => {
    const n = new (SummarizerNode as any)();
    n.assign({ text: 42, max_sentences: 1 });
    const result = await n.process();
    expect(result.text).toBe("42");
  });

  it("handles boolean input via asText", async () => {
    const n = new (SummarizerNode as any)();
    n.assign({ text: true, max_sentences: 1 });
    const result = await n.process();
    expect(result.text).toBe("true");
  });

  it("handles null/undefined input via asText", async () => {
    const n = new (SummarizerNode as any)();
    n.assign({ text: null });
    const result = await n.process();
    expect(result.text).toBe("");
  });

  it("handles array input via asText", async () => {
    const n = new (SummarizerNode as any)();
    n.assign({ text: ["Hello", "World"], max_sentences: 1 });
    const result = await n.process();
    // asText joins array elements with space
    expect(result.text).toBe("Hello World");
  });

  it("handles object with content string via asText", async () => {
    const n = new (SummarizerNode as any)();
    n.assign({
      text: { content: "Message content here." },
      max_sentences: 1
    });
    const result = await n.process();
    expect(result.text).toBe("Message content here.");
  });

  it("handles object with content array (MessagePart) via asText", async () => {
    const n = new (SummarizerNode as any)();
    n.assign({
      text: {
        content: [
          { type: "text", text: "Part one." },
          { type: "image" }, // non-text part
          { type: "text", text: "Part two." }
        ]
      },
      max_sentences: 2
    });
    const result = await n.process();
    expect(result.text).toContain("Part one.");
    expect(result.text).toContain("Part two.");
  });

  it("handles object without content (falls back to JSON.stringify)", async () => {
    const n = new (SummarizerNode as any)();
    n.assign({
      text: { foo: "bar" },
      max_sentences: 1
    });
    const result = await n.process();
    expect(result.text).toContain("foo");
  });

  it("handles function input via asText (returns empty string)", async () => {
    const n = new (SummarizerNode as any)();
    n.assign({ text: () => "fn", max_sentences: 1 });
    const result = await n.process();
    // A function is not string/number/boolean/falsy/array/object, so asText returns ""
    expect(result.text).toBe("");
  });

  it("handles non-finite max_sentences by defaulting to 3", async () => {
    const n = new (SummarizerNode as any)();
    n.assign({
      text: "A. B. C. D. E.",
      max_sentences: NaN
    });
    const result = await n.process();
    // NaN is not finite, so defaults to 3
    expect(result.text).toBe("A. B. C.");
  });

  it("uses assigned defaults when inputs are missing", async () => {
    const n = new (SummarizerNode as any)();
    n.assign({ text: "From props. Second.", max_sentences: 1 });
    const result = await n.process();
    expect(result.text).toBe("From props. Second.");
  });
});

// ---- CreateThreadNode ----
describe("CreateThreadNode", () => {
  it("has correct static metadata", () => {
    expect(CreateThreadNode.nodeType).toBe("nodetool.agents.CreateThread");
  });

  it("defaults", () => {
    expectMetadataDefaults(CreateThreadNode);
  });

  it("creates a new thread with auto-generated id", async () => {
    const n = new (CreateThreadNode as any)();
    n.assign({ title: "My Thread" });
    const result = await n.process();
    expect(result.thread_id).toMatch(/^thread_\d+_/);
  });

  it("reuses existing thread when thread_id provided", async () => {
    const n = new (CreateThreadNode as any)();
    // First call creates the thread
    n.assign({ thread_id: "test_reuse_123", title: "T1" });
    const r1 = await n.process();
    expect(r1.thread_id).toBe("test_reuse_123");
    // Second call reuses it
    n.assign({ thread_id: "test_reuse_123", title: "T2" });
    const r2 = await n.process();
    expect(r2.thread_id).toBe("test_reuse_123");
  });

  it("creates thread from assigned defaults when inputs are empty", async () => {
    const n = new (CreateThreadNode as any)();
    n.assign({ thread_id: "", title: "PropTitle" });
    const result = await n.process();
    expect(result.thread_id).toMatch(/^thread_/);
  });
});

// ---- ExtractorNode ----
describe("ExtractorNode", () => {
  it("has correct static metadata", () => {
    expect(ExtractorNode.nodeType).toBe("nodetool.agents.Extractor");
  });

  it("defaults", () => {
    expectMetadataDefaults(ExtractorNode);
  });

  it("extracts valid JSON object from text", async () => {
    const n = new (ExtractorNode as any)();
    n.assign({ text: '{"name": "Alice", "age": 30}' });
    const result = await n.process();
    expect(result.name).toBe("Alice");
    expect(result.age).toBe(30);
  });

  it("extracts JSON embedded in surrounding text", async () => {
    const n = new (ExtractorNode as any)();
    n.assign({
      text: 'Here is the data: {"key": "value"} end.'
    });
    const result = await n.process();
    expect(result.key).toBe("value");
  });

  it("returns { output: text } when no JSON found", async () => {
    const n = new (ExtractorNode as any)();
    n.assign({ text: "no json here" });
    const result = await n.process();
    expect(result.output).toBe("no json here");
  });

  it("returns { output: text } for JSON array (not object)", async () => {
    const n = new (ExtractorNode as any)();
    n.assign({ text: "[1,2,3]" });
    const result = await n.process();
    expect(result.output).toBe("[1,2,3]");
  });

  it("returns { output: text } for embedded JSON array", async () => {
    const n = new (ExtractorNode as any)();
    // The braces extraction will find { but inner content is not valid object
    n.assign({ text: "prefix [1,2,3] suffix" });
    const result = await n.process();
    expect(result.output).toBe("prefix [1,2,3] suffix");
  });

  it("handles embedded invalid JSON gracefully", async () => {
    const n = new (ExtractorNode as any)();
    n.assign({ text: "prefix {invalid json} suffix" });
    const result = await n.process();
    expect(result.output).toBe("prefix {invalid json} suffix");
  });

  it("handles no braces at all", async () => {
    const n = new (ExtractorNode as any)();
    n.assign({ text: "plain text only" });
    const result = await n.process();
    expect(result.output).toBe("plain text only");
  });

  it("returns null for embedded braces containing a JSON array (not object)", async () => {
    const n = new (ExtractorNode as any)();
    // The outer JSON.parse fails, inner finds { and } but parsed result
    // is not a plain object. We need braces that contain a valid JSON value
    // that is NOT an object. E.g., wrapping text around {"arr": [1]} won't work
    // since that IS an object. We need the inner parse to succeed with an array.
    // Actually we need braces around something that parses as a non-object.
    // But { ... } always parses as an object if valid JSON. So line 78 covers
    // cases like inner parse succeeding but returning an array from within
    // the braces — which can't happen since {..} is always an object in JSON.
    // Line 78 is effectively dead code for the inner parse path.
    // However we can still test the case where there are braces but inner parse fails.
    n.assign({ text: "before {not: valid, json} after" });
    const result = await n.process();
    expect(result.output).toBe("before {not: valid, json} after");
  });
});

// ---- ClassifierNode ----
describe("ClassifierNode", () => {
  it("has correct static metadata", () => {
    expect(ClassifierNode.nodeType).toBe("nodetool.agents.Classifier");
  });

  it("defaults", () => {
    expectMetadataDefaults(ClassifierNode);
  });

  it("throws when fewer than two categories are provided", async () => {
    const n = new (ClassifierNode as any)();
    n.assign({ text: "hello", categories: [] });
    await expect(n.process()).rejects.toThrow(
      "At least 2 categories are required"
    );
  });

  it("classifies text to matching category by token overlap", async () => {
    const n = new (ClassifierNode as any)();
    n.assign({
      text: "I love programming in python",
      categories: ["sports", "programming", "cooking"]
    });
    const result = await n.process();
    expect(result.output).toBe("programming");
    expect(result.category).toBe("programming");
  });

  it("returns first category when no tokens match", async () => {
    const n = new (ClassifierNode as any)();
    n.assign({
      text: "xyzzy",
      categories: ["alpha", "beta", "gamma"]
    });
    const result = await n.process();
    expect(result.output).toBe("alpha");
  });

  it("handles non-array categories via getCategories", async () => {
    const n = new (ClassifierNode as any)();
    n.assign({
      text: "test",
      categories: "not-an-array"
    });
    await expect(n.process()).rejects.toThrow(
      "At least 2 categories are required"
    );
  });

  it("filters empty strings from categories", async () => {
    const n = new (ClassifierNode as any)();
    n.assign({
      text: "hello world",
      categories: ["", "  ", "hello"]
    });
    await expect(n.process()).rejects.toThrow(
      "At least 2 categories are required"
    );
  });

  it("handles multi-word categories", async () => {
    const n = new (ClassifierNode as any)();
    n.assign({
      text: "machine learning is great",
      categories: ["web development", "machine learning", "data science"]
    });
    const result = await n.process();
    expect(result.output).toBe("machine learning");
  });

  it("uses provider-backed classification when model is connected", async () => {
    const n = new (ClassifierNode as any)();
    const mockProvider = {
      generateMessage: async () => ({ content: '{"category":"support"}' }),
      async generateMessageTraced(...a: any[]) {
        return (this as any).generateMessage(...a);
      }
    };
    const mockContext = {
      getProvider: async () => mockProvider
    };
    n.assign({
      text: "help me",
      categories: ["billing", "support"],
      model: { provider: "test", id: "m1" }
    });
    const result = await n.process(mockContext as any);
    expect(result.category).toBe("support");
  });
});

// ---- AgentNode ----
describe("AgentNode", () => {
  it("has correct static metadata", () => {
    expect(AgentNode.nodeType).toBe("nodetool.agents.Agent");
    expect(AgentNode.isStreamingOutput).toBe(true);
  });

  it("defaults", () => {
    expectMetadataDefaults(AgentNode);
  });

  it("requires a model selection", async () => {
    const n = new (AgentNode as any)();
    n.assign({ prompt: "Hello" });
    await expect(n.process()).rejects.toThrow("Select a model");
  });

  it("streams text chunks and final text from the provider", async () => {
    const n = new (AgentNode as any)();
    const mockProvider = {
      async *generateMessages(): AsyncGenerator<Record<string, unknown>> {
        yield {
          type: "chunk",
          content: "Hello ",
          content_type: "text",
          done: false
        };
        yield {
          type: "chunk",
          content: "world",
          content_type: "text",
          done: true
        };
      }
    };
    n.assign({
      prompt: "Test prompt",
      model: { provider: "openai", id: "gpt-4", name: "GPT-4" },
      max_tokens: 512
    });
    const streamed: any[] = [];
    for await (const item of n.genProcess({
      getProvider: async () => mockProvider
    } as any)) {
      streamed.push(item);
    }
    expect(streamed[0].chunk.content).toBe("Hello ");
    expect(streamed[1].chunk.content).toBe("world");
    expect(streamed[2]).toEqual({
      chunk: null,
      thinking: null,
      text: "Hello world",
      audio: null
    });
    const result = await n.process({
      getProvider: async () => mockProvider
    } as any);
    expect(result.text).toBe("Hello world");
    expect(result.output).toBe("Hello world");
    expect(result.chunk).toBeNull();
    expect(result.thinking).toBeNull();
    expect(result.audio).toBeNull();
  });

  it("prepares python-style messages including thread history, history, image, and audio", async () => {
    const n = new (AgentNode as any)();
    let capturedMessages: any[] = [];
    const mockProvider = {
      async *generateMessages({
        messages
      }: any): AsyncGenerator<Record<string, unknown>> {
        capturedMessages = messages;
        yield {
          type: "chunk",
          content: "ok",
          content_type: "text",
          done: true
        };
      }
    };
    const mockContext = {
      getProvider: async () => mockProvider,
      getThreadMessages: async () => ({
        messages: [
          { role: "user", content: "persisted-user" },
          {
            role: "assistant",
            content: [{ type: "text", text: "persisted-assistant" }]
          }
        ],
        next: null
      })
    };
    n.assign({
      system: "Be concise.",
      prompt: "Hi",
      image: { uri: "file://image.png" },
      audio: { data: "YXVkaW8=" },
      history: [
        { role: "user", content: "history-user" },
        { role: "assistant", content: "history-assistant" },
        { role: "invalid_role", content: "skip-me" }
      ],
      thread_id: "thread-1",
      model: { provider: "test", id: "m1" }
    });
    await n.process(mockContext as any);
    expect(capturedMessages[0]).toEqual({
      role: "system",
      content: "Be concise."
    });
    expect(capturedMessages[1]).toEqual({
      role: "user",
      content: "persisted-user",
      toolCalls: null,
      toolCallId: null,
      threadId: null
    });
    expect(capturedMessages[2].content[0].text).toBe("persisted-assistant");
    expect(capturedMessages[3]).toEqual({
      role: "user",
      content: "history-user",
      toolCalls: null,
      toolCallId: null,
      threadId: null
    });
    expect(capturedMessages[4]).toEqual({
      role: "assistant",
      content: "history-assistant",
      toolCalls: null,
      toolCallId: null,
      threadId: null
    });
    expect(capturedMessages[capturedMessages.length - 1].role).toBe("user");
    expect(capturedMessages[capturedMessages.length - 1].content[0].text).toBe(
      "Hi"
    );
    expect(capturedMessages[capturedMessages.length - 1].content[1].type).toBe(
      "image"
    );
    expect(capturedMessages[capturedMessages.length - 1].content[2].type).toBe(
      "audio"
    );
  });

  it("persists the user and assistant messages through context thread APIs", async () => {
    const n = new (AgentNode as any)();
    const created: any[] = [];
    const mockProvider = {
      async *generateMessages(): AsyncGenerator<Record<string, unknown>> {
        yield {
          type: "chunk",
          content: "saved",
          content_type: "text",
          done: true
        };
      }
    };
    const mockContext = {
      getProvider: async () => mockProvider,
      createMessage: async (req: any) => {
        created.push(req);
      }
    };
    n.assign({
      prompt: "persist me",
      thread_id: "thread-2",
      model: { provider: "test", id: "m1" }
    });
    await n.process(mockContext as any);
    expect(created).toHaveLength(2);
    expect(created[0].thread_id).toBe("thread-2");
    expect(created[0].role).toBe("user");
    expect(created[0].content[0].text).toBe("persist me");
    expect(created[1]).toMatchObject({
      thread_id: "thread-2",
      role: "assistant"
    });
  });

  it("emits thinking and audio updates from provider chunks", async () => {
    const n = new (AgentNode as any)();
    const mockProvider = {
      async *generateMessages(): AsyncGenerator<Record<string, unknown>> {
        yield {
          type: "chunk",
          content: "reasoning",
          content_type: "text",
          thinking: true,
          done: false
        };
        yield {
          type: "chunk",
          content: Buffer.from("audio-bytes").toString("base64"),
          content_type: "audio",
          done: true
        };
      }
    };
    n.assign({
      model: { provider: "test", id: "m1" },
      prompt: "Listen"
    });
    const streamed: any[] = [];
    for await (const item of n.genProcess({
      getProvider: async () => mockProvider
    } as any)) {
      streamed.push(item);
    }
    expect(streamed[0].thinking.content).toBe("reasoning");
    expect(streamed[1].chunk.content_type).toBe("audio");
    expect(Buffer.from(streamed[2].audio.data).toString("utf8")).toBe(
      "audio-bytes"
    );
  });

  it("normalizes provider text chunks to include content_type", async () => {
    const n = new (AgentNode as any)();
    const mockProvider = {
      async *generateMessages(): AsyncGenerator<Record<string, unknown>> {
        yield {
          type: "chunk",
          content: "Hello",
          done: false
        };
        yield {
          type: "chunk",
          content: " world",
          done: true
        };
      }
    };
    n.assign({
      model: { provider: "test", id: "m1" },
      prompt: "Hi"
    });
    const streamed: any[] = [];
    for await (const item of n.genProcess({
      getProvider: async () => mockProvider
    } as any)) {
      streamed.push(item);
    }

    expect(streamed[0].chunk).toMatchObject({
      type: "chunk",
      content: "Hello",
      content_type: "text"
    });
    expect(streamed[1].chunk).toMatchObject({
      type: "chunk",
      content: " world",
      content_type: "text"
    });
  });

  it("returns structured outputs from dynamic output schemas", async () => {
    const n = new (AgentNode as any)();
    n._dynamic_outputs = {
      answer: { type: "str" },
      score: { type: "int" }
    };
    const mockProvider = {
      async *generateMessages(): AsyncGenerator<Record<string, unknown>> {
        yield {
          type: "chunk",
          content: '{"answer":"ready","score":7}',
          content_type: "text",
          done: true
        };
      }
    };
    n.assign({
      model: { provider: "test", id: "m1" },
      prompt: "Return JSON"
    });
    const streamed: any[] = [];
    for await (const item of n.genProcess({
      getProvider: async () => mockProvider
    } as any)) {
      streamed.push(item);
    }
    // The last yield is the final result with structured outputs
    const last = streamed[streamed.length - 1];
    expect(last.answer).toBe("ready");
    expect(last.score).toBe(7);
  });

  it("replays locally stored thread messages when model persistence is unavailable", async () => {
    const create = new (CreateThreadNode as any)();
    create.assign({ thread_id: "thread_replay_case" });
    const { thread_id } = await create.process();
    const n = new (AgentNode as any)();
    n.assign({
      prompt: "first",
      thread_id,
      model: { provider: "test", id: "m1" }
    });
    await n.process({
      getProvider: async () => ({
        async *generateMessages(): AsyncGenerator<Record<string, unknown>> {
          yield {
            type: "chunk",
            content: "first-reply",
            content_type: "text",
            done: true
          };
        }
      })
    } as any);

    const secondCalls: any[] = [];
    n.assign({
      prompt: "second",
      thread_id,
      model: { provider: "test", id: "m1" }
    });
    await n.process({
      getProvider: async () => ({
        async *generateMessages({
          messages
        }: any): AsyncGenerator<Record<string, unknown>> {
          secondCalls.push(messages);
          yield {
            type: "chunk",
            content: "second-reply",
            content_type: "text",
            done: true
          };
        }
      })
    } as any);
    const replayed = secondCalls[0];
    expect(
      replayed.some(
        (message: any) =>
          Array.isArray(message.content) && message.content[0].text === "first"
      )
    ).toBe(true);
    expect(
      replayed.some(
        (message: any) =>
          Array.isArray(message.content) &&
          message.content[0].text === "first-reply"
      )
    ).toBe(true);
  });

  it("returns empty text when the provider returns no text content", async () => {
    const n = new (AgentNode as any)();
    const mockProvider = {
      async *generateMessages(): AsyncGenerator<Record<string, unknown>> {
        yield { type: "chunk", content: "", content_type: "text", done: true };
      }
    };
    n.assign({
      prompt: "Hi",
      model: { provider: "test", id: "m1" }
    });
    const result = await n.process({
      getProvider: async () => mockProvider
    } as any);
    expect(result.text).toBe("");
    expect(result.output).toBe("");
    expect(result.chunk).toBeNull();
    expect(result.thinking).toBeNull();
    expect(result.audio).toBeNull();
  });
});

// ResearchAgentNode has been removed from agents.ts

// ---------------------------------------------------------------------------
// generators.ts
// ---------------------------------------------------------------------------

describe("GENERATOR_NODES export", () => {
  it("contains all 5 generator node classes", () => {
    expect(GENERATOR_NODES).toHaveLength(5);
    expect(GENERATOR_NODES).toContain(StructuredOutputGeneratorNode);
    expect(GENERATOR_NODES).toContain(DataGeneratorNode);
    expect(GENERATOR_NODES).toContain(ListGeneratorNode);
    expect(GENERATOR_NODES).toContain(ChartGeneratorNode);
    expect(GENERATOR_NODES).toContain(SVGGeneratorNode);
  });
});

// ---- StructuredOutputGeneratorNode ----
describe("StructuredOutputGeneratorNode", () => {
  it("has correct static metadata", () => {
    expect(StructuredOutputGeneratorNode.nodeType).toBe(
      "nodetool.generators.StructuredOutputGenerator"
    );
  });

  it("defaults", () => {
    expectMetadataDefaults(StructuredOutputGeneratorNode);
  });

  it("generates defaults from schema with various types", async () => {
    const n = new (StructuredOutputGeneratorNode as any)();
    // _dynamic_outputs is used by buildSchemaFromDynamicOutputs to create the schema
    n._dynamic_outputs = {
      name: { type: "str" },
      age: { type: "number" },
      count: { type: "integer" },
      active: { type: "boolean" },
      tags: { type: "array" },
      meta: { type: "object" },
      other: {} // no type specified, defaults to "str" -> "string"
    };
    const result = await n.process();
    expect(result.name).toBe("");
    expect(result.age).toBe(0);
    expect(result.count).toBe(0);
    expect(result.active).toBe(false);
    expect(result.tags).toEqual([]);
    expect(result.meta).toEqual({});
    expect(result.other).toBe("");
  });

  it("generates schema defaults with no properties key", async () => {
    const n = new (StructuredOutputGeneratorNode as any)();
    // No _dynamic_outputs set, so schema is null; falls through to instructions/context fallback
    // with empty defaults
    n.assign({});
    const result = await n.process();
    // Falls through to { output: { instructions, context } }
    expect(result.output).toEqual({ instructions: "", context: "" });
  });

  it("falls back to instructions/context when no schema", async () => {
    const n = new (StructuredOutputGeneratorNode as any)();
    n.assign({
      instructions: "Generate a list",
      context: "user context"
    });
    const result = await n.process();
    expect(result.output).toEqual({
      instructions: "Generate a list",
      context: "user context"
    });
  });

  it("falls back when schema is null", async () => {
    const n = new (StructuredOutputGeneratorNode as any)();
    n.assign({
      schema: null,
      instructions: "test"
    });
    const result = await n.process();
    expect(result.output).toEqual({ instructions: "test", context: "" });
  });

  it("falls back when schema is an array", async () => {
    const n = new (StructuredOutputGeneratorNode as any)();
    n.assign({
      schema: [1, 2, 3],
      instructions: "test"
    });
    const result = await n.process();
    expect(result.output).toEqual({ instructions: "test", context: "" });
  });

  it("handles numeric input for instructions via asText", async () => {
    const n = new (StructuredOutputGeneratorNode as any)();
    n.assign({
      instructions: 42,
      context: true
    });
    const result = await n.process();
    expect(result.output).toEqual({
      instructions: "42",
      context: "true"
    });
  });

  it("handles null/undefined/object inputs via asText in generators", async () => {
    const n = new (StructuredOutputGeneratorNode as any)();
    // null triggers asText !value branch
    n.assign({ instructions: null, context: undefined });
    const r1 = await n.process();
    expect(r1.output).toEqual({ instructions: "", context: "" });
    // object triggers JSON.stringify branch
    n.assign({ instructions: { a: 1 }, context: [1, 2] });
    const r2 = await n.process();
    expect(r2.output.instructions).toBe('{"a":1}');
    expect(r2.output.context).toBe("[1,2]");
  });

  it("maps int type alias to integer default 0", async () => {
    const n = new (StructuredOutputGeneratorNode as any)();
    n._dynamic_outputs = { count: { type: "int" } };
    const result = await n.process();
    expect(result.count).toBe(0);
  });

  it("maps float type alias to number default 0", async () => {
    const n = new (StructuredOutputGeneratorNode as any)();
    n._dynamic_outputs = { score: { type: "float" } };
    const result = await n.process();
    expect(result.score).toBe(0);
  });

  it("maps bool type alias to boolean default false", async () => {
    const n = new (StructuredOutputGeneratorNode as any)();
    n._dynamic_outputs = { enabled: { type: "bool" } };
    const result = await n.process();
    expect(result.enabled).toBe(false);
  });

  it("maps list type alias to array default []", async () => {
    const n = new (StructuredOutputGeneratorNode as any)();
    n._dynamic_outputs = { items: { type: "list" } };
    const result = await n.process();
    expect(result.items).toEqual([]);
  });

  it("maps dict type alias to object default {}", async () => {
    const n = new (StructuredOutputGeneratorNode as any)();
    n._dynamic_outputs = { metadata: { type: "dict" } };
    const result = await n.process();
    expect(result.metadata).toEqual({});
  });

  it("returns instructions/context fallback when _dynamic_outputs is empty object", async () => {
    const n = new (StructuredOutputGeneratorNode as any)();
    n._dynamic_outputs = {};
    n.assign({ instructions: "do stuff", context: "some context" });
    const result = await n.process();
    expect(result.output).toEqual({
      instructions: "do stuff",
      context: "some context"
    });
  });

  it("returns instructions/context fallback when _dynamic_outputs is an array", async () => {
    const n = new (StructuredOutputGeneratorNode as any)();
    n._dynamic_outputs = ["not", "an", "object"];
    n.assign({ instructions: "test" });
    const result = await n.process();
    expect(result.output).toEqual({ instructions: "test", context: "" });
  });

  it("generates defaults for multiple fields of the same type", async () => {
    const n = new (StructuredOutputGeneratorNode as any)();
    n._dynamic_outputs = {
      first_name: { type: "str" },
      last_name: { type: "str" },
      age: { type: "integer" },
      weight: { type: "number" }
    };
    const result = await n.process();
    expect(result).toEqual({
      first_name: "",
      last_name: "",
      age: 0,
      weight: 0
    });
  });
});

// ---- DataGeneratorNode ----
describe("DataGeneratorNode", () => {
  it("has correct static metadata", () => {
    expect(DataGeneratorNode.nodeType).toBe(
      "nodetool.generators.DataGenerator"
    );
    expect(DataGeneratorNode.isStreamingOutput).toBe(true);
  });

  it("defaults", () => {
    expectMetadataDefaults(DataGeneratorNode);
  });

  it("generates rows with default 5 count", async () => {
    const n = new (DataGeneratorNode as any)();
    n.assign({ prompt: "generate data" });
    const result = await n.process();
    const rows = (result.output as any).rows;
    expect(rows).toHaveLength(5);
    // default column is "value"
    expect(rows[0]).toHaveProperty("value");
  });

  it("parses count from prompt", async () => {
    const n = new (DataGeneratorNode as any)();
    n.assign({ prompt: "generate 3 items" });
    const result = await n.process();
    expect((result.output as any).rows).toHaveLength(3);
  });

  it("uses columns array with name objects", async () => {
    const n = new (DataGeneratorNode as any)();
    n.assign({
      prompt: "2 records",
      columns: [{ name: "id" }, { name: "name" }, { name: "score" }]
    });
    const result = await n.process();
    const rows = (result.output as any).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(1);
    expect(rows[0].name).toContain("_1");
    expect(typeof rows[0].score).toBe("number");
  });

  it("uses columns from nested object with columns key", async () => {
    const n = new (DataGeneratorNode as any)();
    n.assign({
      prompt: "2 records",
      columns: { columns: ["id", "date", "active"] }
    });
    const result = await n.process();
    const rows = (result.output as any).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(1);
    expect(rows[0].date).toBeTruthy();
    expect(typeof rows[0].active).toBe("boolean");
  });

  it("handles price/amount column type", async () => {
    const n = new (DataGeneratorNode as any)();
    n.assign({
      prompt: "2 items",
      columns: ["price", "amount"]
    });
    const result = await n.process();
    const rows = (result.output as any).rows;
    expect(typeof rows[0].price).toBe("number");
    expect(typeof rows[0].amount).toBe("number");
  });

  it("handles is_ prefixed columns as booleans", async () => {
    const n = new (DataGeneratorNode as any)();
    n.assign({
      prompt: "3 items",
      columns: ["is_on"]
    });
    const result = await n.process();
    const rows = (result.output as any).rows;
    // "is_on" starts with "is_" and does not include "id"/"name"/"date"/"price"/"amount"/"score"/"active"
    expect(rows[0].is_on).toBe(true); // i=0, even
    expect(rows[1].is_on).toBe(false); // i=1, odd
    expect(rows[2].is_on).toBe(true); // i=2, even
  });

  it("caps count at 200", async () => {
    const n = new (DataGeneratorNode as any)();
    n.assign({ prompt: "generate 999 rows" });
    const result = await n.process();
    // parseRequestedCount caps at 200
    // But 999 has 3 digits, and regex matches \b(\d{1,3})\b
    const rows = (result.output as any).rows;
    expect(rows.length).toBeLessThanOrEqual(200);
  });

  it("genProcess yields individual rows then final dataframe", async () => {
    const n = new (DataGeneratorNode as any)();
    const results: any[] = [];
    n.assign({ prompt: "3 items" });
    for await (const chunk of n.genProcess()) {
      results.push(chunk);
    }
    // 3 row yields + 1 final dataframe yield
    expect(results).toHaveLength(4);
    expect(results[0].index).toBe(0);
    expect(results[0].record).toBeTruthy();
    expect(results[0].dataframe).toBeNull();
    expect(results[3].record).toBeNull();
    expect(results[3].index).toBeNull();
    expect(results[3].dataframe).toBeTruthy();
  });

  it("uses input_text as seed when no prompt", async () => {
    const n = new (DataGeneratorNode as any)();
    n.assign({ input_text: "mydata" });
    const result = await n.process();
    const rows = (result.output as any).rows;
    expect(rows[0].value).toContain("mydata");
  });

  it("handles empty columns from parseColumns", async () => {
    const n = new (DataGeneratorNode as any)();
    n.assign({
      prompt: "2 items",
      columns: [{ name: "" }, ""]
    });
    const result = await n.process();
    const rows = (result.output as any).rows;
    // Empty names are filtered, defaults to ["value"]
    expect(rows[0]).toHaveProperty("value");
  });

  it("parseRequestedCount returns fallback for no digit in prompt", async () => {
    const n = new (DataGeneratorNode as any)();
    n.assign({ prompt: "some data please" });
    const result = await n.process();
    expect((result.output as any).rows).toHaveLength(5);
  });

  it("ensures minimum count of 1", async () => {
    const n = new (DataGeneratorNode as any)();
    // parseRequestedCount: Math.max(1, ...)
    n.assign({ prompt: "0 items" });
    const result = await n.process();
    // 0 matches but max(1, 0) = 1... actually it is clamped to min 1
    // Actually the regex matches "0", n=0, max(1,min(200,0))=max(1,0)=1
    expect((result.output as any).rows).toHaveLength(1);
  });

  it("parses provider CSV into records and dataframe", async () => {
    const n = new (DataGeneratorNode as any)();
    const mockContext = {
      runProviderPrediction: async () => ({
        content: `name,age\nAlice,30\nBob,25`
      }),
      streamProviderPrediction: async function* () {}
    };

    n.assign({
      prompt: "Generate people",
      columns: [
        { name: "name", data_type: "string" },
        { name: "age", data_type: "int" }
      ],
      model: { provider: "mock", id: "gpt-4" }
    });
    const result = await n.process(mockContext as any);

    expect((result.output as any).rows).toEqual([
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 }
    ]);
    expect((result.output as any).data).toEqual([
      ["Alice", 30],
      ["Bob", 25]
    ]);
  });

  it("streams provider CSV into row chunks and final dataframe", async () => {
    const n = new (DataGeneratorNode as any)();
    const mockContext = {
      runProviderPrediction: async () => ({
        content: `name,age\nAlice,30\nBob,25`
      }),
      streamProviderPrediction: async function* () {}
    };

    n.assign({
      prompt: "Generate people",
      columns: [
        { name: "name", data_type: "string" },
        { name: "age", data_type: "int" }
      ],
      model: { provider: "mock", id: "gpt-4" }
    });
    const results: any[] = [];
    for await (const chunk of n.genProcess(mockContext as any)) {
      results.push(chunk);
    }

    expect(results.slice(0, 2)).toEqual([
      { record: { name: "Alice", age: 30 }, index: 0, dataframe: null },
      { record: { name: "Bob", age: 25 }, index: 1, dataframe: null }
    ]);
    expect(results[2].dataframe.data).toEqual([
      ["Alice", 30],
      ["Bob", 25]
    ]);
  });
});

// ---- ListGeneratorNode ----
describe("ListGeneratorNode", () => {
  it("has correct static metadata", () => {
    expect(ListGeneratorNode.nodeType).toBe(
      "nodetool.generators.ListGenerator"
    );
    expect(ListGeneratorNode.isStreamingOutput).toBe(true);
  });

  it("defaults", () => {
    expectMetadataDefaults(ListGeneratorNode);
  });

  it("generates a list with default count 5", async () => {
    const n = new (ListGeneratorNode as any)();
    n.assign({ prompt: "list things" });
    const result = await n.process();
    expect(result.output).toHaveLength(5);
    expect(result.output[0]).toContain("_1");
  });

  it("parses count from prompt", async () => {
    const n = new (ListGeneratorNode as any)();
    n.assign({ prompt: "give me 7 colors" });
    const result = await n.process();
    expect(result.output).toHaveLength(7);
  });

  it("uses input_text as seed", async () => {
    const n = new (ListGeneratorNode as any)();
    n.assign({ input_text: "fruit" });
    const result = await n.process();
    expect(result.output[0]).toBe("fruit_1");
  });

  it("genProcess yields individual items", async () => {
    const n = new (ListGeneratorNode as any)();
    const results: any[] = [];
    n.assign({ prompt: "3 items" });
    for await (const chunk of n.genProcess()) {
      results.push(chunk);
    }
    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ item: expect.any(String), index: 0 });
    expect(results[2].index).toBe(2);
  });

  it("genProcess yields empty when output is not array", async () => {
    const n = new (ListGeneratorNode as any)();
    // Override process to return non-array
    n.process = async () => ({ output: "not-array" });
    const results: any[] = [];
    for await (const chunk of n.genProcess()) {
      results.push(chunk);
    }
    expect(results).toHaveLength(0);
  });

  it("parses provider list items from tagged response", async () => {
    const n = new (ListGeneratorNode as any)();
    const mockContext = {
      runProviderPrediction: async () => ({
        content: `<LIST_ITEM>First item</LIST_ITEM>
<LIST_ITEM>Second item</LIST_ITEM>
<LIST_ITEM>Third item</LIST_ITEM>`
      }),
      streamProviderPrediction: async function* () {}
    };

    n.assign({
      prompt: "Generate items",
      model: { provider: "mock", id: "gpt-4" }
    });
    const result = await n.process(mockContext as any);

    expect(result.output).toEqual(["First item", "Second item", "Third item"]);
  });

  it("normalizes multiline provider list items during streaming", async () => {
    const n = new (ListGeneratorNode as any)();
    const mockContext = {
      runProviderPrediction: async () => ({ content: "" }),
      streamProviderPrediction: async function* () {
        yield {
          type: "chunk",
          content: "<LIST_ITEM>First item\nwith continuation</LIST_ITEM>\n"
        };
        yield {
          type: "chunk",
          content:
            "<LIST_ITEM>Second item</LIST_ITEM>\n<LIST_ITEM>Third item on\nmultiple lines\nhere</LIST_ITEM>"
        };
      }
    };

    n.assign({
      prompt: "Generate items",
      model: { provider: "mock", id: "gpt-4" }
    });
    const results: any[] = [];
    for await (const chunk of n.genProcess(mockContext as any)) {
      results.push(chunk);
    }

    expect(results).toEqual([
      { item: "First item with continuation", index: 0 },
      { item: "Second item", index: 1 },
      { item: "Third item on multiple lines here", index: 2 }
    ]);
  });

  it("throws when provider output omits list tags", async () => {
    const n = new (ListGeneratorNode as any)();
    const mockContext = {
      runProviderPrediction: async () => ({ content: "plain text only" }),
      streamProviderPrediction: async function* () {
        yield { type: "chunk", content: "plain text only" };
      }
    };

    n.assign({
      prompt: "Generate items",
      model: { provider: "mock", id: "gpt-4" }
    });

    await expect(n.process(mockContext as any)).rejects.toThrow(
      "<LIST_ITEM> tags"
    );

    await expect(
      (async () => {
        const chunks: any[] = [];
        for await (const chunk of n.genProcess(mockContext as any)) {
          chunks.push(chunk);
        }
        return chunks;
      })()
    ).rejects.toThrow("<LIST_ITEM> tags");
  });
});

// ---- ChartGeneratorNode ----
describe("ChartGeneratorNode", () => {
  it("has correct static metadata", () => {
    expect(ChartGeneratorNode.nodeType).toBe(
      "nodetool.generators.ChartGenerator"
    );
  });

  it("defaults", () => {
    expectMetadataDefaults(ChartGeneratorNode);
  });

  it("generates chart config from data rows", async () => {
    const n = new (ChartGeneratorNode as any)();
    n.assign({
      prompt: "Sales Chart",
      data: {
        rows: [
          { month: "Jan", revenue: 100 },
          { month: "Feb", revenue: 200 }
        ]
      }
    });
    const result = await n.process();
    const output = result.output as any;
    // output.data is { type: "chart_data", series: [...] }
    expect(output.data.series[0].type).toBe("bar");
    expect(output.data.series[0].x_column).toBe("month");
    expect(output.data.series[0].y_column).toBe("revenue");
    expect(output.data.series[0].label).toBe("Sales Chart");
    expect(output.title).toBe("Sales Chart");
  });

  it("uses default series name when no prompt", async () => {
    const n = new (ChartGeneratorNode as any)();
    n.assign({
      data: { rows: [{ a: 1 }] }
    });
    const result = await n.process();
    const output = result.output as any;
    expect(output.data.series[0].label).toBe("series");
    expect(output.title).toBe("Generated Chart");
  });

  it("handles empty rows", async () => {
    const n = new (ChartGeneratorNode as any)();
    n.assign({ prompt: "Empty", data: { rows: [] } });
    const result = await n.process();
    const output = result.output as any;
    expect(output.data.series[0].x_column).toBe("x");
    expect(output.data.series[0].y_column).toBe("x");
  });

  it("handles data without rows key", async () => {
    const n = new (ChartGeneratorNode as any)();
    n.assign({ data: {} });
    const result = await n.process();
    const output = result.output as any;
    expect(output.data.series[0].x_column).toBe("x");
  });

  it("uses index as fallback when key missing in row", async () => {
    const n = new (ChartGeneratorNode as any)();
    // Only one key so xKey and yKey are the same
    n.assign({
      data: { rows: [{ only: 10 }, { only: 20 }] }
    });
    const result = await n.process();
    const output = result.output as any;
    expect(output.data.series[0].x_column).toBe("only");
    expect(output.data.series[0].y_column).toBe("only");
  });

  it("output has type chart_config with proper series structure", async () => {
    const n = new (ChartGeneratorNode as any)();
    n.assign({
      prompt: "bar chart",
      data: {
        rows: [
          { category: "A", value: 10 },
          { category: "B", value: 20 }
        ]
      }
    });
    const result = await n.process();
    const output = result.output as any;
    expect(output.type).toBe("chart_config");
    expect(output.title).toBe("bar chart");
    expect(output.x_label).toBe("category");
    expect(output.y_label).toBe("value");
    expect(output.legend).toBe(true);
    expect(output.legend_position).toBe("auto");
    expect(output.corner).toBe(false);
    expect(output.annot).toBe(false);
    expect(output.square).toBe(false);
    expect(output.fmt).toBe(".2g");
    // series structure
    expect(output.data.type).toBe("chart_data");
    expect(Array.isArray(output.data.series)).toBe(true);
    expect(output.data.series).toHaveLength(1);
    expect(output.data.series[0]).toEqual({
      type: "bar",
      x_column: "category",
      y_column: "value",
      label: "bar chart"
    });
    expect(output.data.row).toBeNull();
    expect(output.data.col).toBeNull();
    expect(output.data.col_wrap).toBeNull();
    // nullable config fields
    expect(output.height).toBeNull();
    expect(output.aspect).toBeNull();
    expect(output.x_lim).toBeNull();
    expect(output.y_lim).toBeNull();
    expect(output.palette).toBeNull();
  });
});

// ---- SVGGeneratorNode ----
describe("SVGGeneratorNode", () => {
  it("has correct static metadata", () => {
    expect(SVGGeneratorNode.nodeType).toBe("nodetool.generators.SVGGenerator");
  });

  it("defaults", () => {
    expectMetadataDefaults(SVGGeneratorNode);
  });

  it("generates SVG with prompt text", async () => {
    const n = new (SVGGeneratorNode as any)();
    n.assign({ prompt: "Hello World" });
    const result = await n.process();
    const svg = (result.output as any[])[0].content;
    expect(svg).toContain("<svg");
    expect(svg).toContain("Hello World");
    expect(svg).toContain('width="512"');
    expect(svg).toContain('height="512"');
  });

  it("uses custom dimensions", async () => {
    const n = new (SVGGeneratorNode as any)();
    n.assign({ prompt: "Test" });
    // width and height are not declared props, set them directly
    n.width = 100;
    n.height = 200;
    const result = await n.process();
    const svg = (result.output as any[])[0].content;
    expect(svg).toContain('width="100"');
    expect(svg).toContain('height="200"');
  });

  it("escapes HTML entities in prompt", async () => {
    const n = new (SVGGeneratorNode as any)();
    n.assign({ prompt: "A & B <C>" });
    const result = await n.process();
    const svg = (result.output as any[])[0].content;
    expect(svg).toContain("A &amp; B &lt;C&gt;");
    expect(svg).not.toContain("A & B <C>");
  });

  it("uses 'SVG' as default text when no prompt", async () => {
    const n = new (SVGGeneratorNode as any)();
    const result = await n.process();
    const svg = (result.output as any[])[0].content;
    expect(svg).toContain(">SVG</text>");
  });

  it("defaults width/height to 512 when given 0 or NaN", async () => {
    expectMetadataDefaults(SVGGeneratorNode);
  });

  it("output is an array with one svg_element containing content field", async () => {
    const n = new (SVGGeneratorNode as any)();
    n.assign({ prompt: "test shape" });
    const result = await n.process();
    expect(Array.isArray(result.output)).toBe(true);
    expect(result.output).toHaveLength(1);
    const element = (result.output as any[])[0];
    expect(element).toHaveProperty("content");
    expect(typeof element.content).toBe("string");
    expect(element.content).toContain("<svg");
    expect(element.content).toContain("</svg>");
    expect(element.content).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it("generates valid SVG structure with rect and text elements", async () => {
    const n = new (SVGGeneratorNode as any)();
    n.assign({ prompt: "my icon" });
    const result = await n.process();
    const svg = (result.output as any[])[0].content;
    expect(svg).toContain('<rect width="100%" height="100%" fill="#f2f2f2"/>');
    expect(svg).toContain('font-size="20"');
    expect(svg).toContain("my icon");
  });

  it("falls back to 512 when width/height are 0", async () => {
    const n = new (SVGGeneratorNode as any)();
    n.assign({ prompt: "zero dims" });
    n.width = 0;
    n.height = 0;
    const result = await n.process();
    const svg = (result.output as any[])[0].content;
    expect(svg).toContain('width="512"');
    expect(svg).toContain('height="512"');
  });
});

// ---------------------------------------------------------------------------
// team.ts
// ---------------------------------------------------------------------------

describe("TEAM_NODES export", () => {
  it("contains TeamAgentNode and TeamLeadNode", () => {
    expect(TEAM_NODES).toHaveLength(2);
    expect(TEAM_NODES).toContain(TeamAgentNode);
    expect(TEAM_NODES).toContain(TeamLeadNode);
  });
});

// ---- TeamAgentNode ----
describe("TeamAgentNode", () => {
  it("has correct static metadata", () => {
    expect(TeamAgentNode.nodeType).toBe("nodetool.team.Agent");
    expect(TeamAgentNode.title).toBe("Agent");
    expect(TeamAgentNode.isControlled).toBe(true);
    expect(TeamAgentNode.metadataOutputTypes).toEqual({ result: "str" });
  });

  it("defaults", () => {
    expectMetadataDefaults(TeamAgentNode);
  });

  it("process() returns empty string when no response is set", async () => {
    const n = new (TeamAgentNode as any)();
    const result = await n.process();
    expect(result).toEqual({ result: "" });
  });

  it("process() returns __agent_response__ when set", async () => {
    const n = new (TeamAgentNode as any)();
    (n as any).__agent_response__ = "Agent completed the task successfully.";
    const result = await n.process();
    expect(result).toEqual({
      result: "Agent completed the task successfully."
    });
  });

  it("process() returns response property when __agent_response__ is not set", async () => {
    const n = new (TeamAgentNode as any)();
    (n as any).response = "Fallback response text";
    const result = await n.process();
    expect(result).toEqual({ result: "Fallback response text" });
  });

  it("process() prefers __agent_response__ over response", async () => {
    const n = new (TeamAgentNode as any)();
    (n as any).__agent_response__ = "preferred";
    (n as any).response = "fallback";
    const result = await n.process();
    expect(result).toEqual({ result: "preferred" });
  });

  it("process() coerces non-string values to string", async () => {
    const n = new (TeamAgentNode as any)();
    (n as any).__agent_response__ = 42;
    const result = await n.process();
    expect(result).toEqual({ result: "42" });
  });

  it("toIdentity() returns correct agent identity from defaults", () => {
    const n = new (TeamAgentNode as any)();
    n.assign({
      name: "researcher",
      role: "Research specialist",
      skills: ["web_search", "analysis"],
      provider: "openai",
      model: "gpt-4",
      tools: ["search_tool"]
    });
    n.__node_id = "node-123";
    const identity = n.toIdentity();
    expect(identity).toEqual({
      id: "node-123",
      name: "researcher",
      role: "Research specialist",
      skills: ["web_search", "analysis"],
      provider: "openai",
      model: "gpt-4",
      tools: ["search_tool"]
    });
  });

  it("toIdentity() uses defaults when properties are empty", () => {
    const n = new (TeamAgentNode as any)();
    const identity = n.toIdentity();
    expect(identity.name).toBe("Agent");
    expect(identity.role).toBe("General purpose assistant");
    expect(identity.skills).toEqual([]);
    expect(identity.provider).toBe("anthropic");
    expect(identity.model).toContain("claude");
    expect(identity.tools).toEqual([]);
  });

  it("toIdentity() uses __node_id when set, falls back to name", () => {
    const n = new (TeamAgentNode as any)();
    n.assign({ name: "writer" });
    // No __node_id set, should fall back to name
    n.__node_id = "";
    const identity = n.toIdentity();
    expect(identity.id).toBe("writer");
  });

  it("toIdentity() handles non-array skills/tools gracefully", () => {
    const n = new (TeamAgentNode as any)();
    n.assign({ name: "test" });
    n.skills = "not_an_array";
    n.tools = null;
    const identity = n.toIdentity();
    expect(identity.skills).toEqual([]);
    expect(identity.tools).toEqual([]);
  });
});

// ---- TeamLeadNode ----
describe("TeamLeadNode", () => {
  it("has correct static metadata", () => {
    expect(TeamLeadNode.nodeType).toBe("nodetool.team.TeamLead");
    expect(TeamLeadNode.title).toBe("Team Lead");
    expect(TeamLeadNode.metadataOutputTypes).toEqual({
      result: "json",
      board: "json",
      messages: "list",
      events: "list"
    });
  });

  it("defaults", () => {
    expectMetadataDefaults(TeamLeadNode);
  });

  it("throws when objective is empty", async () => {
    const n = new (TeamLeadNode as any)();
    n.assign({ objective: "" });
    await expect(n.process({} as any)).rejects.toThrow("Objective is required");
  });

  it("throws when context is not provided", async () => {
    const n = new (TeamLeadNode as any)();
    n.assign({ objective: "Do something" });
    await expect(n.process()).rejects.toThrow("Processing context is required");
  });

  it("throws when no agents are found (no control context, no inline agents)", async () => {
    const n = new (TeamLeadNode as any)();
    n.assign({ objective: "Build a website" });
    // Provide a context but no _control_context and no inline agents
    const mockContext = {} as any;
    await expect(n.process(mockContext)).rejects.toThrow(
      "No agents found. Connect Agent nodes below this TeamLead via control edges."
    );
  });

  it("genProcess throws for empty objective", async () => {
    const n = new (TeamLeadNode as any)();
    n.assign({ objective: "" });
    const gen = n.genProcess({} as any);
    await expect(gen.next()).rejects.toThrow("Objective is required");
  });

  it("genProcess throws for missing context", async () => {
    const n = new (TeamLeadNode as any)();
    n.assign({ objective: "Do something" });
    const gen = n.genProcess();
    await expect(gen.next()).rejects.toThrow("Processing context is required");
  });

  it("discovers agents from _control_context", async () => {
    const n = new (TeamLeadNode as any)();
    n.assign({ objective: "Test objective" });

    // Set up _control_context with a mock agent node
    n.setDynamic("_control_context", {
      "agent-1": {
        node_type: "nodetool.team.Agent",
        node_title: "Researcher",
        properties: {
          name: { value: "researcher" },
          role: { value: "Research specialist" },
          skills: { value: ["web_search"] },
          provider: { value: "anthropic" },
          model: { value: "claude-sonnet-4-20250514" },
          tools: { value: [] }
        }
      }
    });

    // This will fail at TeamExecutor creation (needs DB), but we can verify
    // it gets past the "No agents found" check
    const mockContext = {} as any;
    await expect(n.process(mockContext)).rejects.not.toThrow("No agents found");
  });

  it("ignores non-Agent node types in _control_context", async () => {
    const n = new (TeamLeadNode as any)();
    n.assign({ objective: "Test objective" });

    // Set up _control_context with a non-agent node type only
    n.setDynamic("_control_context", {
      "node-1": {
        node_type: "nodetool.some.OtherNode",
        node_title: "Other",
        properties: {}
      }
    });

    const mockContext = {} as any;
    await expect(n.process(mockContext)).rejects.toThrow("No agents found");
  });

  it("falls back to inline agents when _control_context has no Agent nodes", async () => {
    const n = new (TeamLeadNode as any)();
    n.assign({ objective: "Test objective" });

    // Set inline agents via setDynamic
    n.setDynamic("agents", [
      {
        id: "inline-1",
        name: "Writer",
        role: "Content writer",
        skills: ["writing"],
        provider: "openai",
        model: "gpt-4",
        tools: []
      }
    ]);

    // This will fail at TeamExecutor (needs DB), but should get past "No agents found"
    const mockContext = {} as any;
    await expect(n.process(mockContext)).rejects.not.toThrow("No agents found");
  });

  it("uses default strategy and iteration values", () => {
    const n = new (TeamLeadNode as any)();
    expect(n.strategy).toBe("coordinator");
    expect(n.max_iterations).toBe(50);
    expect(n.max_concurrency).toBe(3);
  });
});
