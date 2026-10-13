/**
 * The CLI's optional-node root: `<data dir>/optional-node`, where
 * `nodetool runtime add` installs heavy third-party libraries that the npm
 * package does not ship. `importOptionalModule` falls back to its
 * `node_modules` through NODETOOL_OPTIONAL_NODE_MODULES.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getNodetoolDataDir } from "@nodetool-ai/config";

/** The directory `npm install --prefix` runs in. */
export function optionalNodeRoot(): string {
  return join(getNodetoolDataDir(), "optional-node");
}

/** The `node_modules` directory inside the optional-node root. */
export function optionalNodeModulesDir(): string {
  return join(optionalNodeRoot(), "node_modules");
}

/**
 * Point NODETOOL_OPTIONAL_NODE_MODULES at the CLI's root when it exists. A
 * value the caller already set wins, so the desktop app and tests keep their
 * own root. Child processes such as `serve` inherit the variable.
 */
export function applyOptionalNodeModules(): void {
  if (process.env["NODETOOL_OPTIONAL_NODE_MODULES"]) {
    return;
  }
  const dir = optionalNodeModulesDir();
  if (existsSync(dir)) {
    process.env["NODETOOL_OPTIONAL_NODE_MODULES"] = dir;
  }
}
