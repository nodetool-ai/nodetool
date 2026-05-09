#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.argv[2] ?? "release-assets");
const expectedVersion = process.argv[3];
const channelArg = process.argv[4];
const channel = channelArg === "nightly" ? "nightly" : channelArg === "stable" || channelArg === "latest" ? "latest" : null;

if (!expectedVersion || channel == null) {
  console.error("Usage: smoke-release-updater-assets.mjs <asset-dir> <version> <stable|nightly>");
  process.exit(2);
}

const manifests = [
  channel === "nightly" ? "nightly.yml" : "latest.yml",
  channel === "nightly" ? "nightly-mac.yml" : "latest-mac.yml",
  channel === "nightly" ? "nightly-linux.yml" : "latest-linux.yml",
];
const parseManifest = (manifestPath) => {
  const fields = {};
  const text = fs.readFileSync(manifestPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(trimmed);
    if (!match) {
      continue;
    }
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fields[match[1]] = value;
  }
  return fields;
};

const getSha512Base64 = (filePath) =>
  crypto
    .createHash("sha512")
    .update(fs.readFileSync(filePath))
    .digest("base64");

const ensurePathInDir = (baseDir, filePath) => {
  const resolvedBaseDir = path.resolve(baseDir);
  const resolvedFilePath = path.resolve(baseDir, filePath);
  if (resolvedFilePath !== resolvedBaseDir && !resolvedFilePath.startsWith(`${resolvedBaseDir}${path.sep}`)) {
    throw new Error(`Manifest path escapes asset directory: ${filePath}`);
  }
  return resolvedFilePath;
};

for (const manifest of manifests) {
  const manifestPath = path.join(dir, manifest);
  const doc = parseManifest(manifestPath);
  if (Object.keys(doc).length === 0) {
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
  const artifact = ensurePathInDir(dir, doc.path);
  if (!fs.existsSync(artifact)) {
    throw new Error(`${manifest} points to missing artifact ${doc.path}`);
  }
  if (!fs.statSync(artifact).isFile()) {
    throw new Error(`${manifest} points to a non-file artifact ${doc.path}`);
  }
  const actualSha512 = getSha512Base64(artifact);
  if (actualSha512 !== doc.sha512) {
    throw new Error(`${manifest} sha512 mismatch for ${doc.path}`);
  }
  console.log(`${manifest}: ${doc.version} -> ${doc.path}`);
}

console.log(`Updater asset smoke test passed for ${channel} ${expectedVersion}.`);
