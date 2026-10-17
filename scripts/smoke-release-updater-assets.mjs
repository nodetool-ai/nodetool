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

const unquote = (value) => {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
};

// Electron-updater manifests are flat YAML documents plus one `files` list of
// flat entries. Parse only that shape so this script has no npm install
// dependency in the publish job.
const parseManifest = (manifestPath) => {
  const fields = {};
  const files = [];
  let inFiles = false;
  const text = fs.readFileSync(manifestPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#") || trimmed === "---") {
      continue;
    }
    if (line !== line.trimStart()) {
      if (!inFiles) {
        continue;
      }
      const entryStart = trimmed.startsWith("- ");
      const match = MANIFEST_FIELD_PATTERN.exec(entryStart ? trimmed.slice(2).trim() : trimmed);
      if (!match) {
        throw new Error(`Invalid files entry in ${path.basename(manifestPath)}: ${line}`);
      }
      if (entryStart) {
        files.push({});
      }
      if (files.length === 0) {
        throw new Error(`Invalid files entry in ${path.basename(manifestPath)}: ${line}`);
      }
      files[files.length - 1][match[1]] = unquote(match[2].trim());
      continue;
    }
    const match = MANIFEST_FIELD_PATTERN.exec(trimmed);
    if (!match) {
      throw new Error(`Invalid manifest line in ${path.basename(manifestPath)}: ${line}`);
    }
    inFiles = match[1] === "files" && match[2].trim() === "";
    fields[match[1]] = unquote(match[2].trim());
  }
  return { fields, files };
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
  const { fields: doc, files } = parseManifest(manifestPath);
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
  // electron-updater downloads from `files`, not the legacy top-level path,
  // so every entry must match the asset it names.
  if (files.length === 0) {
    throw new Error(`${manifest} has no files entries`);
  }
  for (const entry of files) {
    if (!entry.url || !entry.sha512) {
      throw new Error(`${manifest} has a files entry without url or sha512`);
    }
    const entryPath = ensurePathInDir(dir, entry.url);
    if (!fs.existsSync(entryPath) || !fs.statSync(entryPath).isFile()) {
      throw new Error(`${manifest} files entry points to missing artifact ${entry.url}`);
    }
    if (getSha512Base64(entryPath) !== entry.sha512) {
      throw new Error(`${manifest} files entry sha512 mismatch for ${entry.url}`);
    }
    if (entry.size !== undefined && Number(entry.size) !== fs.statSync(entryPath).size) {
      throw new Error(`${manifest} files entry size mismatch for ${entry.url}`);
    }
  }
  console.log(`${manifest}: ${doc.version} -> ${files.map((entry) => entry.url).join(", ")}`);
}

console.log(`Updater asset smoke test passed for ${channel} ${expectedVersion}.`);
