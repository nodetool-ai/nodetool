// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// SVG Document — lib.svg.Document
export type DocumentInputs = {
  elements?: Connectable<unknown[]>;
  width?: Connectable<number>;
  height?: Connectable<number>;
  viewBox?: Connectable<string>;
};

export interface DocumentOutputs {
  output: unknown;
}

export function document(inputs: DocumentInputs): DslNode<DocumentOutputs, "output"> {
  return createNode("lib.svg.Document", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// SVG to Image — lib.svg.SVGToImage
export type SVGToImageInputs = {
  elements?: Connectable<unknown[]>;
  width?: Connectable<number>;
  height?: Connectable<number>;
  viewBox?: Connectable<string>;
  scale?: Connectable<number>;
};

export interface SVGToImageOutputs {
  output: ImageRef;
}

export function svgToImage(inputs: SVGToImageInputs): DslNode<SVGToImageOutputs, "output"> {
  return createNode("lib.svg.SVGToImage", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
