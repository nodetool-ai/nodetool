// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
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

export function offset(inputs: OffsetInputs): DslNode<OffsetOutputs, "output"> {
  return createNode("lib.image.warp.Offset", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function pad(inputs: PadInputs): DslNode<PadOutputs, "output"> {
  return createNode("lib.image.warp.Pad", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function tile(inputs: TileInputs): DslNode<TileOutputs, "output"> {
  return createNode("lib.image.warp.Tile", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function affine(inputs: AffineInputs): DslNode<AffineOutputs, "output"> {
  return createNode("lib.image.warp.Affine", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function cornerPin(inputs: CornerPinInputs): DslNode<CornerPinOutputs, "output"> {
  return createNode("lib.image.warp.CornerPin", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Polar Remap — lib.image.warp.PolarRemap
export type PolarRemapInputs = {
  image?: Connectable<ImageRef>;
  mode?: Connectable<number>;
};

export interface PolarRemapOutputs {
  output: ImageRef;
}

export function polarRemap(inputs: PolarRemapInputs): DslNode<PolarRemapOutputs, "output"> {
  return createNode("lib.image.warp.PolarRemap", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function displace(inputs: DisplaceInputs): DslNode<DisplaceOutputs, "output"> {
  return createNode("lib.image.warp.Displace", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Spherize — lib.image.warp.Spherize
export type SpherizeInputs = {
  image?: Connectable<ImageRef>;
  amount?: Connectable<number>;
};

export interface SpherizeOutputs {
  output: ImageRef;
}

export function spherize(inputs: SpherizeInputs): DslNode<SpherizeOutputs, "output"> {
  return createNode("lib.image.warp.Spherize", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
