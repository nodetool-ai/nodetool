#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export function requireCapabilities(result, names, kind) {
  if (result.error) { throw result.error; }
  if (result.status !== 0) { throw new Error(`FFmpeg ${kind} query failed (${result.status}): ${result.stderr}`); }
  const available = new Set(result.stdout.split(/\r?\n/).map(line => line.trim().split(/\s+/)[1]));
  const missing = names.filter(name => !available.has(name));
  if (missing.length) { throw new Error(`FFmpeg is missing required ${kind}: ${missing.join(", ")}`); }
}

export function checkPrerequisites(ffmpeg = "ffmpeg") {
  const run = argument => spawnSync(ffmpeg, ["-hide_banner", argument], { encoding: "utf8" });
  requireCapabilities(run("-filters"), ["drawtext", "geq", "overlay", "scale", "setpts", "aevalsrc"], "filters");
  requireCapabilities(run("-encoders"), ["libx264", "libx264rgb", "libx265", "libvpx-vp9", "pcm_f32le", "pcm_s16le", "ffv1", "png"], "encoders");
  const require = createRequire(import.meta.url);
  for (const name of ["@nodetool-ai/node-sdk", "@nodetool-ai/base-nodes", "@nodetool-ai/cli"]) {
    const entry = require.resolve(name);
    if (!fs.existsSync(entry)) { throw new Error(`Build the server packages before native checks: missing ${entry}`); }
  }
  const Database = require("better-sqlite3");
  const database = new Database(":memory:");
  database.prepare("SELECT 1").get();
  database.close();
  console.log("Native CI prerequisites: FFmpeg capabilities, server packages and SQLite binding available");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { checkPrerequisites(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
