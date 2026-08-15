/**
 * Host modules end to end — real sandbox runs, real libraries, no network.
 *
 * These are the cases the `data.*` bridges used to carry, moved to the import
 * path that replaced them, plus the ones the import path adds: the dispatcher's
 * refusals, and the trust rule that keeps host execution first-party.
 */
import { describe, it, expect } from "vitest";
import { Workbook } from "exceljs";
import { zipSync, strToU8 } from "fflate";
import {
  SANDBOX_HOST_MODULES,
  type ResolvedSandboxModule,
  type SandboxModuleResolution
} from "@nodetool-ai/protocol";

import { runInSandbox } from "../src/js-sandbox.js";
import {
  createSandboxHostDispatcher,
  SandboxHostModuleError
} from "../src/host-modules/dispatcher.js";
import {
  registeredSandboxHostModuleIds,
  sandboxHostModuleDrift
} from "../src/host-modules/registry.js";
import { MAX_UNZIP_TOTAL_BYTES } from "../src/host-modules/zip.js";
import {
  DEFAULT_SELECT_HTML_LIMIT,
  MAX_SELECT_HTML_LIMIT
} from "../src/host-modules/html.js";
import {
  MAX_HOST_INPUT_BYTES,
  MAX_HOST_INPUT_CHARS
} from "../src/host-modules/limits.js";
import { buildPdf } from "./_helpers/fixture-pdf.js";

const DIGEST = "b".repeat(64);

/** A resolved host module for `id`, addressed by the pack the registry pins. */
function hostModule(id: string): ResolvedSandboxModule {
  const spec = SANDBOX_HOST_MODULES[id];
  if (spec === undefined) throw new Error(`no host module ${id}`);
  return {
    specifier: spec.packName,
    packName: spec.packName,
    packVersion: "0.0.0-test",
    contentDigest: DIGEST,
    moduleId: `host:${id}`,
    kind: "host",
    hostId: id,
    graph: []
  };
}

function resolution(...ids: string[]): SandboxModuleResolution {
  return { modules: ids.map(hostModule), statuses: [] };
}

async function run(code: string, ...ids: string[]) {
  return runInSandbox({ code, modules: resolution(...ids), timeoutMs: 20000 });
}

// ---------------------------------------------------------------------------
// The registry and the trust rule
// ---------------------------------------------------------------------------

describe("the host module registry", () => {
  it("implements exactly what the protocol table declares", () => {
    expect(sandboxHostModuleDrift()).toEqual([]);
    expect(registeredSandboxHostModuleIds()).toEqual(
      Object.keys(SANDBOX_HOST_MODULES).sort()
    );
  });

  it("pins every id to one owning pack", () => {
    for (const spec of Object.values(SANDBOX_HOST_MODULES)) {
      expect(spec.packName).toBe(`@nodetool-ai/sandbox-${spec.id}`);
      expect(spec.exports.length).toBeGreaterThan(0);
    }
  });
});

describe("the dispatcher", () => {
  it("is absent when a run declares no host module", () => {
    expect(createSandboxHostDispatcher([])).toBeUndefined();
  });

  it("refuses a resolution that claims another pack's implementation", () => {
    // The forged shape a compromised catalog or a hand-written delivery could
    // produce: a real id under a pack the registry does not pin it to.
    const forged: ResolvedSandboxModule = {
      ...hostModule("csv"),
      specifier: "@evil/pack",
      packName: "@evil/pack"
    };
    expect(() => createSandboxHostDispatcher([forged])).toThrow(
      SandboxHostModuleError
    );
    expect(() => createSandboxHostDispatcher([forged])).toThrow(
      /belongs to @nodetool-ai\/sandbox-csv/
    );
  });

  it("refuses a resolution naming an id NodeTool does not implement", () => {
    const forged = {
      ...hostModule("csv"),
      hostId: "shell"
    } as ResolvedSandboxModule;
    expect(() => createSandboxHostDispatcher([forged])).toThrow(
      /not a host module NodeTool implements/
    );
  });

  it("validates the module key, the export name, and the argument list", async () => {
    const dispatcher = createSandboxHostDispatcher([hostModule("csv")]);
    expect(dispatcher).toBeDefined();
    if (dispatcher === undefined) return;
    await expect(dispatcher.call("@nodetool-ai/sandbox-zip", "unzip", [])).rejects.toThrow(
      /is not a host sandbox module declared by this node/
    );
    await expect(
      dispatcher.call("@nodetool-ai/sandbox-csv", "constructor", [])
    ).rejects.toThrow(/has no export named/);
    await expect(
      dispatcher.call("@nodetool-ai/sandbox-csv", "parse", "a,b")
    ).rejects.toThrow(/non-list argument/);
  });
});

describe("the private host bridge module", () => {
  it("cannot be imported by user code", async () => {
    const result = await run(
      'import { __call } from "nodetool:host-bridge";\nreturn typeof __call;',
      "csv"
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("private to the sandbox's generated host facades");
  });

  it("leaves no dispatcher binding for user code to find", async () => {
    const result = await run(
      'import { parse } from "@nodetool-ai/sandbox-csv";\n' +
        "return { csv: typeof parse, dispatch: typeof globalThis.__nodetoolHostDispatch, raw: typeof globalThis.__hostCall };",
      "csv"
    );
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      csv: "function",
      dispatch: "undefined",
      raw: "undefined"
    });
  });

  it("refuses a specifier the run did not declare", async () => {
    const result = await run(
      'import { unzip } from "@nodetool-ai/sandbox-zip";\nreturn typeof unzip;',
      "csv"
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("@nodetool-ai/sandbox-zip");
  });
});

// ---------------------------------------------------------------------------
// csv
// ---------------------------------------------------------------------------

describe("@nodetool-ai/sandbox-csv", () => {
  it("round-trips records through stringify and parse", async () => {
    const result = await run(
      `import { parse, stringify } from "@nodetool-ai/sandbox-csv";
       const rows = [{ name: "ada", city: "london" }, { name: "lin", city: "oslo" }];
       const csv = await stringify(rows);
       const back = await parse(csv);
       return { csv, back };`,
      "csv"
    );
    expect(result.success).toBe(true);
    const { csv, back } = result.result as { csv: string; back: unknown };
    expect(csv.split("\n")[0]).toBe("name,city");
    expect(back).toEqual([
      { name: "ada", city: "london" },
      { name: "lin", city: "oslo" }
    ]);
  });

  it("reads through the default export too", async () => {
    const result = await run(
      `import csv from "@nodetool-ai/sandbox-csv";
       return await csv.parse("a,b\\n1,2\\n");`,
      "csv"
    );
    expect(result.success).toBe(true);
    expect(result.result).toEqual([{ a: "1", b: "2" }]);
  });

  it("rejects a non-array input to stringify", async () => {
    const result = await run(
      `import { stringify } from "@nodetool-ai/sandbox-csv";
       try { await stringify("nope"); return "no throw"; }
       catch (e) { return e.message; }`,
      "csv"
    );
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/rows must be an array/);
  });
});

// ---------------------------------------------------------------------------
// xlsx
// ---------------------------------------------------------------------------

describe("@nodetool-ai/sandbox-xlsx", () => {
  async function workbookBase64(): Promise<string> {
    const wb = new Workbook();
    const sheet = wb.addWorksheet("Products");
    sheet.addRow(["product", "price"]);
    sheet.addRow(["Lamp", 49]);
    sheet.addRow(["Desk", 349]);
    const other = wb.addWorksheet("Notes");
    other.addRow(["note"]);
    other.addRow(["hello"]);
    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer as ArrayBuffer).toString("base64");
  }

  it("parses sheets to records keyed by the header row", async () => {
    const b64 = await workbookBase64();
    const result = await run(
      `import { parse } from "@nodetool-ai/sandbox-xlsx";
       const bytes = fromBase64("${b64}");
       const all = await parse(bytes);
       const one = await parse(bytes, { sheet: "Products" });
       return { names: Object.keys(all), one };`,
      "xlsx"
    );
    expect(result.success).toBe(true);
    const r = result.result as { names: string[]; one: unknown[] };
    expect(r.names).toEqual(["Products", "Notes"]);
    expect(r.one).toEqual([
      { product: "Lamp", price: 49 },
      { product: "Desk", price: 349 }
    ]);
  });

  it("names the available sheets when the requested one is missing", async () => {
    const b64 = await workbookBase64();
    const result = await run(
      `import { parse } from "@nodetool-ai/sandbox-xlsx";
       try { await parse(fromBase64("${b64}"), { sheet: "Nope" }); return "no throw"; }
       catch (e) { return e.message; }`,
      "xlsx"
    );
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/no sheet named "Nope".*Products/);
  });

  it("rejects non-binary input", async () => {
    const result = await run(
      `import { parse } from "@nodetool-ai/sandbox-xlsx";
       try { await parse("text"); return "no throw"; }
       catch (e) { return e.message; }`,
      "xlsx"
    );
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/must be a Uint8Array/);
  });

  it("writes records to a workbook the parser reads back", async () => {
    const result = await run(
      `import { parse, write } from "@nodetool-ai/sandbox-xlsx";
       const bytes = await write({
         Costs: [{ item: "Lamp", usd: 49 }, { item: "Desk", usd: 349 }],
         Notes: [{ note: "draft" }]
       });
       return await parse(bytes);`,
      "xlsx"
    );
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      Costs: [
        { item: "Lamp", usd: 49 },
        { item: "Desk", usd: 349 }
      ],
      Notes: [{ note: "draft" }]
    });
  });

  it("takes per-sheet column order, header-less rows, and cell styles", async () => {
    const result = await run(
      `import { parse, write } from "@nodetool-ai/sandbox-xlsx";
       const bytes = await write([
         {
           name: "Costs",
           rows: [{ usd: 49, item: "Lamp" }],
           columns: ["item", "usd"],
           styles: [{ range: "A1:B1", bold: true, background: "#FFE9A8" }]
         },
         { name: "Raw", rows: [["a", 1], ["b", 2]], header: false }
       ]);
       const sheets = await parse(bytes);
       const raw = await parse(bytes, { sheet: "Raw", header: false });
       return { costs: sheets.Costs, raw };`,
      "xlsx"
    );
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      costs: [{ item: "Lamp", usd: 49 }],
      raw: [
        ["a", 1],
        ["b", 2]
      ]
    });
  });

  it("refuses a workbook past the cell cap", async () => {
    const { write, MAX_WRITE_CELLS } = await import("../src/host-modules/xlsx.js");
    const rows = Array.from({ length: MAX_WRITE_CELLS }, (_, i) => ({ a: i, b: i }));
    await expect(write({ Big: rows })).rejects.toThrow(/exceeds the 250000 cell limit/);
  });

  it("refuses a style whose range is not a rectangle of cells", async () => {
    const result = await run(
      `import { write } from "@nodetool-ai/sandbox-xlsx";
       try { await write([{ name: "S", rows: [{ a: 1 }], styles: [{ range: "rows 1-3" }] }]); return "no throw"; }
       catch (e) { return e.message; }`,
      "xlsx"
    );
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/is not a cell range/);
  });
});

// ---------------------------------------------------------------------------
// xml
// ---------------------------------------------------------------------------

describe("@nodetool-ai/sandbox-xml", () => {
  it("parses elements and keeps attributes prefixed", async () => {
    const result = await run(
      `import { parse } from "@nodetool-ai/sandbox-xml";
       const xml = '<feed><entry id="1"><title>Hello</title></entry>' +
         '<entry id="2"><title>World</title></entry></feed>';
       return await parse(xml);`,
      "xml"
    );
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      feed: {
        entry: [
          { "@_id": "1", title: "Hello" },
          { "@_id": "2", title: "World" }
        ]
      }
    });
  });

  it("keeps numeric-looking text as strings", async () => {
    const result = await run(
      `import { parse } from "@nodetool-ai/sandbox-xml";
       return await parse("<id>007</id>");`,
      "xml"
    );
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ id: "007" });
  });

  it("throws with the parser's reason on invalid XML", async () => {
    const result = await run(
      `import { parse } from "@nodetool-ai/sandbox-xml";
       try { await parse("<a><b></a>"); return "no throw"; }
       catch (e) { return e.message; }`,
      "xml"
    );
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/invalid XML/);
  });
});

// ---------------------------------------------------------------------------
// html
// ---------------------------------------------------------------------------

describe("@nodetool-ai/sandbox-html", () => {
  it("selects text and attributes", async () => {
    const result = await run(
      `import { select } from "@nodetool-ai/sandbox-html";
       const html = '<a href="/one">One</a><a href="/two">Two</a>';
       return {
         texts: await select(html, "a"),
         hrefs: await select(html, "a", { attr: "href" })
       };`,
      "html"
    );
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      texts: ["One", "Two"],
      hrefs: ["/one", "/two"]
    });
  });

  it("clamps the match limit to the host ceiling", async () => {
    const result = await run(
      `import { select } from "@nodetool-ai/sandbox-html";
       const html = "<p>x</p>".repeat(1200);
       const asked = await select(html, "p", { limit: 100000 });
       const defaulted = await select(html, "p");
       return { asked: asked.length, defaulted: defaulted.length };`,
      "html"
    );
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      asked: MAX_SELECT_HTML_LIMIT,
      defaulted: DEFAULT_SELECT_HTML_LIMIT
    });
  });

  it("converts headings, links, and lists to markdown", async () => {
    const result = await run(
      `import { toMarkdown } from "@nodetool-ai/sandbox-html";
       const html = '<h1>Title</h1><p>See <a href="https://x.test">docs</a>.</p>' +
         '<ul><li>one</li><li>two</li></ul>';
       return await toMarkdown(html);`,
      "html"
    );
    expect(result.success).toBe(true);
    const md = result.result as string;
    expect(md).toContain("# Title");
    expect(md).toContain("[docs](https://x.test)");
    expect(md).toMatch(/-\s+one/);
  });

  it("converts a page to plain text", async () => {
    const result = await run(
      `import { toText } from "@nodetool-ai/sandbox-html";
       const html = "<style>p{color:red}</style><p>Hello <b>world</b></p>";
       return await toText(html);`,
      "html"
    );
    expect(result.success).toBe(true);
    expect(result.result).toBe("Hello world");
  });

  it("extracts links, classifying internal vs external", async () => {
    const result = await run(
      `import { extractLinks } from "@nodetool-ai/sandbox-html";
       const html = '<a href="/about">About</a><a href="https://other.test">Other</a>';
       return await extractLinks(html, "https://x.test");`,
      "html"
    );
    expect(result.success).toBe(true);
    expect(result.result).toEqual([
      { href: "/about", text: "About", type: "internal" },
      { href: "https://other.test", text: "Other", type: "external" }
    ]);
  });

  it("extracts images, audio, and videos with resolved URLs", async () => {
    const result = await run(
      `import { extractImages, extractAudio, extractVideos } from "@nodetool-ai/sandbox-html";
       const html = '<img src="/a.png"><audio src="/a.mp3"></audio>' +
         '<video><source src="/v.mp4"></video>';
       return {
         images: await extractImages(html, "https://x.test"),
         audio: await extractAudio(html, "https://x.test"),
         videos: await extractVideos(html, "https://x.test")
       };`,
      "html"
    );
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      images: ["https://x.test/a.png"],
      audio: ["https://x.test/a.mp3"],
      videos: ["https://x.test/v.mp4"]
    });
  });

  it("extracts title, description, and keywords", async () => {
    const result = await run(
      `import { extractMetadata } from "@nodetool-ai/sandbox-html";
       const html = '<title>Hi</title><meta name="description" content="d">';
       return await extractMetadata(html);`,
      "html"
    );
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ title: "Hi", description: "d", keywords: null });
  });

  it("extracts the page's readable content", async () => {
    const result = await run(
      `import { extractReadableText } from "@nodetool-ai/sandbox-html";
       const html = "<nav>Menu</nav><article>Main text</article><footer>F</footer>";
       return await extractReadableText(html);`,
      "html"
    );
    expect(result.success).toBe(true);
    expect(result.result).toBe("Main text");
  });
});

// ---------------------------------------------------------------------------
// zip
// ---------------------------------------------------------------------------

describe("@nodetool-ai/sandbox-zip", () => {
  it("round-trips text and binary entries", async () => {
    const result = await run(
      `import { zip, unzip } from "@nodetool-ai/sandbox-zip";
       const archive = await zip({
         "notes/a.txt": "hello zip",
         "raw.bin": Uint8Array.from([1, 2, 250])
       });
       const entries = await unzip(archive);
       return {
         names: Object.keys(entries).sort(),
         text: new TextDecoder().decode(entries["notes/a.txt"]),
         bin: Array.from(entries["raw.bin"]),
         isBytes: entries["raw.bin"] instanceof Uint8Array
       };`,
      "zip"
    );
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      names: ["notes/a.txt", "raw.bin"],
      text: "hello zip",
      bin: [1, 2, 250],
      isBytes: true
    });
  });

  it("rejects a non-object zip input", async () => {
    const result = await run(
      `import { zip } from "@nodetool-ai/sandbox-zip";
       try { await zip([1, 2]); return "no throw"; }
       catch (e) { return e.message; }`,
      "zip"
    );
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/files must be an object/);
  });

  it("refuses entries that exceed the inflation cap", async () => {
    // Reaching the cap through the host is what proves the guest cannot get
    // past it: the check runs before any bytes reach the facade.
    const { zip } = await import("../src/host-modules/zip.js");
    const chunk = new Uint8Array(8 * 1024 * 1024);
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < 7; i += 1) files[`f${i}`] = chunk;
    await expect(zip(files)).rejects.toThrow(/exceed the 52428800 byte limit/);
  });

  it("keeps the zip-bomb cap at 50 MB", () => {
    // Drift pin. Moving this is a policy change, not a refactor, and it belongs
    // in its own commit with its own reasoning.
    expect(MAX_UNZIP_TOTAL_BYTES).toBe(50 * 1024 * 1024);
  });
});

// ---------------------------------------------------------------------------
// diff
// ---------------------------------------------------------------------------

describe("@nodetool-ai/sandbox-diff", () => {
  it("produces a unified diff with the changed lines", async () => {
    const result = await run(
      `import { unified } from "@nodetool-ai/sandbox-diff";
       return await unified("a\\nb\\nc\\n", "a\\nB\\nc\\n");`,
      "diff"
    );
    expect(result.success).toBe(true);
    const patch = result.result as string;
    expect(patch).toContain("-b");
    expect(patch).toContain("+B");
  });

  it("returns a hunk-free patch for identical inputs", async () => {
    const result = await run(
      `import { unified } from "@nodetool-ai/sandbox-diff";
       return await unified("same\\n", "same\\n");`,
      "diff"
    );
    expect(result.success).toBe(true);
    expect(result.result).not.toContain("@@");
  });
});
// ---------------------------------------------------------------------------
// ocr and tfjs
//
// Both download data on first use — the engine's language file, the models'
// weights — so what runs here is everything up to that point: the argument
// contract, the caps, and the refusals.
// ---------------------------------------------------------------------------

describe("@nodetool-ai/sandbox-ocr", () => {
  it("refuses input that is not image bytes", async () => {
    const result = await run(
      `import { recognize } from "@nodetool-ai/sandbox-ocr";
       try { await recognize("a scan"); return "no throw"; }
       catch (e) { return e.message; }`,
      "ocr"
    );
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/ocr\.recognize: image must be a Uint8Array/);
  });

  it("refuses a language that is not a Tesseract code", async () => {
    const result = await run(
      `import { recognize } from "@nodetool-ai/sandbox-ocr";
       try { await recognize(new Uint8Array([1]), { language: "../etc" }); return "no throw"; }
       catch (e) { return e.message; }`,
      "ocr"
    );
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/is not a Tesseract language code/);
  });
});

describe("@nodetool-ai/sandbox-tfjs", () => {
  it("refuses an image that is not bytes", async () => {
    const result = await run(
      `import { classify } from "@nodetool-ai/sandbox-tfjs";
       try { await classify("a photo"); return "no throw"; }
       catch (e) { return e.message; }`,
      "tfjs"
    );
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/tfjs\.classify: image must be a Uint8Array/);
  });

  it("answers nothing when the question or the passage is empty", async () => {
    const result = await run(
      `import { answer } from "@nodetool-ai/sandbox-tfjs";
       return await answer("  ", "a passage");`,
      "tfjs"
    );
    expect(result.success).toBe(true);
    expect(result.result).toEqual([]);
  });

  it("refuses a passage that is not text", async () => {
    const result = await run(
      `import { answer } from "@nodetool-ai/sandbox-tfjs";
       try { await answer("who?", 42); return "no throw"; }
       catch (e) { return e.message; }`,
      "tfjs"
    );
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/passage must be a string/);
  });
});

// ---------------------------------------------------------------------------
// docx (write) + mammoth (read)
// ---------------------------------------------------------------------------

describe("@nodetool-ai/sandbox-docx", () => {
  it("builds a document with a heading, a paragraph, and a table", async () => {
    const result = await run(
      `import { build } from "@nodetool-ai/sandbox-docx";
       const bytes = await build({
         properties: { title: "Report" },
         elements: [
           { type: "heading", text: "Title", level: 1 },
           { type: "paragraph", text: "Hello world", bold: true },
           { type: "table", rows: [["a", "b"], ["c", "d"]] },
           { type: "pageBreak" }
         ]
       });
       return { isBytes: bytes instanceof Uint8Array, isZip: bytes[0] === 0x50 && bytes[1] === 0x4b };`,
      "docx"
    );
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ isBytes: true, isZip: true });
  });

  it("round-trips text through mammoth", async () => {
    const result = await run(
      `import { build } from "@nodetool-ai/sandbox-docx";
       import { extractRawText } from "@nodetool-ai/sandbox-mammoth";
       const bytes = await build({
         elements: [{ type: "paragraph", text: "Round trip content" }]
       });
       return await extractRawText(bytes);`,
      "docx",
      "mammoth"
    );
    expect(result.success).toBe(true);
    expect(result.result).toContain("Round trip content");
  });

  it("rejects a non-array elements value", async () => {
    const result = await run(
      `import { build } from "@nodetool-ai/sandbox-docx";
       try { await build({ elements: [{ text: "no type" }] }); return "no throw"; }
       catch (e) { return e.message; }`,
      "docx"
    );
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/missing a "type"/);
  });
});

describe("@nodetool-ai/sandbox-mammoth", () => {
  async function docxBase64(): Promise<string> {
    const { Document, Packer, Paragraph, TextRun } = await import("docx");
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({ children: [new TextRun("Hello from DOCX")] })
          ]
        }
      ]
    });
    const buffer = await Packer.toBuffer(doc);
    return Buffer.from(buffer).toString("base64");
  }

  it("extracts raw text", async () => {
    const b64 = await docxBase64();
    const result = await run(
      `import { extractRawText } from "@nodetool-ai/sandbox-mammoth";
       return await extractRawText(fromBase64("${b64}"));`,
      "mammoth"
    );
    expect(result.success).toBe(true);
    expect(result.result).toContain("Hello from DOCX");
  });

  it("converts to HTML", async () => {
    const b64 = await docxBase64();
    const result = await run(
      `import { convertToHtml } from "@nodetool-ai/sandbox-mammoth";
       return await convertToHtml(fromBase64("${b64}"));`,
      "mammoth"
    );
    expect(result.success).toBe(true);
    expect(result.result).toContain("Hello from DOCX");
    expect(String(result.result)).toMatch(/<p>/);
  });

  it("rejects non-binary input", async () => {
    const result = await run(
      `import { extractRawText } from "@nodetool-ai/sandbox-mammoth";
       try { await extractRawText("text"); return "no throw"; }
       catch (e) { return e.message; }`,
      "mammoth"
    );
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/must be a Uint8Array/);
  });
});

// ---------------------------------------------------------------------------
// epub
// ---------------------------------------------------------------------------

describe("@nodetool-ai/sandbox-epub", () => {
  function epubBase64(): string {
    const container = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
    const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Test Book</dc:title>
    <dc:creator>Test Author</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier id="bookid">test-id-123</dc:identifier>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>`;
    const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="test-id-123"/></head>
  <docTitle><text>Test Book</text></docTitle>
  <navMap>
    <navPoint id="ch1" playOrder="1"><navLabel><text>Chapter One</text></navLabel><content src="chapter1.xhtml"/></navPoint>
    <navPoint id="ch2" playOrder="2"><navLabel><text>Chapter Two</text></navLabel><content src="chapter2.xhtml"/></navPoint>
  </navMap>
</ncx>`;
    const ch1 = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter 1</title></head>
<body><h1>Chapter One</h1><p>This is the first chapter content.</p></body></html>`;
    const ch2 = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter 2</title></head>
<body><h1>Chapter Two</h1><p>The second chapter has different text.</p></body></html>`;

    const archive = zipSync({
      mimetype: [strToU8("application/epub+zip"), { level: 0 }],
      "META-INF/container.xml": strToU8(container),
      "OEBPS/content.opf": strToU8(opf),
      "OEBPS/toc.ncx": strToU8(ncx),
      "OEBPS/chapter1.xhtml": strToU8(ch1),
      "OEBPS/chapter2.xhtml": strToU8(ch2)
    });
    return Buffer.from(archive).toString("base64");
  }

  it("reads metadata", async () => {
    const b64 = epubBase64();
    const result = await run(
      `import { metadata } from "@nodetool-ai/sandbox-epub";
       return await metadata(fromBase64("${b64}"));`,
      "epub"
    );
    expect(result.success).toBe(true);
    const meta = result.result as Record<string, unknown>;
    expect(meta.title).toBe("Test Book");
    expect(meta.creator).toBe("Test Author");
  });

  it("reads the table of contents in order", async () => {
    const b64 = epubBase64();
    const result = await run(
      `import { tableOfContents } from "@nodetool-ai/sandbox-epub";
       return await tableOfContents(fromBase64("${b64}"));`,
      "epub"
    );
    expect(result.success).toBe(true);
    const toc = result.result as Array<{ title: string }>;
    expect(toc.map((t) => t.title)).toEqual(["Chapter One", "Chapter Two"]);
  });

  it("extracts concatenated chapter text", async () => {
    const b64 = epubBase64();
    const result = await run(
      `import { extractText } from "@nodetool-ai/sandbox-epub";
       return await extractText(fromBase64("${b64}"));`,
      "epub"
    );
    expect(result.success).toBe(true);
    expect(result.result).toContain("first chapter content");
    expect(result.result).toContain("second chapter has different text");
  });

  it("extracts each chapter as its own item", async () => {
    const b64 = epubBase64();
    const result = await run(
      `import { extractChapters } from "@nodetool-ai/sandbox-epub";
       return await extractChapters(fromBase64("${b64}"));`,
      "epub"
    );
    expect(result.success).toBe(true);
    const chapters = result.result as Array<{ title: string; text: string }>;
    expect(chapters).toHaveLength(2);
    expect(chapters[0].title).toBe("Chapter One");
    expect(chapters[0].text).toContain("first chapter content");
  });
});

// ---------------------------------------------------------------------------
// pdf
// ---------------------------------------------------------------------------

describe("@nodetool-ai/sandbox-pdf", () => {
  function pdfBase64(): string {
    return Buffer.from(buildPdf(["Hello from page one", "Second page text here"])).toString(
      "base64"
    );
  }

  it("extracts full text from all pages", async () => {
    const result = await run(
      `import { extractText } from "@nodetool-ai/sandbox-pdf";
       return await extractText(fromBase64("${pdfBase64()}"));`,
      "pdf"
    );
    expect(result.success).toBe(true);
    const text = String(result.result);
    expect(text).toContain("Hello from page one");
    expect(text).toContain("Second page text here");
    // pdf-parse's own "-- 1 of 2 --" page marker is not the document's text.
    expect(text).not.toMatch(/-- \d+ of \d+ --/);
  });

  it("extracts text per page, preserving order", async () => {
    const result = await run(
      `import { extractPages } from "@nodetool-ai/sandbox-pdf";
       return await extractPages(fromBase64("${pdfBase64()}"));`,
      "pdf"
    );
    expect(result.success).toBe(true);
    const pages = result.result as Array<{ index: number; pageNumber: number; text: string }>;
    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({ index: 0, pageNumber: 1 });
    expect(pages[0].text).toContain("Hello from page one");
    expect(pages[1]).toMatchObject({ index: 1, pageNumber: 2 });
    expect(pages[1].text).toContain("Second page text here");
  });

  it("leaves the guest's own bytes intact", async () => {
    // pdf.js transfers the buffer it is handed; the copy is what keeps a
    // second read of the same input from seeing an empty array.
    const result = await run(
      `import { extractText } from "@nodetool-ai/sandbox-pdf";
       const bytes = fromBase64("${pdfBase64()}");
       await extractText(bytes);
       return bytes.length;`,
      "pdf"
    );
    expect(result.success).toBe(true);
    expect(result.result).toBeGreaterThan(0);
  });

  it("reports a malformed document by name", async () => {
    const result = await run(
      `import { extractText } from "@nodetool-ai/sandbox-pdf";
       try { await extractText(new Uint8Array([1, 2, 3, 4])); return "no throw"; }
       catch (e) { return e.message; }`,
      "pdf"
    );
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/^pdf\.extractText: /);
  });

  it("rejects non-binary input", async () => {
    const result = await run(
      `import { extractText } from "@nodetool-ai/sandbox-pdf";
       try { await extractText("text"); return "no throw"; }
       catch (e) { return e.message; }`,
      "pdf"
    );
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/must be a Uint8Array/);
  });

  it("refuses oversized input by name", async () => {
    const { extractText } = await import("../src/host-modules/pdf.js");
    await expect(extractText(new Uint8Array(MAX_HOST_INPUT_BYTES + 1))).rejects.toThrow(
      /pdf\.extractText: input exceeds the 10485760 byte limit/
    );
  });
});

// ---------------------------------------------------------------------------
// pptx
// ---------------------------------------------------------------------------

describe("@nodetool-ai/sandbox-pptx", () => {
  function pptxBase64(): string {
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`;
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`;
    const presentation = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
    <p:sldId id="257" r:id="rId2"/>
  </p:sldIdLst>
</p:presentation>`;
    const slide1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:p><a:r><a:t>Welcome to slide one</a:t></a:r></a:p></p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;
    const slide2 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:p><a:r><a:t>Slide two title</a:t></a:r><a:r><a:t>Bullet point</a:t></a:r></a:p></p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

    const archive = zipSync({
      "[Content_Types].xml": strToU8(contentTypes),
      "_rels/.rels": strToU8(rels),
      "ppt/presentation.xml": strToU8(presentation),
      "ppt/slides/slide1.xml": strToU8(slide1),
      "ppt/slides/slide2.xml": strToU8(slide2)
    });
    return Buffer.from(archive).toString("base64");
  }

  it("extracts full text from all slides", async () => {
    const b64 = pptxBase64();
    const result = await run(
      `import { extractText } from "@nodetool-ai/sandbox-pptx";
       return await extractText(fromBase64("${b64}"));`,
      "pptx"
    );
    expect(result.success).toBe(true);
    const text = String(result.result);
    expect(text).toContain("Welcome to slide one");
    expect(text).toContain("Slide two title");
    expect(text).toContain("Bullet point");
  });

  it("extracts text per slide, preserving order", async () => {
    const b64 = pptxBase64();
    const result = await run(
      `import { extractSlides } from "@nodetool-ai/sandbox-pptx";
       return await extractSlides(fromBase64("${b64}"));`,
      "pptx"
    );
    expect(result.success).toBe(true);
    const slides = result.result as Array<{ slideNumber: number; text: string }>;
    expect(slides).toHaveLength(2);
    expect(slides[0].slideNumber).toBe(1);
    expect(slides[0].text).toContain("Welcome to slide one");
    expect(slides[1].slideNumber).toBe(2);
    expect(slides[1].text).toContain("Slide two title");
  });

  it("rejects non-binary input", async () => {
    const result = await run(
      `import { extractText } from "@nodetool-ai/sandbox-pptx";
       try { await extractText("text"); return "no throw"; }
       catch (e) { return e.message; }`,
      "pptx"
    );
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/must be a Uint8Array/);
  });
});

// ---------------------------------------------------------------------------
// Fabric.js (canvas rendering / SVG)
// ---------------------------------------------------------------------------

describe("sandbox-fabric in the guest", () => {
  it("renders a scene to SVG", async () => {
    const result = await run(
      `import { renderSVG } from "@nodetool-ai/sandbox-fabric";
       return await renderSVG({
         width: 400,
         height: 300,
         objects: [
           { type: "rect", left: 10, top: 10, width: 50, height: 50, fill: "blue" }
         ]
       });`,
      "fabric"
    );
    expect(result.success).toBe(true);
    expect(typeof result.result).toBe("string");
    expect(result.result).toContain("<svg");
    expect(result.result).toContain("</svg>");
  });

  it("exports data URL", async () => {
    const result = await run(
      `import { toDataURL } from "@nodetool-ai/sandbox-fabric";
       return await toDataURL({
         width: 200,
         height: 200,
         objects: [
           { type: "circle", left: 100, top: 100, radius: 40, fill: "red" }
         ]
       });`,
      "fabric"
    );
    expect(result.success).toBe(true);
    expect(typeof result.result).toBe("string");
    expect(result.result).toMatch(/^data:image\/png;base64,/);
  });
});

// ---------------------------------------------------------------------------
// pdf-lib (write / merge)
// ---------------------------------------------------------------------------

describe("@nodetool-ai/sandbox-pdflib", () => {
  it("builds a one-page PDF", async () => {
    const result = await run(
      `import { build } from "@nodetool-ai/sandbox-pdflib";
       const bytes = await build({
         pages: [{ width: 200, height: 200, items: [
           { type: "text", x: 20, y: 20, text: "Hello PDF", size: 14 }
         ] }]
       });
       return { ok: bytes instanceof Uint8Array, len: bytes.length, head: String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) };`,
      "pdflib"
    );
    expect(result.success).toBe(true);
    expect(result.result).toMatchObject({ ok: true, head: "%PDF" });
    expect((result.result as { len: number }).len).toBeGreaterThan(100);
  });

  it("merges two PDFs", async () => {
    const result = await run(
      `import { build, merge } from "@nodetool-ai/sandbox-pdflib";
       const a = await build({ pages: [{ items: [{ type: "text", x: 40, y: 40, text: "A" }] }] });
       const b = await build({ pages: [{ items: [{ type: "text", x: 40, y: 40, text: "B" }] }] });
       const both = await merge([a, b]);
       return { ok: both instanceof Uint8Array, bigger: both.length > a.length };`,
      "pdflib"
    );
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ ok: true, bigger: true });
  });
});

// ---------------------------------------------------------------------------
// PptxGenJS (write)
// ---------------------------------------------------------------------------

describe("@nodetool-ai/sandbox-chrono", () => {
  it("parses a relative date against a fixed now", async () => {
    const result = await run(
      `import { parseDate } from "@nodetool-ai/sandbox-chrono";
       return await parseDate("tomorrow", "2026-08-15T00:00:00.000Z");`,
      "chrono"
    );
    expect(result.success).toBe(true);
    expect(String(result.result)).toMatch(/^2026-08-16/);
  });
});

describe("@nodetool-ai/sandbox-expr", () => {
  it("evaluates a formula with variables", async () => {
    const result = await run(
      `import { evaluate } from "@nodetool-ai/sandbox-expr";
       return await evaluate("2 * qty + fee", { qty: 3, fee: 1.5 });`,
      "expr"
    );
    expect(result.success).toBe(true);
    expect(result.result).toBe(7.5);
  });
});

describe("@nodetool-ai/sandbox-ics", () => {
  it("builds a one-event calendar", async () => {
    const result = await run(
      `import { createEvent } from "@nodetool-ai/sandbox-ics";
       return await createEvent({
         title: "Standup",
         start: [2026, 8, 15, 10, 0],
         duration: { hours: 1 }
       });`,
      "ics"
    );
    expect(result.success).toBe(true);
    expect(result.result).toContain("BEGIN:VCALENDAR");
    expect(result.result).toContain("Standup");
  });
});

describe("@nodetool-ai/sandbox-subtitle", () => {
  it("round-trips a cue", async () => {
    const result = await run(
      `import { parse, stringify } from "@nodetool-ai/sandbox-subtitle";
       const cues = await parse("1\\n00:00:00,000 --> 00:00:01,000\\nHi\\n");
       const srt = await stringify(cues, { format: "SRT" });
       return { cues, srt };`,
      "subtitle"
    );
    expect(result.success).toBe(true);
    const payload = result.result as { cues: Array<{ text: string }>; srt: string };
    expect(payload.cues[0]?.text).toBe("Hi");
    expect(payload.srt).toContain("Hi");
  });
});

describe("@nodetool-ai/sandbox-exif", () => {
  it("rejects non-binary input", async () => {
    const result = await run(
      `import { parse } from "@nodetool-ai/sandbox-exif";
       try { await parse("nope"); return "no throw"; }
       catch (e) { return e.message; }`,
      "exif"
    );
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/must be a Uint8Array/);
  });
});

describe("@nodetool-ai/sandbox-pptxgen", () => {
  it("builds a one-slide deck", async () => {
    const result = await run(
      `import { build } from "@nodetool-ai/sandbox-pptxgen";
       const bytes = await build({
         title: "Deck",
         slides: [{ items: [{ type: "text", x: 0.5, y: 0.5, w: 8, h: 1, text: "Hello" }] }]
       });
       return { ok: bytes instanceof Uint8Array, len: bytes.length, zip: bytes[0] === 0x50 && bytes[1] === 0x4b };`,
      "pptxgen"
    );
    expect(result.success).toBe(true);
    expect(result.result).toMatchObject({ ok: true, zip: true });
    expect((result.result as { len: number }).len).toBeGreaterThan(1000);
  });
});

// ---------------------------------------------------------------------------
// Shared input caps
// ---------------------------------------------------------------------------

describe("the shared host input caps", () => {
  it("are unchanged at 5 MB of text and 10 MB of bytes", () => {
    expect(MAX_HOST_INPUT_CHARS).toBe(5 * 1024 * 1024);
    expect(MAX_HOST_INPUT_BYTES).toBe(10 * 1024 * 1024);
  });

  it("refuse oversized text by name", async () => {
    const { parse } = await import("../src/host-modules/csv.js");
    await expect(parse("x".repeat(MAX_HOST_INPUT_CHARS + 1))).rejects.toThrow(
      /csv\.parse: input exceeds the 5242880 character limit/
    );
  });

  it("refuse oversized bytes by name", async () => {
    const { unzip } = await import("../src/host-modules/zip.js");
    await expect(unzip(new Uint8Array(MAX_HOST_INPUT_BYTES + 1))).rejects.toThrow(
      /zip\.unzip: input exceeds the 10485760 byte limit/
    );
  });
});
