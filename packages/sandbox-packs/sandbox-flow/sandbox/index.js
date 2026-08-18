/**
 * The pack's root module: the untyped call bridge.
 *
 * The typed surface is the per-namespace modules — `callNode(type, inputs)` is
 * what they are built on, and takes a node type as a string, so it checks
 * nothing until the host answers. Import it when the type is decided at run
 * time; otherwise import the namespace and let the missing export be the error.
 */

export { callNode, streamNode } from "./guest-core.js";
