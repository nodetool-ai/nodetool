/**
 * Tests for the Code node snippet library.
 *
 * These assertions lock down the contract that snippets are vanilla JS only —
 * no lodash, dayjs, cheerio, csv-parse, or validator. Anything that needs
 * those libraries must live in a dedicated workflow node.
 */

import { CODE_SNIPPETS, SNIPPET_CATEGORIES } from "../codeSnippets";
import {
  inferInputKeysFromCode,
  inferOutputKeysFromCode
} from "../../utils/codeOutputInference";

describe("CODE_SNIPPETS", () => {
  it("is non-empty", () => {
    expect(CODE_SNIPPETS.length).toBeGreaterThan(0);
  });

  it("has unique snippet ids", () => {
    const ids = CODE_SNIPPETS.map((s) => s.id);
    const unique = new Set(ids);
    expect(ids.length).toBe(unique.size);
  });

  it("references only known categories", () => {
    for (const snippet of CODE_SNIPPETS) {
      expect(SNIPPET_CATEGORIES).toContain(snippet.category);
    }
  });

  it("never calls removed library globals (_, dayjs, cheerio, csvParse, validator)", () => {
    const FORBIDDEN = [
      { name: "lodash", pattern: /\b_\.[a-zA-Z]/ },
      { name: "dayjs", pattern: /\bdayjs\s*\(/ },
      { name: "cheerio", pattern: /\bcheerio\./ },
      { name: "csv-parse", pattern: /\bcsvParse\s*\(/ },
      { name: "validator", pattern: /\bvalidator\.[a-zA-Z]/ }
    ];
    const offenders: string[] = [];
    for (const snippet of CODE_SNIPPETS) {
      for (const { name, pattern } of FORBIDDEN) {
        if (pattern.test(snippet.code)) {
          offenders.push(`${snippet.id} uses ${name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("each snippet has non-empty title, description, code, and tags", () => {
    for (const s of CODE_SNIPPETS) {
      expect(s.title.trim().length).toBeGreaterThan(0);
      expect(s.description.trim().length).toBeGreaterThan(0);
      expect(s.code.trim().length).toBeGreaterThan(0);
      expect(s.tags.length).toBeGreaterThan(0);
    }
  });

  describe("slot type declarations", () => {
    it("declares only slots the code actually produces", () => {
      const offenders: string[] = [];
      for (const s of CODE_SNIPPETS) {
        const inputKeys = inferInputKeysFromCode(s.code) ?? [];
        const outputKeys = inferOutputKeysFromCode(s.code) ?? ["output"];
        for (const name of Object.keys(s.inputs ?? {})) {
          if (!inputKeys.includes(name)) {
            offenders.push(`${s.id} declares unknown input "${name}"`);
          }
        }
        for (const name of Object.keys(s.outputs ?? {})) {
          if (!outputKeys.includes(name)) {
            offenders.push(`${s.id} declares unknown output "${name}"`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });

    it("every SVG snippet declares svg_element output and typed inputs", () => {
      const svgSnippets = CODE_SNIPPETS.filter((s) => s.category === "SVG");
      expect(svgSnippets.length).toBe(12);
      for (const s of svgSnippets) {
        expect(s.outputs).toEqual({ output: "svg_element" });
        const inputKeys = inferInputKeysFromCode(s.code) ?? [];
        for (const name of inputKeys) {
          expect(s.inputs?.[name]?.type).toBeDefined();
        }
      }
    });

    it("types SVG geometry as numbers and fills/strokes as color", () => {
      const byId = new Map(CODE_SNIPPETS.map((s) => [s.id, s]));
      const circle = byId.get("svg-circle");
      expect(circle?.inputs?.cx.type).toBe("int");
      expect(circle?.inputs?.radius.type).toBe("int");
      expect(circle?.inputs?.fill.type).toBe("color");
      expect(circle?.inputs?.stroke_width.type).toBe("float");

      const text = byId.get("svg-text");
      expect(text?.inputs?.text.type).toBe("str");
      expect(text?.inputs?.font_size.type).toBe("int");

      // Composing snippets still take an element in.
      expect(byId.get("svg-transform")?.inputs?.content.type).toBe(
        "svg_element"
      );
      expect(byId.get("svg-clip-path")?.inputs?.clip_content.type).toBe(
        "svg_element"
      );
    });

    it("uses only type names the editor resolves", () => {
      const KNOWN = new Set([
        "int",
        "float",
        "str",
        "bool",
        "color",
        "svg_element",
        "list",
        "dict",
        "dataframe",
        "any"
      ]);
      for (const s of CODE_SNIPPETS) {
        for (const decl of Object.values(s.inputs ?? {})) {
          expect(KNOWN.has(decl.type)).toBe(true);
        }
        for (const type of Object.values(s.outputs ?? {})) {
          expect(KNOWN.has(type)).toBe(true);
        }
      }
    });
  });
});
