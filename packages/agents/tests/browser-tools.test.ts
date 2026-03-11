import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BrowserTool, ScreenshotTool, htmlToText } from "../src/tools/browser-tools.js";

const mockContext = {} as any;

// ---------------------------------------------------------------------------
// htmlToText
// ---------------------------------------------------------------------------

describe("htmlToText", () => {
  it("strips script and style blocks", () => {
    const html = `<html><head><style>body{color:red}</style></head>
      <body><script>alert('hi')</script><p>Hello</p></body></html>`;
    const text = htmlToText(html);
    expect(text).toContain("Hello");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("color:red");
  });

  it("strips HTML tags and keeps text", () => {
    expect(htmlToText("<div><b>bold</b> and <i>italic</i></div>")).toBe(
      "bold and italic"
    );
  });

  it("decodes named HTML entities", () => {
    expect(htmlToText("&amp; &lt; &gt; &quot; &#39;")).toBe('& < > " \'');
  });

  it("decodes numeric entities", () => {
    expect(htmlToText("&#65;&#x42;")).toBe("AB");
  });

  it("decodes &nbsp;", () => {
    expect(htmlToText("hello&nbsp;world")).toBe("hello world");
  });

  it("collapses excessive whitespace", () => {
    const result = htmlToText("<p>  lots   of   spaces  </p>");
    expect(result).toBe("lots of spaces");
  });

  it("collapses excessive newlines", () => {
    const html = "<p>a</p>\n\n\n\n\n<p>b</p>";
    const result = htmlToText(html);
    // Should have at most two consecutive newlines
    expect(result).not.toMatch(/\n{3,}/);
    expect(result).toContain("a");
    expect(result).toContain("b");
  });

  it("truncates to maxLength", () => {
    const longHtml = "<p>" + "x".repeat(100_000) + "</p>";
    const result = htmlToText(longHtml, 500);
    expect(result.length).toBeLessThanOrEqual(500);
  });

  it("handles empty input", () => {
    expect(htmlToText("")).toBe("");
  });

  it("replaces <br> with newlines", () => {
    const result = htmlToText("line1<br>line2<br/>line3");
    expect(result).toContain("line1\nline2\nline3");
  });
});

// ---------------------------------------------------------------------------
// BrowserTool
// ---------------------------------------------------------------------------

describe("BrowserTool", () => {
  const tool = new BrowserTool();

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("has correct name and schema", () => {
    expect(tool.name).toBe("browser");
    expect(tool.inputSchema).toHaveProperty("properties");
    expect((tool.inputSchema as any).required).toContain("url");
  });

  it("returns error when url is missing", async () => {
    const result = await tool.process(mockContext, {});
    expect(result).toEqual({ error: "URL is required" });
  });

  it("returns error for invalid URL", async () => {
    const result = (await tool.process(mockContext, {
      url: "not-a-url",
    })) as any;
    expect(result.error).toMatch(/Invalid URL/);
  });

  it("blocks search engine URLs", async () => {
    const result = (await tool.process(mockContext, {
      url: "https://www.google.com/search?q=test",
    })) as any;
    expect(result.error).toMatch(/search engine/i);
  });

  it("fetches and converts HTML to text", async () => {
    const html = "<html><body><h1>Title</h1><p>Content here</p></body></html>";
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => html,
    });

    const result = (await tool.process(mockContext, {
      url: "https://example.com",
    })) as any;

    expect(result.success).toBe(true);
    expect(result.url).toBe("https://example.com");
    expect(result.content).toContain("Title");
    expect(result.content).toContain("Content here");
    expect(result.content).not.toContain("<h1>");
  });

  it("returns error for non-OK HTTP responses", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    const result = (await tool.process(mockContext, {
      url: "https://example.com/missing",
    })) as any;

    expect(result.error).toMatch(/404/);
  });

  it("returns error on fetch failure", async () => {
    (globalThis.fetch as any).mockRejectedValueOnce(new Error("Network error"));

    const result = (await tool.process(mockContext, {
      url: "https://example.com",
    })) as any;

    expect(result.error).toMatch(/Network error/);
  });

  it("returns error on fetch failure with non-Error thrown", async () => {
    (globalThis.fetch as any).mockRejectedValueOnce("string error");

    const result = (await tool.process(mockContext, {
      url: "https://example.com",
    })) as any;

    expect(result.error).toMatch(/Error fetching page/);
  });

  it("userMessage formats correctly", () => {
    expect(tool.userMessage({ url: "https://example.com" })).toBe(
      "Browsing https://example.com..."
    );
  });

  it("userMessage truncates long URLs", () => {
    const longUrl = "https://example.com/" + "a".repeat(200);
    const msg = tool.userMessage({ url: longUrl });
    expect(msg).toBe("Browsing a specified URL...");
  });

  it("produces valid provider tool shape", () => {
    const pt = tool.toProviderTool();
    expect(pt.name).toBe("browser");
    expect(pt.description).toBeTruthy();
    expect(pt.inputSchema).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// ScreenshotTool
// ---------------------------------------------------------------------------

describe("ScreenshotTool", () => {
  const tool = new ScreenshotTool();
  const originalEnv = process.env.BROWSER_URL;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    delete process.env.BROWSER_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalEnv !== undefined) {
      process.env.BROWSER_URL = originalEnv;
    } else {
      delete process.env.BROWSER_URL;
    }
  });

  it("has correct name and schema", () => {
    expect(tool.name).toBe("take_screenshot");
    expect((tool.inputSchema as any).required).toContain("url");
    expect((tool.inputSchema as any).required).toContain("output_file");
  });

  it("returns error when url is missing", async () => {
    const result = (await tool.process(mockContext, {})) as any;
    expect(result.error).toMatch(/URL is required/);
  });

  it("returns error when BROWSER_URL is not set", async () => {
    const result = (await tool.process(mockContext, {
      url: "https://example.com",
      output_file: "shot.png",
    })) as any;
    expect(result.error).toMatch(/BROWSER_URL/);
  });

  it("calls browser service when BROWSER_URL is set", async () => {
    process.env.BROWSER_URL = "http://localhost:9222/screenshot";
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ output_file: "/workspace/shot.png" }),
    });

    const result = (await tool.process(mockContext, {
      url: "https://example.com",
      output_file: "shot.png",
    })) as any;

    expect(result.success).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:9222/screenshot",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("returns error when browser service fails", async () => {
    process.env.BROWSER_URL = "http://localhost:9222/screenshot";
    (globalThis.fetch as any).mockRejectedValueOnce(new Error("Connection refused"));

    const result = (await tool.process(mockContext, {
      url: "https://example.com",
      output_file: "shot.png",
    })) as any;

    expect(result.error).toMatch(/Connection refused/);
  });

  it("returns error when browser service returns non-OK", async () => {
    process.env.BROWSER_URL = "http://localhost:9222/screenshot";
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    const result = (await tool.process(mockContext, {
      url: "https://example.com",
      output_file: "shot.png",
    })) as any;

    expect(result.error).toMatch(/Browser service returned HTTP 500/);
  });

  it("returns error when browser service fetch throws non-Error", async () => {
    process.env.BROWSER_URL = "http://localhost:9222/screenshot";
    (globalThis.fetch as any).mockRejectedValueOnce("string error");

    const result = (await tool.process(mockContext, {
      url: "https://example.com",
      output_file: "shot.png",
    })) as any;

    expect(result.error).toMatch(/Error taking screenshot/);
  });

  it("userMessage formats correctly", () => {
    expect(
      tool.userMessage({ url: "https://example.com", output_file: "out.png" })
    ).toBe("Taking screenshot of https://example.com and saving to out.png.");
  });

  it("userMessage truncates long URLs", () => {
    const longUrl = "https://example.com/" + "a".repeat(200);
    const msg = tool.userMessage({ url: longUrl, output_file: "out.png" });
    expect(msg).toContain("Taking screenshot of a page");
    expect(msg).toContain("out.png");
  });

  it("userMessage handles missing params", () => {
    const msg = tool.userMessage({});
    expect(msg).toContain("Taking screenshot");
  });
});
