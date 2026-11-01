import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

describe("published runtime resource loaders", () => {
  it("finds shipped guides, sandbox packs and examples outside the checkout", async () => {
    const directory = await mkdtemp(join(tmpdir(), "nodetool-published-resources-"));
    try {
      await symlink(join(root, "node_modules"), join(directory, "node_modules"), "junction");
      const packagePaths = {};
      for (const name of ["agents", "node-sdk", "timeline", "project-services"]) {
        const source = join(root, "packages", name);
        const packed = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", [
          "pack", "--dry-run", "--ignore-scripts", "--json"
        ], { cwd: source, encoding: "utf8", maxBuffer: 10 * 1024 * 1024, shell: process.platform === "win32" });
        expect(packed.status, packed.stderr).toBe(0);
        const files = JSON.parse(packed.stdout)[0].files;
        expect(files.length).toBeGreaterThan(0);
        const target = join(directory, name);
        for (const file of files) {
          const destination = join(target, file.path);
          await mkdir(resolve(destination, ".."), { recursive: true });
          await cp(join(source, file.path), destination);
        }
        packagePaths[name] = target;
      }
      const entry = (name, file) => pathToFileURL(join(packagePaths[name], "dist", file)).href;
      const program = `
        const skills = await import(${JSON.stringify(entry("agents", "system-skills.js"))});
        if (!skills.findSystemSkill("api-apps") || !skills.findSystemSkill("api-storyboards")) throw new Error("Missing shipped guides");
        const packs = await import(${JSON.stringify(entry("node-sdk", "pack-loader.js"))});
        if (!packs.shippedPackSearchPaths().some(path => path.startsWith(${JSON.stringify(directory)}))) throw new Error("Missing shipped sandbox packs");
        const timelines = await import(${JSON.stringify(entry("timeline", "examples/node.js"))});
        if (timelines.listExampleTimelines().length === 0) throw new Error("Missing shipped timeline examples");
        const workflows = await import(${JSON.stringify(entry("project-services", "example-workflows.js"))});
        if (!workflows.shippedWorkflowExamplesDir()?.startsWith(${JSON.stringify(directory)})) throw new Error("Missing shipped workflow examples");
        const catalog = await import(${JSON.stringify(entry("project-services", "mcp-tool-host-deps.js"))});
        const examples = await catalog.createExampleWorkflowCatalog().list({ query: "text" });
        if (examples.length === 0) throw new Error("Missing discoverable text workflow examples");
      `;
      const checked = spawnSync(process.execPath, ["--input-type=module", "--eval", program], {
        cwd: directory,
        encoding: "utf8",
        env: { ...process.env, NODETOOL_SYSTEM_SKILLS_DIR: "", NODETOOL_SHIPPED_PACKS_DIR: "", NODETOOL_EXAMPLE_TIMELINES_DIR: "" },
        timeout: 30_000
      });
      expect(checked.status, checked.stderr).toBe(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);
});
