// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// PDF Page Screenshot — lib.pdf.Screenshot
export type ScreenshotInputs = {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
  dpi?: Connectable<number>;
};

export interface ScreenshotOutputs {
  output: ImageRef[];
}

export function screenshot(inputs: ScreenshotInputs): DslNode<ScreenshotOutputs, "output"> {
  return createNode("lib.pdf.Screenshot", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// PDF Rasterize (pdftoppm) — lib.pdf.Pdftoppm
export type PdftoppmInputs = {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
  dpi?: Connectable<number>;
  format?: Connectable<"png" | "jpeg" | "tiff">;
  scale_to?: Connectable<number>;
};

export interface PdftoppmOutputs {
  output: ImageRef[];
}

export function pdftoppm(inputs: PdftoppmInputs): DslNode<PdftoppmOutputs, "output"> {
  return createNode("lib.pdf.Pdftoppm", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
