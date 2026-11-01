import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) { rmSync(dir, { recursive: true, force: true }); } });
function runMissing(args: string[], preload?: string, built = false) {
  const home = mkdtempSync(join(tmpdir(), "nodetool-runtime-cli-"));
  directories.push(home);
  const env = {
    HOME: home, USERPROFILE: home, APPDATA: home, XDG_DATA_HOME: home, TMPDIR: home, TMP: home, TEMP: home,
    NODETOOL_HOST: "cli", NODETOOL_ENV: "development", NODETOOL_LOG_LEVEL: "error",
    PATH: join(home, "empty-path"), NODETOOL_CONDA_ENV: join(home, "absent-conda"),
    NODETOOL_PYTHON: join(home, "absent-python"), SECRETS_MASTER_KEY: "a".repeat(64)
  };
  return spawnSync(process.execPath, [
    ...(preload ? ["--import", preload] : []),
    ...(built ? [] : ["--import", "tsx"]),
    resolve(import.meta.dirname, built ? "../dist/nodetool.js" : "../src/nodetool.ts"), ...args
  ], {
    cwd: resolve(import.meta.dirname, "../../.."), env, encoding: "utf8", timeout: 30000
  });
}

describe("actual CLI missing runtime output", () => {
  it.each(["run", "test"])("reports a missing sandbox host dependency from a returned JS script %s failure", (command) => {
    const dir = mkdtempSync(join(tmpdir(), "nodetool-xlsx-script-"));
    directories.push(dir);
    const hook = join(dir, "hide-exceljs.mjs");
    writeFileSync(hook, `import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'exceljs') { const error = new Error("Cannot find package 'exceljs'"); error.code = 'ERR_MODULE_NOT_FOUND'; throw error; }
  return next(specifier, context);
} });`);
    const file = join(dir, "script.json");
    writeFileSync(file, JSON.stringify({ name: "Missing xlsx", document: {
      schemaVersion: 1, code: 'import { parse } from "@nodetool-ai/sandbox-xlsx"; return await parse(new Uint8Array([1, 2, 3]));',
      inputs: [], outputs: [], packages: [], secrets: [], timeoutSeconds: 10,
      tests: [{ name: "Missing dependency", inputs: {}, expect: {} }]
    } }));
    const result = runMissing(["jsscript", command, file, "--json"], hook, true);
    expect(result.status, result.stderr).toBe(3);
    expect(JSON.parse(result.stdout)).toMatchObject({ error: "missing_runtime_package", runtimePackage: "office-documents", missing: "exceljs", reason: "missing", managed: "nodetool packs add office-documents --yes" });
    expect(result.stderr).toContain("nodetool packs add office-documents --yes");
  }, 40000);
  it("keeps an ordinary saved-case assertion failure on exit1", () => {
    const dir = mkdtempSync(join(tmpdir(), "nodetool-script-mismatch-"));
    directories.push(dir);
    const file = join(dir, "script.json");
    writeFileSync(file, JSON.stringify({ name: "Mismatch", document: {
      schemaVersion: 1, code: 'await output("value", 1);', inputs: [], outputs: [{ name: "value", type: "int" }],
      packages: [], secrets: [], timeoutSeconds: 10,
      tests: [{ name: "Wrong value", inputs: {}, expect: { value: 2 } }]
    } }));
    const result = runMissing(["jsscript", "test", file, "--json"], undefined, true);
    expect(result.status, result.stderr).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, passed: 0, failed: 1, results: [{ mismatches: [{ output: "value", expected: 2, actual: 1 }] }] });
  }, 40000);

});
