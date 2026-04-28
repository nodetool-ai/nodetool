import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DownloadFileTool, HttpRequestTool } from "../src/tools/http-tools.js";
import type { ProcessingContext } from "@nodetool-ai/runtime";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "http-tools-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeMockContext(): ProcessingContext {
  return {
    resolveWorkspacePath: (p: string) => join(tempDir, p)
  } as unknown as ProcessingContext;
}

function mockFetchResponse(
  body: string | ArrayBuffer,
  init: {
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
  } = {}
) {
  const status = init.status ?? 200;
  const headers = new Headers(init.headers ?? {});
  const ok = status >= 200 && status < 300;

  const response = {
    ok,
    status,
    statusText: init.statusText ?? "OK",
    headers,
    text: async () => (typeof body === "string" ? body : ""),
    arrayBuffer: async () =>
      typeof body === "string" ? new TextEncoder().encode(body).buffer : body
  } as unknown as Response;

  return vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
}

// ---------------------------------------------------------------------------
// DownloadFileTool
// ---------------------------------------------------------------------------

describe("DownloadFileTool", () => {
  const tool = new DownloadFileTool();

  it("has correct tool name and schema", () => {
    expect(tool.name).toBe("download_file");
    const pt = tool.toProviderTool();
    expect(pt.name).toBe("download_file");
    expect(pt.description).toBeTruthy();
    expect(pt.inputSchema).toBeDefined();
    expect((pt.inputSchema as any).required).toEqual(
      expect.arrayContaining(["url", "output_file"])
    );
  });

  it("downloads a file and saves to workspace", async () => {
    const content = "hello world file contents";
    const fetchSpy = mockFetchResponse(content, {
      headers: { "Content-Type": "text/plain", "Content-Length": "25" }
    });

    const ctx = makeMockContext();
    const result = (await tool.process(ctx, {
      url: "https://example.com/file.txt",
      output_file: "downloads/file.txt"
    })) as Record<string, unknown>;

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
    expect(result.url).toBe("https://example.com/file.txt");
    expect(result.output_file).toBe("downloads/file.txt");
    expect(result.content_type).toBe("text/plain");
    expect(result.file_size_bytes).toBe(25);

    const saved = readFileSync(join(tempDir, "downloads", "file.txt"), "utf-8");
    expect(saved).toBe(content);
  });

  it("returns error when URL is missing", async () => {
    const ctx = makeMockContext();
    const result = (await tool.process(ctx, {
      output_file: "out.txt"
    })) as Record<string, unknown>;
    expect(result.error).toBe("URL is required");
  });

  it("returns error when output_file is missing", async () => {
    const ctx = makeMockContext();
    const result = (await tool.process(ctx, {
      url: "https://example.com/file.txt"
    })) as Record<string, unknown>;
    expect(result.error).toBe("Output file is required");
  });

  it("returns error on non-200 response", async () => {
    mockFetchResponse("Not Found", { status: 404 });

    const ctx = makeMockContext();
    const result = (await tool.process(ctx, {
      url: "https://example.com/missing",
      output_file: "out.txt"
    })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.status_code).toBe(404);
    expect(result.error).toContain("404");
  });

  it("returns error when fetch throws", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const ctx = makeMockContext();
    const result = (await tool.process(ctx, {
      url: "https://example.com/fail",
      output_file: "out.txt"
    })) as Record<string, unknown>;

    expect(result.error).toContain("Network error");
  });

  it("userMessage returns descriptive string", () => {
    const msg = tool.userMessage({
      url: "https://example.com/f.txt",
      output_file: "out.txt"
    });
    expect(msg).toContain("example.com");
    expect(msg).toContain("out.txt");
  });

  it("userMessage truncates long messages", () => {
    const msg = tool.userMessage({
      url: "https://example.com/" + "a".repeat(100),
      output_file: "o".repeat(100)
    });
    expect(msg.length).toBeLessThanOrEqual(80);
  });

  it("userMessage falls back to generic when output_file is also long", () => {
    const msg = tool.userMessage({
      url: "https://example.com/" + "a".repeat(100),
      output_file: "very/long/path/" + "f".repeat(80) + ".txt"
    });
    expect(msg).toBe("Downloading a file...");
  });

  it("merges custom headers when provided", async () => {
    const fetchSpy = mockFetchResponse("ok", {
      headers: { "Content-Type": "text/plain" }
    });

    const ctx = makeMockContext();
    await tool.process(ctx, {
      url: "https://example.com/file.txt",
      output_file: "out.txt",
      headers: { "X-Custom": "value" }
    });

    const calledHeaders = (fetchSpy.mock.calls[0][1] as RequestInit)
      .headers as Record<string, string>;
    expect(calledHeaders["X-Custom"]).toBe("value");
  });

  it("applies custom timeout", async () => {
    const fetchSpy = mockFetchResponse("ok", {
      headers: { "Content-Type": "text/plain" }
    });

    const ctx = makeMockContext();
    await tool.process(ctx, {
      url: "https://example.com/file.txt",
      output_file: "out.txt",
      timeout: 5
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("handles binary content", async () => {
    const binaryData = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    mockFetchResponse(binaryData.buffer as ArrayBuffer, {
      headers: { "Content-Type": "image/png" }
    });

    const ctx = makeMockContext();
    const result = (await tool.process(ctx, {
      url: "https://example.com/image.png",
      output_file: "image.png"
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    const saved = readFileSync(join(tempDir, "image.png"));
    expect(saved[0]).toBe(0x89);
    expect(saved[1]).toBe(0x50);
  });
});

// ---------------------------------------------------------------------------
// HttpRequestTool
// ---------------------------------------------------------------------------

describe("HttpRequestTool", () => {
  const tool = new HttpRequestTool();

  it("has correct tool name and schema", () => {
    expect(tool.name).toBe("http_request");
    const pt = tool.toProviderTool();
    expect(pt.name).toBe("http_request");
    expect(pt.inputSchema).toBeDefined();
    expect((pt.inputSchema as any).required).toContain("url");
  });

  it("makes a GET request and returns the body", async () => {
    const fetchSpy = mockFetchResponse('{"key":"value"}', {
      headers: { "Content-Type": "application/json" }
    });

    const ctx = makeMockContext();
    const result = (await tool.process(ctx, {
      url: "https://api.example.com/data"
    })) as Record<string, unknown>;

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0];
    expect(calledUrl).toBe("https://api.example.com/data");
    expect((calledInit as RequestInit).method).toBe("GET");

    expect(result.success).toBe(true);
    expect(result.status_code).toBe(200);
    expect(result.body).toBe('{"key":"value"}');
    expect(result.content_type).toBe("application/json");
  });

  it("makes a POST request with body", async () => {
    const fetchSpy = mockFetchResponse("created", { status: 201 });

    const ctx = makeMockContext();
    const result = (await tool.process(ctx, {
      url: "https://api.example.com/create",
      method: "POST",
      body: '{"name":"test"}'
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.status_code).toBe(201);
    const [, calledInit] = fetchSpy.mock.calls[0];
    expect((calledInit as RequestInit).method).toBe("POST");
    expect((calledInit as RequestInit).body).toBe('{"name":"test"}');
  });

  it("returns error when URL is missing", async () => {
    const ctx = makeMockContext();
    const result = (await tool.process(ctx, {})) as Record<string, unknown>;
    expect(result.error).toBe("URL is required");
  });

  it("handles non-ok responses", async () => {
    mockFetchResponse("Server Error", { status: 500 });

    const ctx = makeMockContext();
    const result = (await tool.process(ctx, {
      url: "https://api.example.com/error"
    })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.status_code).toBe(500);
    expect(result.body).toBe("Server Error");
  });

  it("returns error when fetch throws", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("Connection refused")
    );

    const ctx = makeMockContext();
    const result = (await tool.process(ctx, {
      url: "https://api.example.com/fail"
    })) as Record<string, unknown>;

    expect(result.error).toContain("Connection refused");
  });

  it("defaults method to GET", async () => {
    const fetchSpy = mockFetchResponse("ok");

    const ctx = makeMockContext();
    await tool.process(ctx, { url: "https://example.com" });

    const [, calledInit] = fetchSpy.mock.calls[0];
    expect((calledInit as RequestInit).method).toBe("GET");
  });

  it("does not send body for GET requests", async () => {
    const fetchSpy = mockFetchResponse("ok");

    const ctx = makeMockContext();
    await tool.process(ctx, {
      url: "https://example.com",
      method: "GET",
      body: "should be ignored"
    });

    const [, calledInit] = fetchSpy.mock.calls[0];
    expect((calledInit as RequestInit).body).toBeUndefined();
  });

  it("userMessage returns method and url", () => {
    const msg = tool.userMessage({
      url: "https://example.com/api",
      method: "post"
    });
    expect(msg).toBe("POST https://example.com/api");
  });

  it("userMessage defaults to GET", () => {
    const msg = tool.userMessage({ url: "https://example.com" });
    expect(msg).toContain("GET");
  });

  it("userMessage truncates long URLs", () => {
    const msg = tool.userMessage({
      url: "https://example.com/" + "a".repeat(100),
      method: "GET"
    });
    expect(msg).toBe("GET request...");
  });

  it("merges custom headers when provided", async () => {
    const fetchSpy = mockFetchResponse("ok");

    const ctx = makeMockContext();
    await tool.process(ctx, {
      url: "https://example.com",
      headers: { "X-Custom": "value" }
    });

    const calledHeaders = (fetchSpy.mock.calls[0][1] as RequestInit)
      .headers as Record<string, string>;
    expect(calledHeaders["X-Custom"]).toBe("value");
  });

  it("applies custom timeout", async () => {
    const fetchSpy = mockFetchResponse("ok");

    const ctx = makeMockContext();
    await tool.process(ctx, {
      url: "https://example.com",
      timeout: 10
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("sends body for PUT and PATCH methods", async () => {
    for (const method of ["PUT", "PATCH"]) {
      const fetchSpy = mockFetchResponse("ok");

      const ctx = makeMockContext();
      await tool.process(ctx, {
        url: "https://example.com",
        method,
        body: '{"data":true}'
      });

      const [, calledInit] = fetchSpy.mock.calls[0];
      expect((calledInit as RequestInit).body).toBe('{"data":true}');
      fetchSpy.mockRestore();
    }
  });
});
