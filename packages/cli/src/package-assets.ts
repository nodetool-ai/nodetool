import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

/**
 * The shipped `package://` assets in a checkout, which the server serves from
 * `packages/base-nodes/nodetool/assets`. The runtime reads that directory when
 * `NODETOOL_PACKAGE_ASSETS_DIR` names it and otherwise asks a running server,
 * so without it a run that reads a shipped input needs the server up.
 */
export function checkoutPackageAssetsDir(): string | null {
  try {
    const entry = createRequire(import.meta.url).resolve("@nodetool-ai/base-nodes");
    const dir = resolve(dirname(entry), "..", "nodetool", "assets");
    return existsSync(dir) ? dir : null;
  } catch {
    // Not installed beside the CLI: package assets resolve over HTTP.
    return null;
  }
}
