import { looksLikeSvg, sanitizeSvgMarkup } from "../sanitizeSvg";

describe("sanitizeSvgMarkup", () => {
  it("keeps drawing elements", () => {
    const out = sanitizeSvgMarkup(
      '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="1" cy="1" r="1"/></svg>'
    );
    expect(out).toContain("<circle");
  });

  it("drops scripts and event handlers", () => {
    const out = sanitizeSvgMarkup(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><rect onclick="x()" width="1" height="1"/></svg>'
    );
    expect(out).not.toMatch(/script|onload|onclick/i);
    expect(out).toContain("<rect");
  });

  it("drops foreignObject", () => {
    const out = sanitizeSvgMarkup(
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>hi</div></foreignObject></svg>'
    );
    expect(out).not.toMatch(/foreignObject/i);
  });
});

describe("looksLikeSvg", () => {
  it("detects an svg root", () => {
    expect(looksLikeSvg("<svg>")).toBe(true);
    expect(looksLikeSvg('<?xml version="1.0"?><SVG width="1">')).toBe(true);
  });

  it("rejects other markup", () => {
    expect(looksLikeSvg("<svgx>")).toBe(false);
    expect(looksLikeSvg("<div></div>")).toBe(false);
  });
});
