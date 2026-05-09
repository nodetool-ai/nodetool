#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const dir = path.resolve(process.argv[2] ?? "release-assets");
const expectedVersion = process.argv[3];
const channel = process.argv[4] === "nightly" ? "nightly" : "latest";
if (!expectedVersion) {
  console.error("Usage: smoke-release-updater-assets.mjs <asset-dir> <version> <latest|nightly>");
  process.exit(2);
}

const manifests = [
  channel === "nightly" ? "nightly.yml" : "latest.yml",
  channel === "nightly" ? "nightly-mac.yml" : "latest-mac.yml",
  channel === "nightly" ? "nightly-linux.yml" : "latest-linux.yml",
];

for (const manifest of manifests) {
  const manifestPath = path.join(dir, manifest);
  const doc = yaml.load(fs.readFileSync(manifestPath, "utf8"));
  if (!doc || typeof doc !== "object") {
    throw new Error(`${manifest} is empty or invalid`);
  }
  if (doc.version !== expectedVersion) {
    throw new Error(`${manifest} version ${doc.version} does not match ${expectedVersion}`);
  }
  if (typeof doc.path !== "string" || doc.path.length === 0) {
    throw new Error(`${manifest} is missing path`);
  }
  if (typeof doc.sha512 !== "string" || doc.sha512.length === 0) {
    throw new Error(`${manifest} is missing sha512`);
  }
  const artifact = path.join(dir, path.basename(doc.path));
  if (!fs.existsSync(artifact)) {
    throw new Error(`${manifest} points to missing artifact ${doc.path}`);
  }
  console.log(`${manifest}: ${doc.version} -> ${doc.path}`);
}

console.log(`Updater asset smoke test passed for ${channel} ${expectedVersion}.`);
