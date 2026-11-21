/**
 * The Incomplete list and the erased list of a cloud project, filtered for
 * one reader (docs/plans/native-cloud-sync/technical-design.md, "Deletion,
 * restore and storage", WP2.9, PRD X7, SR32, AC73).
 *
 * A row is returned only when one of its assets is referred to by content
 * the reader may read: the current revision of a workflow or timeline of
 * the project that the reader can open, or one of its saved versions when
 * the reader may read history. The row names only those documents. Counts
 * and sizes are computed over the returned rows. A file that only other
 * documents refer to is not listed, counted or named.
 *
 * The references are read from each document's content with `refsOf`, not
 * from its stored reference sets. A set holds only files that have an asset
 * row the owner owns, and a missing file often has none on the server.
 * Content is what the reader may read anyway, so the asset ids it names are
 * the reader's to see.
 *
 * The owner sees every row, including those no document refers to now.
 * Projects have no grants before phase 4, so the owner is the only reader
 * of the whole project.
 */
import {
  listErasedFiles,
  listMissingFiles,
  Project,
  TimelineSequence,
  TimelineSequenceVersion,
  Workflow,
  WorkflowVersion
} from "@nodetool-ai/models";
import { refsOf, type RefDocumentKind } from "@nodetool-ai/protocol";
import type { EffectiveAccessItem } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import type { ProjectFileListsOutput } from "@nodetool-ai/protocol/api-schemas/storage.js";
import { effectiveAccess } from "./document-access.js";

/** Saved versions read per document, as the reference sets read them. */
const VERSION_LIMIT = 1000;

interface NamedDocument {
  kind: RefDocumentKind;
  document_id: string;
  name: string;
}

/** Why a reader gets nothing: the project is gone, or they can open none of it. */
export class ProjectFileListsNotFound extends Error {
  constructor() {
    super("Project not found");
    this.name = "ProjectFileListsNotFound";
  }
}

function readsVersions(access: EffectiveAccessItem): boolean {
  return access.role !== "viewer" || access.options.allow_history;
}

async function versionContents(kind: RefDocumentKind, id: string): Promise<unknown[]> {
  if (kind === "workflow") {
    return (await WorkflowVersion.listForWorkflow(id, { limit: VERSION_LIMIT })).map((v) => v.graph as unknown);
  }
  return (await TimelineSequenceVersion.listForTimeline(id, { limit: VERSION_LIMIT })).map((v) => v.document as unknown);
}

/**
 * The documents of the project the reader can open, by each asset id their
 * readable content refers to.
 */
async function readableReferences(
  userId: string,
  project: Project
): Promise<{ opened: number; byAsset: Map<string, NamedDocument[]> }> {
  const [workflows, timelines] = await Promise.all([
    Workflow.listForProjects(project.user_id, [project.id]),
    TimelineSequence.listForProjects(project.user_id, [project.id])
  ]);
  const documents: Array<{ kind: RefDocumentKind; id: string; name: string; content: unknown }> = [
    ...workflows.map((w) => ({ kind: "workflow" as const, id: w.id, name: w.name, content: w.graph as unknown })),
    ...timelines.map((t) => ({ kind: "timeline" as const, id: t.id, name: t.name, content: t.document as unknown }))
  ];
  const byAsset = new Map<string, NamedDocument[]>();
  let opened = 0;
  for (const document of documents) {
    const access = await effectiveAccess(userId, document.kind, document.id);
    if (!access) continue;
    opened += 1;
    const files = new Set(refsOf(document.kind, document.content));
    if (readsVersions(access)) {
      for (const content of await versionContents(document.kind, document.id)) {
        for (const file of refsOf(document.kind, content)) files.add(file);
      }
    }
    const named = { kind: document.kind, document_id: document.id, name: document.name };
    for (const file of files) {
      const list = byAsset.get(file) ?? [];
      list.push(named);
      byAsset.set(file, list);
    }
  }
  for (const list of byAsset.values()) {
    list.sort((a, b) => a.kind.localeCompare(b.kind) || a.document_id.localeCompare(b.document_id));
  }
  return { opened, byAsset };
}

/** Each document once, across several assets. */
function documentsOf(byAsset: Map<string, NamedDocument[]>, assetIds: readonly string[]): NamedDocument[] {
  const seen = new Map<string, NamedDocument>();
  for (const assetId of assetIds) {
    for (const document of byAsset.get(assetId) ?? []) seen.set(`${document.kind}:${document.document_id}`, document);
  }
  return [...seen.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.document_id.localeCompare(b.document_id));
}

/**
 * The project's Incomplete and erased lists as `userId` may see them.
 * Throws {@link ProjectFileListsNotFound} for a project that is gone or that
 * the reader can open nothing of.
 */
export async function projectFileLists(userId: string, projectId: string): Promise<ProjectFileListsOutput> {
  const project = await Project.get<Project>(projectId);
  if (!project || project.deleted_at) throw new ProjectFileListsNotFound();
  const owner = project.user_id === userId;
  const { opened, byAsset } = await readableReferences(userId, project);
  if (!owner && opened === 0) throw new ProjectFileListsNotFound();

  const missing: ProjectFileListsOutput["missing_files"] = [];
  for (const row of await listMissingFiles(project.id)) {
    const documents = documentsOf(byAsset, [row.asset_id]);
    if (!owner && documents.length === 0) continue;
    missing.push({
      asset_id: row.asset_id,
      hash: row.hash,
      size: row.size === null ? null : Number(row.size),
      reason: row.reason as ProjectFileListsOutput["missing_files"][number]["reason"],
      documents
    });
  }

  const erased: ProjectFileListsOutput["erased_files"] = [];
  for (const row of await listErasedFiles(project.id)) {
    // A reader learns only the asset ids their documents refer to.
    const assetIds = owner ? row.asset_ids : row.asset_ids.filter((assetId) => byAsset.has(assetId));
    const documents = documentsOf(byAsset, assetIds);
    if (!owner && documents.length === 0) continue;
    erased.push({
      hash: row.hash,
      size: Number(row.size),
      asset_ids: assetIds,
      erased_by: row.user_id,
      erased_at: row.erased_at,
      documents
    });
  }

  return {
    incomplete: missing.length > 0,
    missing_files: missing,
    missing_bytes: missing.reduce((sum, file) => sum + (file.size ?? 0), 0),
    erased_files: erased,
    erased_bytes: erased.reduce((sum, file) => sum + file.size, 0)
  };
}
