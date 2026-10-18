/**
 * Host-neutral shapes for compositing a sketch document.
 *
 * Structural on purpose, like `painting/surface.ts`: the web editor's `Layer`
 * and `SketchDocument` satisfy them, and so does a document parsed from JSON
 * once it has gone through {@link normalizeRenderDocument}. This package
 * compiles without the DOM lib, so the canvas types are declared here too.
 */

import type { PaintContext2D, PaintSurface } from "../painting/surface.js";

export interface RenderPoint {
  readonly x: number;
  readonly y: number;
}

export type RenderQuad = readonly [
  RenderPoint,
  RenderPoint,
  RenderPoint,
  RenderPoint
];

/** TRS around the raster's center. Rotation is in radians. */
export interface RenderAffineTransform {
  readonly kind: "affine";
  readonly x: number;
  readonly y: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly rotation: number;
}

export type RenderQuadMode = "distort" | "skew" | "perspective" | "mesh-warp";

/** Document-space corners: top-left, top-right, bottom-right, bottom-left. */
export interface RenderQuadTransform {
  readonly kind: "quad";
  readonly mode: RenderQuadMode;
  readonly quad: RenderQuad;
}

export type RenderLayerTransform = RenderAffineTransform | RenderQuadTransform;

export interface RenderBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type RenderLayerType = "raster" | "mask" | "group" | "vector";

export type RenderImageFit = "fill" | "contain" | "cover";

export interface RenderImageReference {
  uri: string;
  /** Omitted: the image is drawn at its natural size from the layer origin. */
  objectFit?: RenderImageFit;
}

export interface BrightnessContrastEffect {
  type: "brightness_contrast";
  enabled: boolean;
  params: { brightness: number; contrast: number };
}

export interface HueSaturationEffect {
  type: "hue_saturation";
  enabled: boolean;
  params: { hueDegrees: number; saturation: number; lightness: number };
}

export interface ExposureEffect {
  type: "exposure";
  enabled: boolean;
  params: { exposureStops: number };
}

/** The non-destructive effects the editor evaluates, in stack order. */
export type RenderLayerEffect =
  | BrightnessContrastEffect
  | HueSaturationEffect
  | ExposureEffect;

/** The fields of a layer that decide its pixels. */
export interface RenderLayer {
  id: string;
  name: string;
  type: RenderLayerType;
  visible: boolean;
  opacity: number;
  blendMode: string;
  alphaLock: boolean;
  collapsed?: boolean;
  /** `ntlayer:<base64 JSON>` or a legacy bare image locator. */
  data: string | null;
  imageReference?: RenderImageReference | null;
  transform: RenderLayerTransform;
  contentBounds: RenderBounds;
  parentId?: string | null;
  effects: RenderLayerEffect[];
}

export interface RenderDocument {
  canvas: { width: number; height: number; backgroundColor?: string };
  layers: RenderLayer[];
  maskLayerId: string | null;
}

/** The Canvas2D members the compositor calls beyond the paint core's. */
export interface RenderContext2D extends PaintContext2D {
  filter: string;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  clip(): void;
  /**
   * HOLDOUT (anti-slop/no-unknown-parameters): see `PaintContext2D.drawImage`.
   * The compositor draws back surfaces and images the same host produced.
   */
  drawImage(image: unknown, dx: number, dy: number): void;
  drawImage(
    image: unknown,
    dx: number,
    dy: number,
    dw: number,
    dh: number
  ): void;
  drawImage(
    image: unknown,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number
  ): void;
}

/** An off-screen bitmap the compositor draws into. */
export interface RenderSurface extends PaintSurface {
  getContext(contextId: "2d"): RenderContext2D | null;
}

/** A decoded image the host can draw. */
export interface RenderImage {
  width: number;
  height: number;
}
