import { z } from "zod";
import { assetResponse } from "./assets.js";

// ── Openverse search and import ──────────────────────────────────
// Openverse (https://openverse.org) indexes Creative Commons and public-domain
// images and audio. The server proxies its API so the optional OAuth client
// credentials never reach the browser, and downloads an imported file itself so
// the asset carries the license record it was found with.

export const openverseMediaType = z.enum(["images", "audio"]);
export type OpenverseMediaType = z.infer<typeof openverseMediaType>;

export const openverseLicenseType = z.enum([
  "all",
  "commercial",
  "modification"
]);
export type OpenverseLicenseType = z.infer<typeof openverseLicenseType>;

export const searchInput = z.object({
  media_type: openverseMediaType,
  q: z.string().trim().min(1).max(200),
  license_type: openverseLicenseType.default("all"),
  /** Image: photograph, illustration, digitized_artwork. Audio: music, sound_effect, podcast, … */
  category: z.string().max(40).optional(),
  page: z.number().int().min(1).max(12).default(1)
});
export type SearchInput = z.input<typeof searchInput>;

/** The license and credit a result carries, and an imported asset keeps. */
export const openverseLicenseRecord = z.object({
  id: z.string(),
  media_type: openverseMediaType,
  title: z.string(),
  creator: z.string(),
  creator_url: z.string(),
  license: z.string(),
  license_version: z.string(),
  license_url: z.string(),
  attribution: z.string(),
  landing_url: z.string(),
  source: z.string()
});
export type OpenverseLicenseRecord = z.infer<typeof openverseLicenseRecord>;

export const openverseResult = openverseLicenseRecord.extend({
  url: z.string(),
  thumbnail: z.string(),
  filetype: z.string(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  duration_seconds: z.number().nullable()
});
export type OpenverseResult = z.infer<typeof openverseResult>;

export const searchOutput = z.object({
  results: z.array(openverseResult),
  result_count: z.number().int(),
  page: z.number().int(),
  page_count: z.number().int(),
  /** True when the server used the configured Openverse API credentials. */
  authenticated: z.boolean()
});
export type SearchOutput = z.infer<typeof searchOutput>;

export const importInput = z.object({
  media_type: openverseMediaType,
  /** Openverse result ids. The server looks each one up again rather than trusting a client URL. */
  ids: z.array(z.string().uuid()).min(1).max(20),
  /** Folder to import into. Empty or omitted means the user's root folder. */
  parent_id: z.string().optional(),
  /** Project the new assets belong to. Omitted means the default project. */
  project_id: z.string().min(1).optional()
});
export type ImportInput = z.infer<typeof importInput>;

export const importOutput = z.object({
  assets: z.array(assetResponse),
  failed: z.array(z.object({ id: z.string(), error: z.string() }))
});
export type ImportOutput = z.infer<typeof importOutput>;
