import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getNodetoolDataDir, loadPackageAssetJson } from "@nodetool-ai/config";
import { createCatalog, mergePresetPacks, packPresetSchema, presetPackManifestSchema } from "@nodetool-ai/presets";

export function presetPackStore(): string {
  return join(getNodetoolDataDir(), "preset-packs");
}
export const installedPresetPackSchema = z.strictObject({
  manifest: presetPackManifestSchema,
  presets: z.array(packPresetSchema).min(1).max(256)
});

/** Read on each request so removal cannot leave a stale server catalogue. */
export function readPresetPacks(store = presetPackStore()): z.infer<typeof installedPresetPackSchema>[] {
  if (!existsSync(store)) { return []; }
  return readdirSync(store).sort().map(file => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(file)) { throw new Error("Invalid installed preset pack filename"); }
    const path = join(store, file);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > 4 * 1024 * 1024) { throw new Error("Invalid installed preset pack file"); }
    const pack = installedPresetPackSchema.parse(JSON.parse(readFileSync(path, "utf8")));
    if (file !== pack.manifest.id + ".json") { throw new Error("Preset pack id does not match installed filename"); }
    return pack;
  });
}

export function builtinPresetCatalog() {
  return createCatalog(loadPackageAssetJson(
    { pkg: "@nodetool-ai/presets", path: "preset-catalog.json" }, import.meta.url
  ));
}
export function runtimePresetCatalog(store = presetPackStore()) {
  return mergePresetPacks(builtinPresetCatalog(), readPresetPacks(store).map(pack => pack.presets));
}
