#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const NIGHTLY_CHANNEL = "nightly";
const STABLE_CHANNEL = "stable";

const dir = path.resolve(process.argv[2] ?? "release-assets");
const inputChannel = process.argv[3] ?? STABLE_CHANNEL;
const channel = inputChannel === NIGHTLY_CHANNEL ? NIGHTLY_CHANNEL : STABLE_CHANNEL;
// Stable channel publishes latest* updater manifests.
const manifestPrefix = channel === NIGHTLY_CHANNEL ? NIGHTLY_CHANNEL : "latest";
let files = [];
try {
  if (fs.existsSync(dir)) {
    const stats = fs.statSync(dir);
    if (!stats.isDirectory()) {
      throw new Error(`Path exists but is not a directory: ${dir}`);
    }
    files = fs.readdirSync(dir);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Release asset validation failed for ${inputChannel} channel.`);
  console.error(`Directory: ${dir}`);
  console.error(`Unable to read directory: ${message}`);
  console.error("Error details:", error);
  process.exit(1);
}
const has = (predicate) => files.some(predicate);
const required = [
  `${manifestPrefix}.yml`,
  `${manifestPrefix}-mac.yml`,
  `${manifestPrefix}-linux.yml`,
];
const missingFiles = required.filter((file) => !files.includes(file));

const checks = [
  ["Windows installer", (f) => /^Nodetool-Setup-.+\.exe$/.test(f)],
  ["macOS DMG", (f) => f.endsWith(".dmg")],
  [
    "macOS zip",
    (f) => f.endsWith(".zip") && f.includes("Nodetool-") && !/win-unpacked/i.test(f),
  ],
  ["Linux AppImage", (f) => f.endsWith(".AppImage")],
  ["blockmap", (f) => f.endsWith(".blockmap")],
  ["web archive", (f) => /^nodetool-web-.+\.zip$/.test(f)],
  ["MCP bundle", (f) => f.endsWith(".mcpb")],
];
const missingArtifacts = [];
for (const [label, predicate] of checks) {
  if (!has(predicate)) {
    missingArtifacts.push(label);
  }
}

if (missingFiles.length > 0 || missingArtifacts.length > 0) {
  console.error(`Release asset validation failed for ${inputChannel} channel.`);
  console.error(`Directory: ${dir}`);
  if (missingFiles.length > 0) {
    console.error(`Missing manifest files: ${missingFiles.join(", ")}`);
  }
  if (missingArtifacts.length > 0) {
    console.error(`Missing artifact types: ${missingArtifacts.join(", ")}`);
  }
  console.error(`Found:\n${files.map((file) => `  - ${file}`).join("\n")}`);
  process.exit(1);
}

console.log(`Release asset validation passed for ${inputChannel} channel.`);
console.log(files.map((file) => `  - ${file}`).join("\n"));
