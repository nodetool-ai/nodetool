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

/**
 * What a dynamic `import()` (or a CJS `require`) resolves to: the module's
 * namespace object. Its members are known only to the caller that named the
 * specifier, which is why the loaders below are generic in that shape.
 */
type ModuleNamespace = object;

export const IS_NODE =
  typeof process !== "undefined" && process.versions?.node != null;

/**
 * `process` is undefined in browser/edge runtimes, where a bare `process.env`
 * read throws `ReferenceError` — including at module scope, which takes the
 * whole bundle down at import time rather than at the call that wanted the
 * variable. Any module that can end up in a browser graph reads env through
 * this instead.
 */
export const safeProcessEnv = (): Record<string, string | undefined> =>
  typeof process !== "undefined" && process.env ? process.env : {};

/** `process.platform`, or `""` where there is no `process`. */
export const safeProcessPlatform = (): string =>
  typeof process !== "undefined" ? (process.platform ?? "") : "";

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
const hiddenImport: (id: string) => Promise<ModuleNamespace> = (() => {
  try {
    // SAFETY: the constructed body is exactly `import(id)`, whose resolution
    // value is always a module namespace object.
    return new Function("id", "return import(id)") as (
      id: string
    ) => Promise<ModuleNamespace>;
  } catch {
    return (id: string) => import(/* @vite-ignore */ id);
  }
})();

async function tryImport(name: string): Promise<ModuleNamespace> {
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
    // SAFETY: `T` is the namespace shape the caller names for `name`; the
    // pairing of specifier and type is the caller's to keep honest.
    return (await tryImport(name)) as T;
  } catch {
    return null;
  }
}

/**
 * Synchronous Node builtin loader for use in modules that must remain
 * CJS-compatible (no top-level await). Uses `process.getBuiltinModule`
 * where available (Node 18.19+, works in both ESM and CJS) and falls
 * back to `globalThis.require` for CJS bundles. Returns `null` on
 * non-Node runtimes or when the builtin cannot be resolved.
 */
/** CommonJS `require`, present only in a CJS bundle. */
type BuiltinRequire = (id: string) => ModuleNamespace;

/** The Node `process` members this loader reaches for. */
interface NodeProcessGlobal {
  getBuiltinModule?: BuiltinRequire;
}

/** `globalThis` as a CJS bundle sees it. */
interface GlobalWithRequire {
  require?: BuiltinRequire;
}

/** Whether this Node build exposes the `process.getBuiltinModule` accessor. */
function hasGetBuiltinModule(
  proc: NodeProcessGlobal | undefined
): proc is { getBuiltinModule: BuiltinRequire } {
  return typeof proc?.getBuiltinModule === "function";
}

/** Whether this module was loaded from a CJS bundle, which carries `require`. */
function hasCjsRequire(
  global: GlobalWithRequire
): global is { require: BuiltinRequire } {
  return typeof global.require === "function";
}

export function getNodeBuiltinSync<T>(name: string): T | null {
  if (!IS_NODE) return null;
  try {
    // SAFETY: `getBuiltinModule` landed in Node 18.19 and is absent from the
    // `@types/node` `Process` this repo compiles against; the guard below is
    // what decides whether it is really there.
    const proc = globalThis.process as NodeProcessGlobal | undefined;
    if (hasGetBuiltinModule(proc)) {
      // SAFETY: `T` is the namespace shape the caller names for `name`.
      return proc.getBuiltinModule(name) as T;
    }
    // SAFETY: `require` exists only when this module is loaded from a CJS
    // bundle, so it is not on the ESM `globalThis` type; the guard decides.
    const globalScope = globalThis as GlobalWithRequire;
    if (hasCjsRequire(globalScope)) {
      // SAFETY: `T` is the export shape the caller names for `name`.
      return globalScope.require(name) as T;
    }
  } catch {
    // fall through to null
  }
  return null;
}

/** Alias for `getNodeBuiltinSync` — synchronous counterpart to `importNodeBuiltin`. */
export const importNodeBuiltinSync = getNodeBuiltinSync;

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
  // SAFETY: `T` is the namespace shape the caller names for `name`.
  return (await tryImport(name)) as T;
}
