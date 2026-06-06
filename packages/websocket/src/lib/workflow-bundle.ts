/**
 * `.nodetool` workflow bundle codec — a self-contained, portable archive of one
 * or more workflows plus the asset bytes they reference, for sharing workflows
 * as templates (offline file, import-by-URL, or upload to a hosted catalog).
 *
 * Layout (a zip):
 *   manifest.json        — format/version, nodetool version, workflow list,
 *                          asset checksums
 *   workflows/<file>.json — one per workflow (graph refs → `bundle://<file>`)
 *   assets/<file>        — content-addressed asset bytes (sha256 + ext), shared
 *                          and deduped across all workflows in the bundle
 *   thumbnail.jpg        — optional preview
 *
 * (v1 bundles used a single top-level `workflow.json`; `unpackWorkflowBundle`
 * still reads those.)
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
export const WORKFLOW_BUNDLE_VERSION = 2;

export interface WorkflowBundleManifest {
  format: typeof WORKFLOW_BUNDLE_FORMAT;
  version: number;
  nodetool_version?: string;
  created_at: string;
  workflows: Array<{ file: string; name: string }>;
  assets: Array<{ file: string; bytes: number; sha256: string }>;
  thumbnail?: string | null;
}

/** The workflow payload carried in a bundle (no per-user/db fields). */
export interface BundledWorkflow {
  id?: string;
  name: string;
  description?: string;
  tags?: string[];
  run_mode?: string | null;
  settings?: Record<string, unknown> | null;
  graph: WorkflowGraphLike;
}

export interface PackWorkflowsBundleOptions {
  workflows: BundledWorkflow[];
  /** Resolve bytes for a referenced asset (`asset://`/`/api/storage/` uri). */
  fetchAssetBytes: (ref: string) => Promise<Uint8Array | null>;
  /** Also embed http(s) and local-file refs. Off by default. */
  includeRemote?: boolean;
  nodetoolVersion?: string;
  thumbnail?: Uint8Array | null;
}

export interface PackBundleOptions {
  workflow: BundledWorkflow;
  fetchAssetBytes: (ref: string) => Promise<Uint8Array | null>;
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

function sanitizeFileBase(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "");
  return cleaned || "workflow";
}

/** A unique `workflows/<file>.json` name, disambiguated against `used`. */
function uniqueWorkflowFile(
  workflow: BundledWorkflow,
  index: number,
  used: Set<string>
): string {
  const base = sanitizeFileBase(workflow.id || workflow.name || `workflow-${index + 1}`);
  let candidate = `${base}.json`;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${n}.json`;
    n += 1;
  }
  return candidate;
}

/** Build a `.nodetool` zip from one or more workflows, embedding their assets. */
export async function packWorkflowsBundle(
  options: PackWorkflowsBundleOptions
): Promise<PackBundleResult> {
  // Resolve each source at most once, even when shared across workflows.
  const memo = new Map<string, Promise<Uint8Array | null>>();
  const fetchAssetBytes = (ref: string): Promise<Uint8Array | null> => {
    let pending = memo.get(ref);
    if (!pending) {
      pending = options.fetchAssetBytes(ref);
      memo.set(ref, pending);
    }
    return pending;
  };

  const files: Record<string, Uint8Array> = {};
  const manifestAssets: WorkflowBundleManifest["assets"] = [];
  const manifestWorkflows: WorkflowBundleManifest["workflows"] = [];
  const seenAssetFiles = new Set<string>();
  const usedWorkflowFiles = new Set<string>();
  const skipped = new Set<string>();

  let index = 0;
  for (const workflow of options.workflows) {
    const { graph, assets, skipped: workflowSkipped } = await collectWorkflowAssets(
      workflow.graph,
      {
        fetchAssetBytes,
        ...(options.includeRemote ? { includeRemote: true } : {}),
        fileNameFor: ({ source, bytes, refType }) =>
          `${sha256Hex(bytes)}${mediaExtension(source, refType)}`,
        uriFor: (fileName) => `${WORKFLOW_BUNDLE_SCHEME}${fileName}`
      }
    );

    for (const s of workflowSkipped) {
      skipped.add(s);
    }
    for (const asset of assets) {
      if (seenAssetFiles.has(asset.fileName)) {
        continue; // identical content already packed
      }
      seenAssetFiles.add(asset.fileName);
      const zipPath = `assets/${asset.fileName}`;
      files[zipPath] = asset.bytes;
      manifestAssets.push({
        file: zipPath,
        bytes: asset.bytes.byteLength,
        sha256: sha256Hex(asset.bytes)
      });
    }

    const wfFile = uniqueWorkflowFile(workflow, index, usedWorkflowFiles);
    usedWorkflowFiles.add(wfFile);
    const bundled: BundledWorkflow = { ...workflow, graph };
    files[`workflows/${wfFile}`] = strToU8(JSON.stringify(bundled, null, 2));
    manifestWorkflows.push({ file: `workflows/${wfFile}`, name: workflow.name });
    index += 1;
  }

  const manifest: WorkflowBundleManifest = {
    format: WORKFLOW_BUNDLE_FORMAT,
    version: WORKFLOW_BUNDLE_VERSION,
    ...(options.nodetoolVersion
      ? { nodetool_version: options.nodetoolVersion }
      : {}),
    created_at: new Date().toISOString(),
    workflows: manifestWorkflows,
    assets: manifestAssets,
    thumbnail: options.thumbnail ? "thumbnail.jpg" : null
  };

  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  if (options.thumbnail) {
    files["thumbnail.jpg"] = options.thumbnail;
  }

  return { bytes: zipSync(files), manifest, skipped: [...skipped] };
}

/** Convenience wrapper to bundle a single workflow. */
export async function packWorkflowBundle(
  options: PackBundleOptions
): Promise<PackBundleResult> {
  const { workflow, ...rest } = options;
  return packWorkflowsBundle({ ...rest, workflows: [workflow] });
}

export interface UnpackedBundle {
  manifest: WorkflowBundleManifest;
  workflows: BundledWorkflow[];
  /** file name (without the `assets/` prefix) → bytes. */
  assets: Map<string, Uint8Array>;
  thumbnail: Uint8Array | null;
}

export function unpackWorkflowBundle(zipBytes: Uint8Array): UnpackedBundle {
  const entries = unzipSync(zipBytes);

  const manifestEntry = entries["manifest.json"];
  if (!manifestEntry) {
    throw new Error("Invalid bundle: missing manifest.json");
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

  const parseWorkflow = (path: string): BundledWorkflow => {
    const wf = JSON.parse(strFromU8(entries[path])) as BundledWorkflow;
    if (!wf.graph?.nodes) {
      throw new Error(`Invalid bundle: ${path} has no graph`);
    }
    return wf;
  };

  const workflows: BundledWorkflow[] = [];
  const workflowPaths = Object.keys(entries).filter(
    (p) => p.startsWith("workflows/") && p.endsWith(".json")
  );
  if (workflowPaths.length > 0) {
    // Preserve manifest order, then append any entries the manifest omitted.
    const seen = new Set<string>();
    const ordered = (manifest.workflows ?? [])
      .map((w) => w.file)
      .filter((f) => entries[f]);
    for (const path of ordered) {
      workflows.push(parseWorkflow(path));
      seen.add(path);
    }
    for (const path of workflowPaths.sort()) {
      if (!seen.has(path)) {
        workflows.push(parseWorkflow(path));
      }
    }
  } else if (entries["workflow.json"]) {
    // v1 single-workflow bundle.
    workflows.push(parseWorkflow("workflow.json"));
  }
  if (workflows.length === 0) {
    throw new Error("Invalid bundle: no workflows found");
  }

  const assets = new Map<string, Uint8Array>();
  for (const [path, bytes] of Object.entries(entries)) {
    if (path.startsWith("assets/")) {
      assets.set(path.slice("assets/".length), bytes);
    }
  }
  const thumbnail = entries["thumbnail.jpg"] ?? null;

  return { manifest, workflows, assets, thumbnail };
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
  workflows: BundledWorkflow[];
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
 * Resolve a bundle's `bundle://` refs into concrete stored assets and return
 * workflows ready to create. `storeAsset` decides where the bytes land; assets
 * shared across workflows are stored once.
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
  const missing = new Set<string>();
  const resolvedByFile = new Map<string, { uri: string; assetId?: string }>();

  const rewriteRef = async (ref: Record<string, unknown>): Promise<void> => {
    const uri = typeof ref.uri === "string" ? ref.uri : "";
    if (!uri.startsWith(WORKFLOW_BUNDLE_SCHEME)) {
      return;
    }
    const fileName = uri.slice(WORKFLOW_BUNDLE_SCHEME.length);
    const bytes = bundle.assets.get(fileName);
    if (!bytes) {
      missing.add(fileName);
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
      stored = {
        uri: result.uri,
        ...(result.assetId ? { assetId: result.assetId } : {})
      };
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
  };

  const workflows: BundledWorkflow[] = [];
  for (const workflow of bundle.workflows) {
    const graph = await transformMediaRefs(workflow.graph, rewriteRef);
    workflows.push({ ...workflow, graph });
  }

  return {
    workflows,
    imported,
    missing: [...missing],
    checksumMismatches
  };
}
