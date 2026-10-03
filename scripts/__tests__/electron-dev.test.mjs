import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";

const temporaryDirectories = [];
afterEach(() => {
  for (const dir of temporaryDirectories.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function launch(pin) {
  const dir = mkdtempSync(join(tmpdir(), "electron-dev-test-"));
  temporaryDirectories.push(dir);
  mkdirSync(join(dir, "scripts"));
  copyFileSync(new URL("../electron-dev.mjs", import.meta.url), join(dir, "scripts/electron-dev.mjs"));
  writeFileSync(join(dir, ".nvmrc"), `${pin}\n`);
  const capture = join(dir, "spawn.json");
  const preload = join(dir, "mock-spawn.mjs");
  writeFileSync(preload, `import childProcess from "node:child_process";
import { writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
childProcess.spawnSync = (command, args, options) => {
  writeFileSync(${JSON.stringify(capture)}, JSON.stringify({command, args, env: options.env}));
  return {status: 0};
};
syncBuiltinESMExports();
`);
  const result = spawnSync(process.execPath, ["--import", preload, "scripts/electron-dev.mjs"], {
    cwd: dir, encoding: "utf8", env: {...process.env, NODETOOL_NODE: "/stale/node"}
  });
  return {result, capture};
}

it("launches with the pinned Node and passes that executable to the backend", () => {
  const {result, capture} = launch(process.versions.node);
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  const child = JSON.parse(readFileSync(capture, "utf8"));
  expect(child.env.NODETOOL_NODE).toBe(process.execPath);
});

it("rejects a different Node version before starting development servers", () => {
  const {result} = launch("99.0.0");
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Node.js 99.0.0 required");
  expect(result.stderr).toContain("nvm use");
});
