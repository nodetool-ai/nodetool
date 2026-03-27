import { describe, expect, it } from "vitest";
import http from "node:http";
import {
  WebFetchLibNode,
  DownloadFileLibNode,
  SpiderCrawlLibNode,
} from "../../src/index.js";

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
  <p>Some paragraph text here.</p>
  <a href="/page2">Link to page 2</a>
</body></html>`;

const HTML_PAGE2 = `<!DOCTYPE html>
<html><head><title>Page 2</title></head>
<body>
  <h1>Second Page</h1>
  <p>Content of page 2.</p>
  <a href="/page3">Link to page 3</a>
</body></html>`;

const HTML_PAGE3 = `<!DOCTYPE html>
<html><head><title>Page 3</title></head>
<body><p>Page three content.</p></body></html>`;

function testHandler(req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.url === "/" || req.url === "/page1") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(HTML_PAGE);
  } else if (req.url === "/page2") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(HTML_PAGE2);
  } else if (req.url === "/page3") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(HTML_PAGE3);
  } else if (req.url === "/plain.txt") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("plain text content");
  } else if (req.url === "/binary") {
    res.writeHead(200, { "Content-Type": "application/octet-stream" });
    res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  } else {
    res.writeHead(404);
    res.end("not found");
  }
}

describe("lib.browser.WebFetch", () => {
  it("fetches HTML and converts to markdown", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await new WebFetchLibNode().process({ url: baseUrl });
      const output = String(result.output);
      expect(output).toContain("Hello Browser");
      expect(output).toContain("paragraph text");
    });
  });

  it("uses selector to extract specific elements", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await new WebFetchLibNode().process({
        url: baseUrl,
        selector: "h1",
      });
      const output = String(result.output);
      expect(output).toContain("Hello Browser");
      expect(output).not.toContain("paragraph text");
    });
  });

  it("returns raw text for non-HTML content", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await new WebFetchLibNode().process({
        url: `${baseUrl}/plain.txt`,
      });
      expect(result.output).toBe("plain text content");
    });
  });

  it("throws on empty URL", async () => {
    await expect(new WebFetchLibNode().process({ url: "" })).rejects.toThrow(
      "URL is required"
    );
  });

  it("throws on non-existent selector", async () => {
    await withServer(testHandler, async (baseUrl) => {
      await expect(
        new WebFetchLibNode().process({ url: baseUrl, selector: "#nonexistent" })
      ).rejects.toThrow("No elements found matching selector");
    });
  });
});

describe("lib.browser.DownloadFile", () => {
  it("downloads binary content as base64", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await new DownloadFileLibNode().process({
        url: `${baseUrl}/binary`,
      });
      const output = result.output as { __bytes__: string };
      expect(output.__bytes__).toBeDefined();
      const buf = Buffer.from(output.__bytes__, "base64");
      expect(buf[0]).toBe(0x89);
      expect(buf[1]).toBe(0x50);
    });
  });

  it("downloads text content as base64", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await new DownloadFileLibNode().process({
        url: `${baseUrl}/plain.txt`,
      });
      const output = result.output as { __bytes__: string };
      const decoded = Buffer.from(output.__bytes__, "base64").toString("utf-8");
      expect(decoded).toBe("plain text content");
    });
  });

  it("throws on empty URL", async () => {
    await expect(new DownloadFileLibNode().process({ url: "" })).rejects.toThrow(
      "URL is required"
    );
  });
});

describe("lib.browser.SpiderCrawl", () => {
  it("crawls pages following links", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await new SpiderCrawlLibNode().process({
        start_url: baseUrl,
        max_depth: 2,
        max_pages: 10,
        same_domain_only: true,
        include_html: false,
        delay_ms: 0,
        timeout: 5000,
      });
      const pages = result.output as Array<Record<string, unknown>>;
      expect(pages.length).toBeGreaterThanOrEqual(2);
      const urls = pages.map((p) => p.url);
      expect(urls).toContain(baseUrl);

      // Should have found at least page2 via link
      const hasPage2 = urls.some((u) => String(u).includes("/page2"));
      expect(hasPage2).toBe(true);

      // Each result should have expected fields
      for (const page of pages) {
        expect(page).toHaveProperty("url");
        expect(page).toHaveProperty("depth");
        expect(page).toHaveProperty("title");
        expect(page).toHaveProperty("status_code");
        expect(page.html).toBeNull(); // include_html is false
      }
    });
  });

  it("respects max_depth=0", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await new SpiderCrawlLibNode().process({
        start_url: baseUrl,
        max_depth: 0,
        max_pages: 10,
        same_domain_only: true,
        include_html: false,
        delay_ms: 0,
        timeout: 5000,
      });
      const pages = result.output as Array<Record<string, unknown>>;
      expect(pages).toHaveLength(1);
      expect(pages[0].url).toBe(baseUrl);
    });
  });

  it("includes HTML when requested", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await new SpiderCrawlLibNode().process({
        start_url: baseUrl,
        max_depth: 0,
        max_pages: 1,
        include_html: true,
        delay_ms: 0,
        timeout: 5000,
      });
      const pages = result.output as Array<Record<string, unknown>>;
      expect(pages[0].html).toContain("Hello Browser");
    });
  });

  it("respects max_pages limit", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await new SpiderCrawlLibNode().process({
        start_url: baseUrl,
        max_depth: 10,
        max_pages: 2,
        same_domain_only: true,
        delay_ms: 0,
        timeout: 5000,
      });
      const pages = result.output as Array<Record<string, unknown>>;
      expect(pages.length).toBeLessThanOrEqual(2);
    });
  });

  it("respects exclude_pattern", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await new SpiderCrawlLibNode().process({
        start_url: baseUrl,
        max_depth: 2,
        max_pages: 10,
        same_domain_only: true,
        exclude_pattern: "page3",
        delay_ms: 0,
        timeout: 5000,
      });
      const pages = result.output as Array<Record<string, unknown>>;
      const urls = pages.map((p) => String(p.url));
      expect(urls.every((u) => !u.includes("page3"))).toBe(true);
    });
  });

  it("throws on empty start_url", async () => {
    await expect(
      new SpiderCrawlLibNode().process({ start_url: "" })
    ).rejects.toThrow("start_url is required");
  });
});
