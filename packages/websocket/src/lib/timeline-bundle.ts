/**
 * Timeline bundle codec — a portable zip holding one timeline document plus the
 * bytes of every asset its clips point at, so a cut can move between installs
 * instead of arriving with dangling `currentAssetId`s.
 *
 * Layout (a zip):
 *   manifest.json   — format/version, the id → file table, checksums, the font
 *                     families the document names, and the ids it references
 *                     but does not carry
 *   timeline.json   — the sequence wire shape minus id/project/user/timestamps
 *   assets/<sha256><ext> — content-addressed asset bytes, deduped
 *
 * Asset ids stay in their own fields inside `timeline.json` (they are bare ids,
 * not media refs, so the `bundle://` rewrite the workflow bundle performs does
 * not apply here). The manifest's `assets[].asset_id` is what maps an id in the
 * document to the file carrying its bytes; import stores each file and rewrites
 * the four id fields to the newly created assets.
 *
 * The codec is storage-agnostic: the caller supplies `fetchAsset` on the way out
 * and `storeAsset` on the way in, so the same functions serve the HTTP route and
 * a test with an in-memory adapter.
 */
import { createHash } from "node:crypto";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { z } from "zod";
import { timelineDocument } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { getAssetFileName } from "./asset-paths.js";

export const TIMELINE_BUNDLE_FORMAT = "nodetool-timeline-bundle";
export const TIMELINE_BUNDLE_VERSION = 1;

const TIMELINE_ENTRY = "timeline.json";
const ASSETS_PREFIX = "assets/";

/** The timeline payload carried in a bundle (no per-user/db fields). */
export const bundledTimeline = timelineDocument.extend({
  name: z.string().min(1),
  fps: z.number(),
  width: z.number(),
  height: z.number(),
  durationMs: z.number(),
  workflowId: z.string().optional()
});
export type BundledTimeline = z.infer<typeof bundledTimeline>;

/**
 * The clip fields this codec reads. A clip carries far more; the structural
 * shape keeps the pure helpers usable with both the `@nodetool-ai/timeline`
 * clip type and the protocol one.
 */
export interface TimelineBundleClip {
  currentAssetId?: string;
  thumbnailAssetId?: string;
  waveformAssetId?: string;
  versions?: Array<{ assetId?: string; jobId?: string }>;
  textStyle?: { fontFamily?: string };
  caption?: { style?: { fontFamily?: string } };
  workflowId?: string;
  storyboardBoardId?: string;
  scriptId?: string;
}

export interface TimelineBundleDocument {
  clips: TimelineBundleClip[];
  workflowId?: string;
}

export interface TimelineBundleAssetEntry {
  file: string;
  asset_id: string;
  name: string;
  content_type: string;
  bytes: number;
  sha256: string;
}

export interface TimelineBundleForeignRefs {
  workflow_ids: string[];
  storyboard_ids: string[];
  script_ids: string[];
  job_ids: string[];
}

export interface TimelineBundleManifest {
  format: typeof TIMELINE_BUNDLE_FORMAT;
  version: number;
  created_at: string;
  timeline: { file: string; name: string };
  assets: TimelineBundleAssetEntry[];
  /** Ids the document references whose bytes could not be read at export. */
  missing_assets: string[];
  fonts: string[];
  /** Ids that mean something only on the exporting install. Informational. */
  foreign_refs: TimelineBundleForeignRefs;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function pushUnique(into: string[], seen: Set<string>, value?: string): void {
  if (typeof value !== "string" || value === "" || seen.has(value)) {
    return;
  }
  seen.add(value);
  into.push(value);
}

/**
 * Every asset id the document points at, in document order, deduped. These are
 * the only fields import rewrites — anything else stays as written.
 */
export function collectTimelineAssetIds(doc: TimelineBundleDocument): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const clip of doc.clips ?? []) {
    pushUnique(ids, seen, clip.currentAssetId);
    pushUnique(ids, seen, clip.thumbnailAssetId);
    pushUnique(ids, seen, clip.waveformAssetId);
    for (const version of clip.versions ?? []) {
      pushUnique(ids, seen, version.assetId);
    }
  }
  return ids;
}

/** Font families the document names, so a reader knows what it needs installed. */
export function collectTimelineFonts(doc: TimelineBundleDocument): string[] {
  const fonts: string[] = [];
  const seen = new Set<string>();
  for (const clip of doc.clips ?? []) {
    pushUnique(fonts, seen, clip.textStyle?.fontFamily);
    pushUnique(fonts, seen, clip.caption?.style?.fontFamily);
  }
  return fonts;
}

/** Ids that resolve only on the exporting install; carried for information. */
export function collectTimelineForeignRefs(
  doc: TimelineBundleDocument
): TimelineBundleForeignRefs {
  const refs: TimelineBundleForeignRefs = {
    workflow_ids: [],
    storyboard_ids: [],
    script_ids: [],
    job_ids: []
  };
  const seen = {
    workflow: new Set<string>(),
    storyboard: new Set<string>(),
    script: new Set<string>(),
    job: new Set<string>()
  };
  pushUnique(refs.workflow_ids, seen.workflow, doc.workflowId);
  for (const clip of doc.clips ?? []) {
    pushUnique(refs.workflow_ids, seen.workflow, clip.workflowId);
    pushUnique(refs.storyboard_ids, seen.storyboard, clip.storyboardBoardId);
    pushUnique(refs.script_ids, seen.script, clip.scriptId);
    for (const version of clip.versions ?? []) {
      pushUnique(refs.job_ids, seen.job, version.jobId);
    }
  }
  return refs;
}

/**
 * A copy of `doc` with every asset id present in `map` replaced. An id the map
 * does not name is left alone — that is how a missing asset stays dangling
 * instead of silently pointing at someone else's bytes.
 */
export function rewriteTimelineAssetIds<T extends TimelineBundleDocument>(
  doc: T,
  map: ReadonlyMap<string, string>
): T {
  const clone = structuredClone(doc);
  const rewrite = (id?: string): string | undefined =>
    typeof id === "string" ? (map.get(id) ?? id) : id;
  for (const clip of clone.clips ?? []) {
    if (clip.currentAssetId) clip.currentAssetId = rewrite(clip.currentAssetId);
    if (clip.thumbnailAssetId) {
      clip.thumbnailAssetId = rewrite(clip.thumbnailAssetId);
    }
    if (clip.waveformAssetId) {
      clip.waveformAssetId = rewrite(clip.waveformAssetId);
    }
    for (const version of clip.versions ?? []) {
      if (version.assetId) version.assetId = rewrite(version.assetId);
    }
  }
  return clone;
}

/** Bytes plus the row fields that travel with an asset. */
export interface FetchedTimelineAsset {
  bytes: Uint8Array;
  name: string;
  contentType: string;
}

export interface PackTimelineBundleOptions {
  sequence: BundledTimeline;
  /** Resolve one asset by id; null when its row or bytes are gone. */
  fetchAsset: (assetId: string) => Promise<FetchedTimelineAsset | null>;
}

export interface PackTimelineBundleResult {
  bytes: Uint8Array;
  manifest: TimelineBundleManifest;
}

/** Build a timeline zip, embedding the bytes of every asset its clips name. */
export async function packTimelineBundle(
  options: PackTimelineBundleOptions
): Promise<PackTimelineBundleResult> {
  const { sequence } = options;
  const files: Record<string, Uint8Array> = {};
  const assets: TimelineBundleAssetEntry[] = [];
  const missing: string[] = [];

  for (const assetId of collectTimelineAssetIds(sequence)) {
    const fetched = await options.fetchAsset(assetId);
    if (!fetched) {
      // An asset the install no longer has does not fail the export: the id is
      // recorded so the far side can say what it is missing.
      missing.push(assetId);
      continue;
    }
    const sha256 = sha256Hex(fetched.bytes);
    const file = `${ASSETS_PREFIX}${getAssetFileName(sha256, fetched.contentType)}`;
    // Content-addressed, so two ids sharing bytes pack one file and get two
    // manifest rows pointing at it.
    files[file] ??= fetched.bytes;
    assets.push({
      file,
      asset_id: assetId,
      name: fetched.name,
      content_type: fetched.contentType,
      bytes: fetched.bytes.byteLength,
      sha256
    });
  }

  const manifest: TimelineBundleManifest = {
    format: TIMELINE_BUNDLE_FORMAT,
    version: TIMELINE_BUNDLE_VERSION,
    created_at: new Date().toISOString(),
    timeline: { file: TIMELINE_ENTRY, name: sequence.name },
    assets,
    missing_assets: missing,
    fonts: collectTimelineFonts(sequence),
    foreign_refs: collectTimelineForeignRefs(sequence)
  };

  files[TIMELINE_ENTRY] = strToU8(JSON.stringify(sequence, null, 2));
  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));

  return { bytes: zipSync(files), manifest };
}

export interface UnpackedTimelineBundle {
  manifest: TimelineBundleManifest;
  /** Parsed, not yet schema-validated — `importTimelineBundle` does that. */
  timeline: BundledTimeline;
  /** file name (without the `assets/` prefix) → bytes. */
  assets: Map<string, Uint8Array>;
}

/** Max total decompressed size of a bundle — guards against zip bombs. */
const MAX_BUNDLE_UNCOMPRESSED_BYTES = 512 * 1024 * 1024; // 512 MB
/** Max number of entries in a bundle. */
const MAX_BUNDLE_ENTRIES = 10_000;

export function unpackTimelineBundle(
  zipBytes: Uint8Array
): UnpackedTimelineBundle {
  // Bound decompression: `unzipSync` otherwise inflates every entry into memory
  // with no size limit, so a small highly-compressible upload can expand to tens
  // of GB and OOM the server. The filter runs per entry with the
  // header-declared uncompressed size, before that entry is inflated.
  let totalUncompressed = 0;
  let entryCount = 0;
  const entries = unzipSync(zipBytes, {
    filter: (file) => {
      entryCount += 1;
      if (entryCount > MAX_BUNDLE_ENTRIES) {
        throw new Error(
          `Bundle rejected: too many entries (limit ${MAX_BUNDLE_ENTRIES})`
        );
      }
      totalUncompressed += file.originalSize;
      if (totalUncompressed > MAX_BUNDLE_UNCOMPRESSED_BYTES) {
        throw new Error(
          `Bundle rejected: decompressed size exceeds ${MAX_BUNDLE_UNCOMPRESSED_BYTES} bytes`
        );
      }
      return true;
    }
  });

  const manifestEntry = entries["manifest.json"];
  if (!manifestEntry) {
    throw new Error("Invalid bundle: missing manifest.json");
  }
  const manifest = JSON.parse(
    strFromU8(manifestEntry)
  ) as TimelineBundleManifest;
  if (manifest.format !== TIMELINE_BUNDLE_FORMAT) {
    throw new Error(`Unrecognized bundle format: ${String(manifest.format)}`);
  }
  if (manifest.version > TIMELINE_BUNDLE_VERSION) {
    throw new Error(
      `Bundle version ${manifest.version} is newer than supported (${TIMELINE_BUNDLE_VERSION})`
    );
  }

  const timelineFile = manifest.timeline?.file || TIMELINE_ENTRY;
  const timelineEntry = entries[timelineFile];
  if (!timelineEntry) {
    throw new Error(`Invalid bundle: missing ${timelineFile}`);
  }
  const timeline = JSON.parse(strFromU8(timelineEntry)) as BundledTimeline;
  if (
    !Array.isArray(timeline?.tracks) ||
    !Array.isArray(timeline?.clips) ||
    !Array.isArray(timeline?.markers)
  ) {
    throw new Error(
      `Invalid bundle: ${timelineFile} has no tracks, clips, and markers arrays`
    );
  }

  const assets = new Map<string, Uint8Array>();
  for (const [path, bytes] of Object.entries(entries)) {
    if (path.startsWith(ASSETS_PREFIX)) {
      assets.set(path.slice(ASSETS_PREFIX.length), bytes);
    }
  }

  return { manifest, timeline, assets };
}

/** Verify each asset's bytes against the manifest sha256. Returns mismatches. */
export function verifyTimelineBundleChecksums(
  bundle: UnpackedTimelineBundle
): string[] {
  const mismatches: string[] = [];
  const checked = new Set<string>();
  for (const entry of bundle.manifest.assets ?? []) {
    const fileName = entry.file.startsWith(ASSETS_PREFIX)
      ? entry.file.slice(ASSETS_PREFIX.length)
      : entry.file;
    if (checked.has(fileName)) {
      continue; // deduped bytes, hashed once
    }
    checked.add(fileName);
    const bytes = bundle.assets.get(fileName);
    if (!bytes) {
      mismatches.push(`${entry.file} (missing)`);
      continue;
    }
    if (entry.sha256 && sha256Hex(bytes) !== entry.sha256) {
      mismatches.push(`${entry.file} (checksum)`);
    }
  }
  return mismatches;
}

export interface StoreTimelineAssetInput {
  bytes: Uint8Array;
  name: string;
  contentType: string;
  /** The id the exporting install used. Only for provenance. */
  sourceAssetId: string;
}

export interface ImportTimelineBundleOptions {
  /** Persist a bundled asset and return the id it now lives under. */
  storeAsset: (input: StoreTimelineAssetInput) => Promise<{ assetId: string }>;
  /** Throw if any asset fails its manifest checksum. Default: false (report). */
  verifyChecksums?: boolean;
}

export interface ImportTimelineBundleResult {
  /** Schema-validated, with every stored asset's id rewritten. */
  timeline: BundledTimeline;
  imported: Array<{ file: string; source_asset_id: string; asset_id: string }>;
  /** Ids the archive carried no bytes for; left dangling in the document. */
  missing: string[];
  checksumMismatches: string[];
}

/**
 * Store a bundle's assets and return a timeline ready to create. Assets shared
 * by several ids are stored once; an id with no bytes keeps its original value
 * and is reported in `missing`.
 */
export async function importTimelineBundle(
  zipBytes: Uint8Array,
  options: ImportTimelineBundleOptions
): Promise<ImportTimelineBundleResult> {
  const bundle = unpackTimelineBundle(zipBytes);
  const checksumMismatches = verifyTimelineBundleChecksums(bundle);
  if (options.verifyChecksums && checksumMismatches.length > 0) {
    throw new Error(
      `Bundle checksum verification failed: ${checksumMismatches.join(", ")}`
    );
  }

  const imported: ImportTimelineBundleResult["imported"] = [];
  const missing = new Set<string>(bundle.manifest.missing_assets ?? []);
  const idMap = new Map<string, string>();
  const storedByFile = new Map<string, string>();

  for (const entry of bundle.manifest.assets ?? []) {
    const fileName = entry.file.startsWith(ASSETS_PREFIX)
      ? entry.file.slice(ASSETS_PREFIX.length)
      : entry.file;
    const bytes = bundle.assets.get(fileName);
    if (!bytes) {
      missing.add(entry.asset_id);
      continue;
    }
    let assetId = storedByFile.get(fileName);
    if (!assetId) {
      const stored = await options.storeAsset({
        bytes,
        name: entry.name || fileName,
        contentType: entry.content_type || "application/octet-stream",
        sourceAssetId: entry.asset_id
      });
      assetId = stored.assetId;
      storedByFile.set(fileName, assetId);
      // One row per stored file, so `imported.length` is what was written.
      imported.push({
        file: entry.file,
        source_asset_id: entry.asset_id,
        asset_id: assetId
      });
    }
    idMap.set(entry.asset_id, assetId);
  }

  // Validate at the boundary — the same gate the tRPC `update` applies, so an
  // uploaded document cannot smuggle fields the editor would then write back.
  const validated = bundledTimeline.parse(bundle.timeline);
  const timeline = rewriteTimelineAssetIds(validated, idMap);

  // An id the document names that no manifest row covered has no bytes here.
  for (const id of collectTimelineAssetIds(bundle.timeline)) {
    if (!idMap.has(id)) {
      missing.add(id);
    }
  }

  return {
    timeline,
    imported,
    missing: [...missing],
    checksumMismatches
  };
}
