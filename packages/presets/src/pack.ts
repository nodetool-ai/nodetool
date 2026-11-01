import { z } from "zod";
import { createCatalog, type Catalog } from "./catalog.js";
import { fragmentSchema, presetSchema } from "./schema.js";

const text = z.string().max(4096);
const httpsUrl = z.url().max(2048).refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}, "Pack previews must use https without credentials");

/** Strict data-only subset. Pack data never supplies graphs or launch targets. */
export const packPresetSchema = presetSchema.omit({ workflow: true }).extend({
  name: z.string().min(1).max(160),
  description: z.string().min(1).max(2048),
  author: z.string().min(1).max(160),
  tags: z.array(z.string().max(80)).max(32).default([]),
  aliases: z.array(z.string().max(160)).max(32).default([]),
  prompt: z.record(z.string().max(80), fragmentSchema).refine(
    fragments => Object.hasOwn(fragments, "default") &&
      Object.keys(fragments).length <= 32 &&
      Object.values(fragments).every(fragment =>
        typeof fragment === "string" ? text.safeParse(fragment).success :
          Object.values(fragment).every(value => text.safeParse(value).success)),
    "Pack prompt fragments require default and at most 4096 characters per clause"
  ),
  preview: z.strictObject({ url: httpsUrl, poster: httpsUrl, run: z.string().max(256) }).optional()
});

export const presetPackManifestSchema = z.strictObject({
  kind: z.literal("preset-pack"),
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  version: z.literal(1),
  presets: z.array(z.string().regex(/^[a-z0-9-]+\.json$/)).min(1).max(256)
});
export type PresetPackManifest = z.infer<typeof presetPackManifestSchema>;

export function mergePresetPacks(builtins: Catalog, packs: readonly unknown[]): Catalog {
  const presets = packs.flatMap(pack => z.array(packPresetSchema).max(256).parse(pack));
  return createCatalog([...builtins.presets, ...builtins.studios, ...presets]);
}
