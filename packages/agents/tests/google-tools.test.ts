import { describe, it, expect, vi } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { GoogleGroundedSearchTool, GoogleImageGenerationTool } from "../src/tools/google-tools.js";

const ctx = {} as any;

// ---------------------------------------------------------------------------
// GoogleGroundedSearchTool
// ---------------------------------------------------------------------------

describe("GoogleGroundedSearchTool", () => {
  const tool = new GoogleGroundedSearchTool();

  it("has correct name and schema", () => {
    expect(tool.name).toBe("google_grounded_search");
    expect(tool.inputSchema.required).toContain("query");
  });

  it("returns error when query is missing", async () => {
    const result = await tool.process(ctx, {}) as any;
    expect(result.error).toBeDefined();
  });

  it("returns error when query is empty string", async () => {
    const result = await tool.process(ctx, { query: "" }) as any;
    expect(result.error).toBeDefined();
  });

  it("returns error when GEMINI_API_KEY is not set", async () => {
    const original = process.env["GEMINI_API_KEY"];
    delete process.env["GEMINI_API_KEY"];
    try {
      const result = await tool.process(ctx, { query: "test query" }) as any;
      expect(result.error).toBeDefined();
    } finally {
      if (original !== undefined) process.env["GEMINI_API_KEY"] = original;
    }
  });

  it("returns error on API failure", async () => {
    process.env["GEMINI_API_KEY"] = "fake-key";
    // Mock fetch to return an error response
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    }) as any;
    try {
      const result = await tool.process(ctx, { query: "test" }) as any;
      expect(result.error).toContain("403");
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env["GEMINI_API_KEY"];
    }
  });

  it("parses successful response with grounding metadata", async () => {
    process.env["GEMINI_API_KEY"] = "fake-key";
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: "Search result text" }],
          },
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: "https://example.com", title: "Example" } },
              { web: { uri: "https://other.com", title: "Other" } },
            ],
          },
        },
      ],
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    }) as any;
    try {
      const result = await tool.process(ctx, { query: "test search" }) as any;
      expect(result.status).toBe("success");
      expect(result.query).toBe("test search");
      expect(result.results).toContain("Search result text");
      expect(result.sources).toHaveLength(2);
      expect(result.sources[0].url).toBe("https://example.com");
      expect(result.sources[0].title).toBe("Example");
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env["GEMINI_API_KEY"];
    }
  });

  it("handles response with no candidates", async () => {
    process.env["GEMINI_API_KEY"] = "fake-key";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ candidates: [] }),
    }) as any;
    try {
      const result = await tool.process(ctx, { query: "test" }) as any;
      expect(result.error).toBeDefined();
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env["GEMINI_API_KEY"];
    }
  });

  it("handles response with no grounding metadata", async () => {
    process.env["GEMINI_API_KEY"] = "fake-key";
    const mockResponse = {
      candidates: [
        {
          content: { parts: [{ text: "Plain result" }] },
        },
      ],
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    }) as any;
    try {
      const result = await tool.process(ctx, { query: "test" }) as any;
      expect(result.status).toBe("success");
      expect(result.sources).toHaveLength(0);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env["GEMINI_API_KEY"];
    }
  });

  it("userMessage returns query in short message", () => {
    const msg = tool.userMessage({ query: "python tutorial" });
    expect(msg).toContain("python tutorial");
  });

  it("userMessage truncates long query", () => {
    const longQuery = "a".repeat(100);
    const msg = tool.userMessage({ query: longQuery });
    expect(msg.length).toBeLessThanOrEqual(80);
  });
});

// ---------------------------------------------------------------------------
// GoogleImageGenerationTool
// ---------------------------------------------------------------------------

describe("GoogleImageGenerationTool", () => {
  const tool = new GoogleImageGenerationTool();

  it("has correct name and schema", () => {
    expect(tool.name).toBe("google_image_generation");
    expect(tool.inputSchema.required).toContain("prompt");
    expect(tool.inputSchema.required).toContain("output_file");
  });

  it("returns error when prompt is missing", async () => {
    const result = await tool.process(ctx, { output_file: "out.png" }) as any;
    expect(result.error).toBeDefined();
  });

  it("returns error when output_file is missing", async () => {
    const result = await tool.process(ctx, { prompt: "a cat" }) as any;
    expect(result.error).toBeDefined();
  });

  it("returns error when GEMINI_API_KEY is not set", async () => {
    const original = process.env["GEMINI_API_KEY"];
    delete process.env["GEMINI_API_KEY"];
    try {
      const result = await tool.process(ctx, { prompt: "a cat", output_file: "out.png" }) as any;
      expect(result.error).toBeDefined();
    } finally {
      if (original !== undefined) process.env["GEMINI_API_KEY"] = original;
    }
  });

  it("returns error on API failure", async () => {
    process.env["GEMINI_API_KEY"] = "fake-key";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("Bad Request"),
    }) as any;
    try {
      const result = await tool.process(ctx, { prompt: "a cat", output_file: "out.png" }) as any;
      expect(result.error).toContain("400");
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env["GEMINI_API_KEY"];
    }
  });

  it("returns error when no predictions in response", async () => {
    process.env["GEMINI_API_KEY"] = "fake-key";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ predictions: [] }),
    }) as any;
    try {
      const result = await tool.process(ctx, { prompt: "a cat", output_file: "out.png" }) as any;
      expect(result.error).toBeDefined();
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env["GEMINI_API_KEY"];
    }
  });

  it("returns error when no image bytes in prediction", async () => {
    process.env["GEMINI_API_KEY"] = "fake-key";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ predictions: [{}] }),
    }) as any;
    try {
      const result = await tool.process(ctx, { prompt: "a cat", output_file: "out.png" }) as any;
      expect(result.error).toBeDefined();
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env["GEMINI_API_KEY"];
    }
  });

  it("saves image and returns success", async () => {
    process.env["GEMINI_API_KEY"] = "fake-key";
    const fakeImageB64 = Buffer.from("fake-png-data").toString("base64");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        predictions: [{ bytesBase64Encoded: fakeImageB64 }],
      }),
    }) as any;
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "google-tools-test-"));
    try {
      const result = await tool.process(
        { workspaceDir: tmpDir } as any,
        { prompt: "a cute cat", output_file: "cat.png" },
      ) as any;
      expect(result.status).toBe("success");
      expect(result.type).toBe("image");
      expect(result.prompt).toBe("a cute cat");
      expect(result.output_file).toBe("cat.png");
      // Verify file was actually written
      const written = await fs.readFile(path.join(tmpDir, "cat.png"));
      expect(written).toEqual(Buffer.from("fake-png-data"));
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env["GEMINI_API_KEY"];
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("userMessage returns prompt in short message", () => {
    const msg = tool.userMessage({ prompt: "a sunset", output_file: "out.png" });
    expect(msg).toContain("a sunset");
  });

  it("userMessage truncates long prompt", () => {
    const longPrompt = "a".repeat(100);
    const msg = tool.userMessage({ prompt: longPrompt, output_file: "out.png" });
    expect(msg.length).toBeLessThanOrEqual(80);
  });
});
