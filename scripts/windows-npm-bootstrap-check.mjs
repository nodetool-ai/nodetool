import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findNpmCli, installerNpmVersion, runInstallerNpm, runNpm } from "../packages/pack-manager/src/npm-runner.ts";

if (process.platform !== "win32") { throw new Error("This check requires native Windows"); }
const base = mkdtempSync(join(tmpdir(), "npm-bootstrap-check-"));
try {
  const cli = findNpmCli(); assert(cli, "npm-cli.js must be installed beside the selected Node runtime");
  const npm = (args, cwd = base) => execFileSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });
  const source = join(base, "source"); mkdirSync(source);
  const marker = "node -e \"require('fs').writeFileSync('metadata.json',JSON.stringify({init:process.env.INIT_CWD,cwd:process.cwd()}))\"";
  writeFileSync(join(source, "package.json"), JSON.stringify({ name: "native-bootstrap-fixture", version: "1.0.0", scripts: { install: marker } }));
  const packed = JSON.parse(npm(["pack", "--json", "--ignore-scripts", `--cache=${join(base, "pack-cache")}`], source));
  const tarball = join(source, packed[0].filename);
  const directory = join(base, ...Array.from({ length: 7 }, (_, i) => `long-${i}-${"x".repeat(35)}`));
  mkdirSync(directory, { recursive: true });
  const root = realpathSync(directory); assert(root.length > 260, "Fixture must exceed MAX_PATH");
  const original = '{"name":"short-parent","version":"1.0.0"}';
  writeFileSync(join(base, "package.json"), original);
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "long-project", version: "1.0.0", scripts: { record: marker } }));
  writeFileSync(join(root, "cert.pem"), "fixture certificate");
  writeFileSync(join(root, ".npmrc"), "registry=https://fixture.invalid/\ncafile=./cert.pem\ncache=./npm-cache\n");
  const version = await installerNpmVersion(root);
  assert.equal(version, process.env["MATRIX_NPM_VERSION"]);
  assert.equal((await runInstallerNpm(root, ["config", "get", "cafile"], { mode: "local" })).trim(), join(root, "cert.pem"));
  assert.equal((await runInstallerNpm(root, ["config", "get", "cache"], { mode: "local" })).trim(), join(root, "npm-cache"));
  await runInstallerNpm(root, ["install", tarball], { mode: "local" });
  assert(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).dependencies["native-bootstrap-fixture"]);
  assert.equal(JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")).packages["node_modules/native-bootstrap-fixture"].version, "1.0.0");
  assert(readdirSync(join(root, "npm-cache/_cacache/content-v2")).length > 0);
  assert.equal(readFileSync(join(base, "package.json"), "utf8"), original);
  assert.throws(() => readFileSync(join(base, "package-lock.json")), { code: "ENOENT" });
  const packageRoot = join(root, "node_modules/native-bootstrap-fixture");
  assert.throws(() => readFileSync(join(packageRoot, "metadata.json")), { code: "ENOENT" });
  await runNpm(root, ["run", "record"], { mode: "local", scriptPolicy: "user" });
  await runInstallerNpm(root, ["rebuild", "native-bootstrap-fixture"], { mode: "local", rebuild: true });
  const identity = path => { const value = statSync(path, { bigint: true }); assert.notEqual(value.ino, 0n); return [value.dev, value.ino]; };
  for (const target of [root, packageRoot]) {
    const metadata = JSON.parse(readFileSync(join(target, "metadata.json"), "utf8"));
    assert.equal(metadata.init, root);
    assert.deepEqual(identity(metadata.cwd), identity(target));
  }
  console.log(JSON.stringify({ check: "native-windows-npm-bootstrap", node: process.version, npm: version,
    rootLength: root.length, relativeConfig: true, targetManifests: true, initCwd: true, nativeLifecycle: true }));
} finally { rmSync(base, { recursive: true, force: true }); }
