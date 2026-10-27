#!/usr/bin/env node
// Compare Package J fixtures with the web exporter. Outputs stay under build/.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");

export function parseArgs(argv) {
  const args = { bin: null, only: [], minPsnr: 40, json: false };
  for (let i = 0; i < argv.length; ++i) {
    const flag = argv[i];
    if (flag === "--json") { args.json = true; continue; }
    if (!["--bin", "--only", "--min-psnr"].includes(flag)) { throw new Error(`Unknown argument: ${flag}`); }
    const value = argv[++i];
    if (value === undefined || value.startsWith("--") || !value.trim()) { throw new Error(`Missing value for ${flag}`); }
    if (flag === "--bin") { args.bin = path.resolve(value); }
    if (flag === "--only") {
      args.only = value.split(",").map(name => name.trim());
      if (args.only.some(name => !name)) { throw new Error("--only requires nonempty fixture names"); }
    }
    if (flag === "--min-psnr") { args.minPsnr = Number(value); }
  }
  if (!args.bin) { throw new Error("--bin is required"); }
  if (!Number.isFinite(args.minPsnr) || args.minPsnr < 0) { throw new Error("--min-psnr must be a finite nonnegative number"); }
  return args;
}

export function comparisonPasses(psnr, minimum) {
  return typeof psnr === "number" && !Number.isNaN(psnr) && psnr >= minimum;
}

export function allComparisonsPass(results) {
  return results.length > 0 && results.every(result => result.pass === true);
}

function psnr(golden, native) {
  // Same RGB24 three-channel average as compare-golden.mjs. ffmpeg prints
  // filter statistics on stderr, even on a successful run.
  const output = execFileSync("bash", ["-c", 'exec ffmpeg -hide_banner -i "$0" -i "$1" -lavfi "[0:v]format=rgb24[a];[1:v]format=rgb24[b];[a][b]psnr" -f null - 2>&1', golden, native],
    { encoding: "utf8" });
  const match = /average:(inf|[0-9.]+)/.exec(output);
  if (!match) { throw new Error(`No PSNR for ${golden}`); }
  return match[1] === "inf" ? Infinity : Number(match[1]);
}

export function loadFixtures(directory, only) {
  const files = fs.readdirSync(directory).filter(name => name.endsWith(".json")).sort();
  const names = files.map(file => path.basename(file, ".json"));
  for (const name of only) {
    if (!names.includes(name)) { throw new Error(`Unknown fixture: ${name}`); }
  }
  const fixtures = files.filter(file => only.length === 0 || only.includes(path.basename(file, ".json")))
    .map(file => {
      const fixture = path.join(directory, file);
      const frames = JSON.parse(fs.readFileSync(fixture, "utf8")).goldenFrames;
      if (!Array.isArray(frames) || frames.length === 0 || frames.some(item =>
        !Number.isSafeInteger(item.frame) || item.frame < 0 || typeof item.criterion !== "string" || !item.criterion.trim()) ||
        new Set(frames.map(item => item.frame)).size !== frames.length) {
        throw new Error(`${file}: expected distinct nonnegative goldenFrames with an exit criterion`);
      }
      return { name: path.basename(file, ".json"), fixture, frames };
    });
  if (fixtures.length === 0) { throw new Error("No fixtures to compare"); }
  return fixtures;
}

export function main(argv) {
  const args = parseArgs(argv);
  const fixtures = loadFixtures(path.join(here, "fixtures"), args.only);
  const results = [];
  for (const { name, fixture, frames } of fixtures) {
    const frameList = frames.map(item => item.frame).join(",");
    const goldenOut = path.join(root, "build", "golden", `effects-${name}`);
    const nativeOut = path.join(root, "build", "native-stills", `effects-${name}`);
    let renderError;
    let operation = "golden-import";
    try {
      execFileSync(process.execPath, [path.join(root, "scripts", "golden-import.mjs"), fixture,
        "--frames", frameList, "--out", goldenOut], { stdio: ["ignore", "pipe", "pipe"] });
      // This path is constructed only from bundled fixture basenames.
      fs.rmSync(nativeOut, { recursive: true, force: true });
      operation = "native stills";
      execFileSync(args.bin, [fixture, "--stills", nativeOut, "--still-frames", frameList, "--decode", "sw"],
        { env: { ...process.env, QT_QPA_PLATFORM: process.env.QT_QPA_PLATFORM ?? "offscreen" }, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      renderError = `${operation} exited ${error.status ?? error.code ?? "unknown"}: ${String(error.stderr ?? error.message).trim().split(/\r?\n/).slice(-5).join(" | ")}`;
    }
    for (const { frame, criterion } of frames) {
      const row = { fixture: name, frame, criterion, psnr: null, pass: false };
      try {
        if (renderError) { throw new Error(renderError); }
        const file = `frame_${String(frame).padStart(6, "0")}.png`;
        const golden = path.join(goldenOut, "stills", file), native = path.join(nativeOut, file);
        if (!fs.existsSync(golden) || !fs.existsSync(native)) { throw new Error("Missing golden or native still"); }
        const value = psnr(golden, native);
        row.psnr = Number.isFinite(value) ? value : "inf";
        row.pass = comparisonPasses(value, args.minPsnr);
      } catch (error) { row.error = error.message.replace(/\r?\n/g, " | "); }
      results.push(row);
      console.log(args.json ? JSON.stringify(row) : `${name} frame ${frame}: PSNR ${row.psnr ?? "missing"} dB ${row.pass ? "PASS" : "FAIL"} (minimum ${args.minPsnr})${row.error ? ` ${row.error}` : ""}`);
    }
  }
  return allComparisonsPass(results) ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error(`check-effects: ${error.message}`); process.exitCode = 1; }
}
