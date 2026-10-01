// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
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

export function document(inputs: DocumentInputs, options?: NodeOptions): NodeWithOutputs<DocumentOutputs, "output"> {
  return createNode("lib.svg.Document", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"svg"}, defaultOutput: "output" });
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

export function svgToImage(inputs: SVGToImageInputs, options?: NodeOptions): NodeWithOutputs<SVGToImageOutputs, "output"> {
  return createNode("lib.svg.SVGToImage", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}
