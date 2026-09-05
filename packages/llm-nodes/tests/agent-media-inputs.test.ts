import { describe, it, expect } from "vitest";
// Import from source (not the package's stale dist) so these exercise the
// current nodes.
import {
  SummarizerNode,
  ExtractorNode,
  ClassifierNode
} from "../src/nodes/agents.js";
import { StructuredOutputGeneratorNode } from "../src/nodes/generators.js";

type Part = { type: string; image?: unknown; audio?: unknown };

function mediaParts(content: unknown): Part[] {
  return Array.isArray(content)
    ? (content as Part[]).filter(
        (p) => p.type === "image_url" || p.type === "audio"
      )
    : [];
}

const IMAGE = {
  type: "image",
  uri: "asset://pic.png",
  data: null,
  asset_id: null,
  metadata: null
};
const AUDIO = {
  type: "audio",
  uri: "asset://clip.mp3",
  data: null,
  asset_id: null,
  metadata: null
};

describe("declared image/audio props reach the provider", () => {
  it("SummarizerNode sends the image and audio it declares", async () => {
    let seen: unknown;
    const provider = {
      async *generateMessages(args: { messages: { content: unknown }[] }) {
        seen = args.messages[1].content;
        yield { type: "chunk", content: "ok", content_type: "text", done: true };
      }
    };
    const n = new (SummarizerNode as any)();
    n.assign({
      text: "Long text",
      model: { provider: "test", id: "m1" },
      image: IMAGE,
      audio: AUDIO
    });
    for await (const _ of n.genProcess({
      getProvider: async () => provider
    } as any)) {
      // drain
    }
    expect(mediaParts(seen).map((p) => p.type)).toEqual([
      "image_url",
      "audio"
    ]);
  });

  it("SummarizerNode keeps a plain string when no media is attached", async () => {
    let seen: unknown;
    const provider = {
      async *generateMessages(args: { messages: { content: unknown }[] }) {
        seen = args.messages[1].content;
        yield { type: "chunk", content: "ok", content_type: "text", done: true };
      }
    };
    const n = new (SummarizerNode as any)();
    n.assign({ text: "Long text", model: { provider: "test", id: "m1" } });
    for await (const _ of n.genProcess({
      getProvider: async () => provider
    } as any)) {
      // drain
    }
    expect(typeof seen).toBe("string");
    expect(seen).toContain("Long text");
  });

  it("ExtractorNode sends the image it declares", async () => {
    let seen: unknown;
    const provider = {
      async generateMessage(args: { messages: { content: unknown }[] }) {
        seen = args.messages[1].content;
        return {
          content: "",
          toolCalls: [{ id: "1", name: "extraction_result", args: { a: "b" } }]
        };
      }
    };
    const n = new (ExtractorNode as any)();
    n.assign({
      text: "Long text",
      model: { provider: "test", id: "m1" },
      image: IMAGE
    });
    await n.process({ getProvider: async () => provider } as any);
    expect(mediaParts(seen).map((p) => p.type)).toEqual(["image_url"]);
  });

  it("ClassifierNode sends the audio it declares", async () => {
    let seen: unknown;
    const provider = {
      async generateMessage(args: { messages: { content: unknown }[] }) {
        seen = args.messages[1].content;
        return {
          content: "",
          toolCalls: [
            { id: "1", name: "classification_result", args: { category: "a" } }
          ]
        };
      }
    };
    const n = new (ClassifierNode as any)();
    n.assign({
      text: "Long text",
      model: { provider: "test", id: "m1" },
      categories: ["a", "b"],
      audio: AUDIO
    });
    await n.process({ getProvider: async () => provider } as any);
    expect(mediaParts(seen).map((p) => p.type)).toEqual(["audio"]);
  });
});

describe("StructuredOutputGeneratorNode.max_tokens", () => {
  it("passes the declared max_tokens to the provider call", async () => {
    let seen: unknown;
    const context = {
      getProvider: async () => ({ provider: "test", cost: 0 }),
      setProviderCost: () => undefined,
      async runProviderPrediction({
        params
      }: {
        params: { max_tokens?: unknown };
      }) {
        seen = params.max_tokens;
        return { content: '{"a":1}' };
      }
    };
    const n = new (StructuredOutputGeneratorNode as any)();
    n.assign({
      instructions: "make one",
      model: { provider: "test", id: "m1" },
      max_tokens: 321
    });
    n._dynamic_outputs = { a: "int" };
    await n.process(context as any);
    expect(seen).toBe(321);
  });
});
