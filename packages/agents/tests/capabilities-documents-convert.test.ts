/**
 * `convert_document` and `convert_markdown_to_pdf` convert in process: real
 * files in a temporary workspace, real `marked`, `docx`, `mammoth` and
 * `turndown`, and the headless Chromium `@nodetool-ai/browser` launches for
 * PDF output. No pandoc, and no child process from the converter itself.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  convertDocument,
  convertMarkdownToPdf
} from "../src/capabilities/documents.js";
import {
  SUPPORTED_CONVERSIONS,
  SUPPORTED_CONVERSIONS_TEXT
} from "../src/capabilities/document-conversion.js";
import { convertDocumentSpec } from "../src/capabilities/documents.specs.js";
import { UNGATED, createCapabilityRun } from "../src/capabilities/invoke.js";

const spawned = vi.hoisted(() => [] as string[]);

// Wrap every process-starting export so a call from the converter is
// recorded and still behaves normally.
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const wrap =
    <F extends (...args: never[]) => unknown>(name: string, fn: F) =>
    (...args: Parameters<F>) => {
      spawned.push(`${name} ${String(args[0])}`);
      return fn(...args);
    };
  return {
    ...actual,
    spawn: wrap("spawn", actual.spawn),
    spawnSync: wrap("spawnSync", actual.spawnSync),
    exec: wrap("exec", actual.exec),
    execSync: wrap("execSync", actual.execSync),
    execFile: wrap("execFile", actual.execFile),
    execFileSync: wrap("execFileSync", actual.execFileSync),
    fork: wrap("fork", actual.fork)
  };
});

const MARKDOWN = [
  "# Quarterly Report",
  "",
  "Revenue **grew** this quarter.",
  "",
  "## Highlights",
  "",
  "- First bullet",
  "- Second bullet",
  "",
  "1. Step one",
  "2. Step two",
  ""
].join("\n");

const HTML = [
  "<!doctype html><html><head><title>t</title></head><body>",
  "<h1>Quarterly Report</h1>",
  "<p>Revenue <strong>grew</strong> this quarter.</p>",
  "<h2>Highlights</h2>",
  "<ul><li>First bullet</li><li>Second bullet</li></ul>",
  "<ol><li>Step one</li><li>Step two</li></ol>",
  "</body></html>"
].join("");

function findChrome(): string | null {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const candidates = [
    "/opt/pw-browsers/chromium",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium"
  ];
  return candidates.find((path) => existsSync(path)) ?? null;
}

const chromePath = findChrome();

let workspace: string;
let savedChromePath: string | undefined;

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), "nodetool-convert-"));
  await writeFile(join(workspace, "report.md"), MARKDOWN);
  await writeFile(join(workspace, "report.html"), HTML);
  savedChromePath = process.env.CHROME_PATH;
  if (chromePath) process.env.CHROME_PATH = chromePath;
});

afterAll(async () => {
  if (savedChromePath === undefined) delete process.env.CHROME_PATH;
  else process.env.CHROME_PATH = savedChromePath;
  await rm(workspace, { recursive: true, force: true });
});

function run() {
  const context = {
    resolveWorkspacePath: (path: string) => resolve(workspace, path)
  } as unknown as ProcessingContext;
  return createCapabilityRun({ context, gate: UNGATED });
}

async function convert(
  input: string,
  output: string,
  from: string,
  to: string
): Promise<Buffer> {
  const result = (await convertDocument.impl(run(), {
    input_file: input,
    output_file: output,
    from_format: from,
    to_format: to
  })) as { status?: string; error?: string };
  expect(result.error).toBeUndefined();
  expect(result.status).toBe("success");
  return readFile(join(workspace, output));
}

/** The paragraphs of a DOCX, as mammoth reads them back. */
async function docxHtml(bytes: Buffer): Promise<string> {
  const mammoth = (await import("mammoth")).default;
  return (await mammoth.convertToHtml({ buffer: bytes })).value;
}

function expectDocx(bytes: Buffer): void {
  expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
  const entries = unzipSync(new Uint8Array(bytes));
  expect(Object.keys(entries)).toContain("word/document.xml");
  const xml = strFromU8(entries["word/document.xml"]!);
  expect(xml).toContain("Quarterly Report");
  expect(xml).toContain("Heading1");
  expect(xml).toContain("<w:numPr>");
}

function expectStructuredHtml(html: string): void {
  expect(html).toMatch(/<h1[^>]*>Quarterly Report<\/h1>/);
  expect(html).toMatch(/<h2[^>]*>Highlights<\/h2>/);
  expect(html).toMatch(/<ul>\s*<li>First bullet<\/li>\s*<li>Second bullet<\/li>\s*<\/ul>/);
  expect(html).toMatch(/<ol>\s*<li>Step one<\/li>\s*<li>Step two<\/li>\s*<\/ol>/);
}

function expectStructuredMarkdown(md: string): void {
  expect(md).toMatch(/^# Quarterly Report$/m);
  expect(md).toMatch(/^## Highlights$/m);
  expect(md).toMatch(/^-\s+First bullet$/m);
  expect(md).toMatch(/^1\.\s+Step one$/m);
  expect(md).toMatch(/^2\.\s+Step two$/m);
}

async function pdfText(bytes: Buffer): Promise<string> {
  const { LiteParse } = await import("@llamaindex/liteparse");
  const parsed = await new LiteParse({ ocrEnabled: false }).parse(bytes, true);
  return parsed.pages.map((page) => page.text).join("\n");
}

describe("convert_document", () => {
  it("markdown → html keeps headings and lists", async () => {
    const html = (await convert("report.md", "out/md.html", "markdown", "html")).toString();
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expectStructuredHtml(html);
  });

  it("html → markdown keeps headings and lists", async () => {
    const md = (await convert("report.html", "out/html.md", "html", "markdown")).toString();
    expectStructuredMarkdown(md);
    expect(md).not.toContain("<title>");
  });

  it("markdown → docx writes a Word document with headings and lists", async () => {
    const bytes = await convert("report.md", "out/md.docx", "md", "docx");
    expectDocx(bytes);
    expectStructuredHtml(await docxHtml(bytes));
  });

  it("html → docx writes a Word document with headings and lists", async () => {
    const bytes = await convert("report.html", "out/html.docx", "html", "docx");
    expectDocx(bytes);
    expectStructuredHtml(await docxHtml(bytes));
  });

  it("docx → markdown, html and text read the document back", async () => {
    await convert("report.md", "round.docx", "markdown", "docx");
    expectStructuredMarkdown(
      (await convert("round.docx", "out/round.md", "docx", "markdown")).toString()
    );
    expectStructuredHtml(
      (await convert("round.docx", "out/round.html", "docx", "html")).toString()
    );
    const text = (await convert("round.docx", "out/round.txt", "docx", "text")).toString();
    expect(text).toContain("Quarterly Report");
    expect(text).toContain("Second bullet");
  });

  it("passes plain text through unchanged", async () => {
    expect(
      (await convert("report.md", "out/plain.txt", "markdown", "text")).toString()
    ).toBe(MARKDOWN);
    expect(
      (await convert("out/plain.txt", "out/plain.md", "txt", "markdown")).toString()
    ).toBe(MARKDOWN);
    expect(
      (await convert("out/plain.txt", "out/copy.txt", "plain", "text")).toString()
    ).toBe(MARKDOWN);
  });

  it("escapes raw HTML and drops unsafe link schemes from markdown", async () => {
    await writeFile(
      join(workspace, "unsafe.md"),
      "<script>alert(1)</script>\n\n[click](javascript:alert(1)) [ok](https://example.com)\n"
    );
    const html = (await convert("unsafe.md", "out/unsafe.html", "markdown", "html")).toString();
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="https://example.com"');
  });
});

describe("convert_document refusals", () => {
  it("names the supported pairs for an unsupported pair", async () => {
    const result = (await convertDocument.impl(run(), {
      input_file: "report.md",
      output_file: "out/report.rst",
      from_format: "markdown",
      to_format: "rst"
    })) as { error?: string };
    expect(result.error).toContain("Cannot convert markdown to rst");
    expect(result.error).toContain(SUPPORTED_CONVERSIONS_TEXT);
    expect(existsSync(join(workspace, "out/report.rst"))).toBe(false);
  });

  it("refuses a known format pair outside the table", async () => {
    const result = (await convertDocument.impl(run(), {
      input_file: "report.md",
      output_file: "out/x.md",
      from_format: "pdf",
      to_format: "markdown"
    })) as { error?: string };
    expect(result.error).toContain("Cannot convert pdf to markdown");
  });

  it("lists every supported pair in the tool description", () => {
    for (const [from, to] of SUPPORTED_CONVERSIONS) {
      expect(convertDocumentSpec.description).toContain(`${from} → ${to}`);
    }
    expect(convertDocumentSpec.inputSchema.properties).not.toHaveProperty("extra_args");
  });

  it("refuses an input outside the workspace", async () => {
    const result = (await convertDocument.impl(run(), {
      input_file: "../outside.md",
      output_file: "out/x.html",
      from_format: "markdown",
      to_format: "html"
    })) as { error?: string };
    expect(result.error).toMatch(/outside the workspace/);
  });
});

describe.skipIf(!chromePath)("PDF output through headless Chromium", () => {
  let server: Server;
  let hits = 0;
  let origin = "";

  beforeAll(async () => {
    server = createServer((_req, res) => {
      hits += 1;
      res.end("x");
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((done) => server.close(() => done()));
  });

  it("convert_markdown_to_pdf prints the headings and lists", async () => {
    const result = (await convertMarkdownToPdf.impl(run(), {
      input_file: "report.md",
      output_file: "out/report.pdf"
    })) as { status?: string; error?: string };
    expect(result.error).toBeUndefined();
    const bytes = await readFile(join(workspace, "out/report.pdf"));
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const text = await pdfText(bytes);
    expect(text).toContain("Quarterly Report");
    expect(text).toContain("Highlights");
    expect(text).toContain("Second bullet");
  }, 60_000);

  it("html → pdf prints the document", async () => {
    const bytes = await convert("report.html", "out/html.pdf", "html", "pdf");
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(await pdfText(bytes)).toContain("Step two");
  }, 60_000);

  it("makes no network request while rendering", async () => {
    await writeFile(
      join(workspace, "remote.html"),
      `<h1>Remote</h1><img src="${origin}/a.png">` +
        `<link rel="stylesheet" href="${origin}/b.css">` +
        `<iframe src="${origin}/c.html"></iframe>` +
        `<script src="${origin}/d.js"></script>`
    );
    await writeFile(
      join(workspace, "remote.md"),
      `# Remote\n\n![img](${origin}/e.png)\n`
    );
    const html = await convert("remote.html", "out/remote.pdf", "html", "pdf");
    const md = await convert("remote.md", "out/remote-md.pdf", "markdown", "pdf");
    expect(html.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(md.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(hits).toBe(0);
  }, 60_000);
});

describe("process use", () => {
  it("starts no child process from the converter", () => {
    // Chromium is launched by chrome-launcher, a CommonJS dependency whose own
    // `require("child_process")` this mock does not see. Everything the
    // converter and the capability import goes through the mock.
    expect(spawned).toEqual([]);
  });
});
