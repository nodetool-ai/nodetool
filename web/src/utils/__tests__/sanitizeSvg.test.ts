import { looksLikeSvg, sanitizeSvgMarkup } from "../sanitizeSvg";

describe("sanitizeSvgMarkup", () => {
  it("keeps the drawing vocabulary", () => {
    const markup =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' +
      '<defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient></defs>' +
      '<circle cx="5" cy="5" r="4" fill="url(#g)"/></svg>';
    const clean = sanitizeSvgMarkup(markup);
    expect(clean).toContain("<circle");
    expect(clean).toContain("linearGradient");
    expect(clean).toContain("url(#g)");
  });

  it("drops scripts and event handlers", () => {
    const markup =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<script>window.stolen = document.cookie</script>' +
      '<rect width="10" height="10" onload="alert(1)"/></svg>';
    const clean = sanitizeSvgMarkup(markup);
    expect(clean).not.toContain("script");
    expect(clean).not.toContain("onload");
    expect(clean).toContain("<rect");
  });

  it("drops foreignObject, which smuggles HTML into an SVG", () => {
    const markup =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<foreignObject><iframe src="https://example.com"></iframe></foreignObject>' +
      "</svg>";
    const clean = sanitizeSvgMarkup(markup);
    expect(clean).not.toContain("foreignObject");
    expect(clean).not.toContain("iframe");
  });
});

describe("looksLikeSvg", () => {
  it("accepts a document with an svg root, however it is preceded", () => {
    expect(looksLikeSvg('<svg viewBox="0 0 1 1"></svg>')).toBe(true);
    expect(looksLikeSvg('<?xml version="1.0"?>\n<svg></svg>')).toBe(true);
    expect(looksLikeSvg("<SVG></SVG>")).toBe(true);
  });

  it("rejects markup with no svg element", () => {
    expect(looksLikeSvg("")).toBe(false);
    expect(looksLikeSvg("<div>not a drawing</div>")).toBe(false);
    // A name that merely starts with "svg" is not an svg element.
    expect(looksLikeSvg("<svgfoo/>")).toBe(false);
  });
});
