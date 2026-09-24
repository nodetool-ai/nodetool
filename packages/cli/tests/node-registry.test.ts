import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

describe("CLI node registry", () => {
  it("resolves AtlasCloud nodes for single-node runs", () => {
    const cliRoot = fileURLToPath(new URL("../", import.meta.url));
    const output = execFileSync(
      process.execPath,
      [
        "--conditions=nodetool-dev",
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        'import { buildFullRegistry } from "./src/node-registry.ts"; console.log(buildFullRegistry().has("atlascloud.video.SyncLipsyncV3"));'
      ],
      { cwd: cliRoot, encoding: "utf8" }
    );
    expect(output.trim()).toBe("true");
  });
});
