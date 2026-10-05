import {
  buildGenerateSvgPrompt,
  extractSvgMarkup
} from "../useGenerateSvg";

describe("extractSvgMarkup", () => {
  it("takes the svg element out of fenced or prefixed answers", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><g><svg/></g></svg>';
    expect(extractSvgMarkup(`Sure.\n\`\`\`xml\n<?xml version="1.0"?>\n${svg}\n\`\`\``)).toBe(svg);
  });

  it("returns null when the answer holds no complete svg", () => {
    expect(extractSvgMarkup("No drawing today.")).toBeNull();
    expect(extractSvgMarkup("<svg width='1'>")).toBeNull();
    expect(extractSvgMarkup("<svgfoo></svg>")).toBeNull();
  });
});

describe("buildGenerateSvgPrompt", () => {
  it("names the size and includes the current svg only when revising", () => {
    const fresh = buildGenerateSvgPrompt(" a fox ", { width: 640, height: 480 });
    expect(fresh).toContain("640 × 480");
    expect(fresh).toContain("Request: a fox");
    expect(fresh).not.toContain("currently holds");
    const revision = buildGenerateSvgPrompt("make it red", {
      width: 10,
      height: 10,
      currentSvg: "<svg/>"
    });
    expect(revision).toContain("currently holds");
    expect(revision.endsWith("<svg/>")).toBe(true);
  });
});
