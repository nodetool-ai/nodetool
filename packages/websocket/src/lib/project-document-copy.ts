/**
 * Copy a project document without retaining references to the source project.
 *
 * Dependency discovery is deliberately data driven: document formats evolve
 * independently, but stored asset locators and the document link fields share
 * stable names. A copy reserves every destination id before writing anything,
 * which makes repeated references and document cycles resolve to one copy.
 */
import {
  Asset,
  Application,
  createTimeOrderedUuid,
  ImageDocument,
  JsScript,
  persistProjectCopy,
  Script,
  Storyboard,
  TimelineSequence,
  type ProjectCopyAsset,
  type ProjectCopyDocument,
  type ProjectDocumentType
} from "@nodetool-ai/models";
import { FileStorageAdapter, type StorageAdapter } from "@nodetool-ai/storage";
import {
  existingAssetUri,
  getAssetStorageKey,
  localAssetPath
} from "./asset-paths.js";

export class ProjectCopyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectCopyError";
  }
}

type DocumentSource =
  | {
      readonly type: "storyboard";
      readonly id: string;
      readonly row: Storyboard;
    }
  | { readonly type: "script"; readonly id: string; readonly row: Script }
  | {
      readonly type: "timeline";
      readonly id: string;
      readonly row: TimelineSequence;
    }
  | {
      readonly type: "sketch";
      readonly id: string;
      readonly row: ImageDocument;
    }
  | {
      readonly type: "application";
      readonly id: string;
      readonly row: Application;
    }
  | { readonly type: "jsscript"; readonly id: string; readonly row: JsScript };

interface PreparedAsset {
  readonly source: Asset;
  /**
   * Where a managed asset's bytes are stored. Null for a folder and for an
   * external asset, whose copy references the same file in place.
   */
  readonly storedUri: string | null;
}

/**
 * Store a copy of the object at `fromUri` under `key` and return its URI and
 * size. The local store copies file to file, so no asset is held in memory;
 * other stores copy one object's bytes at a time.
 */
async function copyStoredObject(
  storage: StorageAdapter,
  fromUri: string,
  key: string,
  contentType: string
): Promise<{ uri: string; size: number }> {
  if (storage instanceof FileStorageAdapter) {
    const path = await storage.localPath(fromUri);
    if (path) {
      const uri = await storage.storeFile(key, path);
      const stored = await storage.stat(uri);
      if (!stored) throw new ProjectCopyError("Copied asset media is missing");
      return { uri, size: stored.size };
    }
  }
  const bytes = await storage.retrieve(fromUri);
  if (!bytes) throw new ProjectCopyError("Asset media disappeared during copy");
  return {
    uri: await storage.store(key, bytes, contentType),
    size: bytes.byteLength
  };
}

const ASSET_KEYS = new Set([
  "assetid",
  "asset_id",
  "assetids",
  "asset_ids",
  "currentassetid",
  "current_asset_id",
  "waveformassetid",
  "waveform_asset_id",
  "entityid",
  "entity_id",
  "entityids",
  "entity_ids",
  "thumbnailassetid",
  "thumbnail_asset_id",
  "referenceassetid",
  "reference_asset_id",
  "referenceassetids",
  "reference_asset_ids",
  "locationid",
  "location_id",
  "styleentityid",
  "style_entity_id",
  "sourceassetid",
  "source_asset_id",
  "maskassetid",
  "mask_asset_id"
]);

const DOCUMENT_KEYS: Readonly<Record<string, ProjectDocumentType>> = {
  storyboardid: "storyboard",
  storyboard_id: "storyboard",
  scriptid: "script",
  script_id: "script",
  timelineid: "timeline",
  timeline_id: "timeline",
  sketchid: "sketch",
  sketch_id: "sketch",
  applicationid: "application",
  application_id: "application",
  jsscriptid: "jsscript",
  js_script_id: "jsscript"
};

const WORKFLOW_KEYS = new Set(["workflowid", "workflow_id"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assetIdFromLocator(locator: string): string | null {
  if (!locator.startsWith("asset://")) return null;
  const rest = locator.slice("asset://".length).split(/[?#]/)[0];
  const last = rest.includes("/")
    ? rest.slice(rest.lastIndexOf("/") + 1)
    : rest;
  const id = last.replace(/\.[^.]+$/, "");
  return id || null;
}

function remapAssetLocator(
  locator: string,
  ids: ReadonlyMap<string, string>
): string {
  const assetId = assetIdFromLocator(locator);
  if (!assetId) return locator;
  const copiedId = ids.get(assetId);
  if (!copiedId) return locator;
  const prefix = locator.slice(0, locator.lastIndexOf(assetId));
  return `${prefix}${copiedId}${locator.slice(prefix.length + assetId.length)}`;
}

function addRef(value: unknown, target: Set<string>): void {
  if (typeof value === "string" && value.length > 0) target.add(value);
  if (Array.isArray(value)) {
    for (const item of value) addRef(item, target);
  }
}

interface References {
  readonly assetIds: Set<string>;
  readonly documents: Array<{ type: ProjectDocumentType; id: string }>;
}

/** Find copyable IDs without treating arbitrary nested `id` fields as refs. */
function findReferences(value: unknown): References {
  const assetIds = new Set<string>();
  const documents: Array<{ type: ProjectDocumentType; id: string }> = [];
  const pending: Array<{ value: unknown; path: string[] }> = [
    { value, path: [] }
  ];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    if (typeof current.value === "string") {
      const assetId = assetIdFromLocator(current.value);
      if (assetId) assetIds.add(assetId);
      continue;
    }
    if (Array.isArray(current.value)) {
      pending.push(
        ...current.value.map((item) => ({ value: item, path: current.path }))
      );
      continue;
    }
    if (!isRecord(current.value)) continue;
    for (const [key, child] of Object.entries(current.value)) {
      const normalizedKey = key.toLowerCase();
      if (
        WORKFLOW_KEYS.has(normalizedKey) &&
        current.path.at(-1) !== "source" &&
        child != null &&
        child !== ""
      ) {
        throw new ProjectCopyError(
          `Unsupported workflow dependency at ${key}. Copy the workflow separately first.`
        );
      }
      if (ASSET_KEYS.has(normalizedKey)) addRef(child, assetIds);
      const documentType = DOCUMENT_KEYS[normalizedKey];
      if (documentType) {
        const ids = new Set<string>();
        addRef(child, ids);
        for (const id of ids) documents.push({ type: documentType, id });
      }
      pending.push({ value: child, path: [...current.path, key] });
    }
  }
  return { assetIds, documents };
}

function cloneAndRemap(
  value: unknown,
  ids: ReadonlyMap<string, string>
): unknown {
  if (typeof value === "string") {
    if (value.startsWith("asset://")) return remapAssetLocator(value, ids);
    return ids.get(value) ?? value;
  }
  if (Array.isArray(value))
    return value.map((item) => cloneAndRemap(item, ids));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      cloneAndRemap(child, ids)
    ])
  );
}

function cloneMetadata(
  metadata: Record<string, unknown> | null,
  ids: ReadonlyMap<string, string>
): Record<string, unknown> | null {
  const copied = cloneAndRemap(metadata, ids);
  if (copied === null) return null;
  if (!isRecord(copied))
    throw new ProjectCopyError("Asset metadata was invalid");
  return copied;
}

async function loadDocument(
  userId: string,
  type: ProjectDocumentType,
  id: string
): Promise<DocumentSource> {
  const assertOwned = <T extends { user_id: string }>(row: T | null): T => {
    if (!row || row.user_id !== userId) {
      throw new ProjectCopyError(`${type} dependency ${id} is unavailable`);
    }
    return row;
  };
  switch (type) {
    case "storyboard":
      return { type, id, row: assertOwned(await Storyboard.findById(id)) };
    case "script":
      return { type, id, row: assertOwned(await Script.findById(id)) };
    case "timeline":
      return {
        type,
        id,
        row: assertOwned(await TimelineSequence.findById(id))
      };
    case "sketch":
      return { type, id, row: assertOwned(await ImageDocument.findById(id)) };
    case "application":
      return { type, id, row: assertOwned(await Application.findById(id)) };
    case "jsscript":
      return { type, id, row: assertOwned(await JsScript.findById(id)) };
  }
}

function documentPayload(source: DocumentSource): unknown {
  switch (source.type) {
    case "storyboard":
    case "script":
    case "timeline":
    case "sketch":
    case "jsscript":
      return JSON.parse(source.row.document);
    case "application":
      return JSON.parse(source.row.document);
  }
}

function directReferences(source: DocumentSource): References {
  const found = findReferences(documentPayload(source));
  const addDocument = (type: ProjectDocumentType, id: string | null): void => {
    if (id) found.documents.push({ type, id });
  };
  switch (source.type) {
    case "storyboard":
      addDocument("timeline", source.row.timeline_id);
      break;
    case "script":
      addDocument("timeline", source.row.timeline_id);
      addDocument("storyboard", source.row.storyboard_id);
      break;
    case "timeline":
      if (source.row.workflow_id) {
        throw new ProjectCopyError(
          "Unsupported workflow dependency on timeline"
        );
      }
      break;
    case "sketch":
      if (source.row.workflow_id) {
        throw new ProjectCopyError("Unsupported workflow dependency on sketch");
      }
      if (source.row.thumbnail_asset_id)
        found.assetIds.add(source.row.thumbnail_asset_id);
      break;
    case "application":
    case "jsscript":
      break;
  }
  return found;
}

function copiedDocument(
  source: DocumentSource,
  destinationId: string,
  destinationProjectId: string,
  ids: ReadonlyMap<string, string>,
  now: string
): ProjectCopyDocument {
  const document = JSON.stringify(cloneAndRemap(documentPayload(source), ids));
  const base = {
    id: destinationId,
    user_id: source.row.user_id,
    project_id: destinationProjectId,
    name: source.row.name,
    document,
    created_at: now,
    updated_at: now
  };
  switch (source.type) {
    case "storyboard":
      return {
        type: source.type,
        values: {
          ...base,
          timeline_id: source.row.timeline_id
            ? (ids.get(source.row.timeline_id) ?? null)
            : null,
          revision: 0
        }
      };
    case "script":
      return {
        type: source.type,
        values: {
          ...base,
          timeline_id: source.row.timeline_id
            ? (ids.get(source.row.timeline_id) ?? null)
            : null,
          storyboard_id: source.row.storyboard_id
            ? (ids.get(source.row.storyboard_id) ?? null)
            : null
        }
      };
    case "timeline":
      return {
        type: source.type,
        values: {
          ...base,
          workflow_id: null,
          fps: source.row.fps,
          width: source.row.width,
          height: source.row.height,
          duration_ms: source.row.duration_ms,
          revision: 0
        }
      };
    case "sketch":
      return {
        type: source.type,
        values: {
          ...base,
          workflow_id: null,
          width: source.row.width,
          height: source.row.height,
          background_color: source.row.background_color,
          thumbnail_asset_id: source.row.thumbnail_asset_id
            ? (ids.get(source.row.thumbnail_asset_id) ?? null)
            : null,
          revision: 0
        }
      };
    case "application":
      return {
        type: source.type,
        values: { ...base, description: source.row.description }
      };
    case "jsscript":
      return { type: source.type, values: base };
  }
}

/**
 * Copy a complete dependency closure. Storage is copied before the database
 * transaction, so no incomplete copy can become a visible document. Failed
 * transactions remove the newly stored bytes again.
 */
export async function copyProjectDocument(args: {
  readonly userId: string;
  readonly type: ProjectDocumentType;
  readonly id: string;
  readonly destinationProjectId: string;
  readonly storage: StorageAdapter;
}): Promise<{
  readonly id: string;
  readonly name: string;
  readonly copiedAssets: number;
  readonly copiedDocuments: number;
}> {
  const documentIds = new Map<string, string>();
  const sources = new Map<string, DocumentSource>();
  const assetIds = new Map<string, string>();
  const assetsToVisit: string[] = [];
  const documentsToVisit: Array<{ type: ProjectDocumentType; id: string }> = [
    { type: args.type, id: args.id }
  ];

  while (documentsToVisit.length > 0) {
    const next = documentsToVisit.pop();
    if (!next) continue;
    const key = `${next.type}:${next.id}`;
    if (documentIds.has(key)) continue;
    const source = await loadDocument(args.userId, next.type, next.id);
    documentIds.set(key, createTimeOrderedUuid());
    sources.set(key, source);
    const refs = directReferences(source);
    for (const assetId of refs.assetIds) assetsToVisit.push(assetId);
    documentsToVisit.push(...refs.documents);
  }

  const preparedAssets = new Map<string, PreparedAsset>();
  const discoveredAssetIds = new Set(assetsToVisit);
  while (assetsToVisit.length > 0) {
    const batch = assetsToVisit.splice(-900);
    const sourcesById = new Map(
      (await Asset.findMany(args.userId, batch)).map((asset) => [
        asset.id,
        asset
      ])
    );
    for (const assetId of batch) {
      const source = sourcesById.get(assetId);
      if (!source) {
        throw new ProjectCopyError(
          `Asset dependency ${assetId} is unavailable`
        );
      }
      assetIds.set(assetId, createTimeOrderedUuid());
      const metadataRefs = findReferences(source.metadata);
      for (const dependencyId of metadataRefs.assetIds) {
        if (!discoveredAssetIds.has(dependencyId)) {
          discoveredAssetIds.add(dependencyId);
          assetsToVisit.push(dependencyId);
        }
      }
      // Presence only: bytes are copied one object at a time below, so a
      // project with many large assets never holds them all in memory.
      let storedUri: string | null = null;
      let available = source.isFolder;
      if (!source.isFolder && source.external_path) {
        // An external asset stays an in-place reference: the copy lives on
        // the same install, which is the only place the path resolves. An
        // offline file fails the copy as missing media always has.
        available =
          (await localAssetPath(
            args.storage,
            source.user_id,
            source.id,
            source.content_type
          )) !== null;
      } else if (!source.isFolder) {
        storedUri = await existingAssetUri(
          args.storage,
          source.user_id,
          source.id,
          source.content_type
        );
        available = storedUri !== null;
      }
      if (!available) {
        throw new ProjectCopyError(
          `Asset dependency ${assetId} has no stored media`
        );
      }
      preparedAssets.set(assetId, { source, storedUri });
    }
  }

  const ids = new Map<string, string>(assetIds);
  for (const [key, destinationId] of documentIds) {
    ids.set(key.slice(key.indexOf(":") + 1), destinationId);
  }

  const storedUris: string[] = [];
  const copiedSizes = new Map<string, number>();
  try {
    for (const [sourceId, prepared] of preparedAssets) {
      if (!prepared.storedUri) continue;
      const destinationId = assetIds.get(sourceId);
      if (!destinationId)
        throw new ProjectCopyError("Asset map was incomplete");
      const key = getAssetStorageKey(
        prepared.source.user_id,
        destinationId,
        prepared.source.content_type
      );
      const copied = await copyStoredObject(
        args.storage,
        prepared.storedUri,
        key,
        prepared.source.content_type
      );
      storedUris.push(copied.uri);
      copiedSizes.set(sourceId, copied.size);
    }

    const now = new Date().toISOString();
    const assetCopies: ProjectCopyAsset[] = [];
    for (const [sourceId, prepared] of preparedAssets) {
      const destinationId = assetIds.get(sourceId);
      if (!destinationId)
        throw new ProjectCopyError("Asset map was incomplete");
      assetCopies.push({
        id: destinationId,
        user_id: prepared.source.user_id,
        parent_id: null,
        file_id: null,
        name: prepared.source.name,
        content_type: prepared.source.content_type,
        size: copiedSizes.get(sourceId) ?? prepared.source.size,
        duration: prepared.source.duration,
        metadata: cloneMetadata(prepared.source.metadata, ids),
        sketch_document_id: null,
        workflow_id: null,
        node_id: null,
        job_id: null,
        timeline_id: null,
        project_id: args.destinationProjectId,
        external_path: prepared.source.external_path,
        created_at: now,
        updated_at: now
      });
    }
    const documentCopies: ProjectCopyDocument[] = [];
    for (const [sourceKey, source] of sources) {
      const destinationId = documentIds.get(sourceKey);
      if (!destinationId)
        throw new ProjectCopyError("Document map was incomplete");
      documentCopies.push(
        copiedDocument(
          source,
          destinationId,
          args.destinationProjectId,
          ids,
          now
        )
      );
    }
    await persistProjectCopy({
      userId: args.userId,
      destinationProjectId: args.destinationProjectId,
      assets: assetCopies,
      documents: documentCopies
    });
  } catch (error) {
    await Promise.allSettled(storedUris.map((uri) => args.storage.delete(uri)));
    throw error;
  }

  const root = sources.get(`${args.type}:${args.id}`);
  const copiedId = documentIds.get(`${args.type}:${args.id}`);
  if (!root || !copiedId)
    throw new ProjectCopyError("Copy root was unavailable");
  return {
    id: copiedId,
    name: root.row.name,
    copiedAssets: preparedAssets.size,
    copiedDocuments: sources.size
  };
}
