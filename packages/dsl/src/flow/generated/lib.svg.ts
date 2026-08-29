// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef } from "../../types.js";

// SVG Document — lib.svg.Document
export type DocumentInputs = {
  elements?: unknown[];
  width?: number;
  height?: number;
  viewBox?: string;
};

export interface DocumentOutputs {
  output: unknown;
}

export function document(inputs: DocumentInputs): Promise<DocumentOutputs> {
  return callNode<DocumentOutputs>("lib.svg.Document", inputs);
}

// SVG to Image — lib.svg.SVGToImage
export type SVGToImageInputs = {
  elements?: unknown[];
  width?: number;
  height?: number;
  viewBox?: string;
  scale?: number;
};

export interface SVGToImageOutputs {
  output: ImageRef;
}

export function svgToImage(inputs: SVGToImageInputs): Promise<SVGToImageOutputs> {
  return callNode<SVGToImageOutputs>("lib.svg.SVGToImage", inputs);
}
