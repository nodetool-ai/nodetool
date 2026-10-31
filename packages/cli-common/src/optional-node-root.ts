/**
 * The CLI's optional-node root: `<data dir>/optional-node`, where
 * `nodetool runtime add` installs heavy third-party libraries that the npm
 * package does not ship. `importOptionalModule` falls back to its
 * `node_modules` through NODETOOL_OPTIONAL_NODE_MODULES.
 */
import { join } from "node:path";
import { applyRuntimeEnv, runtimeLocations } from "@nodetool-ai/config";

/** The directory `npm install --prefix` runs in. */
export function optionalNodeRoot(): string {
  const root = runtimeLocations().optionalNodeRoot;
  if (!root) { throw new Error("This host does not manage npm runtime installs"); }
  return root;
}

/** The `node_modules` directory inside the optional-node root. */
export function optionalNodeModulesDir(): string {
  return join(optionalNodeRoot(), "node_modules");
}

/**
 * Compatibility entry for callers that only need runtime path initialization.
 * Managed paths are set even before installation. Explicit overrides win.
 */
export function applyOptionalNodeModules(): void { applyRuntimeEnv(); }
