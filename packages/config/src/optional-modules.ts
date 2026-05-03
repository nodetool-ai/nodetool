import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Import an optional dependency from the normal module graph, or from a
 * user-managed node_modules directory pointed to by NODETOOL_OPTIONAL_NODE_MODULES.
 */
export async function importOptionalModule<T>(packageName: string): Promise<T> {
  try {
    return (await import(packageName)) as T;
  } catch (error) {
    const optionalNodeModules = process.env["NODETOOL_OPTIONAL_NODE_MODULES"];
    if (!optionalNodeModules) {
      throw error;
    }

    try {
      const requireFromOptional = createRequire(
        join(optionalNodeModules, "..", "package.json")
      );
      const resolved = requireFromOptional.resolve(packageName);
      return (await import(pathToFileURL(resolved).href)) as T;
    } catch {
      throw error;
    }
  }
}
