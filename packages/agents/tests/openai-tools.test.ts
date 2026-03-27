import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { OpenAIWebSearchTool, OpenAIImageGenerationTool, OpenAITextToSpeechTool } from "../src/tools/openai-tools.js";

const ctx = {} as any;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setApiKey(key?: string) {
  if (key) {
    process.env["OPENAI_API_KEY"] = key;
  } else {
    delete process.env["OPENAI_API_KEY"];
  }
}

// ---------------------------------------------------------------------------
// OpenAIWebSearchTool
// ---------------------------------------------------------------------------

describe("OpenAIWebSearchTool", () => {
  const tool = new OpenAIWebSearchTool();
  let savedKey: string | undefined;

  beforeEach(() => {
    savedKey = process.env["OPENAI_API_KEY"];
  });
  afterEach(() => {
    if (savedKey !== undefined) process.env["OPENAI_API_KEY"] = savedKey;
    else delete process.env["OPENAI_API_KEY"];
    vi.restoreAllMocks();
  });

  it("has correct name and schema", () => {
    expect(tool.name).toBe("openai_web_search");
    expect(tool.inputSchema.required).toContain("query");
  });

  it("returns error when query is missing", async () => {
    setApiKey("fake");
    const result = await tool.process(ctx, {}) as any;
    expect(result.error).toBeDefined();
  });

  it("returns error when query is empty string", async () => {
    setApiKey("fake");
    const result = await tool.process(ctx, { query: "" }) as any;
    expect(result.error).toBeDefined();
  });

  it("returns error when OPENAI_API_KEY is not set", async () => {
    setApiKey(undefined);
    const result = await tool.process(ctx, { query: "test" }) as any;
    expect(result.error).toBeDefined();
  });

  it("returns error shape when API call fails with fake key", async () => {
    setApiKey("fake");
    const result = await tool.process(ctx, { query: "test query" }) as any;
    // With a fake key the openai SDK will throw, caught and returned as error
    expect(result).toHaveProperty("error");
    expect(typeof result.error).toBe("string");
  });

  it("userMessage returns query", () => {
    const msg = tool.userMessage({ query: "nodejs testing" });
    expect(msg).toContain("nodejs testing");
  });

  it("userMessage truncates long query", () => {
    const msg = tool.userMessage({ query: "a".repeat(100) });
    expect(msg.length).toBeLessThanOrEqual(80);
  });
});

// ---------------------------------------------------------------------------
// OpenAIImageGenerationTool
// ---------------------------------------------------------------------------

describe("OpenAIImageGenerationTool", () => {
  const tool = new OpenAIImageGenerationTool();
  let savedKey: string | undefined;

  beforeEach(() => {
    savedKey = process.env["OPENAI_API_KEY"];
  });
  afterEach(() => {
    if (savedKey !== undefined) process.env["OPENAI_API_KEY"] = savedKey;
    else delete process.env["OPENAI_API_KEY"];
    vi.restoreAllMocks();
  });

  it("has correct name and schema", () => {
    expect(tool.name).toBe("openai_image_generation");
    expect(tool.inputSchema.required).toContain("prompt");
    expect(tool.inputSchema.required).toContain("output_file");
  });

  it("returns error when prompt is missing", async () => {
    setApiKey("fake");
    const result = await tool.process(ctx, { output_file: "out.png" }) as any;
    expect(result.error).toBeDefined();
  });

  it("returns error when output_file is missing", async () => {
    setApiKey("fake");
    const result = await tool.process(ctx, { prompt: "a cat" }) as any;
    expect(result.error).toBeDefined();
  });

  it("returns error when OPENAI_API_KEY is not set", async () => {
    setApiKey(undefined);
    const result = await tool.process(ctx, { prompt: "a cat", output_file: "out.png" }) as any;
    expect(result.error).toBeDefined();
  });

  it("returns error shape when API call fails with fake key", async () => {
    setApiKey("fake");
    const result = await tool.process(ctx, { prompt: "a cute cat", output_file: "cat.png" }) as any;
    expect(result).toHaveProperty("error");
    expect(typeof result.error).toBe("string");
  });

  it("userMessage returns prompt", () => {
    const msg = tool.userMessage({ prompt: "a sunset", output_file: "out.png" });
    expect(msg).toContain("sunset");
  });

  it("userMessage truncates long prompt", () => {
    const msg = tool.userMessage({ prompt: "a".repeat(100), output_file: "out.png" });
    expect(msg.length).toBeLessThanOrEqual(80);
  });
});

// ---------------------------------------------------------------------------
// OpenAITextToSpeechTool
// ---------------------------------------------------------------------------

describe("OpenAITextToSpeechTool", () => {
  const tool = new OpenAITextToSpeechTool();
  let savedKey: string | undefined;

  beforeEach(() => {
    savedKey = process.env["OPENAI_API_KEY"];
  });
  afterEach(() => {
    if (savedKey !== undefined) process.env["OPENAI_API_KEY"] = savedKey;
    else delete process.env["OPENAI_API_KEY"];
    vi.restoreAllMocks();
  });

  it("has correct name and schema", () => {
    expect(tool.name).toBe("openai_text_to_speech");
    expect(tool.inputSchema.required).toContain("input");
    expect(tool.inputSchema.required).toContain("voice");
    expect(tool.inputSchema.required).toContain("output_file");
  });

  it("returns error when input is missing", async () => {
    setApiKey("fake");
    const result = await tool.process(ctx, { voice: "alloy", output_file: "out.mp3" }) as any;
    expect(result.error).toBeDefined();
  });

  it("returns error when output_file is missing", async () => {
    setApiKey("fake");
    const result = await tool.process(ctx, { input: "hello", voice: "alloy" }) as any;
    expect(result.error).toBeDefined();
  });

  it("returns error when OPENAI_API_KEY is not set", async () => {
    setApiKey(undefined);
    const result = await tool.process(ctx, { input: "hello", voice: "alloy", output_file: "out.mp3" }) as any;
    expect(result.error).toBeDefined();
  });

  it("returns error when input exceeds 4096 characters", async () => {
    setApiKey("fake");
    const result = await tool.process(ctx, {
      input: "a".repeat(4097),
      voice: "alloy",
      output_file: "out.mp3",
    }) as any;
    expect(result.error).toContain("4096");
  });

  it("returns error shape when API call fails with fake key", async () => {
    setApiKey("fake");
    const result = await tool.process(ctx, {
      input: "hello world",
      voice: "nova",
      output_file: "speech.mp3",
    }) as any;
    expect(result).toHaveProperty("error");
    expect(typeof result.error).toBe("string");
  });

  it("userMessage shows voice", () => {
    const msg = tool.userMessage({ input: "hello", voice: "alloy", output_file: "out.mp3" });
    expect(msg).toContain("alloy");
  });

  it("userMessage includes short text in message", () => {
    const msg = tool.userMessage({ input: "hello world", voice: "echo", output_file: "out.mp3" });
    expect(msg).toContain("hello world");
    expect(msg).toContain("echo");
  });

  it("userMessage truncates when voice+text message is long", () => {
    const msg = tool.userMessage({ input: "a".repeat(100), voice: "onyx", output_file: "out.mp3" });
    expect(msg.length).toBeLessThanOrEqual(80);
  });
});
