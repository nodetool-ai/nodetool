import {
  decodeSketchLayerData,
  encodeSketchLayerData
} from "@nodetool-ai/protocol/api-schemas/sketch.js";
import { sanitizeSvgMarkup } from "../../utils/sanitizeSvg";
import { newDocumentId } from "../../lib/newDocumentId";
import { createDefaultLayer, type Layer } from "./types/document";

const SVG_DATA_PREFIX = "data:image/svg+xml;charset=utf-8,";
const MAX_SVG_LENGTH = 2_000_000;

/** Parse a self-contained SVG for an image layer, without executing its markup. */
export function prepareVectorSvg(source: string): {
  source: string;
  width: number;
  height: number;
} {
  if (source.length > MAX_SVG_LENGTH) {
    throw new Error("SVG files must be smaller than 2 MB.");
  }
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
  if (
    parsed.querySelector("parsererror") ||
    parsed.documentElement.localName !== "svg"
  ) {
    throw new Error("Enter a valid SVG document.");
  }
  const clean = new DOMParser().parseFromString(
    sanitizeSvgMarkup(source),
    "image/svg+xml"
  );
  const root = clean.documentElement;
  // Image layers must not depend on network resources or active SVG content.
  for (const node of Array.from(
    root.querySelectorAll(
      "style, image, foreignObject, animate, animateTransform, set"
    )
  )) {
    node.remove();
  }
  for (const node of [root, ...Array.from(root.querySelectorAll("*"))]) {
    for (const attr of Array.from(node.attributes)) {
      if (
        (attr.localName === "href" && !attr.value.startsWith("#")) ||
        (attr.value.includes("url(") &&
          !/^url\(\s*['"]?#[\w.-]+['"]?\s*\)$/.test(attr.value)) ||
        attr.localName === "style"
      ) {
        node.removeAttributeNode(attr);
      }
    }
  }
  const viewBox = root
    .getAttribute("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const validViewBox =
    viewBox?.length === 4 &&
    viewBox.every(Number.isFinite) &&
    viewBox[2] > 0 &&
    viewBox[3] > 0;
  const dimension = (name: string, fallback: number): number => {
    const value = root.getAttribute(name) ?? "";
    const number = /^(\d+(?:\.\d+)?)(?:px)?$/.test(value)
      ? Number.parseFloat(value)
      : fallback;
    if (!Number.isFinite(number) || number <= 0 || number > 16384) {
      throw new Error("SVG dimensions must be between 1 and 16384 pixels.");
    }
    return Math.max(1, Math.round(number));
  };
  const width = dimension("width", validViewBox && viewBox ? viewBox[2] : 512);
  const height = dimension(
    "height",
    validViewBox && viewBox ? viewBox[3] : 512
  );
  root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  if (!validViewBox) {
    root.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }
  return { source: new XMLSerializer().serializeToString(root), width, height };
}

export function getVectorSource(layer: Layer): string {
  const image = decodeSketchLayerData(layer.data, 1, 1).image;
  if (!image?.startsWith(SVG_DATA_PREFIX)) {
    return "";
  }
  return decodeURIComponent(image.slice(SVG_DATA_PREFIX.length));
}

export function createVectorLayer(name: string, source: string): Layer {
  const svg = prepareVectorSvg(source);
  const layer = createDefaultLayer(name, "vector", svg.width, svg.height);
  return {
    ...layer,
    id: newDocumentId(),
    data: encodeSketchLayerData(
      SVG_DATA_PREFIX + encodeURIComponent(svg.source),
      layer.contentBounds
    )
  };
}

const SVG_NAMESPACE_ATTRIBUTE = ' xmlns="http://www.w3.org/2000/svg"';

/**
 * Indent an SVG document one element per line for reading and editing.
 * Elements holding text (`<text>`, `<title>`) stay on one line so their
 * whitespace is unchanged. Returns the input when it does not parse.
 */
export function formatSvgSource(source: string): string {
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
  if (
    parsed.querySelector("parsererror") ||
    parsed.documentElement.localName !== "svg"
  ) {
    return source;
  }
  const serializer = new XMLSerializer();
  const serialize = (node: Node, isRoot: boolean): string => {
    const markup = serializer.serializeToString(node);
    // A detached child restates its namespace; the root already declares it.
    return isRoot ? markup : markup.replace(SVG_NAMESPACE_ATTRIBUTE, "");
  };
  const lines: string[] = [];
  const visit = (element: Element, depth: number): void => {
    const indent = "  ".repeat(depth);
    const children = Array.from(element.childNodes).filter(
      (child) =>
        child.nodeType !== Node.TEXT_NODE || child.textContent?.trim() !== ""
    );
    if (
      children.length === 0 ||
      !children.every((child) => child.nodeType === Node.ELEMENT_NODE)
    ) {
      lines.push(indent + serialize(element, depth === 0));
      return;
    }
    const open = serialize(element.cloneNode(false), depth === 0);
    lines.push(indent + open.replace(/\s*\/>$/, ">"));
    for (const child of children) {
      visit(child as Element, depth + 1);
    }
    lines.push(`${indent}</${element.tagName}>`);
  };
  visit(parsed.documentElement, 0);
  return lines.join("\n");
}
