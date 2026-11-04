import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [directoryArg, executableArg] = process.argv.slice(2);
if (!directoryArg || !executableArg) {
  throw new Error("Usage: capture.mjs <prepared-directory> <installed-player>");
}
const directory = resolve(directoryArg), executable = resolve(executableArg);
const linux = process.platform === "linux";
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const routePath = resolve(directory, "inputs.json");
const routeBytes = await readFile(routePath), route = JSON.parse(routeBytes);
assert.ok(Array.isArray(route) && route.length > 0, "Capture requires a verified route");
const reports = [];
for (const [tick, name] of [[0, "start"], [Math.floor(route.length / 2), "facility"], [route.length, "finish"]]) {
  const image = resolve(directory, `${name}.png`);
  const args = [resolve(directory, "game.json"), "--assets-dir", directory,
    "--inputs", routePath, "--capture", image, "--tick", String(tick),
    "--width", "1280", "--height", "720"];
  const env = { ...process.env };
  if (linux) {
    env.QT_QPA_PLATFORM = "xcb";
    env.QSG_RHI_BACKEND ??= "vulkan";
    delete env.DISPLAY;
    delete env.LD_PRELOAD;
  }
  const child = spawn(linux ? "xvfb-run" : executable,
    linux ? ["-a", "-e", resolve(directory, `xvfb-${name}.log`), executable, ...args] : args,
    { env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", bytes => { stdout += bytes; });
  child.stderr.on("data", bytes => { stderr += bytes; });
  const status = await new Promise((accept, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => { accept({ code, signal }); });
  });
  await writeFile(resolve(directory, `capture-${name}.json`), stdout);
  await writeFile(resolve(directory, `capture-${name}.log`), stderr);
  assert.equal(status.code, 0, `Capture ${name}: ${JSON.stringify(status)} ${stderr}`);
  const report = JSON.parse(stdout);
  assert.equal(report.tick, tick);
  assert.equal(report.width, 1280);
  assert.equal(report.height, 720);
  reports.push({ name, tick, launcherPid: child.pid, ...status, image,
    imageDigest: digest(await readFile(image)), report });
}
const evidence = { executable, playerDigest: digest(await readFile(executable)),
  environment: { backendRequested: process.env.QSG_RHI_BACKEND ?? (linux ? "vulkan" : "platform-default"), softwareDriverThreads: process.env.LP_NUM_THREADS ?? null },
  documentDigest: digest(await readFile(resolve(directory, "game.json"))),
  routeDigest: digest(routeBytes), reports };
await writeFile(resolve(directory, "capture-evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify({ valid: true, reports: reports.map(({ name, tick, imageDigest }) => ({ name, tick, imageDigest })) }));
