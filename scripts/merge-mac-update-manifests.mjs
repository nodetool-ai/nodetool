#!/usr/bin/env node
/**
 * Merge the per-architecture macOS updater manifests into the one file
 * electron-updater reads.
 *
 * The release workflow builds x64 and arm64 in separate jobs so their
 * notarization waits overlap. Each job writes its own `latest-mac.yml` (or
 * `nightly-mac.yml`) and renames it to `<name>-mac-<arch>.yml` before upload,
 * so neither overwrites the other when the artifacts are merged. This script
 * writes the combined `<name>-mac.yml` in the shape a single two-arch build
 * produced: zips before dmgs, x64 before arm64, and the top-level `path` and
 * `sha512` naming the x64 zip. It then removes the per-arch inputs so they are
 * not published.
 *
 * Usage: node scripts/merge-mac-update-manifests.mjs <asset-dir>
 */
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ARCHS = ["x64", "arm64"];
const FIELD = /^([A-Za-z0-9_-]+):\s*(.*)$/;

/**
 * Read the flat updater manifest shape: top-level `key: value` lines plus one
 * `files` list of flat entries. Values keep their original quoting so the
 * merged file writes them back unchanged.
 */
export function parseManifest(text) {
  const fields = [];
  const files = [];
  let inFiles = false;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#") || trimmed === "---") { continue; }
    if (line !== line.trimStart()) {
      if (!inFiles) { throw new Error(`Unexpected indented line: ${line}`); }
      const entryStart = trimmed.startsWith("- ");
      const match = FIELD.exec(entryStart ? trimmed.slice(2) : trimmed);
      if (!match || (!entryStart && files.length === 0)) { throw new Error(`Invalid files entry: ${line}`); }
      if (entryStart) { files.push([]); }
      files.at(-1).push([match[1], match[2]]);
      continue;
    }
    const match = FIELD.exec(trimmed);
    if (!match) { throw new Error(`Invalid manifest line: ${line}`); }
    inFiles = match[1] === "files" && match[2] === "";
    if (!inFiles) { fields.push([match[1], match[2]]); }
  }
  return { fields, files };
}

function value(pairs, key) {
  return pairs.find(([name]) => name === key)?.[1];
}

/** Combine one manifest per architecture, keyed by arch, into one document. */
export function mergeManifests(byArch) {
  for (const arch of ARCHS) {
    if (!byArch[arch]) { throw new Error(`Missing ${arch} macOS updater manifest`); }
  }
  const [primary, secondary] = ARCHS.map(arch => byArch[arch]);
  if (value(primary.fields, "version") !== value(secondary.fields, "version")) {
    throw new Error("macOS updater manifests disagree on version");
  }
  const files = [];
  for (const extension of [".zip", ".dmg"]) {
    for (const manifest of [primary, secondary]) {
      files.push(...manifest.files.filter(entry => value(entry, "url")?.endsWith(extension)));
    }
  }
  const total = primary.files.length + secondary.files.length;
  if (files.length !== total) { throw new Error("macOS updater manifest lists a file that is neither .zip nor .dmg"); }
  const lines = [];
  for (const [key, raw] of primary.fields) {
    lines.push(`${key}: ${raw}`);
    if (key === "version") {
      lines.push("files:");
      for (const entry of files) {
        entry.forEach(([name, raw], index) => lines.push(`${index === 0 ? "  - " : "    "}${name}: ${raw}`));
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

/** Merge every `<name>-mac-<arch>.yml` pair in `dir`. Returns the files written. */
export function mergeDirectory(dir) {
  const prefixes = new Set();
  for (const name of readdirSync(dir)) {
    const match = /^(.+)-mac-(x64|arm64)\.yml$/.exec(name);
    if (match) { prefixes.add(match[1]); }
  }
  if (prefixes.size === 0) { throw new Error(`No per-arch macOS updater manifests in ${dir}`); }
  const written = [];
  for (const prefix of prefixes) {
    const byArch = {};
    for (const arch of ARCHS) {
      const file = join(dir, `${prefix}-mac-${arch}.yml`);
      if (existsSync(file)) { byArch[arch] = parseManifest(readFileSync(file, "utf8")); }
    }
    const target = join(dir, `${prefix}-mac.yml`);
    writeFileSync(target, mergeManifests(byArch));
    for (const arch of ARCHS) { rmSync(join(dir, `${prefix}-mac-${arch}.yml`)); }
    written.push(target);
  }
  return written;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const dir = process.argv[2];
    if (!dir) { throw new Error("Usage: merge-mac-update-manifests.mjs <asset-dir>"); }
    for (const file of mergeDirectory(resolve(dir))) { console.log(`Merged ${file}`); }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
