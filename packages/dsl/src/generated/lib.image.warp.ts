// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { ImageRef } from "../types.js";

// Offset — lib.image.warp.Offset
export type OffsetInputs = {
  image?: Connectable<ImageRef>;
  dx?: Connectable<number>;
  dy?: Connectable<number>;
  wrap?: Connectable<number>;
};

export interface OffsetOutputs {
  output: ImageRef;
}

export function offset(inputs: OffsetInputs, options?: NodeOptions): NodeWithOutputs<OffsetOutputs, "output"> {
  return createNode("lib.image.warp.Offset", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Pad — lib.image.warp.Pad
export type PadInputs = {
  image?: Connectable<ImageRef>;
  left?: Connectable<number>;
  top?: Connectable<number>;
  right?: Connectable<number>;
  bottom?: Connectable<number>;
  color?: Connectable<unknown>;
};

export interface PadOutputs {
  output: ImageRef;
}

export function pad(inputs: PadInputs, options?: NodeOptions): NodeWithOutputs<PadOutputs, "output"> {
  return createNode("lib.image.warp.Pad", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Tile — lib.image.warp.Tile
export type TileInputs = {
  image?: Connectable<ImageRef>;
  tiles_x?: Connectable<number>;
  tiles_y?: Connectable<number>;
  wrap?: Connectable<number>;
};

export interface TileOutputs {
  output: ImageRef;
}

export function tile(inputs: TileInputs, options?: NodeOptions): NodeWithOutputs<TileOutputs, "output"> {
  return createNode("lib.image.warp.Tile", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Affine — lib.image.warp.Affine
export type AffineInputs = {
  image?: Connectable<ImageRef>;
  target_width?: Connectable<number>;
  target_height?: Connectable<number>;
  m00?: Connectable<number>;
  m01?: Connectable<number>;
  tx?: Connectable<number>;
  m10?: Connectable<number>;
  m11?: Connectable<number>;
  ty?: Connectable<number>;
};

export interface AffineOutputs {
  output: ImageRef;
}

export function affine(inputs: AffineInputs, options?: NodeOptions): NodeWithOutputs<AffineOutputs, "output"> {
  return createNode("lib.image.warp.Affine", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Corner Pin — lib.image.warp.CornerPin
export type CornerPinInputs = {
  image?: Connectable<ImageRef>;
  h00?: Connectable<number>;
  h01?: Connectable<number>;
  h02?: Connectable<number>;
  h10?: Connectable<number>;
  h11?: Connectable<number>;
  h12?: Connectable<number>;
  h20?: Connectable<number>;
  h21?: Connectable<number>;
};

export interface CornerPinOutputs {
  output: ImageRef;
}

export function cornerPin(inputs: CornerPinInputs, options?: NodeOptions): NodeWithOutputs<CornerPinOutputs, "output"> {
  return createNode("lib.image.warp.CornerPin", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Polar Remap — lib.image.warp.PolarRemap
export type PolarRemapInputs = {
  image?: Connectable<ImageRef>;
  mode?: Connectable<number>;
};

export interface PolarRemapOutputs {
  output: ImageRef;
}

export function polarRemap(inputs: PolarRemapInputs, options?: NodeOptions): NodeWithOutputs<PolarRemapOutputs, "output"> {
  return createNode("lib.image.warp.PolarRemap", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Displace — lib.image.warp.Displace
export type DisplaceInputs = {
  image?: Connectable<ImageRef>;
  displacement?: Connectable<ImageRef>;
  amount_x?: Connectable<number>;
  amount_y?: Connectable<number>;
};

export interface DisplaceOutputs {
  output: ImageRef;
}

export function displace(inputs: DisplaceInputs, options?: NodeOptions): NodeWithOutputs<DisplaceOutputs, "output"> {
  return createNode("lib.image.warp.Displace", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Spherize — lib.image.warp.Spherize
export type SpherizeInputs = {
  image?: Connectable<ImageRef>;
  amount?: Connectable<number>;
};

export interface SpherizeOutputs {
  output: ImageRef;
}

export function spherize(inputs: SpherizeInputs, options?: NodeOptions): NodeWithOutputs<SpherizeOutputs, "output"> {
  return createNode("lib.image.warp.Spherize", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}
