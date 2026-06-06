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
