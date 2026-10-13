import { mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importWorkflowFile } from "../src/workflow-file.js";

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "nodetool-dsl-")); });
afterEach(async () => { vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }); });

describe("in-process DSL loading", () => {
  it("loads TypeScript exports from paths containing shell syntax", async () => {
    const file = join(root, 'workflow $(echo unsafe).ts');
    await writeFile(file, 'const nodes: unknown[] = []; export default { nodes, edges: [] };');
    expect(await importWorkflowFile(file)).toEqual({ nodes: [], edges: [] });
  });
  it("loads JSON emitted by legacy DSL files", async () => {
    const file = join(root, "printed.ts");
    await writeFile(file, 'const value: string = "hello"; console.log(JSON.stringify({ nodes: [{id: value}], edges: [] }));');
    expect(await importWorkflowFile(file)).toEqual({ nodes: [{ id: "hello" }], edges: [] });
  });
  it("reloads a printed DSL document and its dependencies after edits", async () => {
    await writeFile(join(root, "package.json"), JSON.stringify({ type: "module" }));
    vi.spyOn(Date, "now").mockReturnValue(Date.now());
    const dependency = join(root, "value.ts");
    const file = join(root, "reload.ts");
    await writeFile(dependency, 'export const value = "first";');
    await writeFile(file, 'import { value } from "./value.js"; console.log(JSON.stringify({ nodes: [{ id: value }], edges: [] }));');
    expect(await importWorkflowFile(file)).toEqual({ nodes: [{ id: "first" }], edges: [] });
    expect(await importWorkflowFile(file)).toEqual({ nodes: [{ id: "first" }], edges: [] });
    await writeFile(dependency, 'export const value = "second";');
    expect(await importWorkflowFile(file)).toEqual({ nodes: [{ id: "second" }], edges: [] });
  });

  it("reloads exported DSL documents after edits", async () => {
    const file = join(root, "reload-export.ts");
    await writeFile(file, 'export default { nodes: [{ id: "first" }], edges: [] };');
    expect(await importWorkflowFile(file)).toEqual({ nodes: [{ id: "first" }], edges: [] });
    await writeFile(file, 'export default { nodes: [{ id: "second" }], edges: [] };');
    expect(await importWorkflowFile(file)).toEqual({ nodes: [{ id: "second" }], edges: [] });
  });

  it("keeps an ESM exported document's params and identity", async () => {
    await writeFile(join(root, "package.json"), JSON.stringify({ type: "module" }));
    const file = join(root, "document.ts");
    await writeFile(file, 'export default { name: "example", workflow_id: "my-id", params: { value: "hello" }, graph: { nodes: [], edges: [] } };');
    expect(await importWorkflowFile(file)).toEqual({ name: "example", workflow_id: "my-id", params: { value: "hello" }, graph: { nodes: [], edges: [] } });
  });

  it("resolves relative file reads from the DSL directory and restores cwd", async () => {
    const previous = process.cwd();
    const file = join(root, "relative-read.ts");
    await writeFile(join(root, "value.txt"), "hello");
    await writeFile(file, 'import { readFileSync } from "node:fs"; console.log(JSON.stringify({ nodes: [{ id: readFileSync("value.txt", "utf8") }], edges: [] }));');
    expect(await importWorkflowFile(file)).toEqual({ nodes: [{ id: "hello" }], edges: [] });
    expect(process.cwd()).toBe(previous);
  });

  it("restores console output after an import throws", async () => {
    const file = join(root, "broken.ts");
    const original = console.log;
    await writeFile(file, 'throw new Error("broken workflow");');
    await expect(importWorkflowFile(file)).rejects.toThrow("broken workflow");
    expect(console.log).toBe(original);
  });
  it("contains no npx subprocess call in CLI source", async () => {
    const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
    const files = await readdir(sourceRoot, { recursive: true });
    const sources = files.filter((file) => file.endsWith(".ts"));
    expect(sources.length).toBeGreaterThan(0);
    const call = /(?:spawn|spawnSync|exec|execSync|execFile|execFileSync)\s*\(\s*["'`]npx(?:\s|["'`])/;
    expect(call.test('execFileSync("npx", ["tsx", file])')).toBe(true);
    for (const file of sources) {
      expect(await readFile(join(sourceRoot, file), "utf8"), file).not.toMatch(call);
    }
  });
});

describe("plain Node DSL reload", () => {
  it("reloads CommonJS parent dependencies and cycles without a package manifest", async () => {
    const { spawn } = await import("node:child_process");
    const childFile = join(root, "plain-node.mjs");
    const helper = new URL("../src/workflow-file.ts", import.meta.url).href;
    const tsx = new URL("../../../node_modules/tsx/dist/esm/api/index.mjs", import.meta.url).href;
    await writeFile(childFile, `
      import { tsImport } from ${JSON.stringify(tsx)};
      import { mkdir, symlink, writeFile } from "node:fs/promises";
      import { join } from "node:path";
      const { importWorkflowFile } = await tsImport(${JSON.stringify(helper)}, import.meta.url);
      await mkdir(join(process.argv[2], "workflows"));
      await mkdir(join(process.argv[2], "lib"));
      const file = join(process.argv[2], "workflows", "workflow.ts");
      const dependency = join(process.argv[2], "lib", "value.ts");
      await writeFile(join(process.argv[2], "lib", "cycle.ts"), 'import "./value"; export const label = "loaded";');
      await writeFile(dependency, 'import "./cycle"; export const value = "first";');
      await writeFile(file, 'import { value } from "../lib/value"; console.log(JSON.stringify({ nodes: [{ id: value, file: __filename }], edges: [] }));');
      const first = await importWorkflowFile(file);
      const repeated = await importWorkflowFile(file);
      await writeFile(dependency, 'import "./cycle"; export const value = "second";');
      const changed = await importWorkflowFile(file);
      await writeFile(file, 'import { value } from "../lib/value"; throw new Error(value);');
      try { await importWorkflowFile(file); } catch {}
      await writeFile(dependency, 'import "./cycle"; export const value = "recovered";');
      await writeFile(file, 'import { value } from "../lib/value"; console.log(JSON.stringify({ nodes: [{ id: value, file: __filename }], edges: [] }));');
      const recovered = await importWorkflowFile(file);
      const packages = join(process.argv[2], "packages");
      const modules = join(process.argv[2], "node_modules");
      await mkdir(modules);
      for (const [name, type, code] of [
        ["test-package", "commonjs", 'globalThis.cjsCount = (globalThis.cjsCount || 0) + 1; exports.counter = globalThis.cjsCount;'],
        ["test-esm-package", "module", 'globalThis.esmCount = (globalThis.esmCount || 0) + 1; export const counter = globalThis.esmCount;']
      ]) {
        const target = join(packages, name);
        await mkdir(target, { recursive: true });
        await writeFile(join(target, "package.json"), JSON.stringify({ name, type, main: "index.js" }));
        await writeFile(join(target, "index.js"), code);
        await symlink(target, join(modules, name), "junction");
      }
      const identity = join(process.argv[2], "workflows", "identity.ts");
      await writeFile(identity, 'import { counter as cjs } from "test-package"; import { counter as esm } from "test-esm-package"; console.log(JSON.stringify({ nodes: [{ cjs, esm }], edges: [] }));');
      const linkedFirst = await importWorkflowFile(identity);
      const linkedSecond = await importWorkflowFile(identity);
      process.stdout.write(JSON.stringify([first, repeated, changed, recovered, linkedFirst, linkedSecond]));
    `);
    const child = spawn(process.execPath, [childFile, root], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let errors = "";
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { errors += chunk.toString(); });
    const code = await new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
    expect(code, errors).toBe(0);
    const workflowPath = await realpath(join(root, "workflows", "workflow.ts"));
    expect(JSON.parse(output)).toEqual([
      { nodes: [{ id: "first", file: workflowPath }], edges: [] },
      { nodes: [{ id: "first", file: workflowPath }], edges: [] },
      { nodes: [{ id: "second", file: workflowPath }], edges: [] },
      { nodes: [{ id: "recovered", file: workflowPath }], edges: [] },
      { nodes: [{ cjs: 1, esm: 1 }], edges: [] },
      { nodes: [{ cjs: 1, esm: 1 }], edges: [] }
    ]);
  });
});
