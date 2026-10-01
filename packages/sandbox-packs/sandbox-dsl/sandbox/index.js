/**
 * The pack's root module: the graph builder, plus every namespace under one
 * name.
 *
 * `workflow()` lives only here. A program that imports a namespace subpath for
 * its node wrappers still declares the root, because the root is what turns the
 * nodes it built into a graph.
 */

export { createNode, isOutputHandle, resolveConnection } from "./core.js";
export * from "./generated/index.js";

export { workflow, t, choose, map, template } from "./authoring.js";
