/**
 * Coverage tests for lib-browser, lib-mail, lib-supabase, lib-ocr, lib-markitdown.
 *
 * Strategy:
 * - lib-browser: Real playwright against a local HTTP server for Browser, Screenshot, BrowserNavigation.
 * - lib-mail: SendEmail with invalid config → error. Gmail stubs throw.
 * - lib-supabase: All nodes throw when no credentials provided.
 * - lib-ocr: Test error path (no image data/uri). Test with a small sharp-generated PNG.
 * - lib-markitdown: Test HTML conversion, plain text pass-through, error on missing data/uri,
 *   file URI reading, and docx branch (error path).
 */

import { describe, expect, it, vi } from "vitest";
import http from "node:http";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";

import {
  BrowserLibNode,
  ScreenshotLibNode,
  BrowserNavigationLibNode,
  SendEmailLibNode,
  GmailSearchLibNode,
  AddLabelLibNode,
  MoveToArchiveLibNode,
  SelectLibNode,
  ConvertToMarkdownLibNode
} from "../../src/index.js";

import {
  SpiderCrawlLibNode,
  WebFetchLibNode,
  DownloadFileLibNode
} from "../../src/nodes/lib-browser.js";

// Supabase nodes with qualified imports to avoid name collisions with sqlite
import {
  InsertLibNode as SupabaseInsertLibNode,
  UpdateLibNode as SupabaseUpdateLibNode,
  DeleteLibNode as SupabaseDeleteLibNode,
  UpsertLibNode as SupabaseUpsertLibNode,
  RPCLibNode as SupabaseRPCLibNode
} from "../../src/nodes/lib-supabase.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function withServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not bind test server");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  }
}

const HTML_PAGE = `<!DOCTYPE html>
<html><head><title>Test Page</title></head>
<body>
  <h1>Hello Browser</h1>
  <p id="info">Some paragraph text here.</p>
  <input id="myinput" value="input_value" data-custom="attr_val" />
  <a href="/page2">Link to page 2</a>
</body></html>`;

const HTML_PAGE2 = `<!DOCTYPE html>
<html><head><title>Page 2</title></head>
<body><p>Content of page 2.</p></body></html>`;

function testHandler(req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.url === "/" || req.url === "/page1") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(HTML_PAGE);
  } else if (req.url === "/page2") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(HTML_PAGE2);
  } else {
    res.writeHead(404);
    res.end("not found");
  }
}

// ---------------------------------------------------------------------------
// lib-browser — WebFetch / DownloadFile (ensure process body is covered here)
// ---------------------------------------------------------------------------

describe("lib.browser.WebFetch (coverage)", () => {
  it("fetches HTML page", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await (() => {
        const _n = new WebFetchLibNode();
        _n.assign({ url: baseUrl });
        return _n.process();
      })();
      expect(String(result.output)).toContain("Hello Browser");
    });
  });
});

describe("lib.browser.DownloadFile (coverage)", () => {
  it("downloads content as base64 bytes", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await (() => {
        const _n = new DownloadFileLibNode();
        _n.assign({
          url: `${baseUrl}/page2`
        });
        return _n.process();
      })();
      const output = result.output as { __bytes__: string };
      expect(output.__bytes__).toBeDefined();
      expect(output.__bytes__.length).toBeGreaterThan(0);
    });
  });

  it("defaults method", () => {
    const d = new DownloadFileLibNode().serialize();
    expect(d).toHaveProperty("url");
  });

  it("WebFetchLibNode defaults", () => {
    const d = new WebFetchLibNode().serialize();
    expect(d).toHaveProperty("url");
    expect(d).toHaveProperty("selector");
  });
});

// ---------------------------------------------------------------------------
// lib-browser — Playwright-based nodes
// ---------------------------------------------------------------------------

describe.skip("lib.browser.Browser (playwright)", () => {
  it("fetches page content and returns markdown + metadata", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await (() => {
        const _n = new BrowserLibNode();
        _n.assign({ url: baseUrl });
        return _n.process();
      })();
      expect(result.success).toBe(true);
      expect(String(result.content)).toContain("Hello Browser");
      const meta = result.metadata as { title: string };
      expect(meta.title).toBe("Test Page");
    });
  }, 30_000);

  it("throws on empty URL", async () => {
    await expect(
      (() => {
        const _n = new BrowserLibNode();
        _n.assign({ url: "" });
        return _n.process();
      })()
    ).rejects.toThrow("URL is required");
  });
});

describe.skip("lib.browser.Screenshot (playwright)", () => {
  it("takes a full-page screenshot", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await (() => {
        const _n = new ScreenshotLibNode();
        _n.assign({ url: baseUrl });
        return _n.process();
      })();
      expect(result.success).toBe(true);
      const output = result.output as { type: string; data: string };
      expect(output.type).toBe("image");
      expect(output.data.length).toBeGreaterThan(0);
      expect(result.url).toBe(baseUrl);
    });
  }, 30_000);

  it("takes a screenshot of a specific selector", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await (() => {
        const _n = new ScreenshotLibNode();
        _n.assign({
          url: baseUrl,
          selector: "h1"
        });
        return _n.process();
      })();
      expect(result.success).toBe(true);
      const output = result.output as { type: string; data: string };
      expect(output.data.length).toBeGreaterThan(0);
    });
  }, 30_000);

  it("throws on empty URL", async () => {
    await expect(
      (() => {
        const _n = new ScreenshotLibNode();
        _n.assign({ url: "" });
        return _n.process();
      })()
    ).rejects.toThrow("URL is required");
  });
});

describe.skip("lib.browser.BrowserNavigation (playwright)", () => {
  it("goto action returns success", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await (() => {
        const _n = new BrowserNavigationLibNode();
        _n.assign({
          url: baseUrl,
          action: "goto"
        });
        return _n.process();
      })();
      expect(result.success).toBe(true);
      expect(result.action).toBe("goto");
    });
  }, 30_000);

  it("reload action returns success", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await (() => {
        const _n = new BrowserNavigationLibNode();
        _n.assign({
          url: baseUrl,
          action: "reload"
        });
        return _n.process();
      })();
      expect(result.success).toBe(true);
      expect(result.action).toBe("reload");
    });
  }, 30_000);

  it("click action clicks an element", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await (() => {
        const _n = new BrowserNavigationLibNode();
        _n.assign({
          url: baseUrl,
          action: "click",
          selector: "a"
        });
        return _n.process();
      })();
      expect(result.success).toBe(true);
      expect(result.action).toBe("click");
    });
  }, 30_000);

  it("extract text from selector", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await (() => {
        const _n = new BrowserNavigationLibNode();
        _n.assign({
          url: baseUrl,
          action: "extract",
          selector: "#info",
          extract_type: "text"
        });
        return _n.process();
      })();
      expect(result.success).toBe(true);
      expect(String(result.extracted)).toContain("paragraph text");
    });
  }, 30_000);

  it("extract html from selector", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await (() => {
        const _n = new BrowserNavigationLibNode();
        _n.assign({
          url: baseUrl,
          action: "extract",
          selector: "#info",
          extract_type: "html"
        });
        return _n.process();
      })();
      expect(result.success).toBe(true);
      expect(String(result.extracted)).toContain("<p");
    });
  }, 30_000);

  it("extract value from input element", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await (() => {
        const _n = new BrowserNavigationLibNode();
        _n.assign({
          url: baseUrl,
          action: "extract",
          selector: "#myinput",
          extract_type: "value"
        });
        return _n.process();
      })();
      expect(result.success).toBe(true);
      expect(result.extracted).toBe("input_value");
    });
  }, 30_000);

  it("extract attribute from element", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await (() => {
        const _n = new BrowserNavigationLibNode();
        _n.assign({
          url: baseUrl,
          action: "extract",
          selector: "#myinput",
          extract_type: "attribute",
          attribute: "data-custom"
        });
        return _n.process();
      })();
      expect(result.success).toBe(true);
      expect(result.extracted).toBe("attr_val");
    });
  }, 30_000);

  it("extract html from full page (no selector)", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await (() => {
        const _n = new BrowserNavigationLibNode();
        _n.assign({
          url: baseUrl,
          action: "extract",
          extract_type: "html"
        });
        return _n.process();
      })();
      expect(result.success).toBe(true);
      expect(String(result.extracted)).toContain("Hello Browser");
    });
  }, 30_000);

  it("extract text from full page (no selector)", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await (() => {
        const _n = new BrowserNavigationLibNode();
        _n.assign({
          url: baseUrl,
          action: "extract",
          extract_type: "text"
        });
        return _n.process();
      })();
      expect(result.success).toBe(true);
      expect(String(result.extracted)).toContain("Hello Browser");
    });
  }, 30_000);

  it("back action (no prior navigation — just runs)", async () => {
    await withServer(testHandler, async (baseUrl) => {
      // back/forward on a fresh page won't fail, just returns success
      const result = await (() => {
        const _n = new BrowserNavigationLibNode();
        _n.assign({
          url: baseUrl,
          action: "back"
        });
        return _n.process();
      })();
      expect(result.success).toBe(true);
      expect(result.action).toBe("back");
    });
  }, 30_000);

  it("forward action", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await (() => {
        const _n = new BrowserNavigationLibNode();
        _n.assign({
          url: baseUrl,
          action: "forward"
        });
        return _n.process();
      })();
      expect(result.success).toBe(true);
      expect(result.action).toBe("forward");
    });
  }, 30_000);

  it("wait_for option waits for selector", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await (() => {
        const _n = new BrowserNavigationLibNode();
        _n.assign({
          url: baseUrl,
          action: "goto",
          wait_for: "h1"
        });
        return _n.process();
      })();
      expect(result.success).toBe(true);
    });
  }, 30_000);

  it("throws on goto with empty URL", async () => {
    await expect(
      (() => {
        const _n = new BrowserNavigationLibNode();
        _n.assign({ action: "goto", url: "" });
        return _n.process();
      })()
    ).rejects.toThrow("URL is required for goto action");
  });
});

// ---------------------------------------------------------------------------
// lib-browser — Mocked playwright tests (cover process() bodies)
// ---------------------------------------------------------------------------

describe("lib.browser.Browser (mocked playwright)", () => {
  it("fetches page content and returns { success, content, metadata }", async () => {
    const mockClose = vi.fn();
    const mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      content: vi
        .fn()
        .mockResolvedValue(
          "<html><head><title>Mock Title</title></head><body><h1>Hello</h1></body></html>"
        ),
      title: vi.fn().mockResolvedValue("Mock Title")
    };
    const mockContext = {
      newPage: vi.fn().mockResolvedValue(mockPage)
    };
    const mockBrowser = {
      newContext: vi.fn().mockResolvedValue(mockContext),
      close: mockClose
    };

    vi.doMock("playwright", () => ({
      chromium: { launch: vi.fn().mockResolvedValue(mockBrowser) }
    }));

    try {
      // Re-import to pick up mock
      const { BrowserLibNode: MockedBrowserLibNode } =
        await import("../../src/nodes/lib-browser.js");
      const node = new MockedBrowserLibNode();
      node.assign({ url: "http://example.com", timeout: 5000 });
      const result = await node.process();

      expect(result.success).toBe(true);
      expect(typeof result.content).toBe("string");
      expect(result.content).toContain("Hello");
      expect(result.metadata).toBeDefined();
      expect((result.metadata as Record<string, unknown>).title).toBe(
        "Mock Title"
      );
      expect(mockClose).toHaveBeenCalled();
    } finally {
      vi.doUnmock("playwright");
    }
  });

  it("throws on empty URL (no playwright needed)", async () => {
    await expect(
      (() => {
        const _n = new BrowserLibNode();
        _n.assign({ url: "" });
        return _n.process();
      })()
    ).rejects.toThrow("URL is required");
  });
});

describe("lib.browser.Screenshot (mocked playwright)", () => {
  it("takes screenshot and returns { success, output: { type, data } }", async () => {
    const screenshotBuffer = Buffer.from("fake-png-data");
    const mockClose = vi.fn();
    const mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      screenshot: vi.fn().mockResolvedValue(screenshotBuffer)
    };
    const mockContext = {
      newPage: vi.fn().mockResolvedValue(mockPage)
    };
    const mockBrowser = {
      newContext: vi.fn().mockResolvedValue(mockContext),
      close: mockClose
    };

    vi.doMock("playwright", () => ({
      chromium: { launch: vi.fn().mockResolvedValue(mockBrowser) }
    }));

    try {
      const { ScreenshotLibNode: MockedScreenshotLibNode } =
        await import("../../src/nodes/lib-browser.js");
      const node = new MockedScreenshotLibNode();
      node.assign({ url: "http://example.com", timeout: 5000 });
      const result = await node.process();

      expect((result as Record<string, unknown>).success).toBe(true);
      const output = result.output as { type: string; data: string };
      expect(output.type).toBe("image");
      expect(output.data.length).toBeGreaterThan(0);
      expect(output.data).toBe(screenshotBuffer.toString("base64"));
      expect(mockClose).toHaveBeenCalled();
    } finally {
      vi.doUnmock("playwright");
    }
  });

  it("takes screenshot of a specific selector", async () => {
    const screenshotBuffer = Buffer.from("selector-screenshot");
    const mockElement = {
      screenshot: vi.fn().mockResolvedValue(screenshotBuffer)
    };
    const mockClose = vi.fn();
    const mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(mockElement)
    };
    const mockContext = {
      newPage: vi.fn().mockResolvedValue(mockPage)
    };
    const mockBrowser = {
      newContext: vi.fn().mockResolvedValue(mockContext),
      close: mockClose
    };

    vi.doMock("playwright", () => ({
      chromium: { launch: vi.fn().mockResolvedValue(mockBrowser) }
    }));

    try {
      const { ScreenshotLibNode: MockedScreenshotLibNode } =
        await import("../../src/nodes/lib-browser.js");
      const node = new MockedScreenshotLibNode();
      node.assign({ url: "http://example.com", selector: "h1", timeout: 5000 });
      const result = await node.process();

      expect((result as Record<string, unknown>).success).toBe(true);
      const output = result.output as { type: string; data: string };
      expect(output.type).toBe("image");
      expect(output.data).toBe(screenshotBuffer.toString("base64"));
    } finally {
      vi.doUnmock("playwright");
    }
  });

  it("throws on empty URL", async () => {
    await expect(
      (() => {
        const _n = new ScreenshotLibNode();
        _n.assign({ url: "" });
        return _n.process();
      })()
    ).rejects.toThrow("URL is required");
  });
});

describe("lib.browser.BrowserNavigation (mocked playwright)", () => {
  function makeMockBrowser(overrides: Record<string, unknown> = {}) {
    const mockClose = vi.fn();
    const mockElement = {
      click: vi.fn().mockResolvedValue(undefined),
      evaluate: vi
        .fn()
        .mockImplementation((fn: Function, ...args: unknown[]) => {
          // Simulate different extract types
          return Promise.resolve("extracted-content");
        })
    };
    const mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
      goBack: vi.fn().mockResolvedValue(undefined),
      goForward: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(mockElement),
      content: vi.fn().mockResolvedValue("<html><body>Full HTML</body></html>"),
      evaluate: vi.fn().mockResolvedValue("page-text-content"),
      ...overrides
    };
    const mockContext = {
      newPage: vi.fn().mockResolvedValue(mockPage)
    };
    const mockBrowser = {
      newContext: vi.fn().mockResolvedValue(mockContext),
      close: mockClose
    };
    return { mockBrowser, mockPage, mockElement, mockClose };
  }

  it("goto action returns { success, action, extracted }", async () => {
    const { mockBrowser } = makeMockBrowser();
    vi.doMock("playwright", () => ({
      chromium: { launch: vi.fn().mockResolvedValue(mockBrowser) }
    }));

    try {
      const { BrowserNavigationLibNode: MockedNode } =
        await import("../../src/nodes/lib-browser.js");
      const node = new MockedNode();
      node.assign({ url: "http://example.com", action: "goto", timeout: 5000 });
      const result = await node.process();

      expect(result.success).toBe(true);
      expect(result.action).toBe("goto");
      expect(result.extracted).toBeNull();
    } finally {
      vi.doUnmock("playwright");
    }
  });

  it("extract action with selector extracts text", async () => {
    const { mockBrowser } = makeMockBrowser();
    vi.doMock("playwright", () => ({
      chromium: { launch: vi.fn().mockResolvedValue(mockBrowser) }
    }));

    try {
      const { BrowserNavigationLibNode: MockedNode } =
        await import("../../src/nodes/lib-browser.js");
      const node = new MockedNode();
      node.assign({
        url: "http://example.com",
        action: "extract",
        selector: "#info",
        extract_type: "text",
        timeout: 5000
      });
      const result = await node.process();

      expect(result.success).toBe(true);
      expect(result.action).toBe("extract");
      expect(result.extracted).toBe("extracted-content");
    } finally {
      vi.doUnmock("playwright");
    }
  });

  it("extract html from full page (no selector)", async () => {
    const { mockBrowser } = makeMockBrowser();
    vi.doMock("playwright", () => ({
      chromium: { launch: vi.fn().mockResolvedValue(mockBrowser) }
    }));

    try {
      const { BrowserNavigationLibNode: MockedNode } =
        await import("../../src/nodes/lib-browser.js");
      const node = new MockedNode();
      node.assign({
        url: "http://example.com",
        action: "extract",
        extract_type: "html",
        timeout: 5000
      });
      const result = await node.process();

      expect(result.success).toBe(true);
      expect(result.action).toBe("extract");
      expect(result.extracted).toContain("html");
    } finally {
      vi.doUnmock("playwright");
    }
  });

  it("extract text from full page (no selector)", async () => {
    const { mockBrowser } = makeMockBrowser();
    vi.doMock("playwright", () => ({
      chromium: { launch: vi.fn().mockResolvedValue(mockBrowser) }
    }));

    try {
      const { BrowserNavigationLibNode: MockedNode } =
        await import("../../src/nodes/lib-browser.js");
      const node = new MockedNode();
      node.assign({
        url: "http://example.com",
        action: "extract",
        extract_type: "text",
        timeout: 5000
      });
      const result = await node.process();

      expect(result.success).toBe(true);
      expect(result.action).toBe("extract");
      expect(result.extracted).toBe("page-text-content");
    } finally {
      vi.doUnmock("playwright");
    }
  });

  it("reload action returns success", async () => {
    const { mockBrowser, mockPage } = makeMockBrowser();
    vi.doMock("playwright", () => ({
      chromium: { launch: vi.fn().mockResolvedValue(mockBrowser) }
    }));

    try {
      const { BrowserNavigationLibNode: MockedNode } =
        await import("../../src/nodes/lib-browser.js");
      const node = new MockedNode();
      node.assign({
        url: "http://example.com",
        action: "reload",
        timeout: 5000
      });
      const result = await node.process();

      expect(result.success).toBe(true);
      expect(result.action).toBe("reload");
      expect(mockPage.reload).toHaveBeenCalled();
    } finally {
      vi.doUnmock("playwright");
    }
  });

  it("click action clicks element", async () => {
    const { mockBrowser, mockElement } = makeMockBrowser();
    vi.doMock("playwright", () => ({
      chromium: { launch: vi.fn().mockResolvedValue(mockBrowser) }
    }));

    try {
      const { BrowserNavigationLibNode: MockedNode } =
        await import("../../src/nodes/lib-browser.js");
      const node = new MockedNode();
      node.assign({
        url: "http://example.com",
        action: "click",
        selector: "a",
        timeout: 5000
      });
      const result = await node.process();

      expect(result.success).toBe(true);
      expect(result.action).toBe("click");
      expect(mockElement.click).toHaveBeenCalled();
    } finally {
      vi.doUnmock("playwright");
    }
  });

  it("back action returns success", async () => {
    const { mockBrowser, mockPage } = makeMockBrowser();
    vi.doMock("playwright", () => ({
      chromium: { launch: vi.fn().mockResolvedValue(mockBrowser) }
    }));

    try {
      const { BrowserNavigationLibNode: MockedNode } =
        await import("../../src/nodes/lib-browser.js");
      const node = new MockedNode();
      node.assign({ url: "http://example.com", action: "back", timeout: 5000 });
      const result = await node.process();

      expect(result.success).toBe(true);
      expect(result.action).toBe("back");
      expect(mockPage.goBack).toHaveBeenCalled();
    } finally {
      vi.doUnmock("playwright");
    }
  });

  it("forward action returns success", async () => {
    const { mockBrowser, mockPage } = makeMockBrowser();
    vi.doMock("playwright", () => ({
      chromium: { launch: vi.fn().mockResolvedValue(mockBrowser) }
    }));

    try {
      const { BrowserNavigationLibNode: MockedNode } =
        await import("../../src/nodes/lib-browser.js");
      const node = new MockedNode();
      node.assign({
        url: "http://example.com",
        action: "forward",
        timeout: 5000
      });
      const result = await node.process();

      expect(result.success).toBe(true);
      expect(result.action).toBe("forward");
      expect(mockPage.goForward).toHaveBeenCalled();
    } finally {
      vi.doUnmock("playwright");
    }
  });

  it("throws on goto with empty URL", async () => {
    await expect(
      (() => {
        const _n = new BrowserNavigationLibNode();
        _n.assign({ action: "goto", url: "" });
        return _n.process();
      })()
    ).rejects.toThrow("URL is required for goto action");
  });
});

describe("lib.browser.SpiderCrawl (coverage)", () => {
  it("crawls with url_pattern filter", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await (() => {
        const _n = new SpiderCrawlLibNode();
        _n.assign({
          start_url: baseUrl,
          max_depth: 2,
          max_pages: 10,
          same_domain_only: true,
          include_html: true,
          delay_ms: 0,
          timeout: 5000,
          url_pattern: "page2"
        });
        return _n.process();
      })();
      const pages = result.output as Array<Record<string, unknown>>;
      // url_pattern "page2" means only URLs matching "page2" are crawled.
      // The start URL does NOT match "page2", so it's skipped.
      for (const page of pages) {
        expect(String(page.url)).toContain("page2");
      }
    });
  });

  it("crawls with delay_ms > 0", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await (() => {
        const _n = new SpiderCrawlLibNode();
        _n.assign({
          start_url: baseUrl,
          max_depth: 1,
          max_pages: 3,
          same_domain_only: true,
          include_html: false,
          delay_ms: 10, // small delay to exercise the branch
          timeout: 5000
        });
        return _n.process();
      })();
      const pages = result.output as Array<Record<string, unknown>>;
      expect(pages.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("handles failed requests gracefully", async () => {
    // Connect to a server that immediately closes connections
    const server = http.createServer((_req, res) => {
      res.destroy();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve)
    );
    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      throw new Error("Could not bind");
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;
    try {
      const result = await (() => {
        const _n = new SpiderCrawlLibNode();
        _n.assign({
          start_url: baseUrl,
          max_depth: 0,
          max_pages: 1,
          delay_ms: 0,
          timeout: 2000
        });
        return _n.process();
      })();
      const pages = result.output as Array<Record<string, unknown>>;
      expect(pages.length).toBe(1);
      expect(pages[0].status_code).toBe(0);
      expect(pages[0].html).toBeNull();
    } finally {
      await new Promise<void>((r, e) =>
        server.close((err) => (err ? e(err) : r()))
      );
    }
  });

  it("skips javascript:, mailto:, and tel: links", async () => {
    const htmlWithBadLinks = `<!DOCTYPE html>
<html><head><title>Bad Links</title></head>
<body>
  <a href="javascript:void(0)">JS link</a>
  <a href="mailto:test@test.com">Mail</a>
  <a href="tel:+1234567890">Phone</a>
  <a href="/page2">Good link</a>
</body></html>`;

    await withServer(
      (req, res) => {
        if (req.url === "/") {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(htmlWithBadLinks);
        } else if (req.url === "/page2") {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(HTML_PAGE2);
        } else {
          res.writeHead(404);
          res.end("not found");
        }
      },
      async (baseUrl) => {
        const result = await (() => {
          const _n = new SpiderCrawlLibNode();
          _n.assign({
            start_url: baseUrl,
            max_depth: 1,
            max_pages: 10,
            same_domain_only: true,
            delay_ms: 0,
            timeout: 5000
          });
          return _n.process();
        })();
        const pages = result.output as Array<Record<string, unknown>>;
        const urls = pages.map((p) => String(p.url));
        // Should NOT have javascript:, mailto:, or tel: URLs
        expect(urls.every((u) => !u.startsWith("javascript:"))).toBe(true);
        expect(urls.every((u) => !u.startsWith("mailto:"))).toBe(true);
        expect(urls.every((u) => !u.startsWith("tel:"))).toBe(true);
      }
    );
  });

  it("skips invalid href values gracefully (catch block)", async () => {
    const htmlWithInvalidHref = `<!DOCTYPE html>
<html><head><title>Invalid HREFs</title></head>
<body>
  <a href="http://[::1">Bad URL</a>
  <a href="">Empty</a>
  <a href="/page2">Good link</a>
</body></html>`;

    await withServer(
      (req, res) => {
        if (req.url === "/") {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(htmlWithInvalidHref);
        } else if (req.url === "/page2") {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(HTML_PAGE2);
        } else {
          res.writeHead(404);
          res.end("not found");
        }
      },
      async (baseUrl) => {
        const result = await (() => {
          const _n = new SpiderCrawlLibNode();
          _n.assign({
            start_url: baseUrl,
            max_depth: 1,
            max_pages: 10,
            same_domain_only: false,
            delay_ms: 0,
            timeout: 5000
          });
          return _n.process();
        })();
        const pages = result.output as Array<Record<string, unknown>>;
        // Should have crawled at least the start page and page2
        expect(pages.length).toBeGreaterThanOrEqual(1);
      }
    );
  });

  it("skips cross-domain links when same_domain_only is true", async () => {
    const htmlCrossDomain = `<!DOCTYPE html>
<html><head><title>Cross Domain</title></head>
<body>
  <a href="http://example.com/other">External</a>
  <a href="/page2">Internal</a>
</body></html>`;

    await withServer(
      (req, res) => {
        if (req.url === "/") {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(htmlCrossDomain);
        } else if (req.url === "/page2") {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(HTML_PAGE2);
        } else {
          res.writeHead(404);
          res.end("not found");
        }
      },
      async (baseUrl) => {
        const result = await (() => {
          const _n = new SpiderCrawlLibNode();
          _n.assign({
            start_url: baseUrl,
            max_depth: 1,
            max_pages: 10,
            same_domain_only: true,
            delay_ms: 0,
            timeout: 5000
          });
          return _n.process();
        })();
        const pages = result.output as Array<Record<string, unknown>>;
        const urls = pages.map((p) => String(p.url));
        expect(urls.every((u) => !u.includes("example.com"))).toBe(true);
      }
    );
  });
});

// ---------------------------------------------------------------------------
// lib-mail
// ---------------------------------------------------------------------------

describe("lib.mail.SendEmail", () => {
  it("throws on missing recipient", async () => {
    await expect(
      (() => {
        const _n = new SendEmailLibNode();
        _n.assign({
          smtp_server: "localhost",
          smtp_port: 9999,
          username: "",
          password: "",
          to_address: "",
          subject: "test",
          body: "test"
        });
        return _n.process();
      })()
    ).rejects.toThrow("Recipient email address is required");
  });

  it("throws on connection failure with invalid SMTP", async () => {
    // Use a port that won't have an SMTP server
    await expect(
      (() => {
        const _n = new SendEmailLibNode();
        _n.assign({
          smtp_server: "127.0.0.1",
          smtp_port: 19999,
          username: "",
          password: "",
          from_address: "test@test.com",
          to_address: "recipient@test.com",
          subject: "test",
          body: "test body"
        });
        return _n.process();
      })()
    ).rejects.toThrow();
  }, 15_000);
});

describe("lib.mail.GmailSearch (stub)", () => {
  it("throws credentials error", async () => {
    await expect(new GmailSearchLibNode().process()).rejects.toThrow(
      "Google OAuth2/IMAP credentials"
    );
  });
});

describe("lib.mail.AddLabel (stub)", () => {
  it("throws credentials error", async () => {
    await expect(
      (() => {
        const _n = new AddLabelLibNode();
        _n.assign({ message_id: "abc", label: "test" });
        return _n.process();
      })()
    ).rejects.toThrow("Google OAuth2/IMAP credentials");
  });
});

describe("lib.mail.MoveToArchive (stub)", () => {
  it("throws credentials error", async () => {
    await expect(
      (() => {
        const _n = new MoveToArchiveLibNode();
        _n.assign({ message_id: "abc" });
        return _n.process();
      })()
    ).rejects.toThrow("Google OAuth2/IMAP credentials");
  });
});

// ---------------------------------------------------------------------------
// lib-supabase — all nodes should throw when no credentials
// ---------------------------------------------------------------------------

describe("lib.supabase (no credentials)", () => {
  it("Select throws on missing table_name", async () => {
    await expect(
      (() => {
        const _n = new SelectLibNode();
        // Credentials are now read from _secrets, not node props
        (_n as any).setDynamic("_secrets", { SUPABASE_URL: "https://x.supabase.co", SUPABASE_KEY: "key" });
        return _n.process();
      })()
    ).rejects.toThrow("table_name cannot be empty");
  });

  it("Select throws on missing credentials", async () => {
    await expect(
      (() => {
        const _n = new SelectLibNode();
        _n.assign({
          supabase_url: "",
          supabase_key: "",
          table_name: "test"
        });
        return _n.process();
      })()
    ).rejects.toThrow("Supabase URL and key are required");
  });

  it("Insert throws on missing table_name", async () => {
    await expect(
      (() => {
        const _n = new SupabaseInsertLibNode();
        (_n as any).setDynamic("_secrets", { SUPABASE_URL: "https://x.supabase.co", SUPABASE_KEY: "key" });
        return _n.process();
      })()
    ).rejects.toThrow("table_name cannot be empty");
  });

  it("Insert throws on missing credentials", async () => {
    await expect(
      (() => {
        const _n = new SupabaseInsertLibNode();
        _n.assign({
          supabase_url: "",
          supabase_key: "",
          table_name: "test",
          records: [{ a: 1 }]
        });
        return _n.process();
      })()
    ).rejects.toThrow("Supabase URL and key are required");
  });

  it("Update throws on missing table_name", async () => {
    await expect(
      (() => {
        const _n = new SupabaseUpdateLibNode();
        (_n as any).setDynamic("_secrets", { SUPABASE_URL: "https://x.supabase.co", SUPABASE_KEY: "key" });
        return _n.process();
      })()
    ).rejects.toThrow("table_name cannot be empty");
  });

  it("Update throws on empty values", async () => {
    await expect(
      (() => {
        const _n = new SupabaseUpdateLibNode();
        (_n as any).setDynamic("_secrets", { SUPABASE_URL: "https://x.supabase.co", SUPABASE_KEY: "key" });
        _n.assign({ table_name: "test", values: {} });
        return _n.process();
      })()
    ).rejects.toThrow("values cannot be empty");
  });

  it("Update throws on missing credentials", async () => {
    await expect(
      (() => {
        const _n = new SupabaseUpdateLibNode();
        _n.assign({
          supabase_url: "",
          supabase_key: "",
          table_name: "test",
          values: { x: 1 }
        });
        return _n.process();
      })()
    ).rejects.toThrow("Supabase URL and key are required");
  });

  it("Delete throws on missing table_name", async () => {
    await expect(
      (() => {
        const _n = new SupabaseDeleteLibNode();
        (_n as any).setDynamic("_secrets", { SUPABASE_URL: "https://x.supabase.co", SUPABASE_KEY: "key" });
        return _n.process();
      })()
    ).rejects.toThrow("table_name cannot be empty");
  });

  it("Delete throws when no filters provided", async () => {
    await expect(
      (() => {
        const _n = new SupabaseDeleteLibNode();
        (_n as any).setDynamic("_secrets", { SUPABASE_URL: "https://x.supabase.co", SUPABASE_KEY: "key" });
        _n.assign({ table_name: "test", filters: [] });
        return _n.process();
      })()
    ).rejects.toThrow("At least one filter is required");
  });

  it("Delete throws on missing credentials", async () => {
    await expect(
      (() => {
        const _n = new SupabaseDeleteLibNode();
        _n.assign({
          supabase_url: "",
          supabase_key: "",
          table_name: "test",
          filters: [["id", "eq", 1]]
        });
        return _n.process();
      })()
    ).rejects.toThrow("Supabase URL and key are required");
  });

  it("Upsert throws on missing table_name", async () => {
    await expect(
      (() => {
        const _n = new SupabaseUpsertLibNode();
        (_n as any).setDynamic("_secrets", { SUPABASE_URL: "https://x.supabase.co", SUPABASE_KEY: "key" });
        return _n.process();
      })()
    ).rejects.toThrow("table_name cannot be empty");
  });

  it("Upsert throws on missing credentials", async () => {
    await expect(
      (() => {
        const _n = new SupabaseUpsertLibNode();
        _n.assign({
          supabase_url: "",
          supabase_key: "",
          table_name: "test",
          records: [{ a: 1 }]
        });
        return _n.process();
      })()
    ).rejects.toThrow("Supabase URL and key are required");
  });

  it("RPC throws on missing function name", async () => {
    await expect(
      (() => {
        const _n = new SupabaseRPCLibNode();
        (_n as any).setDynamic("_secrets", { SUPABASE_URL: "https://x.supabase.co", SUPABASE_KEY: "key" });
        return _n.process();
      })()
    ).rejects.toThrow("function cannot be empty");
  });

  it("RPC throws on missing credentials", async () => {
    await expect(
      (() => {
        const _n = new SupabaseRPCLibNode();
        _n.assign({
          supabase_url: "",
          supabase_key: "",
          function: "my_func"
        });
        return _n.process();
      })()
    ).rejects.toThrow("Supabase URL and key are required");
  });

  it("Insert handles single record (non-array) input", async () => {
    // When records is a non-array object, it should be wrapped in an array.
    // It will still throw on missing creds, but the wrapping logic is exercised.
    await expect(
      (() => {
        const _n = new SupabaseInsertLibNode();
        _n.assign({
          supabase_url: "",
          supabase_key: "",
          table_name: "test",
          records: { a: 1 }
        });
        return _n.process();
      })()
    ).rejects.toThrow("Supabase URL and key are required");
  });

  it("Upsert handles single record (non-array) input", async () => {
    await expect(
      (() => {
        const _n = new SupabaseUpsertLibNode();
        _n.assign({
          supabase_url: "",
          supabase_key: "",
          table_name: "test",
          records: { a: 1 }
        });
        return _n.process();
      })()
    ).rejects.toThrow("Supabase URL and key are required");
  });
});

// ---------------------------------------------------------------------------
// lib-ocr
// ---------------------------------------------------------------------------

// PaddleOCR tests removed — PaddleOCRLibNode is not implemented

// ---------------------------------------------------------------------------
// lib-markitdown
// ---------------------------------------------------------------------------

describe("lib.convert.ConvertToMarkdown", () => {
  it("throws when no document URI or data", async () => {
    await expect(
      (() => {
        const _n = new ConvertToMarkdownLibNode();
        _n.assign({ document: {} });
        return _n.process();
      })()
    ).rejects.toThrow("A document URI or data is required");
  });

  it("converts HTML data to markdown", async () => {
    const result = await (() => {
      const _n = new ConvertToMarkdownLibNode();
      _n.assign({
        document: {
          uri: "",
          data: "<h1>Title</h1><p>Paragraph text</p>"
        }
      });
      return _n.process();
    })();
    const output = result.output as { type: string; data: string };
    expect(output.type).toBe("document");
    expect(output.data).toContain("Title");
    expect(output.data).toContain("Paragraph text");
  });

  it("passes plain text data through as-is", async () => {
    const result = await (() => {
      const _n = new ConvertToMarkdownLibNode();
      _n.assign({
        document: {
          uri: "",
          data: "Just plain text without any HTML tags"
        }
      });
      return _n.process();
    })();
    const output = result.output as { type: string; data: string };
    expect(output.data).toBe("Just plain text without any HTML tags");
  });

  it("reads HTML from a file URI", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "markitdown-"));
    const filePath = path.join(tmpDir, "test.html");
    await fs.writeFile(
      filePath,
      "<html><body><h2>From File</h2><p>File content</p></body></html>"
    );

    try {
      const result = await (() => {
        const _n = new ConvertToMarkdownLibNode();
        _n.assign({
          document: { uri: `file://${filePath}` }
        });
        return _n.process();
      })();
      const output = result.output as { type: string; data: string };
      expect(output.data).toContain("From File");
      expect(output.data).toContain("File content");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("reads plain text file from URI", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "markitdown-"));
    const filePath = path.join(tmpDir, "test.txt");
    await fs.writeFile(filePath, "Plain file content no HTML");

    try {
      const result = await (() => {
        const _n = new ConvertToMarkdownLibNode();
        _n.assign({
          document: { uri: `file://${filePath}` }
        });
        return _n.process();
      })();
      const output = result.output as { type: string; data: string };
      expect(output.data).toBe("Plain file content no HTML");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("reads from a raw file path (non file:// URI)", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "markitdown-"));
    const filePath = path.join(tmpDir, "raw.html");
    await fs.writeFile(filePath, "<div><strong>Bold</strong> text</div>");

    try {
      const result = await (() => {
        const _n = new ConvertToMarkdownLibNode();
        _n.assign({
          document: { uri: filePath }
        });
        return _n.process();
      })();
      const output = result.output as { type: string; data: string };
      expect(output.data).toContain("Bold");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("throws for .docx URI that does not exist", async () => {
    await expect(
      (() => {
        const _n = new ConvertToMarkdownLibNode();
        _n.assign({
          document: { uri: "/nonexistent/file.docx" }
        });
        return _n.process();
      })()
    ).rejects.toThrow();
  });

  it("handles file:// prefix for .docx URI (error on missing file)", async () => {
    await expect(
      (() => {
        const _n = new ConvertToMarkdownLibNode();
        _n.assign({
          document: { uri: "file:///nonexistent/file.docx" }
        });
        return _n.process();
      })()
    ).rejects.toThrow();
  });

  it("converts a real .docx file to markdown via mammoth", async () => {
    // Create a minimal .docx file using the 'docx' package
    const docx = await import("docx");
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "markitdown-docx-"));
    const filePath = path.join(tmpDir, "test.docx");

    const doc = new docx.Document({
      sections: [
        {
          children: [
            new docx.Paragraph({
              children: [new docx.TextRun("Hello from DOCX")]
            })
          ]
        }
      ]
    });

    const buffer = await docx.Packer.toBuffer(doc);
    await fs.writeFile(filePath, buffer);

    try {
      const result = await (() => {
        const _n = new ConvertToMarkdownLibNode();
        _n.assign({
          document: { uri: filePath }
        });
        return _n.process();
      })();
      const output = result.output as { type: string; data: string };
      expect(output.type).toBe("document");
      expect(output.data).toContain("Hello from DOCX");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("converts a .docx file via file:// URI", async () => {
    const docx = await import("docx");
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "markitdown-docx-"));
    const filePath = path.join(tmpDir, "test2.docx");

    const doc = new docx.Document({
      sections: [
        {
          children: [
            new docx.Paragraph({
              children: [new docx.TextRun("DOCX via file URI")]
            })
          ]
        }
      ]
    });

    const buffer = await docx.Packer.toBuffer(doc);
    await fs.writeFile(filePath, buffer);

    try {
      const result = await (() => {
        const _n = new ConvertToMarkdownLibNode();
        _n.assign({
          document: { uri: `file://${filePath}` }
        });
        return _n.process();
      })();
      const output = result.output as { type: string; data: string };
      expect(output.type).toBe("document");
      expect(output.data).toContain("DOCX via file URI");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// defaults() coverage — exercise the defaults() method on each node class
// ---------------------------------------------------------------------------

describe("defaults() methods", () => {
  it("BrowserLibNode defaults", () => {
    const d = new BrowserLibNode().serialize();
    expect(d).toHaveProperty("url");
    expect(d).toHaveProperty("timeout");
  });

  it("ScreenshotLibNode defaults", () => {
    const d = new ScreenshotLibNode().serialize();
    expect(d).toHaveProperty("url");
    expect(d).toHaveProperty("selector");
    expect(d).toHaveProperty("timeout");
  });

  it("BrowserNavigationLibNode defaults", () => {
    const d = new BrowserNavigationLibNode().serialize();
    expect(d).toHaveProperty("action");
    expect(d).toHaveProperty("extract_type");
  });

  it("SpiderCrawlLibNode defaults", () => {
    const d = new SpiderCrawlLibNode().serialize();
    expect(d).toHaveProperty("start_url");
    expect(d).toHaveProperty("max_depth");
    expect(d).toHaveProperty("delay_ms");
  });

  it("SendEmailLibNode defaults", () => {
    const d = new SendEmailLibNode().serialize();
    expect(d).toHaveProperty("smtp_server");
    expect(d).toHaveProperty("to_address");
  });

  it("GmailSearchLibNode defaults", () => {
    const d = new GmailSearchLibNode().serialize();
    expect(d).toHaveProperty("folder");
    expect(d).toHaveProperty("max_results");
  });

  it("AddLabelLibNode defaults", () => {
    const d = new AddLabelLibNode().serialize();
    expect(d).toHaveProperty("message_id");
    expect(d).toHaveProperty("label");
  });

  it("MoveToArchiveLibNode defaults", () => {
    const d = new MoveToArchiveLibNode().serialize();
    expect(d).toHaveProperty("message_id");
  });

  it("SelectLibNode defaults", () => {
    const d = new SelectLibNode().serialize();
    expect(d).toHaveProperty("table_name");
    expect(d).toHaveProperty("filters");
  });

  it("SupabaseInsertLibNode defaults", () => {
    const d = new SupabaseInsertLibNode().serialize();
    expect(d).toHaveProperty("records");
    expect(d).toHaveProperty("return_rows");
  });

  it("SupabaseUpdateLibNode defaults", () => {
    const d = new SupabaseUpdateLibNode().serialize();
    expect(d).toHaveProperty("values");
    expect(d).toHaveProperty("filters");
  });

  it("SupabaseDeleteLibNode defaults", () => {
    const d = new SupabaseDeleteLibNode().serialize();
    expect(d).toHaveProperty("filters");
  });

  it("SupabaseUpsertLibNode defaults", () => {
    const d = new SupabaseUpsertLibNode().serialize();
    expect(d).toHaveProperty("records");
  });

  it("SupabaseRPCLibNode defaults", () => {
    const d = new SupabaseRPCLibNode().serialize();
    expect(d).toHaveProperty("function");
    expect(d).toHaveProperty("params");
  });

  it("ConvertToMarkdownLibNode defaults", () => {
    const d = new ConvertToMarkdownLibNode().serialize();
    expect(d).toHaveProperty("document");
  });
});
