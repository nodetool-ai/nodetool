#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.argv[2] ?? "release-assets");
const channel = process.argv[3] === "nightly" ? "nightly" : "latest";
const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
const has = (predicate) => files.some(predicate);
const required = [
  channel === "nightly" ? "nightly.yml" : "latest.yml",
  channel === "nightly" ? "nightly-mac.yml" : "latest-mac.yml",
  channel === "nightly" ? "nightly-linux.yml" : "latest-linux.yml",
];
const missing = required.filter((file) => !files.includes(file));

const checks = [
  ["Windows installer", (f) => /^Nodetool-Setup-.+\.exe$/.test(f)],
  ["macOS DMG", (f) => f.endsWith(".dmg")],
  ["macOS zip", (f) => f.endsWith(".zip") && f.includes("Nodetool-")],
  ["Linux AppImage", (f) => f.endsWith(".AppImage")],
  ["web archive", (f) => /^nodetool-web-.+\.zip$/.test(f)],
];
for (const [label, predicate] of checks) {
  if (!has(predicate)) missing.push(label);
}

if (missing.length > 0) {
  console.error(`Release asset validation failed for ${channel} channel.`);
  console.error(`Directory: ${dir}`);
  console.error(`Missing: ${missing.join(", ")}`);
  console.error(`Found:\n${files.map((file) => `  - ${file}`).join("\n")}`);
  process.exit(1);
}

console.log(`Release asset validation passed for ${channel} channel.`);
console.log(files.map((file) => `  - ${file}`).join("\n"));
