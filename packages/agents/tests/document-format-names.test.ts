import { describe, expect, it } from "vitest";
import {
  normalizeFormat,
  convertDocumentBytes
} from "../src/capabilities/document-conversion.js";

const ALIASES: Record<string, string> = {
  markdown: "markdown", md: "markdown", gfm: "markdown", commonmark: "markdown",
  html: "html", htm: "html", html5: "html",
  docx: "docx", pdf: "pdf",
  text: "text", txt: "text", plain: "text"
};

describe("normalizeFormat", () => {
  it.each(Object.entries(ALIASES))("resolves %s to %s", (name, format) => {
    expect(normalizeFormat(name)).toBe(format);
    expect(normalizeFormat(`  ${name.toUpperCase()}\n`)).toBe(format);
  });

  it.each(["", "rtf", "md.", "m d"])("returns null for %j", (name) => {
    expect(normalizeFormat(name)).toBeNull();
  });

  it.each(["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"])(
    "returns null for the Object.prototype member %s",
    (name) => {
      expect(normalizeFormat(name)).toBeNull();
    }
  );

  it("reports an unsupported pair for an Object.prototype member", async () => {
    await expect(
      convertDocumentBytes(new Uint8Array(), "constructor", "html")
    ).rejects.toThrow(/Cannot convert constructor to html/);
  });
});
