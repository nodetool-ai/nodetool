/**
 * Host modules end to end — real sandbox runs, real libraries, no network.
 *
 * These are the cases the `data.*` bridges used to carry, moved to the import
 * path that replaced them, plus the ones the import path adds: the dispatcher's
 * refusals, and the trust rule that keeps host execution first-party.
 */
import { describe, it, expect } from "vitest";
import { Workbook } from "exceljs";
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
