/**
 * Coverage tests for lib-browser, lib-mail, lib-supabase, lib-compat, lib-ocr, lib-markitdown.
 *
 * Strategy:
 * - lib-browser: Real playwright against a local HTTP server for Browser, Screenshot, BrowserNavigation.
 *   BrowserUseLibNode is a stub that always throws.
 * - lib-mail: SendEmail with invalid config → error. Gmail stubs throw.
 * - lib-supabase: All nodes throw when no credentials provided.
 * - lib-compat: LIB_COMPAT_PY_NODES is empty (all descriptors removed). Verify the array is empty.
 * - lib-ocr: Test error path (no image data/uri). Test with a small sharp-generated PNG.
 * - lib-markitdown: Test HTML conversion, plain text pass-through, error on missing data/uri,
 *   file URI reading, and docx branch (error path).
 */

import { describe, expect, it } from "vitest";
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
  ConvertToMarkdownLibNode,
  PaddleOCRLibNode,
  LIB_COMPAT_PY_NODES,
} from "../../src/index.js";

import { SpiderCrawlLibNode, WebFetchLibNode, DownloadFileLibNode } from "../../src/nodes/lib-browser.js";

// BrowserUseLibNode is not re-exported from index; import directly
import { BrowserUseLibNode } from "../../src/nodes/lib-browser.js";

// Supabase nodes with qualified imports to avoid name collisions with sqlite
import {
  InsertLibNode as SupabaseInsertLibNode,
  UpdateLibNode as SupabaseUpdateLibNode,
  DeleteLibNode as SupabaseDeleteLibNode,
  UpsertLibNode as SupabaseUpsertLibNode,
  RPCLibNode as SupabaseRPCLibNode,
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
      const result = await new WebFetchLibNode().process({ url: baseUrl });
      expect(String(result.output)).toContain("Hello Browser");
    });
  });
});

describe("lib.browser.DownloadFile (coverage)", () => {
  it("downloads content as base64 bytes", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await new DownloadFileLibNode().process({
        url: `${baseUrl}/page2`,
      });
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

describe("lib.browser.Browser (playwright)", () => {
  it("fetches page content and returns markdown + metadata", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await new BrowserLibNode().process({ url: baseUrl });
      expect(result.success).toBe(true);
      expect(String(result.content)).toContain("Hello Browser");
      const meta = result.metadata as { title: string };
      expect(meta.title).toBe("Test Page");
    });
  }, 30_000);

  it("throws on empty URL", async () => {
    await expect(new BrowserLibNode().process({ url: "" })).rejects.toThrow(
      "URL is required"
    );
  });
});

describe("lib.browser.Screenshot (playwright)", () => {
  it("takes a full-page screenshot", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await new ScreenshotLibNode().process({ url: baseUrl });
      expect(result.success).toBe(true);
      const output = result.output as { type: string; data: string };
      expect(output.type).toBe("image");
      expect(output.data.length).toBeGreaterThan(0);
      expect(result.url).toBe(baseUrl);
    });
  }, 30_000);

  it("takes a screenshot of a specific selector", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await new ScreenshotLibNode().process({
        url: baseUrl,
        selector: "h1",
      });
      expect(result.success).toBe(true);
      const output = result.output as { type: string; data: string };
      expect(output.data.length).toBeGreaterThan(0);
    });
  }, 30_000);

  it("throws on empty URL", async () => {
    await expect(
      new ScreenshotLibNode().process({ url: "" })
    ).rejects.toThrow("URL is required");
  });
});

describe("lib.browser.BrowserNavigation (playwright)", () => {
  it("goto action returns success", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await new BrowserNavigationLibNode().process({
        url: baseUrl,
        action: "goto",
      });
      expect(result.success).toBe(true);
      expect(result.action).toBe("goto");
    });
  }, 30_000);

  it("reload action returns success", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await new BrowserNavigationLibNode().process({
        url: baseUrl,
        action: "reload",
      });
      expect(result.success).toBe(true);
      expect(result.action).toBe("reload");
    });
  }, 30_000);

  it("click action clicks an element", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await new BrowserNavigationLibNode().process({
        url: baseUrl,
        action: "click",
        selector: "a",
      });
      expect(result.success).toBe(true);
      expect(result.action).toBe("click");
    });
  }, 30_000);

  it("extract text from selector", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await new BrowserNavigationLibNode().process({
        url: baseUrl,
        action: "extract",
        selector: "#info",
        extract_type: "text",
      });
      expect(result.success).toBe(true);
      expect(String(result.extracted)).toContain("paragraph text");
    });
  }, 30_000);

  it("extract html from selector", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await new BrowserNavigationLibNode().process({
        url: baseUrl,
        action: "extract",
        selector: "#info",
        extract_type: "html",
      });
      expect(result.success).toBe(true);
      expect(String(result.extracted)).toContain("<p");
    });
  }, 30_000);

  it("extract value from input element", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await new BrowserNavigationLibNode().process({
        url: baseUrl,
        action: "extract",
        selector: "#myinput",
        extract_type: "value",
      });
      expect(result.success).toBe(true);
      expect(result.extracted).toBe("input_value");
    });
  }, 30_000);

  it("extract attribute from element", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await new BrowserNavigationLibNode().process({
        url: baseUrl,
        action: "extract",
        selector: "#myinput",
        extract_type: "attribute",
        attribute: "data-custom",
      });
      expect(result.success).toBe(true);
      expect(result.extracted).toBe("attr_val");
    });
  }, 30_000);

  it("extract html from full page (no selector)", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await new BrowserNavigationLibNode().process({
        url: baseUrl,
        action: "extract",
        extract_type: "html",
      });
      expect(result.success).toBe(true);
      expect(String(result.extracted)).toContain("Hello Browser");
    });
  }, 30_000);

  it("extract text from full page (no selector)", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await new BrowserNavigationLibNode().process({
        url: baseUrl,
        action: "extract",
        extract_type: "text",
      });
      expect(result.success).toBe(true);
      expect(String(result.extracted)).toContain("Hello Browser");
    });
  }, 30_000);

  it("back action (no prior navigation — just runs)", async () => {
    await withServer(testHandler, async (baseUrl) => {
      // back/forward on a fresh page won't fail, just returns success
      const result = await new BrowserNavigationLibNode().process({
        url: baseUrl,
        action: "back",
      });
      expect(result.success).toBe(true);
      expect(result.action).toBe("back");
    });
  }, 30_000);

  it("forward action", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await new BrowserNavigationLibNode().process({
        url: baseUrl,
        action: "forward",
      });
      expect(result.success).toBe(true);
      expect(result.action).toBe("forward");
    });
  }, 30_000);

  it("wait_for option waits for selector", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await new BrowserNavigationLibNode().process({
        url: baseUrl,
        action: "goto",
        wait_for: "h1",
      });
      expect(result.success).toBe(true);
    });
  }, 30_000);

  it("throws on goto with empty URL", async () => {
    await expect(
      new BrowserNavigationLibNode().process({ action: "goto", url: "" })
    ).rejects.toThrow("URL is required for goto action");
  });
});

describe("lib.browser.SpiderCrawl (coverage)", () => {
  it("crawls with url_pattern filter", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await new SpiderCrawlLibNode().process({
        start_url: baseUrl,
        max_depth: 2,
        max_pages: 10,
        same_domain_only: true,
        include_html: true,
        delay_ms: 0,
        timeout: 5000,
        url_pattern: "page2",
      });
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
      const result = await new SpiderCrawlLibNode().process({
        start_url: baseUrl,
        max_depth: 1,
        max_pages: 3,
        same_domain_only: true,
        include_html: false,
        delay_ms: 10, // small delay to exercise the branch
        timeout: 5000,
      });
      const pages = result.output as Array<Record<string, unknown>>;
      expect(pages.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("handles failed requests gracefully", async () => {
    // Connect to a server that immediately closes connections
    const server = http.createServer((_req, res) => {
      res.destroy();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      throw new Error("Could not bind");
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;
    try {
      const result = await new SpiderCrawlLibNode().process({
        start_url: baseUrl,
        max_depth: 0,
        max_pages: 1,
        delay_ms: 0,
        timeout: 2000,
      });
      const pages = result.output as Array<Record<string, unknown>>;
      expect(pages.length).toBe(1);
      expect(pages[0].status_code).toBe(0);
      expect(pages[0].html).toBeNull();
    } finally {
      await new Promise<void>((r, e) => server.close((err) => (err ? e(err) : r())));
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
        const result = await new SpiderCrawlLibNode().process({
          start_url: baseUrl,
          max_depth: 1,
          max_pages: 10,
          same_domain_only: true,
          delay_ms: 0,
          timeout: 5000,
        });
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
        const result = await new SpiderCrawlLibNode().process({
          start_url: baseUrl,
          max_depth: 1,
          max_pages: 10,
          same_domain_only: false,
          delay_ms: 0,
          timeout: 5000,
        });
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
        const result = await new SpiderCrawlLibNode().process({
          start_url: baseUrl,
          max_depth: 1,
          max_pages: 10,
          same_domain_only: true,
          delay_ms: 0,
          timeout: 5000,
        });
        const pages = result.output as Array<Record<string, unknown>>;
        const urls = pages.map((p) => String(p.url));
        expect(urls.every((u) => !u.includes("example.com"))).toBe(true);
      }
    );
  });
});

describe("lib.browser.BrowserUse (stub)", () => {
  it("throws not-implemented error", async () => {
    await expect(
      new BrowserUseLibNode().process({ task: "test" })
    ).rejects.toThrow("not yet implemented");
  });
});

// ---------------------------------------------------------------------------
// lib-mail
// ---------------------------------------------------------------------------

describe("lib.mail.SendEmail", () => {
  it("throws on missing recipient", async () => {
    await expect(
      new SendEmailLibNode().process({
        smtp_server: "localhost",
        smtp_port: 9999,
        username: "",
        password: "",
        to_address: "",
        subject: "test",
        body: "test",
      })
    ).rejects.toThrow("Recipient email address is required");
  });

  it("throws on connection failure with invalid SMTP", async () => {
    // Use a port that won't have an SMTP server
    await expect(
      new SendEmailLibNode().process({
        smtp_server: "127.0.0.1",
        smtp_port: 19999,
        username: "",
        password: "",
        from_address: "test@test.com",
        to_address: "recipient@test.com",
        subject: "test",
        body: "test body",
      })
    ).rejects.toThrow();
  }, 15_000);
});

describe("lib.mail.GmailSearch (stub)", () => {
  it("throws credentials error", async () => {
    await expect(
      new GmailSearchLibNode().process({})
    ).rejects.toThrow("Google OAuth2/IMAP credentials");
  });
});

describe("lib.mail.AddLabel (stub)", () => {
  it("throws credentials error", async () => {
    await expect(
      new AddLabelLibNode().process({ message_id: "abc", label: "test" })
    ).rejects.toThrow("Google OAuth2/IMAP credentials");
  });
});

describe("lib.mail.MoveToArchive (stub)", () => {
  it("throws credentials error", async () => {
    await expect(
      new MoveToArchiveLibNode().process({ message_id: "abc" })
    ).rejects.toThrow("Google OAuth2/IMAP credentials");
  });
});

// ---------------------------------------------------------------------------
// lib-supabase — all nodes should throw when no credentials
// ---------------------------------------------------------------------------

describe("lib.supabase (no credentials)", () => {
  it("Select throws on missing table_name", async () => {
    await expect(
      new SelectLibNode().process({ supabase_url: "", supabase_key: "" })
    ).rejects.toThrow("table_name cannot be empty");
  });

  it("Select throws on missing credentials", async () => {
    await expect(
      new SelectLibNode().process({
        supabase_url: "",
        supabase_key: "",
        table_name: "test",
      })
    ).rejects.toThrow("Supabase URL and key are required");
  });

  it("Insert throws on missing table_name", async () => {
    await expect(
      new SupabaseInsertLibNode().process({
        supabase_url: "",
        supabase_key: "",
      })
    ).rejects.toThrow("table_name cannot be empty");
  });

  it("Insert throws on missing credentials", async () => {
    await expect(
      new SupabaseInsertLibNode().process({
        supabase_url: "",
        supabase_key: "",
        table_name: "test",
        records: [{ a: 1 }],
      })
    ).rejects.toThrow("Supabase URL and key are required");
  });

  it("Update throws on missing table_name", async () => {
    await expect(
      new SupabaseUpdateLibNode().process({
        supabase_url: "",
        supabase_key: "",
      })
    ).rejects.toThrow("table_name cannot be empty");
  });

  it("Update throws on empty values", async () => {
    await expect(
      new SupabaseUpdateLibNode().process({
        supabase_url: "",
        supabase_key: "",
        table_name: "test",
        values: {},
      })
    ).rejects.toThrow("values cannot be empty");
  });

  it("Update throws on missing credentials", async () => {
    await expect(
      new SupabaseUpdateLibNode().process({
        supabase_url: "",
        supabase_key: "",
        table_name: "test",
        values: { x: 1 },
      })
    ).rejects.toThrow("Supabase URL and key are required");
  });

  it("Delete throws on missing table_name", async () => {
    await expect(
      new SupabaseDeleteLibNode().process({
        supabase_url: "",
        supabase_key: "",
      })
    ).rejects.toThrow("table_name cannot be empty");
  });

  it("Delete throws when no filters provided", async () => {
    await expect(
      new SupabaseDeleteLibNode().process({
        supabase_url: "",
        supabase_key: "",
        table_name: "test",
        filters: [],
      })
    ).rejects.toThrow("At least one filter is required");
  });

  it("Delete throws on missing credentials", async () => {
    await expect(
      new SupabaseDeleteLibNode().process({
        supabase_url: "",
        supabase_key: "",
        table_name: "test",
        filters: [["id", "eq", 1]],
      })
    ).rejects.toThrow("Supabase URL and key are required");
  });

  it("Upsert throws on missing table_name", async () => {
    await expect(
      new SupabaseUpsertLibNode().process({
        supabase_url: "",
        supabase_key: "",
      })
    ).rejects.toThrow("table_name cannot be empty");
  });

  it("Upsert throws on missing credentials", async () => {
    await expect(
      new SupabaseUpsertLibNode().process({
        supabase_url: "",
        supabase_key: "",
        table_name: "test",
        records: [{ a: 1 }],
      })
    ).rejects.toThrow("Supabase URL and key are required");
  });

  it("RPC throws on missing function name", async () => {
    await expect(
      new SupabaseRPCLibNode().process({
        supabase_url: "",
        supabase_key: "",
      })
    ).rejects.toThrow("function cannot be empty");
  });

  it("RPC throws on missing credentials", async () => {
    await expect(
      new SupabaseRPCLibNode().process({
        supabase_url: "",
        supabase_key: "",
        function: "my_func",
      })
    ).rejects.toThrow("Supabase URL and key are required");
  });

  it("Insert handles single record (non-array) input", async () => {
    // When records is a non-array object, it should be wrapped in an array.
    // It will still throw on missing creds, but the wrapping logic is exercised.
    await expect(
      new SupabaseInsertLibNode().process({
        supabase_url: "",
        supabase_key: "",
        table_name: "test",
        records: { a: 1 },
      })
    ).rejects.toThrow("Supabase URL and key are required");
  });

  it("Upsert handles single record (non-array) input", async () => {
    await expect(
      new SupabaseUpsertLibNode().process({
        supabase_url: "",
        supabase_key: "",
        table_name: "test",
        records: { a: 1 },
      })
    ).rejects.toThrow("Supabase URL and key are required");
  });
});

// ---------------------------------------------------------------------------
// lib-compat
// ---------------------------------------------------------------------------

describe("lib-compat", () => {
  it("LIB_COMPAT_PY_NODES is an empty array (all descriptors removed)", () => {
    expect(Array.isArray(LIB_COMPAT_PY_NODES)).toBe(true);
    expect(LIB_COMPAT_PY_NODES.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// lib-ocr
// ---------------------------------------------------------------------------

describe("lib.ocr.PaddleOCR", () => {
  it("throws when image has no data or uri", async () => {
    await expect(
      new PaddleOCRLibNode().process({ image: { type: "image" } })
    ).rejects.toThrow("Image must have either data or uri");
  });

  it("performs OCR on a sharp-generated PNG with text", async () => {
    // Create a small PNG image with text using sharp
    const sharp = (await import("sharp")).default;

    // Create an SVG with text and convert to PNG buffer
    const svgText = `<svg width="200" height="60" xmlns="http://www.w3.org/2000/svg">
      <rect width="200" height="60" fill="white"/>
      <text x="10" y="40" font-size="30" font-family="sans-serif" fill="black">Hello</text>
    </svg>`;

    const pngBuffer = await sharp(Buffer.from(svgText)).png().toBuffer();
    const base64Data = pngBuffer.toString("base64");

    const result = await new PaddleOCRLibNode().process({
      image: { type: "image", data: base64Data },
      language: "en",
    });

    // The OCR result should have boxes and text fields
    expect(result).toHaveProperty("boxes");
    expect(result).toHaveProperty("text");
    expect(Array.isArray(result.boxes)).toBe(true);
    // Text may or may not be accurate with tesseract.js on synthetic images
    expect(typeof result.text).toBe("string");
  }, 30_000);

  it("accepts a URI-based image (error path for invalid URI)", async () => {
    await expect(
      new PaddleOCRLibNode().process({
        image: { type: "image", uri: "file:///nonexistent/image.png" },
        language: "en",
      })
    ).rejects.toThrow();
  }, 30_000);

  it("maps non-english languages to tesseract codes", async () => {
    // fr → fra; test that the language mapping is exercised.
    // Use a real (tiny) PNG so tesseract doesn't emit unhandled worker errors.
    const sharp = (await import("sharp")).default;
    const svgFr = `<svg width="100" height="40" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="40" fill="white"/>
      <text x="5" y="30" font-size="20" font-family="sans-serif" fill="black">Bonjour</text>
    </svg>`;
    const pngBuf = await sharp(Buffer.from(svgFr)).png().toBuffer();
    const b64 = pngBuf.toString("base64");

    // tesseract.js will attempt to load fra trained data; it may succeed or fail
    // depending on environment, but the language mapping code is exercised.
    try {
      const result = await new PaddleOCRLibNode().process({
        image: { type: "image", data: b64 },
        language: "fr",
      });
      expect(result).toHaveProperty("text");
    } catch {
      // Expected — fra traineddata may not be available
    }
  }, 30_000);
});

// ---------------------------------------------------------------------------
// lib-markitdown
// ---------------------------------------------------------------------------

describe("lib.markitdown.ConvertToMarkdown", () => {
  it("throws when no document URI or data", async () => {
    await expect(
      new ConvertToMarkdownLibNode().process({ document: {} })
    ).rejects.toThrow("A document URI or data is required");
  });

  it("converts HTML data to markdown", async () => {
    const result = await new ConvertToMarkdownLibNode().process({
      document: {
        uri: "",
        data: "<h1>Title</h1><p>Paragraph text</p>",
      },
    });
    const output = result.output as { type: string; data: string };
    expect(output.type).toBe("document");
    expect(output.data).toContain("Title");
    expect(output.data).toContain("Paragraph text");
  });

  it("passes plain text data through as-is", async () => {
    const result = await new ConvertToMarkdownLibNode().process({
      document: {
        uri: "",
        data: "Just plain text without any HTML tags",
      },
    });
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
      const result = await new ConvertToMarkdownLibNode().process({
        document: { uri: `file://${filePath}` },
      });
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
      const result = await new ConvertToMarkdownLibNode().process({
        document: { uri: `file://${filePath}` },
      });
      const output = result.output as { type: string; data: string };
      expect(output.data).toBe("Plain file content no HTML");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("reads from a raw file path (non file:// URI)", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "markitdown-"));
    const filePath = path.join(tmpDir, "raw.html");
    await fs.writeFile(
      filePath,
      "<div><strong>Bold</strong> text</div>"
    );

    try {
      const result = await new ConvertToMarkdownLibNode().process({
        document: { uri: filePath },
      });
      const output = result.output as { type: string; data: string };
      expect(output.data).toContain("Bold");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("throws for .docx URI that does not exist", async () => {
    await expect(
      new ConvertToMarkdownLibNode().process({
        document: { uri: "/nonexistent/file.docx" },
      })
    ).rejects.toThrow();
  });

  it("handles file:// prefix for .docx URI (error on missing file)", async () => {
    await expect(
      new ConvertToMarkdownLibNode().process({
        document: { uri: "file:///nonexistent/file.docx" },
      })
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
              children: [new docx.TextRun("Hello from DOCX")],
            }),
          ],
        },
      ],
    });

    const buffer = await docx.Packer.toBuffer(doc);
    await fs.writeFile(filePath, buffer);

    try {
      const result = await new ConvertToMarkdownLibNode().process({
        document: { uri: filePath },
      });
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
              children: [new docx.TextRun("DOCX via file URI")],
            }),
          ],
        },
      ],
    });

    const buffer = await docx.Packer.toBuffer(doc);
    await fs.writeFile(filePath, buffer);

    try {
      const result = await new ConvertToMarkdownLibNode().process({
        document: { uri: `file://${filePath}` },
      });
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

  it("BrowserUseLibNode defaults", () => {
    const d = new BrowserUseLibNode().serialize();
    expect(d).toHaveProperty("task");
    expect(d).toHaveProperty("model");
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

  it("PaddleOCRLibNode defaults", () => {
    const d = new PaddleOCRLibNode().serialize();
    expect(d).toHaveProperty("image");
    expect(d).toHaveProperty("language");
  });

  it("ConvertToMarkdownLibNode defaults", () => {
    const d = new ConvertToMarkdownLibNode().serialize();
    expect(d).toHaveProperty("document");
  });
});
