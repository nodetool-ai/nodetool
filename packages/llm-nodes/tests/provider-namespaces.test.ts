import { describe, it, expect, vi } from "vitest";
import {
  GEMINI_NODES,
  VertexEmbeddingNode,
  VertexImageGenerationNode,
  VertexTextToVideoNode,
  VertexGroundedSearchNode
} from "@nodetool-ai/llm-nodes/gemini";
import {
  ALL_LLM_NODES,
  AnthropicWebSearchNode,
  ClaudeCodeWebSearchNode,
  CodexCreateImageNode,
  CodexWebSearchNode
} from "@nodetool-ai/llm-nodes";
import type { ProcessingContext } from "@nodetool-ai/runtime";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** A Vertex provider stand-in that records what the node sends. */
function vertexProvider(respond: (method: string) => Response) {
  return {
    postModel: vi.fn(async (_model: string, method: string) => respond(method)),
    getVideoOperation: vi.fn(async () => json({ done: true })),
    mediaHeaders: vi.fn(async () => undefined)
  };
}

function contextWith(provider: unknown, extra: Record<string, unknown> = {}) {
  const getProvider = vi.fn(async () => provider);
  return {
    context: { getProvider, ...extra } as unknown as ProcessingContext,
    getProvider
  };
}

describe("provider namespaces", () => {
  it("registers each separately configured provider under its own namespace", () => {
    const roots = new Set(ALL_LLM_NODES.map((n) => n.nodeType.split(".")[0]));
    for (const root of ["gemini", "vertex", "openai", "codex", "anthropic", "claude_code"]) {
      expect(roots).toContain(root);
    }
  });

  it("offers on Codex only what its backend serves", () => {
    const codex = ALL_LLM_NODES.filter((n) => n.nodeType.startsWith("codex."))
      .map((n) => n.nodeType)
      .sort();
    expect(codex).toEqual(["codex.image.CreateImage", "codex.text.WebSearch"]);
  });

  it("mirrors every Gemini node on Vertex AI", () => {
    const gemini = GEMINI_NODES.filter((n) => n.nodeType.startsWith("gemini."));
    const vertex = GEMINI_NODES.filter((n) => n.nodeType.startsWith("vertex."));
    expect(vertex.map((n) => n.nodeType.replace(/^vertex\./, "")).sort()).toEqual(
      gemini.map((n) => n.nodeType.replace(/^gemini\./, "")).sort()
    );
    for (const node of vertex) {
      expect(node.requiredSettings).toEqual(["GOOGLE_CLOUD_PROJECT"]);
    }
  });
});

describe("Vertex AI nodes", () => {
  it("send the Gemini request body through the Vertex provider", async () => {
    const provider = vertexProvider(() => json({ embedding: { values: [0.1, 0.2] } }));
    const { context, getProvider } = contextWith(provider);
    const node = new VertexEmbeddingNode();
    node.assign({ input: "hello" });
    const result = await node.process(context);
    expect(result).toEqual({ output: [0.1, 0.2] });
    expect(getProvider).toHaveBeenCalledWith("gemini_vertex");
    expect(provider.postModel).toHaveBeenCalledWith(
      "gemini-embedding-2",
      "embedContent",
      { content: { parts: [{ text: "hello" }] } },
      undefined
    );
  });

  it("name Vertex AI in API errors", async () => {
    const provider = vertexProvider(() => new Response("denied", { status: 403 }));
    const { context } = contextWith(provider);
    const node = new VertexGroundedSearchNode();
    node.assign({ query: "news" });
    await expect(node.process(context)).rejects.toThrow("Vertex AI error 403: denied");
  });

  it("read the inline video Veo returns on Vertex AI", async () => {
    const provider = vertexProvider(() =>
      json({
        name: "op",
        done: true,
        response: { videos: [{ bytesBase64Encoded: "dmlkZW8=" }] }
      })
    );
    const { context } = contextWith(provider);
    const node = new VertexTextToVideoNode();
    node.assign({ prompt: "a wave" });
    const result = await node.process(context);
    expect(result.output).toEqual({ type: "video", data: "dmlkZW8=" });
  });

  it("need a provider that serves Gemini requests", async () => {
    const { context } = contextWith({});
    const node = new VertexImageGenerationNode();
    node.assign({ prompt: "a cat" });
    await expect(node.process(context)).rejects.toThrow(
      "does not serve Gemini requests"
    );
  });
});

describe("Codex nodes", () => {
  it("search the web through the Codex provider", async () => {
    const webSearch = vi.fn(async () => ({
      text: "Answer",
      sources: [{ title: "A", url: "https://a.example" }]
    }));
    const { context, getProvider } = contextWith({ webSearch });
    const node = new CodexWebSearchNode();
    node.assign({ query: "q" });
    const result = await node.process(context);
    expect(getProvider).toHaveBeenCalledWith("codex");
    expect(webSearch).toHaveBeenCalledWith({
      query: "q",
      model: undefined,
      signal: undefined
    });
    expect(result.text).toBe("Answer");
  });

  it("create an image with the Codex text-to-image capability", async () => {
    const runProviderPrediction = vi.fn(async () => Uint8Array.from([1, 2, 3]));
    const { context } = contextWith({}, { runProviderPrediction });
    const node = new CodexCreateImageNode();
    node.assign({ prompt: "a dot", size: "1536x1024", quality: "high" });
    const result = await node.process(context);
    expect(runProviderPrediction).toHaveBeenCalledWith({
      provider: "codex",
      capability: "text_to_image",
      model: "gpt-image-2",
      params: { prompt: "a dot", width: 1536, height: 1024, quality: "high" }
    });
    expect(result.output).toEqual({
      type: "image",
      data: Buffer.from([1, 2, 3]).toString("base64")
    });
  });
});

describe("Claude web search nodes", () => {
  /** A provider whose loop answers in two assistant turns. */
  function claudeProvider() {
    const generateLoop = vi.fn(async function* () {
      yield { type: "chunk", content: "Searching. ", done: false };
      yield {
        type: "message",
        message: { role: "assistant", content: "Searching." }
      };
      yield { type: "chunk", content: "Final answer.", done: false };
      yield {
        type: "message",
        message: {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "Final answer.",
              citations: [
                {
                  type: "web_search_result_location",
                  citedText: "x",
                  encryptedIndex: "e",
                  url: "https://src.example",
                  title: "Source"
                }
              ]
            }
          ]
        }
      };
    });
    return { supportsNativeWebSearch: true, generateLoop };
  }

  it("answer with the last assistant turn and its cited pages", async () => {
    const provider = claudeProvider();
    const { context, getProvider } = contextWith(provider);
    const node = new AnthropicWebSearchNode();
    node.assign({ query: "q" });
    const result = await node.process(context);
    expect(getProvider).toHaveBeenCalledWith("anthropic");
    expect(result).toEqual({
      text: "Final answer.",
      sources: [{ title: "Source", url: "https://src.example" }]
    });
    const [args] = provider.generateLoop.mock.calls[0] as unknown as [
      { tools: Array<{ name: string }>; model: string }
    ];
    expect(args.tools.map((t) => t.name)).toEqual(["web_search"]);
    expect(args.model).toBe("claude-sonnet-5-5");
  });

  it("run Claude Code's web search on the subscription provider", async () => {
    const provider = claudeProvider();
    const { context, getProvider } = contextWith(provider);
    const node = new ClaudeCodeWebSearchNode();
    node.assign({ query: "q", model: "opus" });
    await node.process(context);
    expect(getProvider).toHaveBeenCalledWith("claude_agent_sdk");
  });

  it("refuse a provider without built-in web search", async () => {
    const { context } = contextWith({ supportsNativeWebSearch: false });
    const node = new AnthropicWebSearchNode();
    node.assign({ query: "q" });
    await expect(node.process(context)).rejects.toThrow("no built-in web search");
  });
});
