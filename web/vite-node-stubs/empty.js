// Empty Node-builtin stub for the browser bundle. Any property access
// throws so the actual usage site fails fast rather than silently
// behaving wrong. Browser-tagged code should never reach these.
const handler = {
  get(_target, prop) {
    if (prop === "default" || prop === Symbol.toStringTag) return undefined;
    throw new Error(
      `Browser stub: property '${String(prop)}' on Node-builtin not supported`
    );
  }
};
export default new Proxy({}, handler);

// A named import binds at bundle time and the Proxy above cannot satisfy it,
// so every named import a workspace bundle destructures from one of these
// builtins needs a real export here. `request` is `node:http`/`node:https`.
export function request() {
  throw new Error("Browser stub: node:http.request not supported");
}

/** `node:module`. A bundle that reaches for CJS resolution has no browser path. */
export function createRequire() {
  throw new Error("Browser stub: node:module.createRequire not supported");
}
