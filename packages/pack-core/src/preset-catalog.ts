import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { createLogger, getNodetoolDataDir, loadPackageAssetJson } from "@nodetool-ai/config";
import { createCatalog, mergePresetPacks, packPresetSchema, presetPackManifestSchema, type Catalog } from "@nodetool-ai/presets";

const log = createLogger("nodetool.pack-core.preset-catalog");

export function presetPackStore(): string {
  return join(getNodetoolDataDir(), "preset-packs");
}
export const installedPresetPackSchema = z.strictObject({
  manifest: presetPackManifestSchema,
  presets: z.array(packPresetSchema).min(1).max(256)
});

/** Read on each request so removal cannot leave a stale server catalogue. */
export function readPresetPacks(store = presetPackStore()): z.infer<typeof installedPresetPackSchema>[] {
  return presetPackFiles(store).map(file => readPresetPackFile(store, file));
}

function presetPackFiles(store: string): string[] {
  return existsSync(store) ? readdirSync(store).sort() : [];
}

function readPresetPackFile(store: string, file: string): z.infer<typeof installedPresetPackSchema> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(file)) { throw new Error("Invalid installed preset pack filename"); }
  const path = join(store, file);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.size > 4 * 1024 * 1024) { throw new Error("Invalid installed preset pack file"); }
  const pack = installedPresetPackSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  if (file !== pack.manifest.id + ".json") { throw new Error("Preset pack id does not match installed filename"); }
  return pack;
}

export function builtinPresetCatalog(): Catalog {
  return createCatalog(loadPackageAssetJson(
    { pkg: "@nodetool-ai/presets", path: "preset-catalog.json" }, import.meta.url
  ));
}
/** One bad pack is skipped, so it cannot take the built-in catalogue or other packs down with it. */
export function runtimePresetCatalog(store = presetPackStore()): Catalog {
  let catalog = builtinPresetCatalog();
  for (const file of presetPackFiles(store)) {
    try {
      catalog = mergePresetPacks(catalog, [readPresetPackFile(store, file).presets]);
    } catch (error) {
      log.warn("Skipping an invalid preset pack", { file, error: String(error) });
    }
  }
  return catalog;
}
