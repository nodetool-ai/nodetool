import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { prepareTypeScriptWorkspaceBuild } from "../build-typescript-workspace.mjs";

// These cases copy complete resource trees, including the example catalog.
const RESOURCE_TIMEOUT = process.platform === "win32" ? 30_000 : 5_000;

describe("npm workspace runtime resources", () => {
  it.each([
    ["agents", "_skills", "api-apps/SKILL.md"],
    ["node-sdk", "_sandbox", "sandbox-timeline/package.json"],
    ["timeline", "examples/timelines", null],
    ["project-services", "examples/nodetool-base", null]
  ])("stages %s resources inside its published dist", async (name, assetDirectory, sample) => {
    const directory = await mkdtemp(join(tmpdir(), "nodetool-resources-"));
    try {
      await writeFile(join(directory, "package.json"), JSON.stringify({ name: `@nodetool-ai/${name}` }));
      await prepareTypeScriptWorkspaceBuild(directory, async () => {
        await mkdir(join(directory, "dist"), { recursive: true });
      });
      const resources = join(directory, "dist", assetDirectory);
      const files = await readdir(resources);
      expect(files.length).toBeGreaterThan(0);
      if (sample) {
        expect((await readFile(join(resources, sample), "utf8")).length).toBeGreaterThan(0);
      } else {
        expect(files.some((file) => file.endsWith(".json"))).toBe(true);
      }
    } finally {
      // Keep cleanup with its copy operation even if the runner times out.
      await rm(directory, { recursive: true, force: true });
    }
  }, RESOURCE_TIMEOUT);
  it("removes stale nested pack files while retaining live resources", async () => {
    const directory = await mkdtemp(join(tmpdir(), "nodetool-stale-resources-"));
    try {
      await writeFile(join(directory, "package.json"), JSON.stringify({ name: "@nodetool-ai/node-sdk" }));
      const pack = join(directory, "dist", "_sandbox", "sandbox-timeline", "sandbox");
      await mkdir(pack, { recursive: true });
      const stale = join(pack, "removed-module.js");
      await writeFile(stale, "export const stale = true;");
      await prepareTypeScriptWorkspaceBuild(directory, async () => undefined);
      await expect(readFile(stale, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
      expect((await readFile(join(pack, "index.js"), "utf8")).length).toBeGreaterThan(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, RESOURCE_TIMEOUT);

});
