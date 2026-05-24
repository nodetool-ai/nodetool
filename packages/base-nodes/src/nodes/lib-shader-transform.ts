/**
 * Workflow nodes for `transform.*` modules — every entry in the Phase 3
 * Batch 3 transform catalog. Geometry-changing transforms (`pad`, `crop`,
 * `rotate90`, `resize`, `affine`) compute their output dimensions
 * explicitly; same-size warps default to source dimensions.
 */

import { BaseNode, registerDeclaredProperty } from "@nodetool-ai/node-sdk";
import type { NodeClass, ImageRef, PropOptions } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import * as d from "typegpu/data";
import {
  transformMirrorV1,
  transformOffsetV1,
  transformCropV1,
  transformPadV1,
  transformTileV1,
  transformResizeV1,
  transformRotate90V1,
  transformAffineV1,
  transformCornerPinV1,
  transformPolarRemapV1,
  transformDisplaceV1,
  transformSpherizeV1
} from "@nodetool-ai/gpu/pool";
import {
  IMAGE_PROP,
  extraImageProp,
  colorProp,
  colorValueToVec4,
  floatProp,
  intProp,
  runShaderNode,
  type RunShaderOptions
} from "./lib-shader-utils.js";
import { decodeRgba } from "./image.js";

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function vec4From(value: unknown, fallback: [number, number, number, number]): ReturnType<typeof d.vec4f> {
  const [r, g, b, a] = colorValueToVec4(value, fallback);
  return d.vec4f(r, g, b, a);
}

/** Read just dimensions from an ImageRef (one decode, used by host-sized ops). */
async function imageDims(image: unknown, ctx?: ProcessingContext): Promise<{ width: number; height: number } | null> {
  if (!image) return null;
  const { width, height } = await decodeRgba(image, ctx);
  if (!width || !height) return null;
  return { width, height };
}

interface TransformSpec {
  nodeType: string;
  title: string;
  description: string;
  module: Parameters<typeof runShaderNode>[0];
  extraProps: Array<{ name: string; options: PropOptions }>;
  extraImageInputs?: ReadonlyArray<{ propName: string; bindName: string }>;
  buildParams: (props: Record<string, unknown>) => Record<string, unknown>;
  /** Optional output size derivation for `derived` / `host-specified` modules. */
  computeOutputDims?: (
    props: Record<string, unknown>,
    sourceDims: { width: number; height: number } | null
  ) => { width: number; height: number } | null;
}

function defineTransformNode(spec: TransformSpec): NodeClass {
  const C = class extends BaseNode {
    static readonly nodeType = spec.nodeType;
    static readonly title = spec.title;
    static readonly description = spec.description;
    static readonly inputFields = [
      "image",
      ...(spec.extraImageInputs ?? []).map((e) => e.propName)
    ];
    static readonly metadataOutputTypes = { output: "image" };

    async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
      const props = this.serialize() as Record<string, unknown>;
      const extras: Record<string, unknown> = {};
      for (const { propName, bindName } of spec.extraImageInputs ?? []) {
        extras[bindName] = props[propName];
      }
      let opts: RunShaderOptions = { extraInputs: extras };
      if (spec.computeOutputDims) {
        const sourceDims = await imageDims(props.image, context);
        const dims = spec.computeOutputDims(props, sourceDims);
        if (dims) opts = { ...opts, outputWidth: dims.width, outputHeight: dims.height };
      }
      const params = spec.buildParams(props);
      const output = await runShaderNode(spec.module, params, props.image, opts, context);
      return { output };
    }
  };
  registerDeclaredProperty(C, "image", IMAGE_PROP);
  for (const entry of spec.extraImageInputs ?? []) {
    registerDeclaredProperty(C, entry.propName, extraImageProp(entry.propName, ""));
  }
  for (const entry of spec.extraProps) {
    registerDeclaredProperty(C, entry.name, entry.options);
  }
  return C as NodeClass;
}

/* ---- transform.mirror -------------------------------------------- */
const MirrorNode = defineTransformNode({
  nodeType: "shader.transform.mirror",
  title: "Mirror",
  description: "Flip horizontally / vertically / both. 1=H / 2=V / 3=both.",
  module: transformMirrorV1,
  extraProps: [
    { name: "axes", options: intProp(1, { min: 0, max: 3, label: "Axes" }) }
  ],
  buildParams: (p) => ({ axes: num(p.axes, 1) })
});

/* ---- transform.offset -------------------------------------------- */
const OffsetNode = defineTransformNode({
  nodeType: "shader.transform.offset",
  title: "Offset",
  description: "Translate by (dx, dy) UV units with selectable wrap (GPU).",
  module: transformOffsetV1,
  extraProps: [
    { name: "dx", options: floatProp(0, { min: -1, max: 1, label: "Offset X" }) },
    { name: "dy", options: floatProp(0, { min: -1, max: 1, label: "Offset Y" }) },
    { name: "wrap", options: intProp(0, { min: 0, max: 2, label: "Wrap", notes: "0 clamp / 1 repeat / 2 mirror" }) }
  ],
  buildParams: (p) => ({
    dx: num(p.dx, 0),
    dy: num(p.dy, 0),
    wrap: num(p.wrap, 0)
  })
});

/* ---- transform.crop --------------------------------------------- */
const CropNode = defineTransformNode({
  nodeType: "shader.transform.crop",
  title: "Crop",
  description: "Sample a normalized sub-rectangle of the source (GPU). Output is sized to the crop.",
  module: transformCropV1,
  extraProps: [
    { name: "origin_x", options: floatProp(0, { min: 0, max: 1, label: "Origin X" }) },
    { name: "origin_y", options: floatProp(0, { min: 0, max: 1, label: "Origin Y" }) },
    { name: "width", options: floatProp(1, { min: 0.01, max: 1, label: "Width" }) },
    { name: "height", options: floatProp(1, { min: 0.01, max: 1, label: "Height" }) }
  ],
  buildParams: (p) => ({
    originX: num(p.origin_x, 0),
    originY: num(p.origin_y, 0),
    width: num(p.width, 1),
    height: num(p.height, 1)
  }),
  computeOutputDims: (p, src) => {
    if (!src) return null;
    return {
      width: Math.max(1, Math.round(src.width * num(p.width, 1))),
      height: Math.max(1, Math.round(src.height * num(p.height, 1)))
    };
  }
});

/* ---- transform.pad ---------------------------------------------- */
const PadNode = defineTransformNode({
  nodeType: "shader.transform.pad",
  title: "Pad",
  description: "Pad with empty / coloured space on each side (GPU). Output enlarges to fit.",
  module: transformPadV1,
  extraProps: [
    { name: "left", options: floatProp(0, { min: 0, max: 4, label: "Left", notes: "× source width" }) },
    { name: "top", options: floatProp(0, { min: 0, max: 4, label: "Top", notes: "× source height" }) },
    { name: "right", options: floatProp(0, { min: 0, max: 4, label: "Right", notes: "× source width" }) },
    { name: "bottom", options: floatProp(0, { min: 0, max: 4, label: "Bottom", notes: "× source height" }) },
    { name: "fill", options: colorProp("#00000000", { label: "Fill color" }) }
  ],
  buildParams: (p) => ({
    left: num(p.left, 0),
    top: num(p.top, 0),
    right: num(p.right, 0),
    bottom: num(p.bottom, 0),
    color: vec4From(p.fill, [0, 0, 0, 0])
  }),
  computeOutputDims: (p, src) => {
    if (!src) return null;
    const wScale = 1 + num(p.left, 0) + num(p.right, 0);
    const hScale = 1 + num(p.top, 0) + num(p.bottom, 0);
    return {
      width: Math.max(1, Math.round(src.width * wScale)),
      height: Math.max(1, Math.round(src.height * hScale))
    };
  }
});

/* ---- transform.tile --------------------------------------------- */
const TileNode = defineTransformNode({
  nodeType: "shader.transform.tile",
  title: "Tile",
  description: "Tile the source N × M times across the same-sized canvas (GPU).",
  module: transformTileV1,
  extraProps: [
    { name: "tiles_x", options: intProp(2, { min: 1, max: 32, label: "Tiles X" }) },
    { name: "tiles_y", options: intProp(2, { min: 1, max: 32, label: "Tiles Y" }) },
    { name: "wrap", options: intProp(1, { min: 0, max: 2, label: "Wrap", notes: "0 clamp / 1 repeat / 2 mirror" }) }
  ],
  buildParams: (p) => ({
    tilesX: num(p.tiles_x, 2),
    tilesY: num(p.tiles_y, 2),
    wrap: num(p.wrap, 1)
  })
});

/* ---- transform.resize ------------------------------------------- */
const ResizeNode = defineTransformNode({
  nodeType: "shader.transform.resize",
  title: "Resize",
  description: "Resample to (target_width, target_height). 0 nearest / 1 bilinear / 2 bicubic.",
  module: transformResizeV1,
  extraProps: [
    { name: "target_width", options: intProp(512, { min: 1, max: 8192, label: "Target width" }) },
    { name: "target_height", options: intProp(512, { min: 1, max: 8192, label: "Target height" }) },
    { name: "mode", options: intProp(1, { min: 0, max: 2, label: "Mode" }) }
  ],
  buildParams: (p) => ({ mode: num(p.mode, 1) }),
  computeOutputDims: (p) => ({
    width: Math.max(1, Math.round(num(p.target_width, 512))),
    height: Math.max(1, Math.round(num(p.target_height, 512)))
  })
});

/* ---- transform.rotate90 ----------------------------------------- */
const Rotate90Node = defineTransformNode({
  nodeType: "shader.transform.rotate90",
  title: "Rotate 90°",
  description: "Quarter-turn rotation. 0 / 1=90° / 2=180° / 3=270° (CW). Width/height swap for odd turns.",
  module: transformRotate90V1,
  extraProps: [
    { name: "turns", options: intProp(1, { min: 0, max: 3, label: "Turns (CW)" }) }
  ],
  buildParams: (p) => ({ turns: num(p.turns, 1) }),
  computeOutputDims: (p, src) => {
    if (!src) return null;
    const turns = Math.round(num(p.turns, 1)) & 3;
    return turns % 2 === 0
      ? { width: src.width, height: src.height }
      : { width: src.height, height: src.width };
  }
});

/* ---- transform.affine ------------------------------------------- */
const AffineNode = defineTransformNode({
  nodeType: "shader.transform.affine",
  title: "Affine",
  description: "Inverse 2×3 affine matrix remap. Host supplies inverse coefficients (GPU).",
  module: transformAffineV1,
  extraProps: [
    { name: "target_width", options: intProp(0, { min: 0, max: 8192, label: "Target width", notes: "0 = match source" }) },
    { name: "target_height", options: intProp(0, { min: 0, max: 8192, label: "Target height", notes: "0 = match source" }) },
    { name: "m00", options: floatProp(1, { label: "m00" }) },
    { name: "m01", options: floatProp(0, { label: "m01" }) },
    { name: "tx", options: floatProp(0, { label: "tx" }) },
    { name: "m10", options: floatProp(0, { label: "m10" }) },
    { name: "m11", options: floatProp(1, { label: "m11" }) },
    { name: "ty", options: floatProp(0, { label: "ty" }) }
  ],
  buildParams: (p) => ({
    m00: num(p.m00, 1),
    m01: num(p.m01, 0),
    tx: num(p.tx, 0),
    m10: num(p.m10, 0),
    m11: num(p.m11, 1),
    ty: num(p.ty, 0)
  }),
  computeOutputDims: (p, src) => {
    const w = num(p.target_width, 0);
    const h = num(p.target_height, 0);
    if (w > 0 && h > 0) return { width: w, height: h };
    return src;
  }
});

/* ---- transform.cornerPin ---------------------------------------- */
const CornerPinNode = defineTransformNode({
  nodeType: "shader.transform.corner_pin",
  title: "Corner Pin",
  description: "Perspective warp via inverse 3×3 homography (GPU). Same-as-source output.",
  module: transformCornerPinV1,
  extraProps: [
    { name: "h00", options: floatProp(1, { label: "H00" }) },
    { name: "h01", options: floatProp(0, { label: "H01" }) },
    { name: "h02", options: floatProp(0, { label: "H02" }) },
    { name: "h10", options: floatProp(0, { label: "H10" }) },
    { name: "h11", options: floatProp(1, { label: "H11" }) },
    { name: "h12", options: floatProp(0, { label: "H12" }) },
    { name: "h20", options: floatProp(0, { label: "H20" }) },
    { name: "h21", options: floatProp(0, { label: "H21" }) }
  ],
  buildParams: (p) => ({
    h00: num(p.h00, 1),
    h01: num(p.h01, 0),
    h02: num(p.h02, 0),
    h10: num(p.h10, 0),
    h11: num(p.h11, 1),
    h12: num(p.h12, 0),
    h20: num(p.h20, 0),
    h21: num(p.h21, 0)
  })
});

/* ---- transform.polarRemap --------------------------------------- */
const PolarRemapNode = defineTransformNode({
  nodeType: "shader.transform.polar_remap",
  title: "Polar Remap",
  description: "Rectangular ↔ polar coordinate remap. 0 rect→polar / 1 polar→rect.",
  module: transformPolarRemapV1,
  extraProps: [
    { name: "mode", options: intProp(0, { min: 0, max: 1, label: "Mode" }) }
  ],
  buildParams: (p) => ({ mode: num(p.mode, 0) })
});

/* ---- transform.displace ----------------------------------------- */
const DisplaceNode = defineTransformNode({
  nodeType: "shader.transform.displace",
  title: "Displace",
  description: "Per-pixel UV offset driven by a displacement map (R+G channels). GPU.",
  module: transformDisplaceV1,
  extraImageInputs: [{ propName: "displacement", bindName: "displacement" }],
  extraProps: [
    { name: "amount_x", options: floatProp(0.05, { min: -1, max: 1, label: "Amount X" }) },
    { name: "amount_y", options: floatProp(0.05, { min: -1, max: 1, label: "Amount Y" }) }
  ],
  buildParams: (p) => ({
    amountX: num(p.amount_x, 0.05),
    amountY: num(p.amount_y, 0.05)
  })
});

/* ---- transform.spherize ----------------------------------------- */
const SpherizeNode = defineTransformNode({
  nodeType: "shader.transform.spherize",
  title: "Spherize",
  description: "Spherical/fisheye lens distortion centred on the source (GPU).",
  module: transformSpherizeV1,
  extraProps: [
    { name: "amount", options: floatProp(0.5, { min: -1, max: 1, label: "Amount", notes: "negative pinches" }) }
  ],
  buildParams: (p) => ({ amount: num(p.amount, 0.5) })
});

export const SHADER_TRANSFORM_NODES: readonly NodeClass[] = [
  MirrorNode,
  OffsetNode,
  CropNode,
  PadNode,
  TileNode,
  ResizeNode,
  Rotate90Node,
  AffineNode,
  CornerPinNode,
  PolarRemapNode,
  DisplaceNode,
  SpherizeNode
];

export {
  MirrorNode,
  OffsetNode,
  CropNode,
  PadNode,
  TileNode,
  ResizeNode,
  Rotate90Node,
  AffineNode,
  CornerPinNode,
  PolarRemapNode,
  DisplaceNode,
  SpherizeNode
};
