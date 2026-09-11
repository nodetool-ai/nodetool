/**
 * Moving a document between projects.
 *
 * Membership is one column on the document's own table, so a move is one
 * write per document — there is no join table to keep in step. The write
 * deliberately leaves `updated_at` alone: a project is not content, and
 * bumping the column would break the compare-and-swap save of an editor that
 * has the document open.
 */

import { and, eq } from "drizzle-orm";
import { readEntityMarker } from "@nodetool-ai/protocol";
import { Asset } from "./asset.js";
import { getDb } from "./db.js";
import { applications } from "./schema/applications.js";
import { assets } from "./schema/assets.js";
import { imageDocuments } from "./schema/image-documents.js";
import { jsScripts } from "./schema/js-scripts.js";
import { scripts } from "./schema/scripts.js";
import { storyboards } from "./schema/storyboards.js";
import { timelineSequences } from "./schema/timeline-sequences.js";
import type { ProjectDocumentType } from "./project-summary.js";

/**
 * What a project holds: its documents, plus entities — which are assets, not
 * rows in a document table, so they are their own member type rather than a
 * seventh {@link ProjectDocumentType}. Nothing opens an entity as a tab.
 */
export type ProjectMemberType = ProjectDocumentType | "entity";

/**
 * Every table that carries `project_id`. The list is the one
 * {@link moveDocumentToProject} switches over and the one the project overview
 * reads; a new document kind has to arrive in both. `assets` is here for the
 * bulk reassign a deleted project needs — an entity left naming a dead project
 * would vanish from every list, exactly as a stranded document would.
 */
const DOCUMENT_TABLES = [
  storyboards,
  scripts,
  timelineSequences,
  imageDocuments,
  applications,
  jsScripts,
  assets
] as const;

const REFERENCE_KEYS: Readonly<Record<string, ProjectMemberType>> = {
  storyboardId: "storyboard",
  storyboard_id: "storyboard",
  scriptId: "script",
  script_id: "script",
  timelineId: "timeline",
  timeline_id: "timeline",
  sketchId: "sketch",
  sketch_id: "sketch",
  applicationId: "application",
  application_id: "application",
  jsScriptId: "jsscript",
  js_script_id: "jsscript",
  entityId: "entity",
  entity_id: "entity",
  entityIds: "entity",
  entity_ids: "entity",
  assetId: "entity",
  asset_id: "entity",
  assetIds: "entity",
  asset_ids: "entity",
  currentAssetId: "entity",
  current_asset_id: "entity",
  waveformAssetId: "entity",
  waveform_asset_id: "entity",
  thumbnailAssetId: "entity",
  thumbnail_asset_id: "entity",
  referenceAssetId: "entity",
  reference_asset_id: "entity",
  referenceAssetIds: "entity",
  reference_asset_ids: "entity",
  locationId: "entity",
  location_id: "entity",
  styleEntityId: "entity",
  style_entity_id: "entity",
  sourceAssetId: "entity",
  source_asset_id: "entity",
  maskAssetId: "entity",
  mask_asset_id: "entity"
};

function matchesReference(value: unknown, id: string): boolean {
  if (typeof value === "string") {
    return value === id;
  }
  if (Array.isArray(value)) {
    return value.some((item) => matchesReference(item, id));
  }
  return false;
}

function valueIncludesReference(
  value: unknown,
  type: ProjectMemberType,
  id: string
): boolean {
  if (typeof value === "string") {
    return type === "entity" && value === `asset://${id}`;
  }
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) {
    return value.some((item) => valueIncludesReference(item, type, id));
  }
  for (const [key, child] of Object.entries(value)) {
    if (REFERENCE_KEYS[key] === type && matchesReference(child, id)) {
      return true;
    }
    if (valueIncludesReference(child, type, id)) return true;
  }
  return false;
}

/**
 * Whether another project document names this member. Moves do not rewrite
 * references, so callers must refuse a cross-project move rather than leave a
 * document pointing into a project it no longer owns.
 */
export async function hasProjectDocumentDependents(
  userId: string,
  type: ProjectMemberType,
  id: string
): Promise<boolean> {
  const db = getDb();
  const [boardRows, scriptRows, timelineRows, sketchRows, appRows, jsRows] =
    await Promise.all([
      db
        .select({ document: storyboards.document, timelineId: storyboards.timeline_id })
        .from(storyboards)
        .where(eq(storyboards.user_id, userId)),
      db
        .select({
          document: scripts.document,
          timelineId: scripts.timeline_id,
          storyboardId: scripts.storyboard_id
        })
        .from(scripts)
        .where(eq(scripts.user_id, userId)),
      db
        .select({ document: timelineSequences.document })
        .from(timelineSequences)
        .where(eq(timelineSequences.user_id, userId)),
      db
        .select({
          document: imageDocuments.document,
          thumbnailAssetId: imageDocuments.thumbnail_asset_id
        })
        .from(imageDocuments)
        .where(eq(imageDocuments.user_id, userId)),
      db
        .select({ document: applications.document })
        .from(applications)
        .where(eq(applications.user_id, userId)),
      db
        .select({ document: jsScripts.document })
        .from(jsScripts)
        .where(eq(jsScripts.user_id, userId))
    ]);
  const rows = [
    boardRows,
    scriptRows,
    timelineRows,
    sketchRows,
    appRows,
    jsRows
  ];
  return rows.some((group) =>
    group.some((row) => {
      const values = Object.values(row);
      return values.some((value) => {
        if (typeof value !== "string") return valueIncludesReference(value, type, id);
        try {
          return valueIncludesReference(JSON.parse(value), type, id);
        } catch {
          return value === id;
        }
      });
    })
  );
}

/**
 * Point every document of one project at another — the bulk form of
 * {@link moveDocumentToProject}, used when a project goes away and its
 * documents must land back in the loose bucket rather than keep naming an id
 * that resolves to nothing. Scoped to the owner, and `updated_at` is left alone
 * for the same reason a single move leaves it alone.
 *
 * Returns how many rows moved.
 */
export async function reassignProjectDocuments(
  userId: string,
  fromProjectId: string,
  toProjectId: string
): Promise<number> {
  const db = getDb();
  let moved = 0;
  for (const table of DOCUMENT_TABLES) {
    // Only the id comes back: a moved document would otherwise ship its whole
    // stored text column across just to be counted.
    const rows = await db
      .update(table)
      .set({ project_id: toProjectId })
      .where(and(eq(table.project_id, fromProjectId), eq(table.user_id, userId)))
      .returning({ id: table.id });
    moved += rows.length;
  }
  return moved;
}

/**
 * Point one document at `projectId`. Pass {@link LOOSE_PROJECT_ID} to move it
 * back out of every project. Returns false when the caller owns no such
 * document, so a wrong id reads as a miss rather than as a silent no-op.
 */
export async function moveDocumentToProject(
  userId: string,
  type: ProjectMemberType,
  documentId: string,
  projectId: string
): Promise<boolean> {
  const db = getDb();
  const fields = { project_id: projectId };
  switch (type) {
    case "entity": {
      // An entity is its asset, so the move is a column write like every other
      // — but only the assets carrying the marker are entities, and an asset
      // that carries none reads as a miss rather than being quietly filed
      // into a project that would never show it.
      const asset = await Asset.find(userId, documentId);
      if (!asset || !readEntityMarker(asset.metadata)) return false;
      asset.project_id = projectId;
      await asset.save();
      return true;
    }
    case "storyboard": {
      const rows = await db
        .update(storyboards)
        .set(fields)
        .where(
          and(eq(storyboards.id, documentId), eq(storyboards.user_id, userId))
        )
        .returning({ id: storyboards.id });
      return rows.length > 0;
    }
    case "script": {
      const rows = await db
        .update(scripts)
        .set(fields)
        .where(and(eq(scripts.id, documentId), eq(scripts.user_id, userId)))
        .returning({ id: scripts.id });
      return rows.length > 0;
    }
    case "timeline": {
      const rows = await db
        .update(timelineSequences)
        .set(fields)
        .where(
          and(
            eq(timelineSequences.id, documentId),
            eq(timelineSequences.user_id, userId)
          )
        )
        .returning({ id: timelineSequences.id });
      return rows.length > 0;
    }
    case "sketch": {
      const rows = await db
        .update(imageDocuments)
        .set(fields)
        .where(
          and(
            eq(imageDocuments.id, documentId),
            eq(imageDocuments.user_id, userId)
          )
        )
        .returning({ id: imageDocuments.id });
      return rows.length > 0;
    }
    case "application": {
      const rows = await db
        .update(applications)
        .set(fields)
        .where(
          and(eq(applications.id, documentId), eq(applications.user_id, userId))
        )
        .returning({ id: applications.id });
      return rows.length > 0;
    }
    case "jsscript": {
      const rows = await db
        .update(jsScripts)
        .set(fields)
        .where(and(eq(jsScripts.id, documentId), eq(jsScripts.user_id, userId)))
        .returning({ id: jsScripts.id });
      return rows.length > 0;
    }
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
}
