/**
 * Coverage tests for lib-browser, lib-mail, lib-markitdown.
 *
 * Strategy:
 * - lib-browser: Real CDP against a local HTTP server for Screenshot.
 * - lib-mail: Gmail stubs throw without credentials.
 * - lib-markitdown: Test HTML conversion, plain text pass-through, error on missing data/uri,
 *   file URI reading, and docx branch (error path).
 */

import { describe, expect, it, vi } from "vitest";
import http from "node:http";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";

import {
  ScreenshotLibNode,
  GmailSearchLibNode,
  AddLabelLibNode,
  MoveToArchiveLibNode,
  ConvertToMarkdownLibNode
} from "../../src/index.js";


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
// lib-mail
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
  it("ScreenshotLibNode defaults", () => {
    const d = new ScreenshotLibNode().serialize();
    expect(d).toHaveProperty("url");
    expect(d).toHaveProperty("selector");
    expect(d).toHaveProperty("timeout");
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

  it("ConvertToMarkdownLibNode defaults", () => {
    const d = new ConvertToMarkdownLibNode().serialize();
    expect(d).toHaveProperty("document");
  });
});
