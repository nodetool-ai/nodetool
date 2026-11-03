import { lstatSync, readFileSync, readdirSync, mkdirSync, writeFileSync, unlinkSync, renameSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { z } from "zod";
import { mergePresetPacks, packPresetSchema, presetPackManifestSchema } from "@nodetool-ai/presets";
import { builtinPresetCatalog, presetPackStore, readPresetPacks } from "@nodetool-ai/pack-core/preset-catalog";

function readDataFile(path: string): unknown {
  const stat = lstatSync(path);
  if (!stat.isFile() || (stat.mode & 0o111) !== 0 || stat.size > 1024 * 1024) {
    throw new Error("Preset packs accept only non-executable regular JSON files up to 1 MiB");
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

/** No npm, module imports, lifecycle hooks or dependency resolution. */
export function installPresetPack(directory: string, store = presetPackStore()): void {
  if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink()) {
    throw new Error("Preset pack must be a regular directory");
  }
  const manifest = presetPackManifestSchema.parse(readDataFile(join(directory, "preset-pack.json")));
  const files = new Set(["preset-pack.json", ...manifest.presets]);
  if (files.size !== manifest.presets.length + 1 ||
      readdirSync(directory).some(file => !files.has(file))) {
    throw new Error("Preset packs contain only their manifest and declared JSON presets");
  }
  const presets = manifest.presets.map(file => packPresetSchema.parse(readDataFile(join(directory, file))));
  withStoreLock(store, lock => {
    const installed = readPresetPacks(store);
    if (installed.some(pack => pack.manifest.id === manifest.id)) { throw new Error("Preset pack already installed"); }
    mergePresetPacks(builtinPresetCatalog(), [...installed.map(pack => pack.presets), presets]);
    const data = JSON.stringify({ manifest, presets });
    if (Buffer.byteLength(data) > 4 * 1024 * 1024) { throw new Error("Preset pack exceeds 4 MiB"); }
    mkdirSync(store, { recursive: true });
    const staged = join(lock, manifest.id + ".json");
    writeFileSync(staged, data, { flag: "wx", mode: 0o600 });
    renameSync(staged, join(store, manifest.id + ".json"));
  });
}

export function removePresetPack(id: string, store = presetPackStore()): void {
  const safeId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80).parse(id);
  withStoreLock(store, () => unlinkSync(join(store, safeId + ".json")));
}

function withStoreLock(store: string, operation: (lock: string) => void): void {
  mkdirSync(dirname(store), { recursive: true });
  const lock = store + ".lock";
  mkdirSync(lock);
  try {
    operation(lock);
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}
