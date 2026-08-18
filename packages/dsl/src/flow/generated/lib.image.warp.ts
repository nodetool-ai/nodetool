// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef } from "../../types.js";

// Offset — lib.image.warp.Offset
export type OffsetInputs = {
  image?: ImageRef;
  dx?: number;
  dy?: number;
  wrap?: number;
};

export interface OffsetOutputs {
  output: ImageRef;
}

export function offset(inputs: OffsetInputs): Promise<OffsetOutputs> {
  return callNode<OffsetOutputs>("lib.image.warp.Offset", inputs);
}

// Pad — lib.image.warp.Pad
export type PadInputs = {
  image?: ImageRef;
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
  color?: unknown;
};

export interface PadOutputs {
  output: ImageRef;
}

export function pad(inputs: PadInputs): Promise<PadOutputs> {
  return callNode<PadOutputs>("lib.image.warp.Pad", inputs);
}

// Tile — lib.image.warp.Tile
export type TileInputs = {
  image?: ImageRef;
  tiles_x?: number;
  tiles_y?: number;
  wrap?: number;
};

export interface TileOutputs {
  output: ImageRef;
}

export function tile(inputs: TileInputs): Promise<TileOutputs> {
  return callNode<TileOutputs>("lib.image.warp.Tile", inputs);
}

// Affine — lib.image.warp.Affine
export type AffineInputs = {
  image?: ImageRef;
  target_width?: number;
  target_height?: number;
  m00?: number;
  m01?: number;
  tx?: number;
  m10?: number;
  m11?: number;
  ty?: number;
};

export interface AffineOutputs {
  output: ImageRef;
}

export function affine(inputs: AffineInputs): Promise<AffineOutputs> {
  return callNode<AffineOutputs>("lib.image.warp.Affine", inputs);
}

// Corner Pin — lib.image.warp.CornerPin
export type CornerPinInputs = {
  image?: ImageRef;
  h00?: number;
  h01?: number;
  h02?: number;
  h10?: number;
  h11?: number;
  h12?: number;
  h20?: number;
  h21?: number;
};

export interface CornerPinOutputs {
  output: ImageRef;
}

export function cornerPin(inputs: CornerPinInputs): Promise<CornerPinOutputs> {
  return callNode<CornerPinOutputs>("lib.image.warp.CornerPin", inputs);
}

// Polar Remap — lib.image.warp.PolarRemap
export type PolarRemapInputs = {
  image?: ImageRef;
  mode?: number;
};

export interface PolarRemapOutputs {
  output: ImageRef;
}

export function polarRemap(inputs: PolarRemapInputs): Promise<PolarRemapOutputs> {
  return callNode<PolarRemapOutputs>("lib.image.warp.PolarRemap", inputs);
}

// Displace — lib.image.warp.Displace
export type DisplaceInputs = {
  image?: ImageRef;
  displacement?: ImageRef;
  amount_x?: number;
  amount_y?: number;
};

export interface DisplaceOutputs {
  output: ImageRef;
}

export function displace(inputs: DisplaceInputs): Promise<DisplaceOutputs> {
  return callNode<DisplaceOutputs>("lib.image.warp.Displace", inputs);
}

// Spherize — lib.image.warp.Spherize
export type SpherizeInputs = {
  image?: ImageRef;
  amount?: number;
};

export interface SpherizeOutputs {
  output: ImageRef;
}

export function spherize(inputs: SpherizeInputs): Promise<SpherizeOutputs> {
  return callNode<SpherizeOutputs>("lib.image.warp.Spherize", inputs);
}
