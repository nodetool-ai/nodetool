import { looksLikeSvg, sanitizeSvgMarkup } from "../sanitizeSvg";

describe("sanitizeSvg", () => {
  describe("sanitizeSvgMarkup", () => {
    it("keeps drawing elements", () => {
      const out = sanitizeSvgMarkup(
        '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="2"/></svg>'
      );
      expect(out).toContain("<circle");
    });

    it("removes scripts and event handlers", () => {
      const out = sanitizeSvgMarkup(
        '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><rect onclick="x()" width="1" height="1"/></svg>'
      );
      expect(out).not.toContain("<script");
      expect(out).not.toContain("onload");
      expect(out).not.toContain("onclick");
      expect(out).toContain("<rect");
    });

    it("removes foreignObject", () => {
      const out = sanitizeSvgMarkup(
        '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>hi</div></foreignObject></svg>'
      );
      expect(out.toLowerCase()).not.toContain("foreignobject");
    });
  });

  describe("looksLikeSvg", () => {
    it("detects an svg root", () => {
      expect(looksLikeSvg("<svg>")).toBe(true);
      expect(looksLikeSvg('<?xml version="1.0"?><SVG width="1">')).toBe(true);
    });

    it("rejects other markup", () => {
      expect(looksLikeSvg("<svgfoo>")).toBe(false);
      expect(looksLikeSvg("<div></div>")).toBe(false);
    });
  });
});
