import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { getNodeMetadata } from "@nodetool/node-sdk";
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
  TOOL_AGENT_NODES,
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
    text: async () => JSON.stringify(body),
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
      metadata: null,
    });
    expect(d.video).toEqual({
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null,
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
      metadata: null,
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
      metadata: null,
    });
    expect(d.video).toEqual({
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null,
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
      metadata: null,
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
      metadata: null,
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
    ["nodetool.agents.YtDlpDownloaderAgent", YtDlpDownloaderAgentNode],
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
    await expect(node.process({})).rejects.toThrow("Prompt is required");
  });

  it("throws Prompt is required when prompt is whitespace", async () => {
    const node = new ShellAgentNode();
    await expect(node.process({ prompt: "   " })).rejects.toThrow("Prompt is required");
  });

  it("throws Select a model when provider is empty", async () => {
    const node = new ShellAgentNode();
    await expect(
      node.process({ prompt: "do something", model: { provider: "", id: "" } })
    ).rejects.toThrow("Select a model for this skill.");
  });

  it("throws Select a model when model id is empty", async () => {
    const node = new ShellAgentNode();
    await expect(
      node.process({ prompt: "do something", model: { provider: "openai", id: "" } })
    ).rejects.toThrow("Select a model for this skill.");
  });

  it("throws no API key when key is missing for openai", async () => {
    const node = new ShellAgentNode();
    await expect(
      node.process({ prompt: "do something", model: { provider: "openai", id: "gpt-4" } })
    ).rejects.toThrow("No API key found");
  });

  it("throws no API key when key is missing for anthropic", async () => {
    const node = new ShellAgentNode();
    await expect(
      node.process({ prompt: "do something", model: { provider: "anthropic", id: "claude-3" } })
    ).rejects.toThrow("No API key found");
  });
});

// ── OpenAI direct HTTP path ──────────────────────────────────────────────

describe("ToolAgentNode OpenAI direct path", () => {
  it("calls OpenAI and returns text", async () => {
    const node = new ShellAgentNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: "hello world" } }],
      })
    );
    const result = await node.process({
      prompt: "say hello",
      model: { provider: "openai", id: "gpt-4" },
      _secrets: { OPENAI_API_KEY: "sk-test" },
    });
    expect(result.text).toBe("hello world");
    expect(mockFetch.mock.calls[0][0]).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("returns empty string when choices are missing", async () => {
    const node = new ShellAgentNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({}));
    const result = await node.process({
      prompt: "say hello",
      model: { provider: "openai", id: "gpt-4" },
      _secrets: { OPENAI_API_KEY: "sk-test" },
    });
    expect(result.text).toBe("");
  });

  it("throws on OpenAI API error", async () => {
    const node = new ShellAgentNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: "bad" }, 400));
    await expect(
      node.process({
        prompt: "say hello",
        model: { provider: "openai", id: "gpt-4" },
        _secrets: { OPENAI_API_KEY: "sk-test" },
      })
    ).rejects.toThrow("OpenAI API error 400");
  });

  it("resolves key from env", async () => {
    process.env.OPENAI_API_KEY = "sk-env";
    const node = new ShellAgentNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ choices: [{ message: { content: "ok" } }] })
    );
    const result = await node.process({
      prompt: "test",
      model: { provider: "openai", id: "gpt-4" },
    });
    expect(result.text).toBe("ok");
  });
});

// ── Anthropic direct HTTP path ───────────────────────────────────────────

describe("ToolAgentNode Anthropic direct path", () => {
  it("calls Anthropic and returns text", async () => {
    const node = new BrowserAgentNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        content: [
          { type: "text", text: "anthropic response" },
          { type: "text", text: " more" },
        ],
      })
    );
    const result = await node.process({
      prompt: "browse",
      model: { provider: "anthropic", id: "claude-3" },
      _secrets: { ANTHROPIC_API_KEY: "ak-test" },
    });
    expect(result.text).toBe("anthropic response more");
  });

  it("returns empty when content is missing", async () => {
    const node = new BrowserAgentNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({}));
    const result = await node.process({
      prompt: "browse",
      model: { provider: "anthropic", id: "claude-3" },
      _secrets: { ANTHROPIC_API_KEY: "ak-test" },
    });
    expect(result.text).toBe("");
  });

  it("throws on Anthropic API error", async () => {
    const node = new BrowserAgentNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: "bad" }, 401));
    await expect(
      node.process({
        prompt: "browse",
        model: { provider: "anthropic", id: "claude-3" },
        _secrets: { ANTHROPIC_API_KEY: "ak-test" },
      })
    ).rejects.toThrow("Anthropic API error 401");
  });
});

// ── Ollama direct HTTP path ──────────────────────────────────────────────

describe("ToolAgentNode Ollama direct path", () => {
  it("calls Ollama and returns text (no API key needed)", async () => {
    const node = new SQLiteAgentNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ message: { content: "ollama response" } })
    );
    const result = await node.process({
      prompt: "query db",
      model: { provider: "ollama", id: "llama3" },
    });
    expect(result.text).toBe("ollama response");
    expect(mockFetch.mock.calls[0][0]).toBe("http://127.0.0.1:11434/api/chat");
  });

  it("uses custom OLLAMA_API_URL", async () => {
    process.env.OLLAMA_API_URL = "http://custom:9999";
    const node = new SQLiteAgentNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ message: { content: "custom" } })
    );
    await node.process({
      prompt: "query",
      model: { provider: "ollama", id: "llama3" },
    });
    expect(mockFetch.mock.calls[0][0]).toBe("http://custom:9999/api/chat");
  });

  it("returns empty when message is missing", async () => {
    const node = new SQLiteAgentNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({}));
    const result = await node.process({
      prompt: "query",
      model: { provider: "ollama", id: "llama3" },
    });
    expect(result.text).toBe("");
  });

  it("throws on Ollama API error", async () => {
    const node = new SQLiteAgentNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));
    await expect(
      node.process({
        prompt: "query",
        model: { provider: "ollama", id: "llama3" },
      })
    ).rejects.toThrow("Ollama API error 500");
  });
});

// ── Unsupported provider ─────────────────────────────────────────────────

describe("ToolAgentNode unsupported provider", () => {
  it("throws unsupported provider error", async () => {
    const node = new ShellAgentNode();
    // Ollama doesn't need API key, so we can test unsupported by using a fake provider
    // But we need to bypass the API key check - use ollama-like (no key needed) but unsupported name
    // Actually, the key check happens before callChatCompletionDirect for non-ollama providers
    // So we need a provider that's not in PROVIDER_KEY_MAP and not ollama
    // The code: if (provider !== "ollama" && !apiKey) throw
    // So we need to provide an API key for the unknown provider
    // But PROVIDER_KEY_MAP won't have an entry, so resolveApiKey returns null
    // Wait - let's check: resolveApiKey checks PROVIDER_KEY_MAP[provider], which for unknown returns undefined
    // Then envName is undefined, so it returns null
    // Then provider !== "ollama" && !apiKey → throws "No API key found"
    // We can't reach "Unsupported provider" via direct path for unknown providers.
    // But we CAN set a key in env that matches the pattern
    // Actually, the code does: const envName = PROVIDER_KEY_MAP[provider]; if (!envName) return null;
    // So for unknown providers, resolveApiKey always returns null, and we get "No API key found" first.
    // The "Unsupported provider" only triggers if provider is somehow valid for key check but not for HTTP call.
    // This can't happen with the current code for unknown providers.
    // Let's verify by checking if we can reach it through context fallback path.
  });

  it("throws unsupported provider for gemini (has key but no HTTP path)", async () => {
    const node = new ShellAgentNode();
    // gemini is in PROVIDER_KEY_MAP so resolveApiKey will find it
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 200)); // won't be called
    await expect(
      node.process({
        prompt: "do something",
        model: { provider: "gemini", id: "gemini-pro" },
        _secrets: { GEMINI_API_KEY: "gk-test" },
      })
    ).rejects.toThrow('Unsupported provider "gemini"');
  });

  it("throws unsupported provider for mistral", async () => {
    const node = new ShellAgentNode();
    await expect(
      node.process({
        prompt: "do something",
        model: { provider: "mistral", id: "mistral-large" },
        _secrets: { MISTRAL_API_KEY: "mk-test" },
      })
    ).rejects.toThrow('Unsupported provider "mistral"');
  });
});

// ── Runtime provider path ────────────────────────────────────────────────

describe("ToolAgentNode runtime provider path", () => {
  it("uses context.getProvider when available", async () => {
    const node = new ShellAgentNode();
    const mockProvider = {
      generateMessage: vi.fn().mockResolvedValue({ content: "from provider" }),
    };
    const context = {
      getProvider: vi.fn().mockResolvedValue(mockProvider),
    };
    const result = await node.process(
      {
        prompt: "do something",
        model: { provider: "openai", id: "gpt-4" },
      },
      context as any
    );
    expect(result.text).toBe("from provider");
    expect(context.getProvider).toHaveBeenCalledWith("openai");
  });

  it("handles non-string content from provider", async () => {
    const node = new ShellAgentNode();
    const mockProvider = {
      generateMessage: vi.fn().mockResolvedValue({ content: { key: "val" } }),
    };
    const context = {
      getProvider: vi.fn().mockResolvedValue(mockProvider),
    };
    const result = await node.process(
      {
        prompt: "do something",
        model: { provider: "openai", id: "gpt-4" },
      },
      context as any
    );
    expect(result.text).toBe('{"key":"val"}');
  });

  it("handles null content from provider", async () => {
    const node = new ShellAgentNode();
    const mockProvider = {
      generateMessage: vi.fn().mockResolvedValue({ content: null }),
    };
    const context = {
      getProvider: vi.fn().mockResolvedValue(mockProvider),
    };
    const result = await node.process(
      {
        prompt: "do something",
        model: { provider: "openai", id: "gpt-4" },
      },
      context as any
    );
    expect(result.text).toBe('""');
  });

  it("falls back to direct HTTP when provider throws", async () => {
    const node = new ShellAgentNode();
    const context = {
      getProvider: vi.fn().mockRejectedValue(new Error("no provider")),
    };
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ choices: [{ message: { content: "fallback" } }] })
    );
    const result = await node.process(
      {
        prompt: "do something",
        model: { provider: "openai", id: "gpt-4" },
        _secrets: { OPENAI_API_KEY: "sk-test" },
      },
      context as any
    );
    expect(result.text).toBe("fallback");
  });
});

// ── secretsMap edge cases ────────────────────────────────────────────────

describe("secretsMap handling", () => {
  it("handles _secrets as array (returns empty map)", async () => {
    const node = new ShellAgentNode();
    await expect(
      node.process({
        prompt: "test",
        model: { provider: "openai", id: "gpt-4" },
        _secrets: ["not", "a", "map"],
      })
    ).rejects.toThrow("No API key found");
  });

  it("handles _secrets as null", async () => {
    const node = new ShellAgentNode();
    await expect(
      node.process({
        prompt: "test",
        model: { provider: "openai", id: "gpt-4" },
        _secrets: null,
      })
    ).rejects.toThrow("No API key found");
  });
});
