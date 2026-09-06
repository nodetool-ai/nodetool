/**
 * `@openclaw/fs-safe`, the symlink-safe filesystem wrapper
 * `@nodetool-ai/storage`'s `FileStorageAdapter` is built on.
 *
 * Not a Node builtin, but it belongs with the stubs for the same reason: it
 * is Node-only *at module scope*. Its native-binding loader calls
 * `createRequire(import.meta.url)` and reads `process.env` while the module
 * evaluates, so merely having it in a browser graph throws before any code
 * asks it for anything — which is what took the whole harness entry down.
 *
 * The browser never constructs a `FileStorageAdapter`: `root()` is called
 * only from that constructor, and a browser has no local directory to point
 * one at. So the stub throws on use, like every other stub here.
 */
export function root() {
  throw new Error("Browser stub: @openclaw/fs-safe.root not supported");
}
