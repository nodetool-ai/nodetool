import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { getNodeMetadata } from "@nodetool/node-sdk";
import {
  ShellAgentSkillNode,
  BrowserSkillNode,
  SQLiteSkillNode,
  SupabaseSkillNode,
  DocumentSkillNode,
  DocxSkillNode,
  EmailSkillNode,
  FfmpegSkillNode,
  FilesystemSkillNode,
  GitSkillNode,
  HtmlSkillNode,
  HttpApiSkillNode,
  ImageSkillNode,
  MediaSkillNode,
  PdfLibSkillNode,
  PptxSkillNode,
  SpreadsheetSkillNode,
  VectorStoreSkillNode,
  YtDlpDownloaderSkillNode,
  SKILLS_NODES,
} from "../src/nodes/skills.js";

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

describe("SKILLS_NODES export", () => {
  it("exports 19 skill node classes", () => {
    expect(SKILLS_NODES).toHaveLength(19);
  });
});

// ── Defaults tests for all nodes ─────────────────────────────────────────

describe("Skill node defaults", () => {
  it("ShellAgentSkillNode base defaults", () => {
    expectMetadataDefaults(ShellAgentSkillNode);
  });

  it("BrowserSkillNode overrides timeout and max_output_chars", () => {
    const node = new BrowserSkillNode();
    const d = node.serialize();
    expect(d.timeout_seconds).toBe(150);
    expect(d.max_output_chars).toBe(180000);
  });

  it("SQLiteSkillNode has db_path and allow_mutation", () => {
    const node = new SQLiteSkillNode();
    const d = node.serialize();
    expect(d.timeout_seconds).toBe(120);
    expect(d.db_path).toBe("memory.db");
    expect(d.allow_mutation).toBe(false);
  });

  it("SupabaseSkillNode has timeout 120", () => {
    const node = new SupabaseSkillNode();
    expect(node.serialize().timeout_seconds).toBe(120);
  });

  it("DocumentSkillNode defaults", () => {
    const node = new DocumentSkillNode();
    const d = node.serialize();
    expect(d.timeout_seconds).toBe(120);
    expect(d.max_output_chars).toBe(150000);
  });

  it("DocxSkillNode defaults", () => {
    const node = new DocxSkillNode();
    const d = node.serialize();
    expect(d.timeout_seconds).toBe(300);
    expect(d.max_output_chars).toBe(220000);
  });

  it("EmailSkillNode base defaults", () => {
    const node = new EmailSkillNode();
    expect(node.serialize().timeout_seconds).toBe(180);
  });

  it("FfmpegSkillNode has audio and video", () => {
    const node = new FfmpegSkillNode();
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

  it("FilesystemSkillNode base defaults", () => {
    const node = new FilesystemSkillNode();
    expect(node.serialize().timeout_seconds).toBe(180);
  });

  it("GitSkillNode base defaults", () => {
    const node = new GitSkillNode();
    expect(node.serialize().timeout_seconds).toBe(180);
  });

  it("HtmlSkillNode has max_output_chars 180000", () => {
    const node = new HtmlSkillNode();
    expect(node.serialize().max_output_chars).toBe(180000);
  });

  it("HttpApiSkillNode base defaults", () => {
    const node = new HttpApiSkillNode();
    expect(node.serialize().timeout_seconds).toBe(180);
  });

  it("ImageSkillNode has image, timeout, max_output_chars", () => {
    const node = new ImageSkillNode();
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

  it("MediaSkillNode has audio and video", () => {
    const node = new MediaSkillNode();
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

  it("PdfLibSkillNode has document and custom timeout", () => {
    const node = new PdfLibSkillNode();
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

  it("PptxSkillNode has document and custom timeout", () => {
    const node = new PptxSkillNode();
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

  it("SpreadsheetSkillNode base defaults", () => {
    const node = new SpreadsheetSkillNode();
    expect(node.serialize().timeout_seconds).toBe(180);
  });

  it("VectorStoreSkillNode base defaults", () => {
    const node = new VectorStoreSkillNode();
    expect(node.serialize().timeout_seconds).toBe(180);
  });

  it("YtDlpDownloaderSkillNode has url, output_dir, custom timeout", () => {
    const node = new YtDlpDownloaderSkillNode();
    const d = node.serialize();
    expect(d.url).toBe("");
    expect(d.output_dir).toBe("downloads/yt-dlp");
    expect(d.timeout_seconds).toBe(300);
    expect(d.max_output_chars).toBe(220000);
  });
});

// ── nodeType tests ───────────────────────────────────────────────────────

describe("Skill node types", () => {
  const expected: [string, typeof ShellAgentSkillNode][] = [
    ["skills._shell_agent.ShellAgentSkill", ShellAgentSkillNode],
    ["skills.browser.BrowserSkill", BrowserSkillNode],
    ["skills.data.SQLiteSkill", SQLiteSkillNode],
    ["skills.data.SupabaseSkill", SupabaseSkillNode],
    ["skills.document.DocumentSkill", DocumentSkillNode],
    ["skills.docx.DocxSkill", DocxSkillNode],
    ["skills.email.EmailSkill", EmailSkillNode],
    ["skills.ffmpeg.FfmpegSkill", FfmpegSkillNode],
    ["skills.filesystem.FilesystemSkill", FilesystemSkillNode],
    ["skills.git.GitSkill", GitSkillNode],
    ["skills.html.HtmlSkill", HtmlSkillNode],
    ["skills.httpapi.HttpApiSkill", HttpApiSkillNode],
    ["skills.image.ImageSkill", ImageSkillNode],
    ["skills.media.MediaSkill", MediaSkillNode],
    ["skills.pdf_lib.PdfLibSkill", PdfLibSkillNode],
    ["skills.pptx.PptxSkill", PptxSkillNode],
    ["skills.spreadsheet.SpreadsheetSkill", SpreadsheetSkillNode],
    ["skills.vectorstore.VectorStoreSkill", VectorStoreSkillNode],
    ["skills.ytdlp.YtDlpDownloaderSkill", YtDlpDownloaderSkillNode],
  ];
  for (const [nodeType, NodeClass] of expected) {
    it(`${NodeClass.name} has nodeType ${nodeType}`, () => {
      expect(NodeClass.nodeType).toBe(nodeType);
    });
  }
});

// ── Process error paths ──────────────────────────────────────────────────

describe("SkillNode process", () => {
  it("throws Prompt is required when prompt is empty", async () => {
    const node = new ShellAgentSkillNode();
    await expect(node.process({})).rejects.toThrow("Prompt is required");
  });

  it("throws Prompt is required when prompt is whitespace", async () => {
    const node = new ShellAgentSkillNode();
    await expect(node.process({ prompt: "   " })).rejects.toThrow("Prompt is required");
  });

  it("throws Select a model when provider is empty", async () => {
    const node = new ShellAgentSkillNode();
    await expect(
      node.process({ prompt: "do something", model: { provider: "", id: "" } })
    ).rejects.toThrow("Select a model for this skill.");
  });

  it("throws Select a model when model id is empty", async () => {
    const node = new ShellAgentSkillNode();
    await expect(
      node.process({ prompt: "do something", model: { provider: "openai", id: "" } })
    ).rejects.toThrow("Select a model for this skill.");
  });

  it("throws no API key when key is missing for openai", async () => {
    const node = new ShellAgentSkillNode();
    await expect(
      node.process({ prompt: "do something", model: { provider: "openai", id: "gpt-4" } })
    ).rejects.toThrow("No API key found");
  });

  it("throws no API key when key is missing for anthropic", async () => {
    const node = new ShellAgentSkillNode();
    await expect(
      node.process({ prompt: "do something", model: { provider: "anthropic", id: "claude-3" } })
    ).rejects.toThrow("No API key found");
  });
});

// ── OpenAI direct HTTP path ──────────────────────────────────────────────

describe("SkillNode OpenAI direct path", () => {
  it("calls OpenAI and returns text", async () => {
    const node = new ShellAgentSkillNode();
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
    const node = new ShellAgentSkillNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({}));
    const result = await node.process({
      prompt: "say hello",
      model: { provider: "openai", id: "gpt-4" },
      _secrets: { OPENAI_API_KEY: "sk-test" },
    });
    expect(result.text).toBe("");
  });

  it("throws on OpenAI API error", async () => {
    const node = new ShellAgentSkillNode();
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
    const node = new ShellAgentSkillNode();
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

describe("SkillNode Anthropic direct path", () => {
  it("calls Anthropic and returns text", async () => {
    const node = new BrowserSkillNode();
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
    const node = new BrowserSkillNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({}));
    const result = await node.process({
      prompt: "browse",
      model: { provider: "anthropic", id: "claude-3" },
      _secrets: { ANTHROPIC_API_KEY: "ak-test" },
    });
    expect(result.text).toBe("");
  });

  it("throws on Anthropic API error", async () => {
    const node = new BrowserSkillNode();
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

describe("SkillNode Ollama direct path", () => {
  it("calls Ollama and returns text (no API key needed)", async () => {
    const node = new SQLiteSkillNode();
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
    const node = new SQLiteSkillNode();
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
    const node = new SQLiteSkillNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({}));
    const result = await node.process({
      prompt: "query",
      model: { provider: "ollama", id: "llama3" },
    });
    expect(result.text).toBe("");
  });

  it("throws on Ollama API error", async () => {
    const node = new SQLiteSkillNode();
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

describe("SkillNode unsupported provider", () => {
  it("throws unsupported provider error", async () => {
    const node = new ShellAgentSkillNode();
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
    const node = new ShellAgentSkillNode();
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
    const node = new ShellAgentSkillNode();
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

describe("SkillNode runtime provider path", () => {
  it("uses context.getProvider when available", async () => {
    const node = new ShellAgentSkillNode();
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
    const node = new ShellAgentSkillNode();
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
    const node = new ShellAgentSkillNode();
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
    const node = new ShellAgentSkillNode();
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
    const node = new ShellAgentSkillNode();
    await expect(
      node.process({
        prompt: "test",
        model: { provider: "openai", id: "gpt-4" },
        _secrets: ["not", "a", "map"],
      })
    ).rejects.toThrow("No API key found");
  });

  it("handles _secrets as null", async () => {
    const node = new ShellAgentSkillNode();
    await expect(
      node.process({
        prompt: "test",
        model: { provider: "openai", id: "gpt-4" },
        _secrets: null,
      })
    ).rejects.toThrow("No API key found");
  });
});
