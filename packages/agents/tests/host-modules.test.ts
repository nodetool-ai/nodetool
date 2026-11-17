/**
 * Host modules end to end — real sandbox runs, real libraries, no network.
 *
 * These are the cases the `data.*` bridges used to carry, moved to the import
 * path that replaced them, plus the ones the import path adds: the dispatcher's
 * refusals, and the trust rule that keeps host execution first-party.
 */
import { describe, it, expect } from "vitest";
import { zipSync } from "fflate";
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
import {
  MAX_FABRIC_EFFECT_PIXELS,
  assertRenderBudget,
  assertSvgHasNoExternalResources
} from "../src/host-modules/fabric.js";
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

  it("refuses a bomb from its declared entry sizes", async () => {
    const { unzip } = await import("../src/host-modules/zip.js");
    const zeros = new Uint8Array(32 * 1024 * 1024);
    const bomb = zipSync({ a: zeros, b: zeros }, { level: 9 });
    expect(bomb.length).toBeLessThan(1024 * 1024);
    await expect(unzip(bomb)).rejects.toThrow(/inflates past the 52428800 byte limit/);
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
// tokens
// ---------------------------------------------------------------------------

describe("@nodetool-ai/sandbox-tokens", () => {
  it("counts tokens the way the removed CountTokens node did", async () => {
    const result = await run(
      `import { count } from "@nodetool-ai/sandbox-tokens";
       return {
         hello: await count("hello world"),
         empty: await count(""),
         o200k: await count("hello world", "o200k_base")
       };`,
      "tokens"
    );
    expect(result.success).toBe(true);
    const counts = result.result as Record<string, number>;
    expect(counts.hello).toBe(2);
    expect(counts.empty).toBe(0);
    expect(counts.o200k).toBe(2);
  });

  it("round-trips encode and decode", async () => {
    const result = await run(
      `import { encode, decode } from "@nodetool-ai/sandbox-tokens";
       const ids = await encode("hello world");
       return { ids, text: await decode(ids) };`,
      "tokens"
    );
    expect(result.success).toBe(true);
    const round = result.result as { ids: number[]; text: string };
    expect(round.ids).toHaveLength(2);
    expect(round.text).toBe("hello world");
  });

  it("refuses an encoding it has no ranks for", async () => {
    const result = await run(
      `import { count } from "@nodetool-ai/sandbox-tokens";
       try { await count("x", "not_an_encoding"); return "no throw"; }
       catch (e) { return e.message; }`,
      "tokens"
    );
    expect(result.success).toBe(true);
    expect(result.result).toContain("tokens.count: encoding must be one of");
  });
});
// ---------------------------------------------------------------------------
// ocr
//
// It downloads the engine's language file on first use, so what runs here is
// everything up to that point: the argument contract, the caps, and the
// refusals.
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

  it("refuses an image source that is not an inline raster data URI", async () => {
    for (const src of ["file:///etc/hostname", "http://127.0.0.1:1/x.png", "data:image/svg+xml;base64,PHN2Zy8+"]) {
      const result = await run(
        `import { render } from "@nodetool-ai/sandbox-fabric";
         return await render({
           width: 4,
           height: 4,
           objects: [{ type: "Image", src: ${JSON.stringify(src)} }]
         });`,
        "fabric"
      );
      expect(result.success).toBe(false);
      expect(String(result.error)).toMatch(/inline data:image URI/);
    }
  });

  it("refuses an external source nested in a clip path or pattern", async () => {
    const result = await run(
      `import { renderSVG } from "@nodetool-ai/sandbox-fabric";
       return await renderSVG({
         width: 4,
         height: 4,
         objects: [{ type: "rect", width: 4, height: 4,
           fill: { type: "pattern", source: "file:///etc/hostname" } }]
       });`,
      "fabric"
    );
    expect(result.success).toBe(false);
    expect(String(result.error)).toMatch(/source must be an inline data:image URI/);
  });

  it("refuses an SVG that references an external resource", async () => {
    for (const svg of [
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="file:///etc/hostname"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(http://127.0.0.1:1/p)"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><style>@import "file:///x.css";</style></svg>'
    ]) {
      const result = await run(
        `import { loadSVG } from "@nodetool-ai/sandbox-fabric";
         return await loadSVG(${JSON.stringify(svg)});`,
        "fabric"
      );
      expect(result.success).toBe(false);
      expect(String(result.error)).toMatch(/external resource|@import/);
    }
  });

  it("passes an SVG with fragment references and an inline image", () => {
    expect(() =>
      assertSvgHasNoExternalResources(
        "test",
        '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"/></defs>' +
          '<rect fill="url(#g)"/><use href="#g"/><image href="data:image/png;base64,iVBORw0KGgo="/></svg>'
      )
    ).not.toThrow();
  });

  it("refuses an output larger than the pixel cap before rendering", async () => {
    const result = await run(
      `import { render } from "@nodetool-ai/sandbox-fabric";
       return await render({ width: 8000, height: 8000 }, { multiplier: 4 });`,
      "fabric"
    );
    expect(result.success).toBe(false);
    expect(String(result.error)).toMatch(/at most 16777216 pixels/);
  });

  it("refuses an image source given as an array or other non-string value", async () => {
    // Fabric assigns `src` to an image as is, so an array stringifies to the
    // URL it holds and would load it.
    for (const src of [["file:///etc/hostname"], ["http://127.0.0.1:1/x.png"], { toString: "x" }, 1]) {
      const result = await run(
        `import { render } from "@nodetool-ai/sandbox-fabric";
         return await render({
           width: 4,
           height: 4,
           objects: [{ type: "Image", src: ${JSON.stringify(src)} }]
         });`,
        "fabric"
      );
      expect(result.success).toBe(false);
      expect(String(result.error)).toMatch(/src must be a string/);
    }
  });

  it("refuses a scene with more shadows than the output size allows", () => {
    const shadowed = (count: number) => ({
      objects: Array.from({ length: count }, () => ({
        type: "rect",
        width: 10,
        height: 10,
        shadow: { color: "#000", blur: 20, offsetX: 1, offsetY: 1 }
      }))
    });
    const large = 4096 * 4096;
    expect(() => assertRenderBudget("test", shadowed(2), large)).not.toThrow();
    expect(() => assertRenderBudget("test", shadowed(3), large)).toThrow(/too many shadows and image filters/);
    // A small canvas affords more, up to a fixed count.
    expect(() => assertRenderBudget("test", shadowed(32), 512 * 512)).not.toThrow();
    expect(() => assertRenderBudget("test", shadowed(33), 16)).toThrow(/too many shadows and image filters/);
  });

  it("counts shadows and filters inside groups", () => {
    const scene = {
      objects: [{
        type: "group",
        objects: [
          { type: "image", src: "data:image/png;base64,iVBORw0KGgo=", filters: [{ type: "Blur" }, { type: "Grayscale" }] },
          { type: "rect", shadow: "rgba(0,0,0,0.5) 2px 2px 10px" },
          { type: "rect", shadow: { blur: 5 } }
        ]
      }]
    };
    expect(() => assertRenderBudget("test", scene, MAX_FABRIC_EFFECT_PIXELS / 4)).not.toThrow();
    expect(() => assertRenderBudget("test", scene, MAX_FABRIC_EFFECT_PIXELS / 3)).toThrow(/too many shadows/);
  });

  it("refuses a shadow blur over the limit, in object or string form", () => {
    for (const shadow of [{ blur: 2000 }, "#000000 1px 1px 2000px"]) {
      expect(() =>
        assertRenderBudget("test", { objects: [{ type: "rect", shadow }] }, 16)
      ).toThrow(/shadow blur must be at most 100/);
    }
  });

  it("refuses a scene with too many objects", () => {
    const objects = Array.from({ length: 2001 }, () => ({ type: "rect", width: 1, height: 1 }));
    expect(() => assertRenderBudget("test", { objects }, 16)).toThrow(/at most 2000 objects/);
  });

  it("applies the render budget to guest calls", async () => {
    const result = await run(
      `import { render } from "@nodetool-ai/sandbox-fabric";
       const objects = [];
       for (let i = 0; i < 20; i++) {
         objects.push({ type: "rect", width: 4096, height: 4096, shadow: { color: "#000", blur: 100 } });
       }
       return await render({ width: 4096, height: 4096, objects });`,
      "fabric"
    );
    expect(result.success).toBe(false);
    expect(String(result.error)).toMatch(/too many shadows and image filters/);
  });

  it("returns plain objects from loadSVG", async () => {
    const result = await run(
      `import { loadSVG } from "@nodetool-ai/sandbox-fabric";
       const parsed = await loadSVG('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect x="1" y="2" width="5" height="4" fill="#ff0000"/></svg>');
       return { count: parsed.objects.length, type: parsed.objects[0].type, fill: parsed.objects[0].fill };`,
      "fabric"
    );
    expect(result.success).toBe(true);
    expect(result.result).toMatchObject({ count: 1, fill: "#ff0000" });
    expect(String((result.result as { type: string }).type).toLowerCase()).toBe("rect");
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

  it("rejects formulas that reach object internals", async () => {
    const result = await run(
      `import { evaluate } from "@nodetool-ai/sandbox-expr";
       return await evaluate("x.constructor", { x: 1 });`,
      "expr"
    );
    expect(result.success).toBe(false);
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
