// Exercise deployment from an executable alone, without the developer's PATH.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [binary, deployScript, cmake, mediaDirectories = ""] = process.argv.slice(2);
assert.equal(process.platform, "win32");
assert.ok(binary && deployScript && cmake, "Expected executable, deployment script, and CMake");
const directory = mkdtempSync(join(tmpdir(), "node-editor-deploy-"));
try {
  const executable = join(directory, "nodetool-node-editor.exe");
  copyFileSync(binary, executable);
  const deployed = spawnSync(cmake, [`-DEDITOR_BINARY=${executable}`, "-P", deployScript],
    { encoding: "utf8", timeout: 180_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  assert.equal(deployed.status, 0, deployed.error?.message ?? deployed.stdout + deployed.stderr);
  assert.ok(existsSync(join(directory, "guest.js")), "Missing guest bundle");
  assert.ok(existsSync(join(directory, "vcruntime140.dll")), "Missing compiler runtime");
  assert.ok(existsSync(join(directory, "platforms", "qwindows.dll")), "Missing Windows platform plugin");
  // Qt's FFmpeg DLLs share names with the runner's. The deployed copy must be the runner's.
  const ffmpeg = /^(avcodec|avformat|avutil|avfilter|avdevice|swscale|swresample)(-\d+)?\.dll$/i;
  const media = mediaDirectories.split("|").filter(Boolean);
  const staged = readdirSync(directory).filter((name) => ffmpeg.test(name));
  if (media.length > 0) assert.ok(staged.length > 0, "Missing graph runner FFmpeg DLLs");
  for (const name of staged) {
    const source = media.map((dir) => join(dir, name)).find(existsSync);
    if (!source) continue;
    assert.ok(readFileSync(join(directory, name)).equals(readFileSync(source)), `${name} is not the graph runner's copy`);
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^(path|qt_.*|qml.*|nodetool_guest_bundle|nodetool_local_runner)$/i.test(key)));
  env.PATH = `${process.env.SystemRoot}\\System32;${process.env.SystemRoot}`;
  env.QT_QPA_PLATFORM = "windows";
  env.QT_QUICK_BACKEND = "software";
  const screenshot = join(directory, "smoke.png");
  const launched = spawnSync(executable, ["--offline", "--screenshot", screenshot],
    { cwd: directory, env, encoding: "utf8", timeout: 60_000, windowsHide: true });
  assert.equal(launched.status, 0, launched.error?.message ?? launched.stdout + launched.stderr);
  assert.ok(statSync(screenshot).size > 0, "Editor did not render a screenshot");
  console.log("Fresh Windows deployment launched without dependency PATH or an explicit guest path.");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
