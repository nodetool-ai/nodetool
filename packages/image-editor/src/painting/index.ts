/**
 * @nodetool-ai/image-editor/painting — the paint core.
 *
 * The brush/pencil/eraser stroke engine plus the data shapes it reads. Pure
 * Canvas2D with a single injectable surface factory, so it runs in the browser
 * and headlessly in Node (see `setPaintSurfaceFactory`).
 */

export * from "./types.js";
export * from "./surface.js";
export * from "./strokeRendering.js";
