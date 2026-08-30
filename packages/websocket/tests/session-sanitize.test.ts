/**
 * session/sanitize — error text that reaches a client frame.
 *
 * The module exists to keep secrets and huge blobs out of error text, so the
 * cases here are adversarial: real data URIs that must be redacted, text at
 * and past the truncation boundary, thrown values that are not Errors,
 * cyclic objects, and values JSON.stringify cannot serialize.
 */

import { describe, expect, it } from "vitest";
import {
  formatSanitizedError,
  sanitizeLargeText
} from "../src/session/sanitize.js";

const MAX = 4000; // MAX_ERROR_TEXT_LENGTH in sanitize.ts

describe("sanitizeLargeText", () => {
  it("redacts a base64 data URI, naming its mime type and length", () => {
    const uri = `data:image/png;base64,${"iVBORw0KGgoAAAANSUhEUg".repeat(10)}`;
    const out = sanitizeLargeText(`upload failed for ${uri} today`);
    expect(out).toBe(
      `upload failed for [image/png base64 omitted, ${uri.length} chars] today`
    );
    expect(out).not.toContain("base64,iVBOR");
  });

  it("falls back to 'data' when the URI carries no mime type", () => {
    const uri = "data:;base64,QUJDRA==";
    expect(sanitizeLargeText(`x ${uri}`)).toBe(
      `x [data base64 omitted, ${uri.length} chars]`
    );
  });

  it("redacts every data URI in the text, not just the first", () => {
    const a = "data:audio/wav;base64,AAAA";
    const b = "data:video/mp4;base64,BBBB";
    const out = sanitizeLargeText(`${a} and ${b}`);
    expect(out).toBe(
      `[audio/wav base64 omitted, ${a.length} chars] and ` +
        `[video/mp4 base64 omitted, ${b.length} chars]`
    );
  });

  it("returns text exactly at the limit unchanged", () => {
    const text = "a".repeat(MAX);
    expect(sanitizeLargeText(text)).toBe(text);
  });

  it("truncates one character past the limit and says how much was cut", () => {
    const text = "a".repeat(MAX + 1);
    const out = sanitizeLargeText(text);
    expect(out).toBe(`${"a".repeat(MAX)}... (truncated 1 chars)`);
  });

  it("honors a caller-supplied max length", () => {
    expect(sanitizeLargeText("abcdef", 3)).toBe("abc... (truncated 3 chars)");
  });

  it("redacts before measuring, so a huge data URI does not force truncation", () => {
    const uri = `data:application/octet-stream;base64,${"A".repeat(10_000)}`;
    const out = sanitizeLargeText(`payload: ${uri}`);
    expect(out).toBe(
      `payload: [application/octet-stream base64 omitted, ${uri.length} chars]`
    );
    expect(out.length).toBeLessThan(MAX);
  });
});

describe("formatSanitizedError", () => {
  it("maps a nullish error to the empty string, never the text 'null'", () => {
    expect(formatSanitizedError(null)).toBe("");
    expect(formatSanitizedError(undefined)).toBe("");
  });

  it("sanitizes a plain string error", () => {
    const uri = "data:text/plain;base64,c2VjcmV0";
    expect(formatSanitizedError(`boom ${uri}`)).toBe(
      `boom [text/plain base64 omitted, ${uri.length} chars]`
    );
  });

  it("uses an Error's message and truncates it", () => {
    const err = new Error("x".repeat(MAX + 5));
    expect(formatSanitizedError(err)).toBe(
      `${"x".repeat(MAX)}... (truncated 5 chars)`
    );
  });

  it("serializes an object error, reducing nested Errors and redacting nested URIs", () => {
    const uri = "data:image/jpeg;base64,QUFBQQ==";
    const parsed = JSON.parse(
      formatSanitizedError({
        cause: new Error("inner failure"),
        blob: `see ${uri}`,
        list: [1, "ok", null, new Error("in list")],
        count: 3,
        flag: true,
        nothing: null
      })
    ) as Record<string, unknown>;
    expect(parsed).toEqual({
      cause: "inner failure",
      blob: `see [image/jpeg base64 omitted, ${uri.length} chars]`,
      list: [1, "ok", null, "in list"],
      count: 3,
      flag: true,
      nothing: null
    });
  });

  it("serializes a top-level array error", () => {
    expect(formatSanitizedError([new Error("e1"), 2])).toBe('["e1",2]');
  });

  it("replaces a cycle with [circular] instead of throwing", () => {
    const cyclic: Record<string, unknown> = { name: "loop" };
    cyclic.self = cyclic;
    expect(JSON.parse(formatSanitizedError(cyclic))).toEqual({
      name: "loop",
      self: "[circular]"
    });
  });

  it("stringifies a thrown scalar that is not an Error", () => {
    expect(formatSanitizedError(42)).toBe("42");
    expect(formatSanitizedError(false)).toBe("false");
  });

  it("falls back to String(error) when JSON serialization fails", () => {
    // JSON.stringify throws on BigInt; the catch path must still answer.
    expect(formatSanitizedError(10n)).toBe("10");
    expect(formatSanitizedError({ n: 10n })).toBe("[object Object]");
  });

  it("survives a symbol, which JSON.stringify erases to undefined", () => {
    expect(formatSanitizedError(Symbol("weird"))).toBe("Symbol(weird)");
  });
});
