/**
 * Coverage tests for lib-browser.
 *
 * Strategy:
 * - lib-browser: Real CDP against a local HTTP server for Screenshot.
 */

import { describe, expect, it, vi } from "vitest";
import http from "node:http";

import { ScreenshotLibNode } from "../../src/index.js";


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
// lib-browser — Playwright-based nodes
// ---------------------------------------------------------------------------

describe.skip("lib.browser.Screenshot (cdp)", () => {
  it("takes a full-page screenshot", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await (() => {
        const _n = new ScreenshotLibNode();
        _n.assign({ url: baseUrl });
        return _n.process();
      })();
      const output = result.output as { type: string; data: string };
      expect(output.type).toBe("image");
      expect(output.data.length).toBeGreaterThan(0);
    });
  }, 30_000);

  it("takes a screenshot of a specific selector", async () => {
    await withServer(testHandler, async (baseUrl) => {
      const result = await (() => {
        const _n = new ScreenshotLibNode();
        _n.assign({ url: baseUrl, selector: "h1" });
        return _n.process();
      })();
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

// ---------------------------------------------------------------------------
// defaults() coverage — exercise the defaults() method on each node class
// ---------------------------------------------------------------------------

describe("defaults() methods", () => {
  it("ScreenshotLibNode defaults", () => {
    const d = new ScreenshotLibNode().serialize();
    expect(d).toHaveProperty("url");
    expect(d).toHaveProperty("selector");
    expect(d).toHaveProperty("timeout");
  });

});
