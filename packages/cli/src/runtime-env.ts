import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { applyRuntimeEnv, isNodetoolHost, type NodetoolHost } from "@nodetool-ai/config";

export function cliHostForPath(path: string): NodetoolHost {
  const normalized = path.replaceAll("\\", "/");
  if (normalized.split("/").includes("_npx")) { return "npx"; }
  if (normalized.endsWith(".ts") || /\/packages\/cli\/(?:src|dist)\//.test(normalized)) { return "source"; }
  return "cli";
}

export function initializeCliRuntime(entryUrl: string): void {
  if (process.env["NODETOOL_HOST"] === undefined) {
    process.env["NODETOOL_HOST"] = cliHostForPath(realpathSync(fileURLToPath(entryUrl)));
  } else if (!isNodetoolHost(process.env["NODETOOL_HOST"])) {
    throw new Error(`Unknown NODETOOL_HOST: ${process.env["NODETOOL_HOST"]}`);
  }
  if (process.env["NODETOOL_CLI_VERSION"] === undefined) {
    const manifest: unknown = JSON.parse(readFileSync(new URL("../package.json", entryUrl), "utf8"));
    if (manifest && typeof manifest === "object" && "version" in manifest && typeof manifest.version === "string") {
      process.env["NODETOOL_CLI_VERSION"] = manifest.version;
    }
  }
  applyRuntimeEnv();
}
