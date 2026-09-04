/**
 * surface.ts
 *
 * The one host-canvas seam of the paint core. The stroke engine needs
 * off-screen bitmaps for its brush-stamp cache; everything else it touches is
 * handed in by the caller. Rather than reaching for `document.createElement`,
 * it asks for a {@link PaintSurface} here, so a headless host (Node with
 * `@napi-rs/canvas`, a worker with `OffscreenCanvas`) can supply its own.
 *
 * The default stays the browser DOM, so nothing in the web editor changes.
 *
 * The types are structural on purpose: this package compiles without the DOM
 * lib, and both `HTMLCanvasElement` and `@napi-rs/canvas`'s `Canvas` satisfy
 * them.
 */

/** Colour ramp handed to {@link PaintContext2D.fillStyle}. */
export interface PaintGradient {
  addColorStop(offset: number, color: string): void;
}

/**
 * The Canvas2D members the stroke engine calls. A DOM
 * `CanvasRenderingContext2D` and `@napi-rs/canvas`'s context both satisfy it.
 */
export interface PaintContext2D {
  globalAlpha: number;
  globalCompositeOperation: string;
  /** Written, never read — a CSS colour string or a {@link PaintGradient}. */
  fillStyle: unknown;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: string;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  scale(x: number, y: number): void;
  setTransform(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number
  ): void;
  beginPath(): void;
  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number
  ): void;
  fill(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number
  ): PaintGradient;
  /**
   * HOLDOUT (anti-slop/no-unknown-parameters): `image` is whatever the host's
   * canvas accepts, and a DOM `CanvasRenderingContext2D` has to stay assignable
   * to this interface. Its `CanvasImageSource` union has no supertype writable
   * here — an `SVGImageElement`'s `width` is an `SVGAnimatedLength`, not a
   * number — so neither direction of the bivariant method check succeeds
   * against a named shape. The engine only ever passes back a
   * {@link PaintSurface} the same host produced.
   */
  drawImage(image: unknown, dx: number, dy: number): void;
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

/** An off-screen bitmap the engine draws a brush stamp into and then stamps from. */
export interface PaintSurface {
  width: number;
  height: number;
  getContext(contextId: "2d"): PaintContext2D | null;
}

/** Allocates a {@link PaintSurface} of the given pixel size. */
export type PaintSurfaceFactory = (
  width: number,
  height: number
) => PaintSurface;

/** Shape of `window` this module needs, declared locally since there is no DOM lib. */
interface CanvasDocumentHost {
  document: {
    createElement(tagName: "canvas"): PaintSurface;
  };
}

const browserPaintSurfaceFactory: PaintSurfaceFactory = (width, height) => {
  // SAFETY: the assertion declares `window` optional, so it claims nothing
  // about this host; the `!host` branch below is what handles a runtime
  // without one, and every `host.document.createElement` result flows back
  // through the `PaintSurface` contract this module already checks.
  const host = (globalThis as { window?: CanvasDocumentHost }).window;
  if (!host) {
    throw new Error(
      "No paint surface available: this environment has no DOM canvas. " +
        "Call setPaintSurfaceFactory() first — in Node, pass @napi-rs/canvas's createCanvas."
    );
  }
  const surface = host.document.createElement("canvas");
  surface.width = width;
  surface.height = height;
  return surface;
};

let activePaintSurfaceFactory: PaintSurfaceFactory = browserPaintSurfaceFactory;

/**
 * Point the paint core at a host canvas implementation. Pass `null` to restore
 * the browser DOM default.
 *
 * ```ts
 * import { createCanvas } from "@napi-rs/canvas";
 * setPaintSurfaceFactory(createCanvas);
 * ```
 */
export function setPaintSurfaceFactory(
  factory: PaintSurfaceFactory | null
): void {
  activePaintSurfaceFactory = factory ?? browserPaintSurfaceFactory;
}

/** Allocate an off-screen surface through the active factory. */
export function createPaintSurface(
  width: number,
  height: number
): PaintSurface {
  return activePaintSurfaceFactory(width, height);
}
