/**
 * @jest-environment node
 */
import { renderToStaticMarkup } from "react-dom/server";
import { renderSVGDocument } from "../svg";
import type { SVGElement } from "../../../../stores/ApiTypes";

const render = (elements: SVGElement[]): string =>
  renderToStaticMarkup(renderSVGDocument(elements));

describe("renderSVGDocument", () => {
  it("renders drawing elements and their attributes", () => {
    const html = render([
      {
        name: "rect",
        attributes: { width: "10", height: "5", fill: "red" }
      } as SVGElement
    ]);
    expect(html).toContain("<rect");
    expect(html).toContain('fill="red"');
  });

  it("does not build an element outside the SVG allowlist", () => {
    const html = render([
      {
        name: "iframe",
        attributes: { srcdoc: "<script>parent.alert(1)</script>" }
      } as SVGElement,
      {
        name: "g",
        children: [{ name: "foreignObject", attributes: {} } as SVGElement]
      } as SVGElement
    ]);
    expect(html).not.toContain("iframe");
    expect(html).not.toContain("srcdoc");
    expect(html).not.toContain("foreignObject");
  });

  it("drops script-bearing attributes and javascript: links", () => {
    const html = render([
      {
        name: "a",
        attributes: { href: "javascript:alert(1)" }
      } as SVGElement,
      {
        name: "image",
        attributes: { href: " java\tscript:alert(1)", onload: "alert(1)" }
      } as SVGElement,
      {
        name: "image",
        attributes: { href: "data:image/png;base64,AAAA" }
      } as SVGElement
    ]);
    expect(html).not.toContain("javascript");
    expect(html).not.toContain("onload");
    expect(html).toContain("data:image/png;base64,AAAA");
  });
});
