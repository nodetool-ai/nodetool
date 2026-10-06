/**
 * Import an optional dependency from the normal module graph, or — on Node —
 * from a user-managed `node_modules` directory pointed to by
 * NODETOOL_OPTIONAL_NODE_MODULES. The fallback path is Node-only; on
 * browsers / Edge we just re-throw the original import failure.
 */

import { IS_NODE, importNodeBuiltin, importHidden } from "./node-import.js";

export async function importOptionalModule<T>(
  packageName: string,
  options: { commonJs?: boolean } = {}
): Promise<T> {
  try {
    // Some native wrappers ship TypeScript that ESM development loaders select
    // instead of their published CommonJS entry point.
    if (options.commonJs && IS_NODE) {
      const module =
        await importNodeBuiltin<typeof import("node:module")>("node:module");
      if (!module) {
        throw new Error("Node module loader is unavailable");
      }
      // SAFETY: T describes the caller's trusted package API, as with importHidden<T>.
      return module.createRequire(import.meta.url)(packageName) as T;
    }
    const mod = await importHidden<T>(packageName);
    if (mod === null) {
      throw new Error(
        `importOptionalModule: ${packageName} unavailable on non-Node`
      );
    }
    return mod;
  } catch (error) {
    if (!IS_NODE) {
      throw error;
    }
    const optionalNodeModules = process.env["NODETOOL_OPTIONAL_NODE_MODULES"];
    if (!optionalNodeModules) {
      throw error;
    }
    try {
      const modMod =
        await importNodeBuiltin<typeof import("node:module")>("node:module");
      const pathMod =
        await importNodeBuiltin<typeof import("node:path")>("node:path");
      const urlMod =
        await importNodeBuiltin<typeof import("node:url")>("node:url");
      if (!modMod || !pathMod || !urlMod) {
        throw error;
      }
      const requireFromOptional = modMod.createRequire(
        pathMod.join(optionalNodeModules, "..", "package.json")
      );
      if (options.commonJs) {
        // SAFETY: The caller supplies the API type for this trusted runtime package.
        return requireFromOptional(packageName) as T;
      }
      const resolved = requireFromOptional.resolve(packageName);
      const fileMod = await importHidden<T>(
        urlMod.pathToFileURL(resolved).href
      );
      if (fileMod === null) {
        throw error;
      }
      return fileMod;
    } catch {
      throw error;
    }
  }
}
