import { afterEach, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { bareSpecifierName, resolvePackDependency } from "../../src/packs/resolution.js";

const exec = promisify(execFile);
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function writePackage(directory: string, manifest: Record<string, unknown>, files: Record<string, string>): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "package.json"), JSON.stringify(manifest));
  for (const [file, source] of Object.entries(files)) { await writeFile(join(directory, file), source); }
}

/**
 * A CLI tree and a pack project that both contain `@nodetool-ai/shared`, a
 * runtime library only the project has, and a pack importing both.
 */
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "pack-resolution-"))); roots.push(root);
  const cliRoot = join(root, "cli");
  const projectRoot = join(root, "packs", "1.0.0", "g-0-0000000000000000");
  const where = "export const where = import.meta.url;\n";
  await writePackage(cliRoot, { name: "@nodetool-ai/cli", version: "1.0.0", type: "module" }, {});
  for (const modules of [join(cliRoot, "node_modules"), join(projectRoot, "node_modules")]) {
    await writePackage(join(modules, "@nodetool-ai/shared"), { name: "@nodetool-ai/shared", version: "1.0.0", type: "module", exports: "./index.js" }, { "index.js": where });
  }
  const project = join(projectRoot, "node_modules");
  await writePackage(join(project, "@nodetool-ai/project-only"), { name: "@nodetool-ai/project-only", version: "1.0.0", type: "module", exports: "./index.js" }, { "index.js": where });
  await writePackage(join(project, "runtime-lib"), { name: "runtime-lib", version: "1.0.0", main: "index.js" }, { "index.js": "module.exports = { where: __filename };\n" });
  await writePackage(join(project, "@nodetool-ai/fixture-nodes"), { name: "@nodetool-ai/fixture-nodes", version: "1.0.0", type: "module", exports: "./index.js" }, {
    "index.js": 'export { where as shared } from "@nodetool-ai/shared";\nexport { where as projectOnly } from "@nodetool-ai/project-only";\nexport { where as self } from "@nodetool-ai/other-nodes";\n'
  });
  await writePackage(join(project, "@nodetool-ai/other-nodes"), { name: "@nodetool-ai/other-nodes", version: "1.0.0", type: "module", exports: "./index.js" }, { "index.js": where });
  await writePackage(join(cliRoot, "node_modules/@nodetool-ai/other-nodes"), { name: "@nodetool-ai/other-nodes", version: "1.0.0", type: "module", exports: "./index.js" }, { "index.js": where });
  const resolution = { cliRoot, projectRoot, packNames: ["@nodetool-ai/fixture-nodes", "@nodetool-ai/other-nodes"], sharedNames: [] };
  return { root, cliRoot, projectRoot, resolution };
}

it("routes pack imports of core packages to the CLI and lets host code reach project-only packages", async () => {
  const f = await fixture();
  const module = new URL("../../src/packs/resolution.ts", import.meta.url).href;
  const host = join(f.cliRoot, "host.mjs");
  await writeFile(host, `import { createRequire } from "node:module";
const { activatePackResolution } = await import(${JSON.stringify(module)});
activatePackResolution(${JSON.stringify(f.resolution)});
const pack = await import(${JSON.stringify(pathToFileURL(join(f.projectRoot, "node_modules/@nodetool-ai/fixture-nodes/index.js")).href)});
const esm = await import("runtime-lib");
const cjs = createRequire(import.meta.url)("runtime-lib");
process.stdout.write(JSON.stringify({ shared: pack.shared, projectOnly: pack.projectOnly, self: pack.self, esm: esm.default.where, cjs: cjs.where }));
`);
  const { stdout } = await exec(process.execPath, ["--import", "tsx", "--conditions=nodetool-dev", host], { cwd: fileURLToPath(new URL("../../../..", import.meta.url)) });
  const url = (path: string) => pathToFileURL(path).href;
  expect(JSON.parse(stdout)).toEqual({
    shared: url(join(f.cliRoot, "node_modules/@nodetool-ai/shared/index.js")),
    projectOnly: url(join(f.projectRoot, "node_modules/@nodetool-ai/project-only/index.js")),
    self: url(join(f.projectRoot, "node_modules/@nodetool-ai/other-nodes/index.js")),
    esm: join(f.projectRoot, "node_modules/runtime-lib/index.js"),
    cjs: join(f.projectRoot, "node_modules/runtime-lib/index.js")
  });
});

it("applies the same rule when verification resolves without hooks", async () => {
  const f = await fixture();
  const pack = join(f.projectRoot, "node_modules/@nodetool-ai/fixture-nodes");
  expect(resolvePackDependency("@nodetool-ai/shared", pack, f.resolution)).toBe(join(f.cliRoot, "node_modules/@nodetool-ai/shared"));
  expect(resolvePackDependency("@nodetool-ai/project-only", pack, f.resolution)).toBe(join(f.projectRoot, "node_modules/@nodetool-ai/project-only"));
  expect(resolvePackDependency("@nodetool-ai/other-nodes", pack, f.resolution)).toBe(join(f.projectRoot, "node_modules/@nodetool-ai/other-nodes"));
  expect(resolvePackDependency("runtime-lib", f.cliRoot, f.resolution)).toBe(join(f.projectRoot, "node_modules/runtime-lib"));
});

it("names only bare package specifiers", () => {
  expect(bareSpecifierName("@nodetool-ai/node-sdk/pack-verifier")).toBe("@nodetool-ai/node-sdk");
  expect(bareSpecifierName("sharp")).toBe("sharp");
  for (const specifier of ["./local.js", "/abs.js", "file:///x.js", "node:fs", "fs", "#internal", "@scope"]) {
    expect(bareSpecifierName(specifier)).toBeNull();
  }
});
