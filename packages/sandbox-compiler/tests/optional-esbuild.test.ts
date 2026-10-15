import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";

it("imports the compiler without esbuild and reports a recoverable missing runtime on compilation", () => {
  const dir = mkdtempSync(join(tmpdir(), "compiler-optional-"));
  try {
    mkdirSync(join(dir, "node_modules", "fixture"), { recursive: true });
    writeFileSync(join(dir, "node_modules", "fixture", "package.json"), JSON.stringify({ name: "fixture", type: "module", main: "index.js" }));
    writeFileSync(join(dir, "node_modules", "fixture", "index.js"), "export default 42;");
    const script = join(dir, "check.mjs");
    writeFileSync(script, `
import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
let mode = 'missing';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'esbuild' && mode !== 'ready') {
    const error = new Error(mode === 'missing' ? "Cannot find package 'esbuild'" : "Cannot find package 'broken-transitive'");
    error.code = 'ERR_MODULE_NOT_FOUND';
    throw error;
  }
  return next(specifier, context);
} });
const compiler = await import(${JSON.stringify(pathToFileURL(resolve(import.meta.dirname, "../src/index.ts")).href)});
const bundle = await import(${JSON.stringify(pathToFileURL(resolve(import.meta.dirname, "../src/bundle.ts")).href)});
const cache = await import(${JSON.stringify(pathToFileURL(resolve(import.meta.dirname, "../src/cache.ts")).href)});
assert.equal(cache.createCachedNpmLookup(new cache.CompiledModuleCache(${JSON.stringify(join(dir, "cache"))}))({ packName: 'fixture', packDir: ${JSON.stringify(dir)}, specifier: 'fixture', npmName: 'fixture' }), undefined);
await assert.rejects(compiler.compileNpmModule({ packDir: ${JSON.stringify(dir)}, npmName: 'fixture', noCache: true }), error => error.name === 'MissingRuntimePackageError' && error.details.runtimePackage === 'esbuild' && error.details.missing === 'esbuild');
await assert.rejects(bundle.currentOptionsDigest(), error => error.name === 'MissingRuntimePackageError');
mode = 'transitive';
await assert.rejects(bundle.currentOptionsDigest(), error => error.name !== 'MissingRuntimePackageError' && error.message.includes('broken-transitive'));
mode = 'ready';
assert.match(await bundle.currentOptionsDigest(), /^[a-f0-9]{64}$/);
const built = await bundle.bundleNpmModule(${JSON.stringify(dir)}, 'fixture');
assert.equal(built.status, 'bundled');
`);
    const result = spawnSync(process.execPath, ["--import", "tsx", script], {
      cwd: resolve(import.meta.dirname, "../../.."),
      env: { ...process.env, NODETOOL_OPTIONAL_NODE_MODULES: "", NODETOOL_HOST: "cli" },
      encoding: "utf8", timeout: 30000
    });
    expect(result.status, result.stderr).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 40000);
