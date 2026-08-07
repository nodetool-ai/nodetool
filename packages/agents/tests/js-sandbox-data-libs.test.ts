/**
 * Structured-data library bridges (exceljs / js-yaml / fast-xml-parser /
 * turndown / fflate / diff / papaparse-unparse) — real sandbox runs, real
 * libraries, no network.
 */
import { describe, it, expect } from "vitest";
import { Workbook } from "exceljs";
import { runInSandbox } from "../src/js-sandbox.js";

describe("data.toCsv bridge", () => {
  it("round-trips records through toCsv and parseCsv", async () => {
    const result = await runInSandbox({
      code: `
        const rows = [{ name: "ada", city: "london" }, { name: "lin", city: "oslo" }];
        const csv = await data.toCsv(rows);
        const back = await data.parseCsv(csv);
        return { csv, back };`
    });
    expect(result.success).toBe(true);
    const { csv, back } = result.result as { csv: string; back: unknown };
    expect(csv.split("\n")[0]).toBe("name,city");
    expect(back).toEqual([
      { name: "ada", city: "london" },
      { name: "lin", city: "oslo" }
    ]);
  });

  it("rejects a non-array input", async () => {
    const result = await runInSandbox({
      code: `try { await data.toCsv("nope"); return "no throw"; }
             catch (e) { return e.message; }`
    });
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/rows must be an array/);
  });
});

describe("data.parseXlsx bridge", () => {
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
    const result = await runInSandbox({
      code: `
        const bytes = fromBase64("${b64}");
        const all = await data.parseXlsx(bytes);
        const one = await data.parseXlsx(bytes, { sheet: "Products" });
        return { names: Object.keys(all), one };`
    });
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
    const result = await runInSandbox({
      code: `
        try { await data.parseXlsx(fromBase64("${b64}"), { sheet: "Nope" }); return "no throw"; }
        catch (e) { return e.message; }`
    });
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/no sheet named "Nope".*Products/);
  });

  it("rejects non-binary input", async () => {
    const result = await runInSandbox({
      code: `try { await data.parseXlsx("text"); return "no throw"; }
             catch (e) { return e.message; }`
    });
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/must be a Uint8Array/);
  });
});

describe("data.parseYaml / data.toYaml bridges", () => {
  it("round-trips a nested value", async () => {
    const result = await runInSandbox({
      code: `
        const value = { name: "wf", tags: ["a", "b"], nested: { n: 3 } };
        const text = await data.toYaml(value);
        const back = await data.parseYaml(text);
        return { text, back };`
    });
    expect(result.success).toBe(true);
    const r = result.result as { text: string; back: unknown };
    expect(r.text).toContain("name: wf");
    expect(r.back).toEqual({ name: "wf", tags: ["a", "b"], nested: { n: 3 } });
  });

  it("parses a YAML document with lists and scalars", async () => {
    const result = await runInSandbox({
      code: `return await data.parseYaml("steps:\\n  - id: one\\n    run: true\\n");`
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ steps: [{ id: "one", run: true }] });
  });
});

describe("data.parseXml bridge", () => {
  it("parses elements and keeps attributes prefixed", async () => {
    const result = await runInSandbox({
      code: `
        const xml = '<feed><entry id="1"><title>Hello</title></entry>' +
          '<entry id="2"><title>World</title></entry></feed>';
        return await data.parseXml(xml);`
    });
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
    const result = await runInSandbox({
      code: `return await data.parseXml("<id>007</id>");`
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ id: "007" });
  });

  it("throws with the parser's reason on invalid XML", async () => {
    const result = await runInSandbox({
      code: `try { await data.parseXml("<a><b></a>"); return "no throw"; }
             catch (e) { return e.message; }`
    });
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/invalid XML/);
  });
});

describe("data.htmlToMarkdown bridge", () => {
  it("converts headings, links, and lists", async () => {
    const result = await runInSandbox({
      code: `
        const html = '<h1>Title</h1><p>See <a href="https://x.test">docs</a>.</p>' +
          '<ul><li>one</li><li>two</li></ul>';
        return await data.htmlToMarkdown(html);`
    });
    expect(result.success).toBe(true);
    const md = result.result as string;
    expect(md).toContain("# Title");
    expect(md).toContain("[docs](https://x.test)");
    expect(md).toMatch(/-\s+one/);
  });
});

describe("data.zip / data.unzip bridges", () => {
  it("round-trips text and binary entries inside the guest", async () => {
    const result = await runInSandbox({
      code: `
        const archive = await data.zip({
          "notes/a.txt": "hello zip",
          "raw.bin": Uint8Array.from([1, 2, 250])
        });
        const entries = await data.unzip(archive);
        return {
          names: Object.keys(entries).sort(),
          text: utf8Decode(entries["notes/a.txt"]),
          bin: Array.from(entries["raw.bin"]),
          isBytes: entries["raw.bin"] instanceof Uint8Array
        };`
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      names: ["notes/a.txt", "raw.bin"],
      text: "hello zip",
      bin: [1, 2, 250],
      isBytes: true
    });
  });

  it("rejects a non-object zip input", async () => {
    const result = await runInSandbox({
      code: `try { await data.zip([1, 2]); return "no throw"; }
             catch (e) { return e.message; }`
    });
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/files must be an object/);
  });
});

describe("data.diff bridge", () => {
  it("produces a unified diff with the changed lines", async () => {
    const result = await runInSandbox({
      code: `return await data.diff("a\\nb\\nc\\n", "a\\nB\\nc\\n");`
    });
    expect(result.success).toBe(true);
    const patch = result.result as string;
    expect(patch).toContain("-b");
    expect(patch).toContain("+B");
  });

  it("returns a hunk-free patch for identical inputs", async () => {
    const result = await runInSandbox({
      code: `return await data.diff("same\\n", "same\\n");`
    });
    expect(result.success).toBe(true);
    expect(result.result).not.toContain("@@");
  });
});
