import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { prepareTypeScriptWorkspaceBuild } from "../build-typescript-workspace.mjs";

const directories = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("npm workspace runtime resources", () => {
  it.each([
    ["agents", "_skills", "api-apps/SKILL.md"],
    ["node-sdk", "_sandbox", "sandbox-timeline/package.json"],
    ["timeline", "examples/timelines", null],
    ["project-services", "examples/nodetool-base", null]
  ])("stages %s resources inside its published dist", async (name, assetDirectory, sample) => {
    const directory = await mkdtemp(join(tmpdir(), "nodetool-resources-"));
    directories.push(directory);
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
  });
  it("removes stale nested pack files while retaining live resources", async () => {
    const directory = await mkdtemp(join(tmpdir(), "nodetool-stale-resources-"));
    directories.push(directory);
    await writeFile(join(directory, "package.json"), JSON.stringify({ name: "@nodetool-ai/node-sdk" }));
    const pack = join(directory, "dist", "_sandbox", "sandbox-timeline", "sandbox");
    await mkdir(pack, { recursive: true });
    const stale = join(pack, "removed-module.js");
    await writeFile(stale, "export const stale = true;");
    await prepareTypeScriptWorkspaceBuild(directory, async () => undefined);
    await expect(readFile(stale, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect((await readFile(join(pack, "index.js"), "utf8")).length).toBeGreaterThan(0);
  });

});
