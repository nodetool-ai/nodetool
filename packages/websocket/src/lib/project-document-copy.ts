/**
 * Copy a project document without retaining references to the source project.
 *
 * Dependency discovery is deliberately data driven: document formats evolve
 * independently, but stored asset locators and the document link fields share
 * stable names. A copy reserves every destination id before writing anything,
 * which makes repeated references and document cycles resolve to one copy.
 */
import { createTimeOrderedUuid } from "@nodetool-ai/models";
import {
  Asset,
  ImageDocument,
  JsScript,
  Script,
  Storyboard,
  TimelineSequence,
  type ProjectDocumentType
} from "@nodetool-ai/models";
import {
  applications,
  assets,
  getDb,
  getDbType,
  imageDocuments,
  jsScripts,
  scripts,
  storyboards,
  timelineSequences,
  type DbTransaction
} from "@nodetool-ai/models";
import type { StorageAdapter } from "@nodetool-ai/storage";
import { Application } from "@nodetool-ai/models";
import { retrieveAssetBytes, getAssetStorageKey } from "./asset-paths.js";

export class ProjectCopyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectCopyError";
  }
}

interface DocumentSource {
  readonly type: ProjectDocumentType;
  readonly id: string;
  readonly row:
    | Storyboard
    | Script
    | TimelineSequence
    | ImageDocument
    | Application
    | JsScript;
}

interface PreparedAsset {
  readonly source: Asset;
  readonly bytes: Uint8Array | null;
}

const ASSET_KEYS = new Set([
  "assetid",
  "asset_id",
  "assetids",
  "asset_ids",
  "entityid",
  "entity_id",
  "entityids",
  "entity_ids",
  "thumbnailassetid",
  "thumbnail_asset_id",
  "referenceassetid",
  "reference_asset_id",
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

function addRef(
  value: unknown,
  target: Set<string>,
  kind: "asset" | "document"
): void {
  if (typeof value === "string" && value.length > 0) target.add(value);
  if (Array.isArray(value)) {
    for (const item of value) addRef(item, target, kind);
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
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current === "string") {
      if (current.startsWith("asset://")) assetIds.add(current.slice(8));
      continue;
    }
    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }
    if (!isRecord(current)) continue;
    for (const [key, child] of Object.entries(current)) {
      if (WORKFLOW_KEYS.has(key) && child != null && child !== "") {
        throw new ProjectCopyError(
          `Unsupported workflow dependency at ${key}. Copy the workflow separately first.`
        );
      }
      if (ASSET_KEYS.has(key)) addRef(child, assetIds, "asset");
      const documentType = DOCUMENT_KEYS[key];
      if (documentType) {
        const ids = new Set<string>();
        addRef(child, ids, "document");
        for (const id of ids) documents.push({ type: documentType, id });
      }
      pending.push(child);
    }
  }
  return { assetIds, documents };
}

function cloneAndRemap(
  value: unknown,
  ids: ReadonlyMap<string, string>
): unknown {
  if (typeof value === "string") {
    if (value.startsWith("asset://")) {
      const copied = ids.get(value.slice(8));
      return copied ? `asset://${copied}` : value;
    }
    return ids.get(value) ?? value;
  }
  if (Array.isArray(value)) return value.map((item) => cloneAndRemap(item, ids));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, cloneAndRemap(child, ids)])
  );
}

async function loadDocument(
  userId: string,
  type: ProjectDocumentType,
  id: string
): Promise<DocumentSource> {
  const row = await (
    {
      storyboard: Storyboard.findById,
      script: Script.findById,
      timeline: TimelineSequence.findById,
      sketch: ImageDocument.findById,
      application: Application.findById,
      jsscript: JsScript.findById
    } as const
  )[type](id);
  if (!row || row.user_id !== userId) {
    throw new ProjectCopyError(`${type} dependency ${id} is unavailable`);
  }
  return { type, id, row };
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
        throw new ProjectCopyError("Unsupported workflow dependency on timeline");
      }
      break;
    case "sketch":
      if (source.row.workflow_id) {
        throw new ProjectCopyError("Unsupported workflow dependency on sketch");
      }
      if (source.row.thumbnail_asset_id) found.assetIds.add(source.row.thumbnail_asset_id);
      break;
    case "application":
    case "jsscript":
      break;
  }
  return found;
}

function valuesForDocument(
  source: DocumentSource,
  destinationId: string,
  destinationProjectId: string,
  ids: ReadonlyMap<string, string>
): { table: unknown; values: Record<string, unknown> } {
  const now = new Date().toISOString();
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
        table: storyboards,
        values: {
          ...base,
          timeline_id: source.row.timeline_id
            ? ids.get(source.row.timeline_id) ?? null
            : null,
          revision: 0
        }
      };
    case "script":
      return {
        table: scripts,
        values: {
          ...base,
          timeline_id: source.row.timeline_id
            ? ids.get(source.row.timeline_id) ?? null
            : null,
          storyboard_id: source.row.storyboard_id
            ? ids.get(source.row.storyboard_id) ?? null
            : null
        }
      };
    case "timeline":
      return {
        table: timelineSequences,
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
        table: imageDocuments,
        values: {
          ...base,
          workflow_id: null,
          width: source.row.width,
          height: source.row.height,
          background_color: source.row.background_color,
          thumbnail_asset_id: source.row.thumbnail_asset_id
            ? ids.get(source.row.thumbnail_asset_id) ?? null
            : null,
          revision: 0
        }
      };
    case "application":
      return {
        table: applications,
        values: { ...base, description: source.row.description }
      };
    case "jsscript":
      return { table: jsScripts, values: base };
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
  while (assetsToVisit.length > 0) {
    const assetId = assetsToVisit.pop();
    if (!assetId || assetIds.has(assetId)) continue;
    const source = await Asset.find(args.userId, assetId);
    if (!source) throw new ProjectCopyError(`Asset dependency ${assetId} is unavailable`);
    assetIds.set(assetId, createTimeOrderedUuid());
    const metadataRefs = findReferences(source.metadata);
    assetsToVisit.push(...metadataRefs.assetIds);
    const bytes = source.isFolder
      ? null
      : await retrieveAssetBytes(args.storage, source.user_id, source.id, source.content_type);
    if (!source.isFolder && !bytes) {
      throw new ProjectCopyError(`Asset dependency ${assetId} has no stored media`);
    }
    preparedAssets.set(assetId, { source, bytes });
  }

  const ids = new Map<string, string>(assetIds);
  for (const [key, destinationId] of documentIds) {
    ids.set(key.slice(key.indexOf(":") + 1), destinationId);
  }

  const storedUris: string[] = [];
  try {
    for (const [sourceId, prepared] of preparedAssets) {
      if (!prepared.bytes) continue;
      const destinationId = assetIds.get(sourceId);
      if (!destinationId) throw new ProjectCopyError("Asset map was incomplete");
      const key = getAssetStorageKey(
        prepared.source.user_id,
        destinationId,
        prepared.source.content_type
      );
      storedUris.push(
        await args.storage.store(key, prepared.bytes, prepared.source.content_type)
      );
    }

    const db = getDb();
    const writes = (tx: DbTransaction) => {
      const statements = [];
      const now = new Date().toISOString();
      for (const [sourceId, prepared] of preparedAssets) {
        const destinationId = assetIds.get(sourceId);
        if (!destinationId) throw new ProjectCopyError("Asset map was incomplete");
        statements.push(
          tx.insert(assets).values({
            id: destinationId,
            user_id: prepared.source.user_id,
            parent_id: null,
            file_id: null,
            name: prepared.source.name,
            content_type: prepared.source.content_type,
            size: prepared.bytes?.byteLength ?? prepared.source.size,
            duration: prepared.source.duration,
            metadata: cloneAndRemap(prepared.source.metadata, ids) as Record<string, unknown> | null,
            sketch_document_id: null,
            workflow_id: null,
            node_id: null,
            job_id: null,
            timeline_id: null,
            project_id: args.destinationProjectId,
            created_at: now,
            updated_at: now
          })
        );
      }
      for (const [sourceKey, source] of sources) {
        const destinationId = documentIds.get(sourceKey);
        if (!destinationId) throw new ProjectCopyError("Document map was incomplete");
        const row = valuesForDocument(source, destinationId, args.destinationProjectId, ids);
        statements.push(
          tx.insert(row.table as typeof storyboards).values(row.values as never)
        );
      }
      return statements;
    };
    if (getDbType() === "sqlite") {
      db.transaction((tx: DbTransaction): void => {
        for (const statement of writes(tx)) {
          (statement as { run: () => void }).run();
        }
      });
    } else {
      await db.transaction(async (tx: DbTransaction): Promise<void> => {
        for (const statement of writes(tx)) await statement;
      });
    }
  } catch (error) {
    await Promise.allSettled(storedUris.map((uri) => args.storage.delete(uri)));
    throw error;
  }

  const root = sources.get(`${args.type}:${args.id}`);
  const copiedId = documentIds.get(`${args.type}:${args.id}`);
  if (!root || !copiedId) throw new ProjectCopyError("Copy root was unavailable");
  return {
    id: copiedId,
    name: root.row.name,
    copiedAssets: preparedAssets.size,
    copiedDocuments: sources.size
  };
}
