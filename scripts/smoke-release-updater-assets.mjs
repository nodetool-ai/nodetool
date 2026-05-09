#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.argv[2] ?? "release-assets");
const expectedVersion = process.argv[3];
const channelArg = process.argv[4];
const channel = (() => {
  if (channelArg === "nightly") return "nightly";
  if (channelArg === "stable" || channelArg === "latest") return "latest";
  return null;
})();

if (!expectedVersion || channel === null) {
  console.error("Usage: smoke-release-updater-assets.mjs <asset-dir> <version> <stable|nightly>");
  process.exit(2);
}

const MANIFEST_FIELD_PATTERN = /^([A-Za-z0-9_-]+):\s*([^\r\n]*)$/;

// Electron-updater manifests are flat YAML documents for the fields we care
// about. Parse only top-level scalar fields so this script has no npm install
// dependency in the publish job.
const parseManifest = (manifestPath) => {
  const fields = {};
  const text = fs.readFileSync(manifestPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#") || trimmed === "---") {
      continue;
    }
    if (line !== line.trimStart()) {
      continue;
    }
    const match = MANIFEST_FIELD_PATTERN.exec(trimmed);
    if (!match) {
      throw new Error(`Invalid manifest line in ${path.basename(manifestPath)}: ${line}`);
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
  const normalizedFilePath = path.normalize(filePath);
  const resolvedFilePath = path.resolve(baseDir, normalizedFilePath);
  const relativePath = path.relative(resolvedBaseDir, resolvedFilePath);
  if (
    relativePath.length === 0 ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`Manifest path escapes asset directory: ${filePath}`);
  }
  return resolvedFilePath;
};

const manifests = [
  channel === "nightly" ? "nightly.yml" : "latest.yml",
  channel === "nightly" ? "nightly-mac.yml" : "latest-mac.yml",
  channel === "nightly" ? "nightly-linux.yml" : "latest-linux.yml",
];

for (const manifest of manifests) {
  const manifestPath = path.join(dir, manifest);
  const doc = parseManifest(manifestPath);
  if (Object.keys(doc).length === 0) {
    throw new Error(`${manifest} is empty or invalid`);
  }
  if (doc.version !== expectedVersion) {
    throw new Error(`${manifest} version ${doc.version ?? "<missing>"} does not match ${expectedVersion}`);
  }
  if (!doc.path) {
    throw new Error(`${manifest} is missing path`);
  }
  if (!doc.sha512) {
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
