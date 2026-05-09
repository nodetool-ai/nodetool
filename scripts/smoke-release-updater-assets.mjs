#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.argv[2] ?? "release-assets");
const expectedVersion = process.argv[3];
const channel = process.argv[4] === "nightly" ? "nightly" : "latest";
if (!expectedVersion) {
  console.error("Usage: smoke-release-updater-assets.mjs <asset-dir> <version> <latest|nightly>");
  process.exit(2);
}

function readTopLevelYamlString(raw, key) {
  const match = new RegExp(`^${key}:\\s*[\"']?([^\\r\\n\"']+)`, "m").exec(raw);
  return match?.[1]?.trim();
}

const manifests = [
  channel === "nightly" ? "nightly.yml" : "latest.yml",
  channel === "nightly" ? "nightly-mac.yml" : "latest-mac.yml",
  channel === "nightly" ? "nightly-linux.yml" : "latest-linux.yml",
];

for (const manifest of manifests) {
  const manifestPath = path.join(dir, manifest);
  const raw = fs.readFileSync(manifestPath, "utf8");
  const version = readTopLevelYamlString(raw, "version");
  const artifactPath = readTopLevelYamlString(raw, "path");
  const sha512 = readTopLevelYamlString(raw, "sha512");

  if (version !== expectedVersion) {
    throw new Error(`${manifest} version ${version ?? "<missing>"} does not match ${expectedVersion}`);
  }
  if (!artifactPath) {
    throw new Error(`${manifest} is missing path`);
  }
  if (!sha512) {
    throw new Error(`${manifest} is missing sha512`);
  }
  const artifact = path.join(dir, path.basename(artifactPath));
  if (!fs.existsSync(artifact)) {
    throw new Error(`${manifest} points to missing artifact ${artifactPath}`);
  }
  console.log(`${manifest}: ${version} -> ${artifactPath}`);
}

console.log(`Updater asset smoke test passed for ${channel} ${expectedVersion}.`);
