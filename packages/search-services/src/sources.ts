/**
 * The source tables the library index covers, and how to read them.
 */

import { and, eq, inArray, isNull, ne, or, type SQL } from "drizzle-orm";
import {
  Asset,
  applications,
  assets,
  games,
  getPortableDb,
  imageDocuments,
  jsScripts,
  scripts,
  storyboards,
  timelineSequences,
  workflows
} from "@nodetool-ai/models";
import type { SearchResourceType } from "@nodetool-ai/protocol";
import {
  assetSourceVersion,
  extractAsset,
  extractDocument,
  type AssetSource,
  type DocumentSource,
  type ExtractedItem
} from "./extract.js";

export type DocumentResourceType = Exclude<SearchResourceType, "asset">;

type DocumentTable =
  | typeof workflows
  | typeof applications
  | typeof imageDocuments
  | typeof scripts
  | typeof storyboards
  | typeof timelineSequences
  | typeof jsScripts
  | typeof games;

export const DOCUMENT_TABLES: Record<DocumentResourceType, DocumentTable> = {
  workflow: workflows,
  application: applications,
  image_document: imageDocuments,
  script: scripts,
  storyboard: storyboards,
  timeline_sequence: timelineSequences,
  js_script: jsScripts,
  game: games
};

/** The model class each resource type is saved through, as `ModelObserver` names it. */
export const RESOURCE_TYPE_BY_MODEL: Record<string, SearchResourceType> = {
  Asset: "asset",
  Workflow: "workflow",
  Application: "application",
  ImageDocument: "image_document",
  Script: "script",
  Storyboard: "storyboard",
  TimelineSequence: "timeline_sequence",
  JsScript: "js_script",
  Game: "game"
};

/**
 * Workflow rows a person sees as documents: the run modes `Workflow.paginate`
 * lists by default. Other run modes are internal rows and are not indexed.
 */
const LISTED_RUN_MODES = ["workflow", "layer", "clip", "comfy"];

function listedWorkflows(): SQL {
  return or(inArray(workflows.run_mode, LISTED_RUN_MODES), isNull(workflows.run_mode))!;
}

/** The condition a source row must meet to be a library item, beyond its owner. */
function sourceCondition(resourceType: SearchResourceType): SQL | undefined {
  if (resourceType === "asset") return ne(assets.content_type, "folder");
  if (resourceType === "workflow") return listedWorkflows();
  return undefined;
}

/** Id, owner and version of every source row, optionally for one owner. */
export async function listSourceVersions(
  resourceType: SearchResourceType,
  userId?: string
): Promise<Array<{ id: string; userId: string; version: string }>> {
  const db = getPortableDb();
  if (resourceType === "asset") {
    const rows = await db
      .select({
        id: assets.id,
        user_id: assets.user_id,
        updated_at: assets.updated_at,
        content_hash: assets.content_hash
      })
      .from(assets)
      .where(and(userId ? eq(assets.user_id, userId) : undefined, sourceCondition("asset")));
    return rows.map((row) => ({ id: row.id, userId: row.user_id, version: assetSourceVersion(row) }));
  }
  const table = DOCUMENT_TABLES[resourceType];
  const rows = await db
    .select({ id: table.id, user_id: table.user_id, updated_at: table.updated_at })
    .from(table)
    .where(and(userId ? eq(table.user_id, userId) : undefined, sourceCondition(resourceType)));
  return rows.map((row) => ({ id: row.id, userId: row.user_id, version: row.updated_at }));
}

/** Folder path an asset is shown under, as the asset browser spells it. */
async function assetFolderPaths(
  userId: string,
  rows: readonly AssetSource[]
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const needChain: string[] = [];
  for (const row of rows) {
    if (row.workspace_path) {
      const slash = row.workspace_path.lastIndexOf("/");
      out.set(row.id, slash > 0 ? row.workspace_path.slice(0, slash) : null);
    } else {
      needChain.push(row.id);
    }
  }
  if (needChain.length > 0) {
    const info = await Asset.getAssetPathInfo(userId, needChain);
    for (const id of needChain) out.set(id, info[id]?.folder_path ?? null);
  }
  return out;
}

/**
 * Extract the given source rows of one owner. A row that is not a library
 * item, such as a shipped entity preset, maps to `"skip"`. A row that is gone
 * is absent from the result.
 */
export async function extractSources(
  resourceType: SearchResourceType,
  userId: string,
  ids: readonly string[]
): Promise<Map<string, ExtractedItem | "skip">> {
  const out = new Map<string, ExtractedItem | "skip">();
  const db = getPortableDb();
  for (let start = 0; start < ids.length; start += 500) {
    const batch = ids.slice(start, start + 500);
    if (resourceType === "asset") {
      const rows = await db
        .select()
        .from(assets)
        .where(and(eq(assets.user_id, userId), inArray(assets.id, batch)));
      const paths = await assetFolderPaths(userId, rows);
      for (const row of rows) {
        out.set(row.id, extractAsset(row, paths.get(row.id) ?? null) ?? "skip");
      }
      continue;
    }
    const table = DOCUMENT_TABLES[resourceType];
    const rows = (await db
      .select()
      .from(table)
      .where(
        and(eq(table.user_id, userId), inArray(table.id, batch), sourceCondition(resourceType))
      )) as DocumentSource[];
    for (const row of rows) out.set(row.id, extractDocument(resourceType, row));
  }
  return out;
}

/** The ids among `ids` whose source row still exists for `userId`. */
export async function existingSourceIds(
  resourceType: SearchResourceType,
  userId: string,
  ids: readonly string[]
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const table = resourceType === "asset" ? assets : DOCUMENT_TABLES[resourceType];
  const rows = await getPortableDb()
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.user_id, userId), inArray(table.id, [...ids])));
  return new Set(rows.map((row) => row.id));
}
