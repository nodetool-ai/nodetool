import { describe, expect, it } from "vitest";

import { DEFAULT_CHUNK_MAX, TELEGRAM_MESSAGE_LIMIT, chunkText, splitOnce } from "../src/chunk.js";
import { markdownToTelegramHtml } from "../src/markdown-html.js";

/** Characters with no markup meaning, so a fixture's length is its own. */
function filler(length: number, word = "alpha"): string {
  const unit = `${word} `;
  return unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
}

function stripWhitespace(text: string): string {
  return text.replace(/\s+/g, "");
}

describe("chunkText", () => {
  it("returns the text unchanged when it fits", () => {
    expect(chunkText("hello", 100)).toEqual(["hello"]);
  });

  it("returns nothing for empty or whitespace-only input", () => {
    expect(chunkText("", 100)).toEqual([]);
    expect(chunkText("   \n  ", 100)).toEqual([]);
  });

  it("rejects a non-positive limit", () => {
    expect(() => chunkText("x", 0)).toThrow(/greater than zero/);
  });

  it("never emits a chunk over the limit, and never an empty one", () => {
    const text = filler(20_000);
    const chunks = chunkText(text, 400);
    expect(chunks.length).toBeGreaterThan(20);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(400);
      expect(chunk.length).toBeGreaterThan(0);
    }
  });

  it("preserves content across chunks", () => {
    const text = [filler(500), filler(500, "beta"), filler(500, "gamma")].join("\n\n");
    const chunks = chunkText(text, 300);
    expect(stripWhitespace(chunks.join(""))).toBe(stripWhitespace(text));
  });

  it("prefers paragraph boundaries, then line, then word", () => {
    const paragraphs = `${filler(80)}\n\n${filler(80, "beta")}\n\n${filler(80, "gamma")}`;
    const byParagraph = chunkText(paragraphs, 100);
    expect(byParagraph[0]).not.toContain("beta");
    expect(byParagraph[1].startsWith("beta")).toBe(true);

    const lines = `${filler(80)}\n${filler(80, "beta")}`;
    const byLine = chunkText(lines, 100);
    expect(byLine[0].includes("beta")).toBe(false);

    const words = filler(300);
    const byWord = chunkText(words, 100);
    expect(byWord.every((chunk) => !chunk.endsWith("alph"))).toBe(true);
  });

  it("keeps every chunk's code fences balanced when a fence spans chunks", () => {
    const body = Array.from({ length: 120 }, (_, i) => `line ${i} of code`).join("\n");
    const text = `intro\n\n\`\`\`ts\n${body}\n\`\`\`\n\noutro`;
    const chunks = chunkText(text, 400);
    expect(chunks.length).toBeGreaterThan(2);
    for (const chunk of chunks) {
      const fences = chunk.match(/^ {0,3}```/gm) ?? [];
      expect(fences.length % 2).toBe(0);
      expect(chunk.length).toBeLessThanOrEqual(400);
    }
    // The reopened fence carries the language through.
    expect(chunks[1].startsWith("```ts")).toBe(true);
  });

  it("never cuts an HTML entity in half", () => {
    const text = Array.from({ length: 200 }, () => "a&amp;b&lt;c&gt;d").join("");
    for (const chunk of chunkText(text, 137)) {
      expect(chunk).not.toMatch(/&[a-z]*$/);
      expect(chunk).not.toMatch(/^[a-z]*;/);
    }
  });

  it("never cuts an HTML tag in half, and reopens an inline tag it split", () => {
    const text = `<b>${filler(900)}</b>`;
    const chunks = chunkText(text, 200);
    expect(chunks.length).toBeGreaterThan(3);
    for (const chunk of chunks) {
      expect(chunk).not.toMatch(/<[a-z/]*$/);
      const opens = (chunk.match(/<b>/g) ?? []).length;
      const closes = (chunk.match(/<\/b>/g) ?? []).length;
      expect(opens).toBe(closes);
      expect(chunk.length).toBeLessThanOrEqual(200);
    }
  });

  it("stays under Telegram's limit after worst-case HTML escaping", () => {
    // Every character of prose expands to five (`&` → `&amp;`), and the
    // converter is applied before chunking, which is what makes the bound hold.
    const md = `${"& ".repeat(6000)}\n\n\`\`\`\n${"<>&".repeat(2000)}\n\`\`\`\n`;
    const rendered = markdownToTelegramHtml(md);
    expect(rendered.ok).toBe(true);
    const html = rendered.ok ? rendered.html : rendered.text;
    expect(html.length).toBeGreaterThan(TELEGRAM_MESSAGE_LIMIT);

    const chunks = chunkText(html, DEFAULT_CHUNK_MAX);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_LIMIT);
      expect(chunk.length).toBeLessThanOrEqual(DEFAULT_CHUNK_MAX);
    }
  });
});

describe("splitOnce", () => {
  it("returns the whole text when it fits", () => {
    expect(splitOnce("short", 100)).toEqual({ head: "short", rest: "" });
  });

  it("splits at a boundary and hands back the untouched remainder", () => {
    const text = `${filler(150)}\n${filler(150, "beta")}`;
    const { head, rest } = splitOnce(text, 200);
    expect(head.length).toBeLessThanOrEqual(200);
    expect(rest.length).toBeGreaterThan(0);
    expect(stripWhitespace(head + rest)).toBe(stripWhitespace(text));
  });
});
