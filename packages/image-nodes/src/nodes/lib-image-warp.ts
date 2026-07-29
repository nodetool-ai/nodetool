/**
 * `lib.image.warp.*` — geometric warps that re-sample the source. Tile, pad
 * with empty/coloured borders, affine matrix remap, perspective corner pin,
 * polar coordinate remap, displacement-map driven warp, fisheye spherize,
 * UV-space offset.
 *
 * Resize / crop / mirror / rotate already live under `nodetool.image.*` and
 * `nodetool.image.RotateAndFlip` — those nodeTypes stay; this file only
 * exposes ops that don't already have an equivalent.
 */

import { BaseNode, registerDeclaredProperty } from "@nodetool-ai/node-sdk";
import type { ImageRef } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import * as d from "typegpu/data";
import {
  transformOffsetV1,
  transformPadV1,
  transformTileV1,
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
  num,
  premultiplyVec4,
  runShaderNode,
  type RunShaderOptions
} from "./lib-shader-utils.js";
import { imageDimensions } from "./image-io.js";
import { tagAsBrowserGpu, tagAsContentCard } from "@nodetool-ai/nodes-utils";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Convert a colour value to a vec4f, premultiplying the alpha into RGB before
 * packing. Use when handing a colour to a shader whose param contract
 * expects premultiplied (e.g. `transform.pad@1`'s `color`).
 */
function premultipliedVec4From(
  value: unknown,
  fallback: [number, number, number, number]
): ReturnType<typeof d.vec4f> {
  const [r, g, b, a] = premultiplyVec4(colorValueToVec4(value, fallback));
  return d.vec4f(r, g, b, a);
}

async function imageDims(
  image: unknown,
  ctx?: ProcessingContext
): Promise<{ width: number; height: number } | null> {
  if (!image) return null;
  const { width, height } = await imageDimensions(image, ctx);
  if (!width || !height) return null;
  return { width, height };
}

class OffsetNode extends BaseNode {
  static readonly nodeType = "lib.image.warp.Offset";
  static readonly title = "Offset";
  static readonly description =
    "Translate the image by (dx, dy) UV units with selectable wrap.\n    image, offset, translate, shift";
  static readonly inputFields = ["image"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const output = await runShaderNode(
      transformOffsetV1,
      {
        dx: num(props.dx, 0),
        dy: num(props.dy, 0),
        wrap: num(props.wrap, 0)
      },
      props.image,
      {},
      context
    );
    return { output };
  }
}
registerDeclaredProperty(OffsetNode, "image", IMAGE_PROP);
registerDeclaredProperty(OffsetNode, "dx", floatProp(0, { min: -1, max: 1, label: "Offset X" }));
registerDeclaredProperty(OffsetNode, "dy", floatProp(0, { min: -1, max: 1, label: "Offset Y" }));
registerDeclaredProperty(
  OffsetNode,
  "wrap",
  intProp(0, { min: 0, max: 2, label: "Wrap", notes: "0 clamp / 1 repeat / 2 mirror" })
);

class PadNode extends BaseNode {
  static readonly nodeType = "lib.image.warp.Pad";
  static readonly title = "Pad";
  static readonly description =
    "Pad with empty / coloured space on each side. Output enlarges to fit.\n    image, pad, border, expand, frame";
  static readonly inputFields = ["image"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const src = await imageDims(props.image, context);
    let opts: RunShaderOptions = {};
    if (src) {
      const wScale = 1 + num(props.left, 0) + num(props.right, 0);
      const hScale = 1 + num(props.top, 0) + num(props.bottom, 0);
      opts = {
        outputWidth: Math.max(1, Math.round(src.width * wScale)),
        outputHeight: Math.max(1, Math.round(src.height * hScale))
      };
    }
    const output = await runShaderNode(
      transformPadV1,
      {
        left: num(props.left, 0),
        top: num(props.top, 0),
        right: num(props.right, 0),
        bottom: num(props.bottom, 0),
        // Shader's `color` is declared premultiplied — the colour picker
        // emits straight alpha, so we premultiply before handing it over.
        color: premultipliedVec4From(props.color, [0, 0, 0, 0])
      },
      props.image,
      opts,
      context
    );
    return { output };
  }
}
registerDeclaredProperty(PadNode, "image", IMAGE_PROP);
registerDeclaredProperty(PadNode, "left", floatProp(0, { min: 0, max: 4, label: "Left", notes: "× source width" }));
registerDeclaredProperty(PadNode, "top", floatProp(0, { min: 0, max: 4, label: "Top", notes: "× source height" }));
registerDeclaredProperty(PadNode, "right", floatProp(0, { min: 0, max: 4, label: "Right", notes: "× source width" }));
registerDeclaredProperty(PadNode, "bottom", floatProp(0, { min: 0, max: 4, label: "Bottom", notes: "× source height" }));
registerDeclaredProperty(PadNode, "color", colorProp("#00000000", { label: "Fill color" }));

class TileNode extends BaseNode {
  static readonly nodeType = "lib.image.warp.Tile";
  static readonly title = "Tile";
  static readonly description =
    "Tile the source N × M times across the same-sized canvas.\n    image, tile, repeat, pattern";
  static readonly inputFields = ["image"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const output = await runShaderNode(
      transformTileV1,
      {
        // Prop metadata caps tiles at [1, 32]; clamp so an out-of-range wire
        // value can't reach the shader as a zero/negative or runaway count.
        tilesX: clamp(Math.round(num(props.tiles_x, 2)), 1, 32),
        tilesY: clamp(Math.round(num(props.tiles_y, 2)), 1, 32),
        wrap: num(props.wrap, 1)
      },
      props.image,
      {},
      context
    );
    return { output };
  }
}
registerDeclaredProperty(TileNode, "image", IMAGE_PROP);
registerDeclaredProperty(TileNode, "tiles_x", intProp(2, { min: 1, max: 32, label: "Tiles X" }));
registerDeclaredProperty(TileNode, "tiles_y", intProp(2, { min: 1, max: 32, label: "Tiles Y" }));
registerDeclaredProperty(
  TileNode,
  "wrap",
  intProp(1, { min: 0, max: 2, label: "Wrap", notes: "0 clamp / 1 repeat / 2 mirror" })
);

class AffineNode extends BaseNode {
  static readonly nodeType = "lib.image.warp.Affine";
  static readonly title = "Affine";
  static readonly description =
    "Apply an inverse 2×3 affine matrix. Each output UV maps to source (m00·u + m01·v + tx, m10·u + m11·v + ty).\n    image, affine, transform, matrix, warp";
  static readonly inputFields = ["image"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const w = num(props.target_width, 0);
    const h = num(props.target_height, 0);
    // Resolve each dimension independently so a single specified target
    // (e.g. width only) is honored and combined with the source's other
    // dimension, instead of being dropped unless BOTH are set.
    const src = w > 0 && h > 0 ? null : await imageDims(props.image, context);
    const outputWidth = w > 0 ? w : src?.width;
    const outputHeight = h > 0 ? h : src?.height;
    const opts: RunShaderOptions =
      outputWidth && outputHeight ? { outputWidth, outputHeight } : {};
    const output = await runShaderNode(
      transformAffineV1,
      {
        m00: num(props.m00, 1),
        m01: num(props.m01, 0),
        tx: num(props.tx, 0),
        m10: num(props.m10, 0),
        m11: num(props.m11, 1),
        ty: num(props.ty, 0)
      },
      props.image,
      opts,
      context
    );
    return { output };
  }
}
registerDeclaredProperty(AffineNode, "image", IMAGE_PROP);
registerDeclaredProperty(
  AffineNode,
  "target_width",
  intProp(0, { min: 0, max: 8192, label: "Target width", notes: "0 = match source" })
);
registerDeclaredProperty(
  AffineNode,
  "target_height",
  intProp(0, { min: 0, max: 8192, label: "Target height", notes: "0 = match source" })
);
registerDeclaredProperty(AffineNode, "m00", floatProp(1, { label: "m00" }));
registerDeclaredProperty(AffineNode, "m01", floatProp(0, { label: "m01" }));
registerDeclaredProperty(AffineNode, "tx", floatProp(0, { label: "tx" }));
registerDeclaredProperty(AffineNode, "m10", floatProp(0, { label: "m10" }));
registerDeclaredProperty(AffineNode, "m11", floatProp(1, { label: "m11" }));
registerDeclaredProperty(AffineNode, "ty", floatProp(0, { label: "ty" }));

class CornerPinNode extends BaseNode {
  static readonly nodeType = "lib.image.warp.CornerPin";
  static readonly title = "Corner Pin";
  static readonly description =
    "Perspective warp via an inverse 3×3 homography (H22 fixed at 1).\n    image, perspective, corner pin, homography, warp";
  static readonly inputFields = ["image"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const output = await runShaderNode(
      transformCornerPinV1,
      {
        h00: num(props.h00, 1),
        h01: num(props.h01, 0),
        h02: num(props.h02, 0),
        h10: num(props.h10, 0),
        h11: num(props.h11, 1),
        h12: num(props.h12, 0),
        h20: num(props.h20, 0),
        h21: num(props.h21, 0)
      },
      props.image,
      {},
      context
    );
    return { output };
  }
}
registerDeclaredProperty(CornerPinNode, "image", IMAGE_PROP);
for (const key of ["h00", "h01", "h02", "h10", "h11", "h12", "h20", "h21"] as const) {
  const def = key === "h00" || key === "h11" ? 1 : 0;
  registerDeclaredProperty(CornerPinNode, key, floatProp(def, { label: key.toUpperCase() }));
}

class PolarRemapNode extends BaseNode {
  static readonly nodeType = "lib.image.warp.PolarRemap";
  static readonly title = "Polar Remap";
  static readonly description =
    "Convert between rectangular and polar UV space. 0 rect→polar / 1 polar→rect.\n    image, polar, warp, kaleidoscope";
  static readonly inputFields = ["image"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const output = await runShaderNode(
      transformPolarRemapV1,
      { mode: num(props.mode, 0) },
      props.image,
      {},
      context
    );
    return { output };
  }
}
registerDeclaredProperty(PolarRemapNode, "image", IMAGE_PROP);
registerDeclaredProperty(PolarRemapNode, "mode", intProp(0, { min: 0, max: 1, label: "Mode" }));

class DisplaceNode extends BaseNode {
  static readonly nodeType = "lib.image.warp.Displace";
  static readonly title = "Displace";
  static readonly description =
    "Per-pixel UV offset driven by a displacement map (R+G channels). Useful for ripples and glass.\n    image, displace, warp, ripple, distortion";
  static readonly inputFields = ["image", "displacement"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const output = await runShaderNode(
      transformDisplaceV1,
      {
        amountX: num(props.amount_x, 0.05),
        amountY: num(props.amount_y, 0.05)
      },
      props.image,
      { extraInputs: { displacement: props.displacement } },
      context
    );
    return { output };
  }
}
registerDeclaredProperty(DisplaceNode, "image", IMAGE_PROP);
registerDeclaredProperty(
  DisplaceNode,
  "displacement",
  extraImageProp("Displacement map", "R/G channels drive the UV offset")
);
registerDeclaredProperty(
  DisplaceNode,
  "amount_x",
  floatProp(0.05, { min: -1, max: 1, label: "Amount X" })
);
registerDeclaredProperty(
  DisplaceNode,
  "amount_y",
  floatProp(0.05, { min: -1, max: 1, label: "Amount Y" })
);

class SpherizeNode extends BaseNode {
  static readonly nodeType = "lib.image.warp.Spherize";
  static readonly title = "Spherize";
  static readonly description =
    "Fisheye lens distortion centred on the source. Positive bulges out, negative pinches in.\n    image, fisheye, spherize, warp, lens";
  static readonly inputFields = ["image"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const output = await runShaderNode(
      transformSpherizeV1,
      { amount: num(props.amount, 0.5) },
      props.image,
      {},
      context
    );
    return { output };
  }
}
registerDeclaredProperty(SpherizeNode, "image", IMAGE_PROP);
registerDeclaredProperty(
  SpherizeNode,
  "amount",
  floatProp(0.5, { min: -1, max: 1, label: "Amount", notes: "negative pinches" })
);

export const LIB_IMAGE_WARP_NODES = tagAsBrowserGpu(tagAsContentCard([
  OffsetNode,
  PadNode,
  TileNode,
  AffineNode,
  CornerPinNode,
  PolarRemapNode,
  DisplaceNode,
  SpherizeNode
]));

export {
  OffsetNode,
  PadNode,
  TileNode,
  AffineNode,
  CornerPinNode,
  PolarRemapNode,
  DisplaceNode,
  SpherizeNode
};
