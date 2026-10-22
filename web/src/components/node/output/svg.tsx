import React, { createElement } from "react";
import DOMPurify from "dompurify";
import { SVGElement } from "../../../stores/ApiTypes";
import { isString } from "../../../utils/typePredicates";

const sanitizeSvgContent = (html: string): string => {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ["use", "symbol", "defs", "clipPath", "mask", "pattern", "marker", "linearGradient", "radialGradient", "stop"],
    ADD_ATTR: ["xlink:href", "clip-path", "mask", "fill", "stroke", "transform", "viewBox", "preserveAspectRatio"]
  });
};

const convertStyleStringToObject = (
  styleString: string
): React.CSSProperties => {
  if (!styleString) {return {};}
  return styleString
    .split(";")
    .filter((style) => style.trim())
    .reduce((acc, style) => {
      const [property, value] = style.split(":").map((str) => str.trim());
      const camelProperty = property.replace(/-([a-z])/g, (g) =>
        g[1].toUpperCase()
      );
      return { ...acc, [camelProperty]: value };
    }, {} as React.CSSProperties);
};

// SVGElement names and attributes come from node output, which a workflow
// author controls. createElement would build any tag it is handed (an iframe
// with srcdoc runs on the app's origin), so only drawing elements are built
// and anything that can carry script or a navigation is dropped.
const ALLOWED_SVG_ELEMENTS = new Set([
  "svg", "g", "defs", "symbol", "use", "title", "desc",
  "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "textPath",
  "linearGradient", "radialGradient", "stop", "pattern",
  "clipPath", "mask", "marker", "image",
  "filter", "feBlend", "feColorMatrix", "feComponentTransfer", "feComposite",
  "feConvolveMatrix", "feDiffuseLighting", "feDisplacementMap",
  "feDistantLight", "feDropShadow", "feFlood", "feFuncA", "feFuncB",
  "feFuncG", "feFuncR", "feGaussianBlur", "feImage", "feMerge",
  "feMergeNode", "feMorphology", "feOffset", "fePointLight",
  "feSpecularLighting", "feSpotLight", "feTile", "feTurbulence"
]);

const URL_ATTRIBUTES = new Set(["href", "xlink:href", "xlinkhref", "src"]);

const isSafeAttribute = (name: string, value: unknown): boolean => {
  const key = name.toLowerCase();
  if (key.startsWith("on")) {return false;}
  if (key === "srcdoc" || key === "dangerouslysetinnerhtml") {return false;}
  if (URL_ATTRIBUTES.has(key)) {
    // Strip what browsers ignore before the scheme ("java\tscript:").
    const url = Array.from(String(value))
      .filter((ch) => ch.charCodeAt(0) > 0x20)
      .join("")
      .toLowerCase();
    if (/^(javascript|data|vbscript):/.test(url) && !url.startsWith("data:image/")) {
      return false;
    }
  }
  return true;
};

const safeAttributes = (
  attributes: Record<string, string>
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(attributes).filter(([name, value]) =>
      isSafeAttribute(name, value)
    )
  );

const renderSvgElement = (value: SVGElement): React.ReactElement => {
  const name = value.name || "svg";
  if (!ALLOWED_SVG_ELEMENTS.has(name)) {
    return createElement("g");
  }
  const attributes = safeAttributes(value.attributes || {});
  const style = attributes.style
    ? convertStyleStringToObject(attributes.style)
    : undefined;
  const svgProps = {
    ...attributes,
    className: attributes.class,
    xmlSpace: (attributes as Record<string, unknown>)["xml:space"],
    xmlLang: (attributes as Record<string, unknown>)["xml:lang"],
    style
  } satisfies Record<string, unknown>;

  const children = [
    value.content &&
      (isString(value.content) &&
      value.content.trim().startsWith("<") ? (
        <div key="content" dangerouslySetInnerHTML={{ __html: sanitizeSvgContent(value.content) }} />
      ) : (
        value.content
      )),
    ...(value.children || []).map((child, idx) =>
      React.cloneElement(renderSvgElement(child), { key: `child-${idx}` })
    )
  ].filter(Boolean);

  return createElement(name, svgProps, ...children);
};

export const renderSVGDocument = (value: SVGElement[]): React.ReactElement => {
  const docAttributes = {
    xmlns: "http://www.w3.org/2000/svg",
    version: "1.1",
    width: "100%",
    height: "100%"
  };
  const extractSVGContent = (elements: SVGElement[]): React.ReactElement[] =>
    elements.map((element, idx) => {
      if (element.content && isString(element.content)) {
        const match = element.content.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
        if (match && match[1]) {
          return (
            <g
              key={element.name ?? idx}
              dangerouslySetInnerHTML={{ __html: sanitizeSvgContent(match[1]) }}
            />
          );
        }
      }
      return React.cloneElement(renderSvgElement(element), { key: `${element.name ?? "el"}-${idx}` });
    });

  const children = extractSVGContent(value);
  return createElement("svg", docAttributes, ...children);
};
