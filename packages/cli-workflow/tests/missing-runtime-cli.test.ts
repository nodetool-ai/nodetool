import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  it("reports a Python-pack workflow with an unavailable interpreter instead of an unknown node", () => {
    const dir = mkdtempSync(join(tmpdir(), "nodetool-python-graph-"));
    directories.push(dir);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "graph.json");
    writeFileSync(file, JSON.stringify({ nodes: [{ id: "python", type: "huggingface.test.Unavailable", properties: {} }], edges: [] }));
    const result = runMissing(["workflows", "run", file, "--json"]);
    expect(result.status, result.stderr).toBe(3);
    expect(JSON.parse(result.stdout)).toMatchObject({ error: "missing_runtime_package", runtimePackage: "python", missing: "Python worker", reason: "missing" });
  }, 40000);
});
