/**
 * `.nodetool` workflow bundle codec — a self-contained, portable archive of a
 * workflow plus the asset bytes it references, for sharing a workflow as a
 * template (offline file, import-by-URL, or upload to a hosted catalog).
 *
 * Layout (a zip):
 *   manifest.json   — bundle format/version, nodetool version, asset checksums
 *   workflow.json   — the workflow (graph refs rewritten to `bundle://<file>`)
 *   assets/<file>   — content-addressed asset bytes (sha256 + ext)
 *   thumbnail.jpg   — optional preview
 *
 * Export rewrites per-install refs (`asset://`, `/api/storage/`) into
 * `bundle://<file>` and packs the bytes. Import resolves each `bundle://` ref
 * back to a concrete asset via a caller-supplied `storeAsset` (which decides
 * where the bytes land — user storage, a workspace, etc.) and rewrites the ref
 * to the returned uri. The codec itself is storage-agnostic and dependency-light
 * (fflate + node:crypto) so it can be reused server-side and, later, in the UI.
 */
import { createHash } from "node:crypto";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  collectWorkflowAssets,
  mediaExtension,
  transformMediaRefs,
  type WorkflowGraphLike
} from "./package-asset-export.js";

export const WORKFLOW_BUNDLE_SCHEME = "bundle://";
export const WORKFLOW_BUNDLE_FORMAT = "nodetool-workflow-bundle";
export const WORKFLOW_BUNDLE_VERSION = 1;

export interface WorkflowBundleManifest {
  format: typeof WORKFLOW_BUNDLE_FORMAT;
  version: number;
  nodetool_version?: string;
  created_at: string;
  assets: Array<{ file: string; bytes: number; sha256: string }>;
  thumbnail?: string | null;
}

/** The workflow payload carried in a bundle (no per-user/db fields). */
export interface BundledWorkflow {
  name: string;
  description?: string;
  tags?: string[];
  run_mode?: string | null;
  settings?: Record<string, unknown> | null;
  graph: WorkflowGraphLike;
}

export interface PackBundleOptions {
  workflow: BundledWorkflow;
  /** Resolve bytes for a referenced asset (`asset://`/`/api/storage/` uri). */
  fetchAssetBytes: (ref: string) => Promise<Uint8Array | null>;
  /** Also embed http(s) and local-file refs. Off by default. */
  includeRemote?: boolean;
  nodetoolVersion?: string;
  thumbnail?: Uint8Array | null;
}

export interface PackBundleResult {
  bytes: Uint8Array;
  manifest: WorkflowBundleManifest;
  /** Refs that looked embeddable but could not be resolved (left as-is). */
  skipped: string[];
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Build a `.nodetool` zip from a workflow, embedding its referenced assets. */
export async function packWorkflowBundle(
  options: PackBundleOptions
): Promise<PackBundleResult> {
  const { graph, assets, skipped } = await collectWorkflowAssets(
    options.workflow.graph,
    {
      fetchAssetBytes: options.fetchAssetBytes,
      ...(options.includeRemote ? { includeRemote: true } : {}),
      fileNameFor: ({ source, bytes, refType }) =>
        `${sha256Hex(bytes)}${mediaExtension(source, refType)}`,
      uriFor: (fileName) => `${WORKFLOW_BUNDLE_SCHEME}${fileName}`
    }
  );

  const files: Record<string, Uint8Array> = {};
  const manifestAssets: WorkflowBundleManifest["assets"] = [];
  const seen = new Set<string>();
  for (const asset of assets) {
    if (seen.has(asset.fileName)) {
      continue; // identical content already packed
    }
    seen.add(asset.fileName);
    const zipPath = `assets/${asset.fileName}`;
    files[zipPath] = asset.bytes;
    manifestAssets.push({
      file: zipPath,
      bytes: asset.bytes.byteLength,
      sha256: sha256Hex(asset.bytes)
    });
  }

  const manifest: WorkflowBundleManifest = {
    format: WORKFLOW_BUNDLE_FORMAT,
    version: WORKFLOW_BUNDLE_VERSION,
    ...(options.nodetoolVersion
      ? { nodetool_version: options.nodetoolVersion }
      : {}),
    created_at: new Date().toISOString(),
    assets: manifestAssets,
    thumbnail: options.thumbnail ? "thumbnail.jpg" : null
  };

  const bundledWorkflow: BundledWorkflow = { ...options.workflow, graph };

  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  files["workflow.json"] = strToU8(JSON.stringify(bundledWorkflow, null, 2));
  if (options.thumbnail) {
    files["thumbnail.jpg"] = options.thumbnail;
  }

  return { bytes: zipSync(files), manifest, skipped };
}

export interface UnpackedBundle {
  manifest: WorkflowBundleManifest;
  workflow: BundledWorkflow;
  /** file name (without the `assets/` prefix) → bytes. */
  assets: Map<string, Uint8Array>;
  thumbnail: Uint8Array | null;
}

export function unpackWorkflowBundle(zipBytes: Uint8Array): UnpackedBundle {
  const entries = unzipSync(zipBytes);

  const manifestEntry = entries["manifest.json"];
  const workflowEntry = entries["workflow.json"];
  if (!manifestEntry || !workflowEntry) {
    throw new Error("Invalid bundle: missing manifest.json or workflow.json");
  }

  const manifest = JSON.parse(strFromU8(manifestEntry)) as WorkflowBundleManifest;
  if (manifest.format !== WORKFLOW_BUNDLE_FORMAT) {
    throw new Error(`Unrecognized bundle format: ${String(manifest.format)}`);
  }
  if (manifest.version > WORKFLOW_BUNDLE_VERSION) {
    throw new Error(
      `Bundle version ${manifest.version} is newer than supported (${WORKFLOW_BUNDLE_VERSION})`
    );
  }

  const workflow = JSON.parse(strFromU8(workflowEntry)) as BundledWorkflow;
  if (!workflow.graph?.nodes) {
    throw new Error("Invalid bundle: workflow has no graph");
  }

  const assets = new Map<string, Uint8Array>();
  for (const [path, bytes] of Object.entries(entries)) {
    if (path.startsWith("assets/")) {
      assets.set(path.slice("assets/".length), bytes);
    }
  }
  const thumbnail = entries["thumbnail.jpg"] ?? null;

  return { manifest, workflow, assets, thumbnail };
}

/** Verify each asset's bytes against the manifest sha256. Returns mismatches. */
export function verifyBundleChecksums(bundle: UnpackedBundle): string[] {
  const mismatches: string[] = [];
  for (const entry of bundle.manifest.assets) {
    const fileName = entry.file.startsWith("assets/")
      ? entry.file.slice("assets/".length)
      : entry.file;
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

export interface StoreAssetInput {
  bytes: Uint8Array;
  fileName: string;
  contentType: string;
  refType?: unknown;
}

export interface ImportBundleOptions {
  /**
   * Persist a bundled asset and return the ref it should be addressed by
   * (e.g. `asset://<id>`). `assetId`, when provided, is written back onto the
   * ref so it round-trips through the asset system.
   */
  storeAsset: (input: StoreAssetInput) => Promise<{ uri: string; assetId?: string }>;
  /** Throw if any asset fails its manifest checksum. Default: false (warn). */
  verifyChecksums?: boolean;
}

export interface ImportBundleResult {
  workflow: BundledWorkflow;
  imported: Array<{ file: string; uri: string }>;
  /** `bundle://` refs whose bytes were missing from the archive. */
  missing: string[];
  checksumMismatches: string[];
}

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".glb": "model/gltf-binary",
  ".pdf": "application/pdf",
  ".json": "application/json",
  ".txt": "text/plain"
};

function mimeForFile(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const ext = dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/**
 * Resolve a bundle's `bundle://` refs into concrete stored assets and return a
 * workflow ready to create. `storeAsset` decides where the bytes land.
 */
export async function importWorkflowBundle(
  zipBytes: Uint8Array,
  options: ImportBundleOptions
): Promise<ImportBundleResult> {
  const bundle = unpackWorkflowBundle(zipBytes);
  const checksumMismatches = verifyBundleChecksums(bundle);
  if (options.verifyChecksums && checksumMismatches.length > 0) {
    throw new Error(
      `Bundle checksum verification failed: ${checksumMismatches.join(", ")}`
    );
  }

  const imported: Array<{ file: string; uri: string }> = [];
  const missing: string[] = [];
  const resolvedByFile = new Map<string, { uri: string; assetId?: string }>();

  const graph = await transformMediaRefs(bundle.workflow.graph, async (ref) => {
    const uri = typeof ref.uri === "string" ? ref.uri : "";
    if (!uri.startsWith(WORKFLOW_BUNDLE_SCHEME)) {
      return;
    }
    const fileName = uri.slice(WORKFLOW_BUNDLE_SCHEME.length);
    const bytes = bundle.assets.get(fileName);
    if (!bytes) {
      missing.push(fileName);
      return;
    }

    let stored = resolvedByFile.get(fileName);
    if (!stored) {
      const result = await options.storeAsset({
        bytes,
        fileName,
        contentType: mimeForFile(fileName),
        refType: ref.type
      });
      stored = { uri: result.uri, ...(result.assetId ? { assetId: result.assetId } : {}) };
      resolvedByFile.set(fileName, stored);
      imported.push({ file: fileName, uri: stored.uri });
    }

    ref.uri = stored.uri;
    delete ref.temp_id;
    delete ref.data;
    if (stored.assetId) {
      ref.asset_id = stored.assetId;
    } else {
      delete ref.asset_id;
    }
  });

  return {
    workflow: { ...bundle.workflow, graph },
    imported,
    missing,
    checksumMismatches
  };
}
