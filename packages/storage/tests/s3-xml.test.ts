import { describe, it, expect } from "vitest";

import { decodeXmlEntities, xmlBlocks, xmlText } from "../src/s3/xml.js";

describe("decodeXmlEntities", () => {
  it("decodes the named entities", () => {
    expect(decodeXmlEntities("a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;")).toBe(
      `a & b <c> "d" 'e'`
    );
  });

  it("decodes decimal and hex character references", () => {
    expect(decodeXmlEntities("&#65;&#x42;&#X43;")).toBe("ABC");
  });

  it("decodes the code point range boundaries", () => {
    expect(decodeXmlEntities("&#0;")).toBe("\u0000");
    expect(decodeXmlEntities("&#x10FFFF;")).toBe(String.fromCodePoint(0x10ffff));
    expect(decodeXmlEntities("&#xD7FF;&#xE000;")).toBe("퟿");
  });

  it("leaves out-of-range and surrogate references intact", () => {
    for (const ref of ["&#x110000;", "&#xD800;", "&#xDFFF;", "&#-1;", "&bogus;"]) {
      expect(decodeXmlEntities(`x${ref}y`)).toBe(`x${ref}y`);
    }
  });

  it("keeps a bare ampersand and an unterminated entity", () => {
    expect(decodeXmlEntities("a & b")).toBe("a & b");
    expect(decodeXmlEntities("&ampX")).toBe("&ampX");
  });

  it("decodes an entity whose semicolon is ten characters away", () => {
    // `&#x0000041;` spans ten characters from `&` to `;`.
    expect(decodeXmlEntities("&#x0000041;")).toBe("A");
    // One more character reads as a bare ampersand.
    expect(decodeXmlEntities("&#x00000041;")).toBe("&#x00000041;");
  });
});

describe("xmlText", () => {
  it("reads the first element's decoded text", () => {
    expect(xmlText("<Error><Code>A&amp;B</Code><Code>C</Code></Error>", "Code")).toBe(
      "A&B"
    );
  });

  it("answers null for a missing or unterminated element", () => {
    expect(xmlText("<Error></Error>", "Code")).toBeNull();
    expect(xmlText("<Code>unterminated", "Code")).toBeNull();
  });
});

describe("xmlBlocks", () => {
  it("returns every block in document order, including one at offset 0", () => {
    expect(xmlBlocks("<B>1</B><B>2</B> <B>3</B>", "B")).toEqual(["1", "2", "3"]);
  });

  it("stops at an unterminated block", () => {
    expect(xmlBlocks("<B>1</B><B>2", "B")).toEqual(["1"]);
  });

  it("returns raw inner content without decoding", () => {
    expect(xmlBlocks("<R><Contents><Key>a&amp;b</Key></Contents></R>", "Contents")).toEqual([
      "<Key>a&amp;b</Key>"
    ]);
  });
});
