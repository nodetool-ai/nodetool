/**
 * SVG attribute escaping for RenderText.
 *
 * RenderText (Node path) builds an SVG string and hands it to sharp. Color and
 * font-family come from node props, so a value containing a quote must not be
 * able to terminate the attribute and inject arbitrary SVG markup. `escapeXmlAttr`
 * is the single escaping helper used for every interpolated attribute value.
 */
import { describe, it, expect } from "vitest";
import { escapeXmlAttr } from "../src/nodes/lib-image-draw.js";

describe("escapeXmlAttr", () => {
  it("escapes the five XML metacharacters", () => {
    expect(escapeXmlAttr(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&apos;");
  });

  it("leaves ordinary attribute values untouched", () => {
    expect(escapeXmlAttr("#FF0000")).toBe("#FF0000");
    expect(escapeXmlAttr("DejaVu Sans")).toBe("DejaVu Sans");
  });

  it("neutralizes a double-quote breakout attempt", () => {
    // A malicious color trying to close fill="" and inject an <image> element.
    const evil = `red" /><image href="x" onerror="alert(1)`;
    const escaped = escapeXmlAttr(evil);
    expect(escaped).not.toContain('"');
    expect(escaped).toContain("&quot;");
    // Interpolated into an attribute, the value stays inside the quotes.
    const svg = `<text fill="${escaped}">hi</text>`;
    expect(svg).toBe(
      '<text fill="red&quot; /&gt;&lt;image href=&quot;x&quot; onerror=&quot;alert(1)">hi</text>'
    );
    // Only the two literal tag delimiters survive — none from the injected value.
    expect(svg.match(/</g)?.length).toBe(2);
  });

  it("neutralizes a single-quote breakout attempt", () => {
    const evil = `Arial' /><script>x`;
    const escaped = escapeXmlAttr(evil);
    expect(escaped).not.toContain("'");
    expect(escaped).toContain("&apos;");
    expect(escaped).not.toContain("<script>");
  });
});
