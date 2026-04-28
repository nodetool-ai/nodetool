import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { getNodeMetadata } from "@nodetool-ai/node-sdk";
import {
  ShellAgentNode,
  BrowserAgentNode,
  SQLiteAgentNode,
  SupabaseAgentNode,
  DocumentAgentNode,
  DocxAgentNode,
  EmailAgentNode,
  FfmpegAgentNode,
  FilesystemAgentNode,
  GitAgentNode,
  HtmlAgentNode,
  HttpApiAgentNode,
  ImageAgentNode,
  MediaAgentNode,
  PdfLibAgentNode,
  PptxAgentNode,
  SpreadsheetAgentNode,
  VectorStoreAgentNode,
  YtDlpDownloaderAgentNode,
  TOOL_AGENT_NODES
} from "../src/nodes/tool-agents.js";

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.MISTRAL_API_KEY;
  delete process.env.OLLAMA_API_URL;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.MISTRAL_API_KEY;
  delete process.env.OLLAMA_API_URL;
});

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

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as Response;
}

describe("TOOL_AGENT_NODES export", () => {
  it("exports 19 tool agent node classes", () => {
    expect(TOOL_AGENT_NODES).toHaveLength(19);
  });
});

// ── Defaults tests for all nodes ─────────────────────────────────────────

describe("Tool agent node defaults", () => {
  it("ShellAgentNode base defaults", () => {
    expectMetadataDefaults(ShellAgentNode);
  });

  it("BrowserAgentNode overrides timeout and max_output_chars", () => {
    const node = new BrowserAgentNode();
    const d = node.serialize();
    expect(d.timeout_seconds).toBe(150);
    expect(d.max_output_chars).toBe(180000);
  });

  it("SQLiteAgentNode has db_path and allow_mutation", () => {
    const node = new SQLiteAgentNode();
    const d = node.serialize();
    expect(d.timeout_seconds).toBe(120);
    expect(d.db_path).toBe("memory.db");
    expect(d.allow_mutation).toBe(false);
  });

  it("SupabaseAgentNode has timeout 120", () => {
    const node = new SupabaseAgentNode();
    expect(node.serialize().timeout_seconds).toBe(120);
  });

  it("DocumentAgentNode defaults", () => {
    const node = new DocumentAgentNode();
    const d = node.serialize();
    expect(d.timeout_seconds).toBe(120);
    expect(d.max_output_chars).toBe(150000);
  });

  it("DocxAgentNode defaults", () => {
    const node = new DocxAgentNode();
    const d = node.serialize();
    expect(d.timeout_seconds).toBe(300);
    expect(d.max_output_chars).toBe(220000);
  });

  it("EmailAgentNode base defaults", () => {
    const node = new EmailAgentNode();
    expect(node.serialize().timeout_seconds).toBe(180);
  });

  it("FfmpegAgentNode has audio and video", () => {
    const node = new FfmpegAgentNode();
    const d = node.serialize();
    expect(d.audio).toEqual({
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    });
    expect(d.video).toEqual({
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    });
  });

  it("FilesystemAgentNode base defaults", () => {
    const node = new FilesystemAgentNode();
    expect(node.serialize().timeout_seconds).toBe(180);
  });

  it("GitAgentNode base defaults", () => {
    const node = new GitAgentNode();
    expect(node.serialize().timeout_seconds).toBe(180);
  });

  it("HtmlAgentNode has max_output_chars 180000", () => {
    const node = new HtmlAgentNode();
    expect(node.serialize().max_output_chars).toBe(180000);
  });

  it("HttpApiAgentNode base defaults", () => {
    const node = new HttpApiAgentNode();
    expect(node.serialize().timeout_seconds).toBe(180);
  });

  it("ImageAgentNode has image, timeout, max_output_chars", () => {
    const node = new ImageAgentNode();
    const d = node.serialize();
    expect(d.image).toEqual({
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    });
    expect(d.timeout_seconds).toBe(90);
    expect(d.max_output_chars).toBe(120000);
  });

  it("MediaAgentNode has audio and video", () => {
    const node = new MediaAgentNode();
    const d = node.serialize();
    expect(d.audio).toEqual({
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    });
    expect(d.video).toEqual({
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    });
  });

  it("PdfLibAgentNode has document and custom timeout", () => {
    const node = new PdfLibAgentNode();
    const d = node.serialize();
    expect(d.document).toEqual({
      type: "document",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    });
    expect(d.timeout_seconds).toBe(300);
    expect(d.max_output_chars).toBe(220000);
  });

  it("PptxAgentNode has document and custom timeout", () => {
    const node = new PptxAgentNode();
    const d = node.serialize();
    expect(d.document).toEqual({
      type: "document",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    });
    expect(d.timeout_seconds).toBe(300);
    expect(d.max_output_chars).toBe(220000);
  });

  it("SpreadsheetAgentNode base defaults", () => {
    const node = new SpreadsheetAgentNode();
    expect(node.serialize().timeout_seconds).toBe(180);
  });

  it("VectorStoreAgentNode base defaults", () => {
    const node = new VectorStoreAgentNode();
    expect(node.serialize().timeout_seconds).toBe(180);
  });

  it("YtDlpDownloaderAgentNode has url, output_dir, custom timeout", () => {
    const node = new YtDlpDownloaderAgentNode();
    const d = node.serialize();
    expect(d.url).toBe("");
    expect(d.output_dir).toBe("downloads/yt-dlp");
    expect(d.timeout_seconds).toBe(300);
    expect(d.max_output_chars).toBe(220000);
  });
});

// ── nodeType tests ───────────────────────────────────────────────────────

describe("Tool agent node types", () => {
  const expected: [string, typeof ShellAgentNode][] = [
    ["nodetool.agents.ShellAgent", ShellAgentNode],
    ["nodetool.agents.BrowserAgent", BrowserAgentNode],
    ["nodetool.agents.SQLiteAgent", SQLiteAgentNode],
    ["nodetool.agents.SupabaseAgent", SupabaseAgentNode],
    ["nodetool.agents.DocumentAgent", DocumentAgentNode],
    ["nodetool.agents.DocxAgent", DocxAgentNode],
    ["nodetool.agents.EmailAgent", EmailAgentNode],
    ["nodetool.agents.FfmpegAgent", FfmpegAgentNode],
    ["nodetool.agents.FilesystemAgent", FilesystemAgentNode],
    ["nodetool.agents.GitAgent", GitAgentNode],
    ["nodetool.agents.HtmlAgent", HtmlAgentNode],
    ["nodetool.agents.HttpApiAgent", HttpApiAgentNode],
    ["nodetool.agents.ImageAgent", ImageAgentNode],
    ["nodetool.agents.MediaAgent", MediaAgentNode],
    ["nodetool.agents.PdfLibAgent", PdfLibAgentNode],
    ["nodetool.agents.PptxAgent", PptxAgentNode],
    ["nodetool.agents.SpreadsheetAgent", SpreadsheetAgentNode],
    ["nodetool.agents.VectorStoreAgent", VectorStoreAgentNode],
    ["nodetool.agents.YtDlpDownloaderAgent", YtDlpDownloaderAgentNode]
  ];
  for (const [nodeType, NodeClass] of expected) {
    it(`${NodeClass.name} has nodeType ${nodeType}`, () => {
      expect(NodeClass.nodeType).toBe(nodeType);
    });
  }
});

// ── Process error paths ──────────────────────────────────────────────────

describe("ToolAgentNode process", () => {
  it("throws Prompt is required when prompt is empty", async () => {
    const node = new ShellAgentNode();
    node.assign({});
    await expect(node.process()).rejects.toThrow("Prompt is required");
  });

  it("throws Prompt is required when prompt is whitespace", async () => {
    const node = new ShellAgentNode();

    node.assign({
      prompt: "   "
    });

    await expect(node.process()).rejects.toThrow("Prompt is required");
  });

  it("throws Select a model when provider is empty", async () => {
    const node = new ShellAgentNode();

    node.assign({
      prompt: "do something",
      model: { provider: "", id: "" }
    });

    await expect(node.process()).rejects.toThrow(
      "Select a model for this skill."
    );
  });

  it("throws Select a model when model id is empty", async () => {
    const node = new ShellAgentNode();

    node.assign({
      prompt: "do something",
      model: { provider: "openai", id: "" }
    });

    await expect(node.process()).rejects.toThrow(
      "Select a model for this skill."
    );
  });

  it("throws no API key when key is missing for openai", async () => {
    const node = new ShellAgentNode();

    node.assign({
      prompt: "do something",
      model: { provider: "openai", id: "gpt-4" }
    });

    await expect(node.process()).rejects.toThrow(
      "Processing context with provider access is required"
    );
  });

  it("throws no API key when key is missing for anthropic", async () => {
    const node = new ShellAgentNode();

    node.assign({
      prompt: "do something",
      model: { provider: "anthropic", id: "claude-3" }
    });

    await expect(node.process()).rejects.toThrow(
      "Processing context with provider access is required"
    );
  });
});

// ── Context required path (direct HTTP paths removed) ───────────────────

describe("ToolAgentNode requires processing context", () => {
  it("throws when no context provided for OpenAI", async () => {
    const node = new ShellAgentNode();

    node.assign({
      prompt: "say hello",
      model: { provider: "openai", id: "gpt-4" }
    });

    node.setDynamic("_secrets", { OPENAI_API_KEY: "sk-test" });
    await expect(node.process()).rejects.toThrow(
      "Processing context with provider access is required"
    );
  });

  it("throws when no context provided for Anthropic", async () => {
    const node = new BrowserAgentNode();

    node.assign({
      prompt: "browse",
      model: { provider: "anthropic", id: "claude-3" }
    });

    node.setDynamic("_secrets", { ANTHROPIC_API_KEY: "ak-test" });
    await expect(node.process()).rejects.toThrow(
      "Processing context with provider access is required"
    );
  });

  it("throws when no context provided for Ollama", async () => {
    const node = new SQLiteAgentNode();

    node.assign({
      prompt: "query db",
      model: { provider: "ollama", id: "llama3" }
    });

    await expect(node.process()).rejects.toThrow(
      "Processing context with provider access is required"
    );
  });

  it("throws when no context provided for unsupported provider", async () => {
    const node = new ShellAgentNode();

    node.assign({
      prompt: "do something",
      model: { provider: "gemini", id: "gemini-pro" }
    });

    node.setDynamic("_secrets", { GEMINI_API_KEY: "gk-test" });
    await expect(node.process()).rejects.toThrow(
      "Processing context with provider access is required"
    );
  });
});

// ── Runtime provider path ────────────────────────────────────────────────

describe("ToolAgentNode runtime provider path", () => {
  it("uses context.getProvider when available", async () => {
    const node = new ShellAgentNode();
    const mockProvider = {
      generateMessage: vi.fn().mockResolvedValue({ content: "from provider" })
    };
    const context = {
      getProvider: vi.fn().mockResolvedValue(mockProvider)
    };

    node.assign({
      prompt: "do something",
      model: { provider: "openai", id: "gpt-4" }
    });

    const result = await node.process(context as any);
    expect(result.text).toBe("from provider");
    expect(context.getProvider).toHaveBeenCalledWith("openai");
  });

  it("handles non-string content from provider", async () => {
    const node = new ShellAgentNode();
    const mockProvider = {
      generateMessage: vi.fn().mockResolvedValue({ content: { key: "val" } })
    };
    const context = {
      getProvider: vi.fn().mockResolvedValue(mockProvider)
    };

    node.assign({
      prompt: "do something",
      model: { provider: "openai", id: "gpt-4" }
    });

    const result = await node.process(context as any);
    expect(result.text).toBe('{"key":"val"}');
  });

  it("handles null content from provider", async () => {
    const node = new ShellAgentNode();
    const mockProvider = {
      generateMessage: vi.fn().mockResolvedValue({ content: null })
    };
    const context = {
      getProvider: vi.fn().mockResolvedValue(mockProvider)
    };

    node.assign({
      prompt: "do something",
      model: { provider: "openai", id: "gpt-4" }
    });

    const result = await node.process(context as any);
    expect(result.text).toBe("");
  });

  it("throws when provider rejects", async () => {
    const node = new ShellAgentNode();
    const context = {
      getProvider: vi.fn().mockRejectedValue(new Error("no provider"))
    };

    node.assign({
      prompt: "do something",
      model: { provider: "openai", id: "gpt-4" }
    });

    node.setDynamic("_secrets", { OPENAI_API_KEY: "sk-test" });
    await expect(node.process(context as any)).rejects.toThrow("no provider");
  });
});

// ── secretsMap edge cases ────────────────────────────────────────────────

describe("secretsMap handling", () => {
  it("handles _secrets as array (requires context)", async () => {
    const node = new ShellAgentNode();

    node.assign({
      prompt: "test",
      model: { provider: "openai", id: "gpt-4" }
    });

    node.setDynamic("_secrets", ["not", "a", "map"]);
    await expect(node.process()).rejects.toThrow(
      "Processing context with provider access is required"
    );
  });

  it("handles _secrets as null (requires context)", async () => {
    const node = new ShellAgentNode();

    node.assign({
      prompt: "test",
      model: { provider: "openai", id: "gpt-4" }
    });

    node.setDynamic("_secrets", null);
    await expect(node.process()).rejects.toThrow(
      "Processing context with provider access is required"
    );
  });
});
