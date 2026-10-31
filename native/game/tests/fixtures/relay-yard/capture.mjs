import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "./adapt.mjs";

const [directory, executable] = process.argv.slice(2).map(value => resolve(value));
if (!directory || !executable) { throw new Error("Usage: capture.mjs <adapted-directory> <installed-player>"); }
const inputs = fileURLToPath(new URL("completion.inputs.json", import.meta.url)), reports = [];
for (const [tick, name] of [[0, "start"], [90, "mid"], [165, "finish"], [166, "finish-orbit"]]) {
  const recorded = name === "finish-orbit" ? fileURLToPath(new URL("finish-orbit.inputs.json", import.meta.url)) : inputs;
  const args = [resolve(directory, "game.json"), "--assets-dir", directory, "--inputs", recorded, "--capture", resolve(directory, `${name}.png`), "--tick", String(tick), "--width", "1280", "--height", "720"];
  const env = { ...process.env, QT_QPA_PLATFORM: "xcb", QSG_RHI_BACKEND: "vulkan" }; delete env.DISPLAY; delete env.LD_PRELOAD;
  const launcher = process.platform === "linux" ? "xvfb-run" : executable;
  const child = spawn(launcher, process.platform === "linux" ? ["-a", "-e", resolve(directory, `xvfb-${name}.log`), executable, ...args] : args, { env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = ""; child.stdout.on("data", bytes => stdout += bytes); child.stderr.on("data", bytes => stderr += bytes);
  const status = await new Promise((accept, reject) => { child.on("error", reject); child.on("exit", (code, signal) => accept({ code, signal })); });
  await writeFile(resolve(directory, `capture-${name}.log`), stderr); await writeFile(resolve(directory, `capture-${name}.json`), stdout);
  if (status.code !== 0) { throw new Error(`Native capture ${name} failed: ${JSON.stringify(status)} ${stderr}`); }
  const report = JSON.parse(stdout); if (report.tick !== tick || report.width !== 1280 || report.height !== 720 || report.qt !== "6.12.0") { throw new Error("Unexpected installed capture profile"); }
  reports.push({ tick, name, launcherPid: child.pid, exitCode: status.code, routeDigest: sha256(await readFile(recorded)), imageDigest: sha256(await readFile(resolve(directory, `${name}.png`))), report });
}
await writeFile(resolve(directory, "capture-evidence.json"), JSON.stringify({ processId: process.pid, executable, playerDigest: sha256(await readFile(executable)), documentDigest: sha256(await readFile(resolve(directory, "game.json"))), routeDigest: sha256(await readFile(inputs)), reports }, null, 2) + "\n");
console.log(JSON.stringify({ valid: true, reports: reports.map(({ tick, name, launcherPid, imageDigest }) => ({ tick, name, launcherPid, imageDigest })) }));
