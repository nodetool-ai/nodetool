/**
 * The font corpus, and everything about it a caller can use without a canvas.
 *
 * `register-node.ts` is deliberately absent: it imports `@napi-rs/canvas`, and
 * the package root has no runtime dependencies (AS2). Node hosts reach it
 * through `@nodetool-ai/timeline/fonts/node`.
 */

export * from "./catalog.js";
export * from "./css.js";
