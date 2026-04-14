/**
 * Tests for the Code node snippet library.
 *
 * These assertions lock down the contract that snippets are vanilla JS only —
 * no lodash, dayjs, cheerio, csv-parse, or validator. Anything that needs
 * those libraries must live in a dedicated workflow node.
 */

import { CODE_SNIPPETS, SNIPPET_CATEGORIES } from "../codeSnippets";

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
});
