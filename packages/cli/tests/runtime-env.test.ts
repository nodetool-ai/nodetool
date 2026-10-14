import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cliHostForPath, initializeCliRuntime } from "../src/runtime-env.js";

const directories: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("CLI runtime host", () => {
  it.each([
    ["/usr/local/lib/node_modules/@nodetool-ai/cli/dist/nodetool.js", "cli"],
    ["/home/test/project/node_modules/@nodetool-ai/cli/dist/nodetool.js", "cli"],
    ["/home/test/.npm/_npx/123/node_modules/@nodetool-ai/cli/dist/nodetool.js", "npx"],
    [String.raw`C:\Users\test\npm\_npx\123\node_modules\@nodetool-ai\cli\dist\nodetool.js`, "npx"],
    ["/checkout/packages/cli/src/nodetool.ts", "source"],
    ["/checkout/packages/cli/dist/nodetool.js", "source"]
  ])("recognizes %s", (path, host) => { expect(cliHostForPath(path)).toBe(host); });

  it.each([
    [{ version: "0.8.3" }, "0.8.3"],
    [{ version: 3 }, undefined],
    [{ name: "cli" }, undefined],
    [null, undefined]
  ])("reads only a string version from the CLI manifest: %j", (manifest, version) => {
    const directory = mkdtempSync(join(tmpdir(), "cli-runtime-env-"));
    directories.push(directory);
    const entry = join(directory, "dist", "nodetool.js");
    mkdirSync(join(directory, "dist"));
    writeFileSync(entry, "");
    writeFileSync(join(directory, "package.json"), JSON.stringify(manifest));
    vi.stubEnv("NODETOOL_HOST", "docker");
    vi.stubEnv("NODETOOL_CLI_VERSION", undefined);
    initializeCliRuntime(pathToFileURL(entry).href);
    expect(process.env["NODETOOL_CLI_VERSION"]).toBe(version);
  });
});
