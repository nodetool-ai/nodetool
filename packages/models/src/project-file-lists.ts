/**
 * The erased list and the Incomplete list of cloud projects
 * (docs/plans/native-cloud-sync/technical-design.md, "Deletion, restore and
 * storage", WP2.9). See schema/project-file-lists.ts. The erase itself, which
 * checks current content and removes the blob rows, is
 * `@nodetool-ai/project-services/project-erase`.
 */
import { and, eq, inArray } from "drizzle-orm";
import { createTimeOrderedUuid } from "./base-model.js";
import { getPortableDb } from "./db.js";
import { assets } from "./schema/assets.js";
import { deletedDocuments } from "./schema/deleted-documents.js";
import { projectBlobs } from "./schema/project-blobs.js";
import { projectErasedFiles, projectMissingFiles, projectWorkspaceHashes } from "./schema/project-file-lists.js";

export type ProjectErasedFileRow = typeof projectErasedFiles.$inferSelect;
export type ProjectMissingFileRow = typeof projectMissingFiles.$inferSelect;
export type ProjectWorkspaceHashRow = typeof projectWorkspaceHashes.$inferSelect;

export type MissingFileReason = "missing_locally" | "too_large" | "over_allowance";

const IN_LIST_CHUNK = 400;

/** Puts a hash on the project's erased list. Erasing it again keeps the first row. */
export async function recordErasedFile(input: {
  projectId: string;
  userId: string;
  hash: string;
  size: number;
  assetIds: readonly string[];
  now?: Date;
}): Promise<void> {
  await getPortableDb()
    .insert(projectErasedFiles)
    .values({
      id: createTimeOrderedUuid(),
      project_id: input.projectId,
      user_id: input.userId,
      hash: input.hash,
      size: input.size,
      asset_ids: [...new Set(input.assetIds)].sort(),
      erased_at: (input.now ?? new Date()).toISOString()
    })
    .onConflictDoNothing({ target: [projectErasedFiles.project_id, projectErasedFiles.hash] });
}

/** The erased row of `hash` in the project, or null when it is not on the list. */
export async function getErasedFile(projectId: string, hash: string): Promise<ProjectErasedFileRow | null> {
  const [row] = await getPortableDb()
    .select()
    .from(projectErasedFiles)
    .where(and(eq(projectErasedFiles.project_id, projectId), eq(projectErasedFiles.hash, hash)))
    .limit(1);
  return row ?? null;
}

/** The project's erased list, oldest first. */
export async function listErasedFiles(projectId: string): Promise<ProjectErasedFileRow[]> {
  const rows = await getPortableDb()
    .select()
    .from(projectErasedFiles)
    .where(eq(projectErasedFiles.project_id, projectId));
  return rows.sort((a, b) => a.erased_at.localeCompare(b.erased_at) || a.hash.localeCompare(b.hash));
}

/** Takes a hash off the erased list. Returns false when it was not on it. */
export async function removeErasedFile(projectId: string, hash: string): Promise<boolean> {
  const rows = await getPortableDb()
    .delete(projectErasedFiles)
    .where(and(eq(projectErasedFiles.project_id, projectId), eq(projectErasedFiles.hash, hash)))
    .returning({ id: projectErasedFiles.id });
  return rows.length > 0;
}

/** The erased hashes and the asset ids the erased rows name, for a transfer's checks. */
export async function erasedFilesOf(projectId: string): Promise<{ hashes: Set<string>; assetIds: Set<string> }> {
  const hashes = new Set<string>();
  const assetIds = new Set<string>();
  for (const row of await listErasedFiles(projectId)) {
    hashes.add(row.hash);
    for (const assetId of row.asset_ids) assetIds.add(assetId);
  }
  return { hashes, assetIds };
}

/**
 * Records the files a committed attempt confirmed missing. A file listed
 * before takes the newer reason, size and transfer.
 */
export async function recordMissingFiles(input: {
  projectId: string;
  userId: string;
  transferId: string;
  files: readonly { assetId: string; hash?: string; size?: number; reason: MissingFileReason }[];
  now?: Date;
}): Promise<void> {
  const now = (input.now ?? new Date()).toISOString();
  for (const file of input.files) {
    const values = {
      hash: file.hash ?? null,
      size: file.size ?? null,
      reason: file.reason,
      transfer_id: input.transferId
    };
    await getPortableDb()
      .insert(projectMissingFiles)
      .values({
        id: createTimeOrderedUuid(),
        project_id: input.projectId,
        user_id: input.userId,
        asset_id: file.assetId,
        created_at: now,
        ...values
      })
      .onConflictDoUpdate({ target: [projectMissingFiles.project_id, projectMissingFiles.asset_id], set: values });
  }
}

/** Removes the rows of files a transfer supplied. Returns how many it removed. */
export async function removeMissingFiles(projectId: string, assetIds: readonly string[]): Promise<number> {
  let removed = 0;
  const unique = [...new Set(assetIds)];
  for (let i = 0; i < unique.length; i += IN_LIST_CHUNK) {
    const rows = await getPortableDb()
      .delete(projectMissingFiles)
      .where(
        and(
          eq(projectMissingFiles.project_id, projectId),
          inArray(projectMissingFiles.asset_id, unique.slice(i, i + IN_LIST_CHUNK))
        )
      )
      .returning({ id: projectMissingFiles.id });
    removed += rows.length;
  }
  return removed;
}

/** The project's Incomplete list, by asset id. */
export async function listMissingFiles(projectId: string): Promise<ProjectMissingFileRow[]> {
  const rows = await getPortableDb()
    .select()
    .from(projectMissingFiles)
    .where(eq(projectMissingFiles.project_id, projectId));
  return rows.sort((a, b) => a.asset_id.localeCompare(b.asset_id));
}

/** The ids of every asset whose content has `hash`. */
export async function assetIdsWithContentHash(hash: string): Promise<string[]> {
  const rows = await getPortableDb().select({ id: assets.id }).from(assets).where(eq(assets.content_hash, hash));
  return rows.map((row) => row.id).sort();
}

/** The project folder files whose content has `hash`, by path. */
export async function projectFilesWithContentHash(
  projectId: string,
  hash: string
): Promise<{ assetId: string; path: string }[]> {
  const rows = await getPortableDb()
    .select({ id: assets.id, path: assets.workspace_path })
    .from(assets)
    .where(and(eq(assets.project_id, projectId), eq(assets.content_hash, hash)));
  return rows.flatMap((row) => (row.path ? [{ assetId: row.id, path: row.path }] : [])).sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Deletes every row, staged or committed, through which the project holds
 * `hash`. Returns the largest size they recorded, or null when there was
 * none. The object stays until no row and no live revision set names the
 * hash, which `deleteUnnamedBlob` checks.
 */
export async function deleteProjectBlobRows(projectId: string, hash: string): Promise<number | null> {
  const rows = await getPortableDb()
    .delete(projectBlobs)
    .where(and(eq(projectBlobs.project_id, projectId), eq(projectBlobs.hash, hash)))
    .returning({ size: projectBlobs.size, committed_at: projectBlobs.committed_at });
  const committed = rows.filter((row) => row.committed_at !== null);
  if (committed.length === 0) return null;
  return Math.max(...committed.map((row) => Number(row.size)));
}

/** Deletes the rows a transfer staged for hashes on the erased list (TC81). */
export async function deleteStagedErasedBlobs(projectId: string, transferId: string, hashes: ReadonlySet<string>): Promise<number> {
  if (hashes.size === 0) return 0;
  let removed = 0;
  const list = [...hashes];
  for (let i = 0; i < list.length; i += IN_LIST_CHUNK) {
    const rows = await getPortableDb()
      .delete(projectBlobs)
      .where(
        and(
          eq(projectBlobs.project_id, projectId),
          eq(projectBlobs.transfer_id, transferId),
          inArray(projectBlobs.hash, list.slice(i, i + IN_LIST_CHUNK))
        )
      )
      .returning({ id: projectBlobs.id });
    removed += rows.length;
  }
  return removed;
}

/** The deleted documents of a project that still wait for their purge, with the files their payloads name. */
export async function deletedDocumentsOfProject(
  projectId: string
): Promise<{ kind: string; documentId: string; name: string; payload: string }[]> {
  const rows = await getPortableDb()
    .select({
      kind: deletedDocuments.kind,
      document_id: deletedDocuments.document_id,
      name: deletedDocuments.name,
      payload: deletedDocuments.payload
    })
    .from(deletedDocuments)
    .where(eq(deletedDocuments.project_id, projectId));
  return rows
    .filter((row) => row.kind !== "project")
    .map((row) => ({ kind: row.kind, documentId: row.document_id, name: row.name, payload: row.payload }));
}

/** The hashes the server read from the project's workspace files, by path (RW3). */
export async function listProjectWorkspaceHashes(projectId: string): Promise<Map<string, ProjectWorkspaceHashRow>> {
  const rows = await getPortableDb()
    .select()
    .from(projectWorkspaceHashes)
    .where(eq(projectWorkspaceHashes.project_id, projectId));
  return new Map(rows.map((row) => [row.path, row]));
}

/** Records the hash a workspace file had at a size and modification time. */
export async function setProjectWorkspaceHash(input: {
  projectId: string;
  userId: string;
  path: string;
  size: number;
  mtimeMs: number;
  hash: string;
  now?: Date;
}): Promise<void> {
  const now = (input.now ?? new Date()).toISOString();
  await getPortableDb()
    .insert(projectWorkspaceHashes)
    .values({
      id: createTimeOrderedUuid(),
      project_id: input.projectId,
      user_id: input.userId,
      path: input.path,
      size: input.size,
      mtime_ms: input.mtimeMs,
      hash: input.hash,
      updated_at: now
    })
    .onConflictDoUpdate({
      target: [projectWorkspaceHashes.project_id, projectWorkspaceHashes.path],
      set: { size: input.size, mtime_ms: input.mtimeMs, hash: input.hash, updated_at: now }
    });
}

/** Deletes the hash rows of paths the folder no longer holds as workspace files. */
export async function deleteProjectWorkspaceHashes(projectId: string, paths: readonly string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += IN_LIST_CHUNK) {
    await getPortableDb()
      .delete(projectWorkspaceHashes)
      .where(
        and(
          eq(projectWorkspaceHashes.project_id, projectId),
          inArray(projectWorkspaceHashes.path, paths.slice(i, i + IN_LIST_CHUNK))
        )
      );
  }
}
