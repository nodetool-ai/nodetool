/**
 * @jest-environment node
 */
import { renderToStaticMarkup } from "react-dom/server";
import { renderSVGDocument } from "../svg";
import type { SVGElement } from "../../../../stores/ApiTypes";

const el = (
  name: string,
  attributes: Record<string, string> = {},
  children: SVGElement[] = []
): SVGElement => ({ type: "svg_element", name, attributes, children });

const render = (elements: SVGElement[]): string =>
  renderToStaticMarkup(renderSVGDocument(elements));

describe("renderSVGDocument", () => {
  it("renders drawing elements and their attributes", () => {
    const html = render([
      el("rect", { width: "10", height: "5", fill: "red" })
    ]);
    expect(html).toContain("<rect");
    expect(html).toContain('fill="red"');
  });

  it("does not build an element outside the SVG allowlist", () => {
    const html = render([
      el("iframe", { srcdoc: "<script>parent.alert(1)</script>" }),
      el("g", {}, [el("foreignObject")])
    ]);
    expect(html).not.toContain("iframe");
    expect(html).not.toContain("srcdoc");
    expect(html).not.toContain("foreignObject");
  });

  it("drops script-bearing attributes and javascript: links", () => {
    const html = render([
      el("a", { href: "javascript:alert(1)" }),
      el("image", { href: " java\tscript:alert(1)", onload: "alert(1)" }),
      el("image", { href: "data:image/png;base64,AAAA" })
    ]);
    expect(html).not.toContain("javascript");
    expect(html).not.toContain("onload");
    expect(html).toContain("data:image/png;base64,AAAA");
  });
});
