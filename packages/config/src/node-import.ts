/**
 * Cross-runtime helpers for loading `node:*` built-ins lazily.
 *
 * Bundlers (Vite, esbuild) try to resolve `node:fs` etc. at build time
 * even when the import is gated behind a runtime check, and `@vite-ignore`
 * comments don't always stop the resolver. We use the `Function`
 * constructor to construct an `import()` call the static analyser never
 * sees.
 *
 * Returns `null` on non-Node runtimes (browser, V8 isolates without
 * Node compat), so callers can fall back to platform-specific paths.
 */

export const IS_NODE =
  typeof process !== "undefined" &&
  typeof (process as { versions?: { node?: string } }).versions?.node ===
    "string";

/**
 * Dynamic import that bundlers can't statically resolve.
 *
 * The Function-constructor body hides the `import()` call from Vite /
 * Rollup / esbuild static analysis so they don't try to bundle Node
 * built-ins into a browser graph. At runtime we prefer the constructed
 * function, but in some test loaders (vitest) Function-context dynamic
 * imports don't have access to the loader callback ("A dynamic import
 * callback was not specified.") — in that case we fall back to a plain
 * dynamic `import(name)` evaluated in the calling module's context.
 */
const hiddenImport: (id: string) => Promise<unknown> = (() => {
  try {
    return new Function("id", "return import(id)") as (
      id: string
    ) => Promise<unknown>;
  } catch {
    return (id: string) => import(/* @vite-ignore */ id);
  }
})();

async function tryImport(name: string): Promise<unknown> {
  try {
    return await hiddenImport(name);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Fall back to in-context dynamic import for vitest's VM loader.
    if (msg.includes("dynamic import callback")) {
      return await import(/* @vite-ignore */ name);
    }
    throw err;
  }
}

export async function importNodeBuiltin<T>(name: string): Promise<T | null> {
  if (!IS_NODE) return null;
  try {
    return (await tryImport(name)) as T;
  } catch {
    return null;
  }
}

/**
 * Dynamic import of an arbitrary module specifier hidden from bundler
 * static analysis. Use for native/Node-only npm packages (e.g. `sharp`,
 * `better-sqlite3`) so a browser/edge bundle doesn't try to bundle them.
 *
 * Returns `null` on non-Node runtimes. Throws if the package can't be
 * resolved on Node — callers should catch if the dependency is optional.
 */
export async function importHidden<T>(name: string): Promise<T | null> {
  if (!IS_NODE) return null;
  return (await tryImport(name)) as T;
}
