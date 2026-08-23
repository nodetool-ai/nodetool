/**
 * What the guest's Node-compat bootstrap loads, in place of the wrapper's own
 * polyfills.
 *
 * Before our sandboxed function is called, `@sebastianwessel/quickjs` evaluates
 * a fixed preamble in the fresh context:
 *
 * ```js
 * import 'node:buffer'; import 'node:util'; import 'node:url';
 * import '@node_compatibility/headers'; import '@node_compatibility/request';
 * import '@node_compatibility/response';
 * ```
 *
 * Twelve kilobytes of JavaScript, compiled and evaluated into a new runtime on
 * **every run** — 4.3 ms of a 12 ms empty run, against 0.34 ms for a bare
 * QuickJS context. And most of it is thrown away immediately: the init prelude
 * deletes `Buffer`, `Headers`, `Request` and `Response` before user code exists,
 * because guest code has no business with host-shaped Node globals.
 *
 * Those imports resolve through the run's own module loader
 * (`createGuestModuleHost`), which is ours, so the bootstrap can be served
 * something cheaper instead of being fought. Four of the six become empty
 * modules. `node:util` becomes the two classes the guest actually keeps, in
 * place of promisify/callbackify/inherits/deprecate/types it never sees.
 * `node:url` is served by the wrapper unchanged, because `URL` and
 * `URLSearchParams` are guest capabilities and a hand-rolled URL parser is not
 * a saving worth making.
 *
 * Measured on this repo's engine: wrapper setup 5.96 ms → 3.28 ms per run.
 *
 * The failure modes are deliberately lopsided. A wrapper release that renames
 * or moves these modules makes the map miss, the real polyfill loads, and the
 * only loss is the saving — pinned by "the compat bootstrap loads our stubs" in
 * `tests/js-sandbox-modules.test.ts`, which fails loudly rather than silently
 * costing 2.7 ms. A release that imports something our `node:util` does not
 * export fails every sandbox run in the suite, which is as loud as it gets.
 *
 * Browser-safe: nothing here imports a Node builtin.
 */

/** A module whose only job is to exist, for an `import` that wants no export. */
const EMPTY_MODULE = "export default {};";

/**
 * `TextEncoder`/`TextDecoder`, which the wrapper's `node:util` installs as
 * globals and which the guest surface documents.
 *
 * The `encodeURIComponent`/`unescape` pair is UTF-8 the way the wrapper's own
 * polyfill does it, so the bytes a guest sees are the bytes it saw before. Both
 * classes are also exported by name: the wrapper's `node:buffer` imports them
 * that way, and although that module is empty here, a future one may not be.
 */
const UTIL_MODULE = `
class TextEncoder {
  encode(input = "") {
    const utf8 = unescape(encodeURIComponent(input));
    const out = new Uint8Array(utf8.length);
    for (let i = 0; i < utf8.length; i++) out[i] = utf8.charCodeAt(i);
    return out;
  }
}
class TextDecoder {
  constructor(encoding = "utf-8") {
    if (encoding !== "utf-8") throw new Error("Only utf-8 encoding is supported");
  }
  decode(input = new Uint8Array()) {
    let text = "";
    for (let i = 0; i < input.length; i++) text += String.fromCharCode(input[i]);
    return decodeURIComponent(escape(text));
  }
}
globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder;
export { TextEncoder, TextDecoder };
export default { TextEncoder, TextDecoder };
`;

/**
 * Module id → the source served during the wrapper's bootstrap phase. The ids
 * are what its own normalizer produces for the specifiers above; anything not
 * listed loads from the wrapper as before.
 */
export const BOOTSTRAP_MODULE_SOURCES: ReadonlyMap<string, string> = new Map([
  // Deleted by the init prelude the moment the bootstrap finishes.
  ["/node_modules/buffer", EMPTY_MODULE],
  ["/node_modules/@node_compatibility/headers", EMPTY_MODULE],
  ["/node_modules/@node_compatibility/request", EMPTY_MODULE],
  ["/node_modules/@node_compatibility/response", EMPTY_MODULE],
  // Kept, minus everything the guest cannot reach.
  ["/node_modules/util", UTIL_MODULE]
]);

/**
 * The globals the bootstrap no longer installs, in the order a reader would
 * check them. Exported so a test can assert they are gone at the source rather
 * than after the prelude's `delete`, which would hide a missed stub.
 */
export const BOOTSTRAP_DROPPED_GLOBALS = [
  "Buffer",
  "Headers",
  "Request",
  "Response"
] as const;
