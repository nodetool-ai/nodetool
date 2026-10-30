import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { applyRuntimeEnv, isNodetoolHost, type NodetoolHost } from "@nodetool-ai/config";

const cliManifestSchema = z.object({ version: z.string() });

export function cliHostForPath(path: string): NodetoolHost {
  const normalized = path.replaceAll("\\", "/");
  if (normalized.split("/").includes("_npx")) { return "npx"; }
  if (normalized.endsWith(".ts") || /\/packages\/cli(?:-full)?\/(?:src|dist)\//.test(normalized)) { return "source"; }
  return "cli";
}

export function initializeCliRuntime(entryUrl: string): void {
  if (process.env["NODETOOL_HOST"] === undefined) {
    process.env["NODETOOL_HOST"] = cliHostForPath(realpathSync(fileURLToPath(entryUrl)));
  } else if (!isNodetoolHost(process.env["NODETOOL_HOST"])) {
    throw new Error(`Unknown NODETOOL_HOST: ${process.env["NODETOOL_HOST"]}`);
  }
  if (process.env["NODETOOL_CLI_VERSION"] === undefined) {
    const manifest = cliManifestSchema.safeParse(JSON.parse(readFileSync(new URL("../package.json", entryUrl), "utf8")));
    if (manifest.success) {
      process.env["NODETOOL_CLI_VERSION"] = manifest.data.version;
    }
  }
  applyRuntimeEnv();
}
