import React, { createElement } from "react";
import DOMPurify from "dompurify";
import { SVGElement } from "../../../stores/ApiTypes";

// Configure DOMPurify to allow SVG elements and attributes
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

const renderSvgElement = (value: SVGElement): React.ReactElement => {
  const attributes = value.attributes || ({} as any);
  const style = attributes.style
    ? convertStyleStringToObject(attributes.style)
    : undefined;
  const svgProps: any = {
    ...value.attributes,
    className: attributes.class,
    xmlSpace: (attributes as any)["xml:space"],
    xmlLang: (attributes as any)["xml:lang"],
    style
  };

  const children = [
    value.content &&
      (typeof value.content === "string" &&
      value.content.trim().startsWith("<") ? (
        <div dangerouslySetInnerHTML={{ __html: sanitizeSvgContent(value.content) }} />
      ) : (
        value.content
      )),
    ...(value.children || []).map(renderSvgElement)
  ].filter(Boolean);

  return createElement(value.name || "svg", svgProps, ...children);
};

export const renderSVGDocument = (value: SVGElement[]): React.ReactElement => {
  const docAttributes = {
    xmlns: "http://www.w3.org/2000/svg",
    version: "1.1",
    width: "100%",
    height: "100%"
  };
  const extractSVGContent = (elements: SVGElement[]): React.ReactElement[] =>
    elements.map((element) => {
      if (element.content && typeof element.content === "string") {
        const match = element.content.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
        if (match && match[1]) {
          return (
            <g
              key={element.name}
              dangerouslySetInnerHTML={{ __html: sanitizeSvgContent(match[1]) }}
            />
          );
        }
      }
      return renderSvgElement(element);
    });

  const children = extractSVGContent(value);
  return createElement("svg", docAttributes, ...children);
};
