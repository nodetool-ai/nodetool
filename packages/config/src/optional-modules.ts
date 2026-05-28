/**
 * Import an optional dependency from the normal module graph, or — on Node —
 * from a user-managed `node_modules` directory pointed to by
 * NODETOOL_OPTIONAL_NODE_MODULES. The fallback path is Node-only; on
 * browsers / Edge we just re-throw the original import failure.
 */

import { IS_NODE, importNodeBuiltin, importHidden } from "./node-import.js";

export async function importOptionalModule<T>(packageName: string): Promise<T> {
  try {
    const mod = await importHidden<T>(packageName);
    if (mod === null) {
      throw new Error(`importOptionalModule: ${packageName} unavailable on non-Node`);
    }
    return mod;
  } catch (error) {
    if (!IS_NODE) throw error;
    const optionalNodeModules = process.env["NODETOOL_OPTIONAL_NODE_MODULES"];
    if (!optionalNodeModules) {
      throw error;
    }
    try {
      const modMod = await importNodeBuiltin<typeof import("node:module")>(
        "node:module"
      );
      const pathMod = await importNodeBuiltin<typeof import("node:path")>(
        "node:path"
      );
      const urlMod = await importNodeBuiltin<typeof import("node:url")>(
        "node:url"
      );
      if (!modMod || !pathMod || !urlMod) throw error;
      const requireFromOptional = modMod.createRequire(
        pathMod.join(optionalNodeModules, "..", "package.json")
      );
      const resolved = requireFromOptional.resolve(packageName);
      const fileMod = await importHidden<T>(urlMod.pathToFileURL(resolved).href);
      if (fileMod === null) {
        throw error;
      }
      return fileMod;
    } catch {
      throw error;
    }
  }
}
