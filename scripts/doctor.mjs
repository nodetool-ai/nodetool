#!/usr/bin/env node
/** Report local environment state without changing anything. */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const has = (p, yes, no) => (existsSync(resolve(root, p)) ? yes : no);
const row = (k, v) => console.log(`  ${k.padEnd(16)}${v}`);

function blender() {
  const candidates = [
    process.env.BLENDER_PATH,
    "blender",
    "/Applications/Blender.app/Contents/MacOS/Blender",
  ].filter(Boolean);
  for (const bin of candidates) {
    const r = spawnSync(bin, ["--version"], { encoding: "utf8" });
    if (r.status === 0) return r.stdout.split("\n")[0];
  }
  return "not found (nodetool.blender nodes need Blender 5.2+, set BLENDER_PATH)";
}

function portState(port) {
  return new Promise((done) => {
    const s = net.createConnection({ host: "127.0.0.1", port });
    s.setTimeout(1000);
    s.on("connect", () => (s.destroy(), done("in use")));
    s.on("timeout", () => (s.destroy(), done("free")));
    s.on("error", () => done("free"));
  });
}

const port = Number(process.env.PORT ?? 7777);
console.log("\n==> Environment");
row("node", process.version);
row(".env", has(".env", "present", "missing, created by npm run bootstrap"));
row("node_modules", has("node_modules", "present", "missing, installed by npm run bootstrap"));
row("packages built", has("packages/base-nodes/dist", "yes", "no, built by npm run bootstrap"));
row("better-sqlite3", has("node_modules/better-sqlite3/build", "built", "not built"));
row("blender", blender());
row(`port ${port}`, await portState(port));
