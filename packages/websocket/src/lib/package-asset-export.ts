/**
 * Convert a workflow into a portable template by materializing the user-local
 * assets it references (uploaded inputs, generated samples) into constant
 * package assets that ship with the build.
 *
 * User assets are addressed by per-install identifiers — `asset://<id>` or
 * `/api/storage/<key>` — that resolve only on the machine that created them.
 * For a workflow to work as a shipped example, those bytes must travel with it.
 * This walks the graph, writes each referenced asset as a flat file under
 * `<assetsRoot>/<packageName>/<file>`, and rewrites the ref's `uri` to
 * `package://<packageName>/<file>` (clearing the stale `asset_id`/`temp_id`/
 * inline `data`). The result resolves identically on every install via the
 * `/api/assets/packages/...` route.
 *
 * The lower-level {@link transformMediaRefs} / {@link collectWorkflowAssets}
 * primitives are shared with the `.nodetool` bundle codec (`workflow-bundle`).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { buildPackageAssetUri } from "@nodetool-ai/protocol";

export interface WorkflowGraphLike {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
}

const MEDIA_TYPE_EXTENSIONS: Record<string, string> = {
  image: ".png",
  audio: ".mp3",
  video: ".mp4",
  document: ".bin",
  model3d: ".glb"
};

/** True for refs that must be materialized to ship (per-install identifiers). */
export function isLocalAssetUri(uri: string): boolean {
  if (uri.startsWith("package://")) {
    return false;
  }
  if (uri.startsWith("asset://")) {
    return true;
  }
  return uri.includes("/api/storage/");
}

export function isRemoteOrFileUri(uri: string): boolean {
  return (
    /^https?:\/\//.test(uri) ||
    uri.startsWith("file://") ||
    uri.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(uri)
  );
}

/** Best-effort extension for an asset, from the source URI then the ref type. */
export function mediaExtension(source: string, refType: unknown): string {
  let raw = source;
  if (raw.startsWith("asset://")) {
    raw = raw.slice("asset://".length);
  } else if (raw.includes("/api/storage/")) {
    raw = raw.slice(raw.indexOf("/api/storage/") + "/api/storage/".length);
  }
  raw = raw.split("?")[0].split("#")[0];
  const ext = extname(basename(raw));
  if (ext) {
    return ext;
  }
  if (typeof refType === "string") {
    return MEDIA_TYPE_EXTENSIONS[refType] ?? ".bin";
  }
  return ".bin";
}

/** Strip query/fragment and return a safe flat file name for the asset. */
function deriveFileName(source: string, refType: unknown): string {
  let raw = source;
  if (raw.startsWith("asset://")) {
    raw = raw.slice("asset://".length);
  } else if (raw.includes("/api/storage/")) {
    raw = raw.slice(raw.indexOf("/api/storage/") + "/api/storage/".length);
  }
  raw = raw.split("?")[0].split("#")[0];
  let name = basename(raw) || raw;
  // Collapse anything that isn't a safe flat filename character.
  name = name.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
  if (!name) {
    name = "asset";
  }
  if (!extname(name)) {
    name = `${name}${mediaExtension(source, refType)}`;
  }
  return name;
}

/**
 * A media ref is a plain object carrying at least one asset locator
 * (`uri`/`asset_id`/`temp_id`). We rewrite these in place.
 */
function asMediaRef(value: unknown): Record<string, unknown> | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    value instanceof Uint8Array
  ) {
    return null;
  }
  const obj = value as Record<string, unknown>;
  const hasLocator =
    typeof obj.uri === "string" ||
    typeof obj.asset_id === "string" ||
    typeof obj.temp_id === "string";
  return hasLocator ? obj : null;
}

/**
 * Clone `graph` and invoke `visit` on every media ref found under each node's
 * `data` / `dynamic_properties`. The visitor mutates refs in place on the
 * clone; the input graph is never modified. Returns the rewritten clone.
 */
export async function transformMediaRefs(
  graph: WorkflowGraphLike,
  visit: (ref: Record<string, unknown>) => Promise<void> | void
): Promise<WorkflowGraphLike> {
  const clone = structuredClone(graph) as WorkflowGraphLike;

  const walk = async (value: unknown): Promise<void> => {
    if (Array.isArray(value)) {
      for (const item of value) {
        await walk(item);
      }
      return;
    }
    const ref = asMediaRef(value);
    if (ref) {
      await visit(ref);
    }
    if (typeof value === "object" && value !== null) {
      for (const child of Object.values(value as Record<string, unknown>)) {
        await walk(child);
      }
    }
  };

  for (const node of clone.nodes) {
    if (node.data !== undefined) {
      await walk(node.data);
    }
    if (node.dynamic_properties !== undefined) {
      await walk(node.dynamic_properties);
    }
  }

  return clone;
}

/** The locator to feed `fetchAssetBytes`, or null when not materializable. */
function materializableSource(
  ref: Record<string, unknown>,
  includeRemote: boolean
): string | null {
  const uri = typeof ref.uri === "string" ? ref.uri : "";
  if (uri && isLocalAssetUri(uri)) {
    return uri;
  }
  if (uri && includeRemote && isRemoteOrFileUri(uri)) {
    return uri;
  }
  // No usable uri — fall back to an asset id (resolved by the fetcher).
  if (!uri || uri.length === 0) {
    if (typeof ref.asset_id === "string" && ref.asset_id) {
      return `asset://${ref.asset_id}`;
    }
  }
  return null;
}

export interface CollectedAsset {
  /** The ref that was rewritten. */
  source: string;
  fileName: string;
  /** The rewritten ref uri. */
  uri: string;
  bytes: Uint8Array;
}

export interface CollectOptions {
  fetchAssetBytes: (ref: string) => Promise<Uint8Array | null>;
  includeRemote?: boolean;
  /** Choose a file name for a resolved asset. */
  fileNameFor: (input: {
    source: string;
    bytes: Uint8Array;
    refType: unknown;
  }) => string;
  /** Build the rewritten ref uri from the chosen file name. */
  uriFor: (fileName: string) => string;
}

export interface CollectResult {
  graph: WorkflowGraphLike;
  /** Unique assets (deduped by source). */
  assets: CollectedAsset[];
  /** Sources that looked materializable but could not be resolved. */
  skipped: string[];
}

/**
 * Walk a graph, resolve each materializable asset ref to bytes, and rewrite the
 * ref's `uri` (clearing `asset_id`/`temp_id`/`data`). The caller decides where
 * the collected bytes are persisted. Identical sources are resolved once.
 */
export async function collectWorkflowAssets(
  graph: WorkflowGraphLike,
  options: CollectOptions
): Promise<CollectResult> {
  const includeRemote = options.includeRemote ?? false;
  const assets: CollectedAsset[] = [];
  const skipped: string[] = [];
  const resolved = new Map<string, string>();

  const outGraph = await transformMediaRefs(graph, async (ref) => {
    const source = materializableSource(ref, includeRemote);
    if (!source) {
      return;
    }
    let uri = resolved.get(source);
    if (!uri) {
      const bytes = await options.fetchAssetBytes(source);
      if (!bytes) {
        skipped.push(source);
        return;
      }
      const fileName = options.fileNameFor({
        source,
        bytes,
        refType: ref.type
      });
      uri = options.uriFor(fileName);
      resolved.set(source, uri);
      assets.push({ source, fileName, uri, bytes });
    }
    ref.uri = uri;
    delete ref.asset_id;
    delete ref.temp_id;
    delete ref.data;
  });

  return { graph: outGraph, assets, skipped };
}

export interface MaterializeOptions {
  /** Package the assets belong to, e.g. `nodetool-base`. */
  packageName: string;
  /** Root holding `<packageName>/<file>` constant assets on disk. */
  assetsRoot: string;
  /**
   * Resolve the raw bytes for a referenced asset. `ref` is the original
   * `uri` (or `asset://<id>` synthesized from an `asset_id`). Return `null`
   * when the asset can't be resolved — the ref is then left untouched.
   */
  fetchAssetBytes: (ref: string) => Promise<Uint8Array | null>;
  /**
   * Also materialize remote (`http`/`https`) and local-file (`file://`,
   * absolute path) references. Off by default — remote URLs are already
   * portable and local paths are usually intentional. `asset://` and
   * `/api/storage/` refs are always materialized.
   */
  includeRemote?: boolean;
}

export interface ExportedAsset {
  /** The ref that was rewritten. */
  source: string;
  /** The `package://` URI it now points to. */
  packageUri: string;
  fileName: string;
  byteLength: number;
}

export interface MaterializeResult {
  graph: WorkflowGraphLike;
  exported: ExportedAsset[];
  /** Refs that looked materializable but could not be resolved. */
  skipped: string[];
}

export async function materializeWorkflowConstantAssets(
  graph: WorkflowGraphLike,
  options: MaterializeOptions
): Promise<MaterializeResult> {
  const { graph: outGraph, assets, skipped } = await collectWorkflowAssets(
    graph,
    {
      fetchAssetBytes: options.fetchAssetBytes,
      ...(options.includeRemote ? { includeRemote: true } : {}),
      fileNameFor: ({ source, refType }) => deriveFileName(source, refType),
      uriFor: (fileName) => buildPackageAssetUri(options.packageName, fileName)
    }
  );

  const targetDir = join(options.assetsRoot, options.packageName);
  if (assets.length > 0) {
    await mkdir(targetDir, { recursive: true });
  }
  const exported: ExportedAsset[] = [];
  for (const asset of assets) {
    await writeFile(join(targetDir, asset.fileName), asset.bytes);
    exported.push({
      source: asset.source,
      packageUri: asset.uri,
      fileName: asset.fileName,
      byteLength: asset.bytes.byteLength
    });
  }

  return { graph: outGraph, exported, skipped };
}
