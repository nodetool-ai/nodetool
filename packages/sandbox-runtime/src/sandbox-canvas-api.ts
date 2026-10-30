/**
 * The Canvas 2D surface the sandbox exposes, named in one place.
 *
 * Two sides read these lists and must agree: the guest-side recorder in the
 * sandbox prelude, which builds a context object with exactly these members,
 * and the host-side replay in `sandbox-media.ts`, which refuses any op naming
 * something outside them. Splitting them out of the media engine keeps that
 * engine — and the native canvas behind it — lazily loaded, since the prelude
 * needs the names long before anything draws.
 */

/** Context properties a recorded draw list may set. */
export const CANVAS_PROPERTIES = [
  "fillStyle",
  "strokeStyle",
  "lineWidth",
  "lineCap",
  "lineJoin",
  "miterLimit",
  "lineDashOffset",
  "globalAlpha",
  "globalCompositeOperation",
  "filter",
  "font",
  "textAlign",
  "textBaseline",
  "direction",
  "letterSpacing",
  "imageSmoothingEnabled",
  "imageSmoothingQuality",
  "shadowColor",
  "shadowBlur",
  "shadowOffsetX",
  "shadowOffsetY"
] as const;

/**
 * Context methods a recorded draw list may call. `drawImage` is deliberately
 * absent: it is the one call carrying binary, and both sides special-case it.
 */
export const CANVAS_METHODS = [
  "save",
  "restore",
  "translate",
  "rotate",
  "scale",
  "transform",
  "setTransform",
  "resetTransform",
  "beginPath",
  "closePath",
  "moveTo",
  "lineTo",
  "bezierCurveTo",
  "quadraticCurveTo",
  "arc",
  "arcTo",
  "ellipse",
  "rect",
  "roundRect",
  "fill",
  "stroke",
  "clip",
  "fillRect",
  "strokeRect",
  "clearRect",
  "fillText",
  "strokeText",
  "setLineDash"
] as const;

/** Gradient factories the recorder offers; each returns a gradient handle. */
export const CANVAS_GRADIENT_FACTORIES = {
  createLinearGradient: "linear",
  createRadialGradient: "radial",
  createConicGradient: "conic"
} as const;

/**
 * Marker key on a gradient handle. A gradient is a host object, so the guest
 * holds a tag instead and the renderer swaps in the real one when the tag is
 * assigned to `fillStyle` or `strokeStyle`.
 */
export const CANVAS_GRADIENT_MARKER = "__nodetool_canvas_gradient__";
