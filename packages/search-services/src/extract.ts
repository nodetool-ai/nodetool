/**
 * Turn a source row into the item and chunks the library index stores
 * (docs/plans/library-search.md, D4 to D6). Delivery step A1 indexes what the
 * row itself holds: the name, the generation prompt, descriptions and tags.
 * File content belongs to the indexer's extractors.
 */

import {
  ENTITY_METADATA_KEY,
  isSystemEntityMetadata,
  normalizeSearchTags,
  readAssetGenerationMetadata,
  readEntityMarker,
  type SearchField,
  type SearchKind,
  type SearchMetadata,
  type SearchOrigin,
  type SearchResourceType
} from "@nodetool-ai/protocol";

/**
 * Bumped when the extraction below changes, so the reconcile rebuilds every
 * item that an older extraction wrote.
 */
export const EXTRACTOR_VERSION = 2;

/** One passage of an item's text. */
export interface ExtractedChunk {
  field: SearchField;
  text: string;
  locator?: Record<string, unknown>;
}

/** Everything the index stores for one source row. */
export interface ExtractedItem {
  userId: string;
  projectId: string;
  resourceType: SearchResourceType;
  resourceId: string;
  kind: SearchKind;
  title: string;
  contentType: string | null;
  provider: string | null;
  model: string | null;
  workflowId: string | null;
  favorite: boolean;
  folderPath: string | null;
  tags: string[];
  metadata: SearchMetadata;
  sourceVersion: string;
  createdAt: string;
  updatedAt: string;
  /** Metadata chunks: title, prompt, description. */
  chunks: ExtractedChunk[];
  /** True when the indexer has content to extract beyond the metadata. */
  hasContent: boolean;
}

/** The asset columns extraction reads. */
export interface AssetSource {
  id: string;
  user_id: string;
  project_id?: string | null;
  name: string;
  content_type: string;
  size?: number | null;
  duration?: number | null;
  metadata?: Record<string, unknown> | null;
  workflow_id?: string | null;
  node_id?: string | null;
  job_id?: string | null;
  external_path?: string | null;
  workspace_path?: string | null;
  content_hash?: string | null;
  favorite?: boolean | null;
  created_at: string;
  updated_at: string;
}

/** The columns every document table shares, plus the optional ones some have. */
export interface DocumentSource {
  id: string;
  user_id: string;
  project_id?: string | null;
  name: string;
  description?: string | null;
  tags?: unknown;
  created_at: string;
  updated_at: string;
}

/** The document kind each document table holds. */
export const DOCUMENT_KIND_BY_RESOURCE: Record<
  Exclude<SearchResourceType, "asset" | "project_file">,
  SearchKind
> = {
  workflow: "workflow",
  application: "application",
  image_document: "sketch",
  script: "script",
  storyboard: "storyboard",
  timeline_sequence: "timeline",
  js_script: "jsscript",
  game: "game"
};

/** Content types a text document is stored under, beyond `text/*`. */
const DOCUMENT_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/json",
  "application/xml",
  "application/x-yaml",
  "application/yaml",
  "application/msword",
  "application/rtf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text"
]);

/** Whether an asset's file has a content extractor (D6). */
export function hasAssetContentExtractor(contentType: string, name: string): boolean {
  return assetContentFormat(contentType, name) !== null;
}

/** How an asset's file is read: as text, as Markdown, as a PDF or as a Word file. */
export type AssetContentFormat = "text" | "markdown" | "pdf" | "docx";

const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function assetContentFormat(contentType: string, name: string): AssetContentFormat | null {
  const type = contentType.toLowerCase();
  const lower = name.toLowerCase();
  if (type === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
  if (type === DOCX_CONTENT_TYPE || lower.endsWith(".docx")) return "docx";
  if (type === "text/markdown" || type === "text/x-markdown" || /\.(md|markdown)$/.test(lower)) {
    return "markdown";
  }
  if (
    type.startsWith("text/") ||
    ["application/json", "application/xml", "application/x-yaml", "application/yaml"].includes(type)
  ) {
    return "text";
  }
  return null;
}

const MODEL_3D_EXTENSIONS = /\.(glb|gltf|obj|fbx|stl|usdz|ply)$/i;

/** The kind of a non-entity asset, read from its content type and name. */
export function assetKind(contentType: string, name: string): SearchKind {
  const type = contentType.toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("model/") || MODEL_3D_EXTENSIONS.test(name)) return "model_3d";
  if (type.startsWith("text/") || DOCUMENT_CONTENT_TYPES.has(type)) return "document";
  return "file";
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function descriptionChunk(parts: Array<string | undefined>, tags: string[]): ExtractedChunk[] {
  const text = [...parts.filter((part): part is string => Boolean(part)), ...tags].join("\n");
  return text ? [{ field: "description", text }] : [];
}

/**
 * What the index stores for an asset, or null when the asset is not a library
 * item: a folder, or a shipped entity preset.
 */
export function extractAsset(asset: AssetSource, folderPath: string | null): ExtractedItem | null {
  if (asset.content_type === "folder") return null;
  const metadata = asset.metadata ?? {};
  if (isSystemEntityMetadata(metadata)) return null;

  const marker = metadata[ENTITY_METADATA_KEY] !== undefined ? readEntityMarker(metadata) : null;
  const generation = readAssetGenerationMetadata(metadata);
  const tags = normalizeSearchTags([
    ...(Array.isArray(metadata.tags) ? metadata.tags : []),
    ...(marker?.tags ?? [])
  ]);
  const kind: SearchKind = marker ? "entity" : assetKind(asset.content_type, asset.name);
  const title = nonEmpty(marker?.name) ?? asset.name;
  const projectId = asset.project_id || "default";
  const prompt = generation.prompt;
  const origin: SearchOrigin = prompt || generation.generation
    ? "generated"
    : asset.external_path
      ? "external"
      : asset.workspace_path
        ? "folder_file"
        : "imported";

  const item: SearchMetadata = {
    kind,
    title,
    content_type: asset.content_type,
    project_id: projectId,
    uri: `asset://${asset.id}`,
    origin,
    created_at: asset.created_at,
    updated_at: asset.updated_at
  };
  if (folderPath) item.folder_path = folderPath;
  const width = finiteNumber(metadata.width);
  const height = finiteNumber(metadata.height);
  const pageCount = finiteNumber(metadata.page_count);
  if (width !== undefined) item.width = width;
  if (height !== undefined) item.height = height;
  if (pageCount !== undefined) item.page_count = pageCount;
  if (finiteNumber(asset.duration) !== undefined) item.duration = asset.duration!;
  if (finiteNumber(asset.size) !== undefined) item.size = asset.size!;
  if (prompt) item.prompt = prompt;
  const settings = generation.generation;
  if (settings?.provider) item.provider = settings.provider;
  if (settings?.model) item.model = settings.model;
  if (settings?.capability) item.capability = settings.capability;
  if (settings?.node_type) item.node_type = settings.node_type;
  if (asset.workflow_id) item.workflow_id = asset.workflow_id;
  if (asset.job_id) item.job_id = asset.job_id;
  if (asset.favorite) item.favorite = true;
  if (tags.length > 0) item.tags = tags;
  if (marker) {
    item.entity_kind = marker.kind;
    if (nonEmpty(marker.descriptor)) item.descriptor = marker.descriptor;
  }

  const chunks: ExtractedChunk[] = [{ field: "title", text: title }];
  if (marker && title !== asset.name && asset.name) {
    chunks[0] = { field: "title", text: `${title}\n${asset.name}` };
  }
  if (prompt) chunks.push({ field: "prompt", text: prompt });
  chunks.push(
    ...descriptionChunk(
      [nonEmpty(marker?.descriptor), nonEmpty(marker?.description), nonEmpty(metadata.description)],
      tags
    )
  );

  return {
    userId: asset.user_id,
    projectId,
    resourceType: "asset",
    resourceId: asset.id,
    kind,
    title,
    contentType: asset.content_type,
    provider: settings?.provider ?? null,
    model: settings?.model ?? null,
    workflowId: asset.workflow_id ?? null,
    favorite: Boolean(asset.favorite),
    folderPath,
    tags,
    metadata: item,
    sourceVersion: assetSourceVersion(asset),
    createdAt: asset.created_at,
    updatedAt: asset.updated_at,
    chunks,
    hasContent: kind === "document" && hasAssetContentExtractor(asset.content_type, asset.name)
  };
}

/** What an asset item was built from. A metadata edit moves `updated_at`, a new file moves the hash. */
export function assetSourceVersion(asset: Pick<AssetSource, "updated_at" | "content_hash">): string {
  return `${asset.updated_at}|${asset.content_hash ?? ""}`;
}

/** What the index stores for a document row of any kind. */
export function extractDocument(
  resourceType: Exclude<SearchResourceType, "asset" | "project_file">,
  doc: DocumentSource
): ExtractedItem {
  const kind = DOCUMENT_KIND_BY_RESOURCE[resourceType];
  const projectId = doc.project_id || "default";
  const title = doc.name || "";
  const tags = normalizeSearchTags(Array.isArray(doc.tags) ? doc.tags : []);
  const description = nonEmpty(doc.description);
  const item: SearchMetadata = {
    kind,
    title,
    project_id: projectId,
    created_at: doc.created_at,
    updated_at: doc.updated_at
  };
  if (tags.length > 0) item.tags = tags;
  if (resourceType === "workflow") item.workflow_id = doc.id;

  return {
    userId: doc.user_id,
    projectId,
    resourceType,
    resourceId: doc.id,
    kind,
    title,
    contentType: null,
    provider: null,
    model: null,
    workflowId: resourceType === "workflow" ? doc.id : null,
    favorite: false,
    folderPath: null,
    tags,
    metadata: item,
    sourceVersion: doc.updated_at,
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
    chunks: [{ field: "title", text: title }, ...descriptionChunk([description], tags)],
    // A game's content is a folder of files, which step A6 indexes.
    hasContent: resourceType !== "game"
  };
}
