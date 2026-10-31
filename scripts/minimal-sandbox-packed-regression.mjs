import assert from "node:assert/strict";
import { readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { builtinModules } from "node:module";
import ts from "typescript";
import { inspectMinimalTree, installedPackageDirectories } from "./minimal-dependency-guard.mjs";

// Run after the packed Code smoke, against that same clean consumer.
export function sandboxPackedRegression(consumer) {
  const directories = installedPackageDirectories(consumer);
  assert.ok(directories.length > 0);
  const names = directories.map(path => JSON.parse(readFileSync(join(path, "package.json"), "utf8")).name);
  assert.equal(names.some(name => name === "typescript" || name.startsWith("@typescript/")), false, "Compiler physically installed");
  assert.equal(names.includes("@sebastianwessel/quickjs"), false, "Unused compiler helper package installed");
  const options = { entryPackageName: "@nodetool-ai/server-minimal", profile: "sandbox" };
  const inspect = () => inspectMinimalTree(directories, options);
  const inspection = inspect();
  assert.ok(inspection.inspectedFiles > 0);
  const sandbox = directories.find(path => JSON.parse(readFileSync(join(path, "package.json"), "utf8")).name === "@nodetool-ai/sandbox-runtime");
  assert.ok(sandbox);
  // Resolve shipped declaration imports from the consumer, using the test runner's
  // compiler without installing compiler tooling into the production consumer.
  let declarations = 0;
  for (const file of readdirSync(sandbox, { recursive: true }).filter(file => file.endsWith(".d.ts"))) {
    const path = join(sandbox, file);
    const parsed = ts.preProcessFile(readFileSync(path, "utf8"), true);
    for (const { fileName } of parsed.importedFiles) {
      if (fileName.startsWith("node:") || builtinModules.includes(fileName)) { continue; }
      const resolved = ts.resolveModuleName(fileName, path, { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext }, ts.sys, undefined, undefined, ts.ModuleKind.ESNext).resolvedModule;
      assert.ok(resolved, `Unresolved public declaration import ${fileName} in ${path}`);
    }
    declarations++;
  }
  assert.ok(declarations > 0);
  const manifestPath = join(sandbox, "package.json");
  const original = readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(original);
  try {
    manifest.dependencies.typescript = "*";
    writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.throws(inspect, /Forbidden minimal dependency typescript/);
  } finally { writeFileSync(manifestPath, original); }
  for (const [extension, source] of [["js", 'export const compiler = import("typescript");'], ["d.ts", 'export type Compiler = import("typescript").CompilerOptions;']]) {
    const path = join(sandbox, `compiler-regression.${extension}`);
    try {
      writeFileSync(path, source);
      assert.throws(inspect, /Forbidden minimal dependency typescript/);
    } finally { rmSync(path, { force: true }); }
  }
  assert.deepEqual(inspect(), inspection);
  return { ...inspection, declarations, compilerAbsent: true, forbiddenManifestRejected: true, forbiddenJavaScriptRejected: true, forbiddenDeclarationRejected: true, restored: true };
}
