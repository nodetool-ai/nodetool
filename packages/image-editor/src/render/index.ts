/**
 * @nodetool-ai/image-editor/render — the sketch compositor.
 *
 * `compose.ts` holds the per-layer draw rules the editor's Canvas2D runtime
 * composites with. `document.ts` runs them over a whole persisted document in
 * one pass for a host without the editor, such as the headless renderer.
 */

export * from "./types.js";
export * from "./normalize.js";
export * from "./compose.js";
export * from "./document.js";
