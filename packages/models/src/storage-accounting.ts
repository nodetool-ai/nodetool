/**
 * Storage accounting for the blob store
 * (docs/plans/native-cloud-sync/technical-design.md, "Deletion, restore and
 * storage", WP2.3, PRD D5).
 *
 * An owner's storage use is the sum of the sizes of the distinct hashes that
 * have a committed blob row in the owner's projects. A file held by two
 * projects counts once. Everything retained counts: a file that only a saved
 * version or a deleted document refers to keeps its row until it is erased
 * or purged, so it stays in the sum.
 *
 * The allowance is one value set by the host. Unset means unlimited, and an
 * owner is then never over it.
 */
import { and, eq, inArray, isNotNull, max } from "drizzle-orm";
import { getPortableDb } from "./db.js";
import { DocumentRefs } from "./document-refs.js";
import { assets } from "./schema/assets.js";
import { deletedDocuments } from "./schema/deleted-documents.js";
import { documentRefs } from "./schema/document-refs.js";
import { projectBlobs } from "./schema/project-blobs.js";
import { projects } from "./schema/projects.js";

/** The fraction of the allowance at which the owner is warned (PRD, 90 percent). */
export const STORAGE_WARNING_FRACTION = 0.9;

const IN_LIST_CHUNK = 400;

// Host configuration, set once at start-up before requests are served, as
// the restore period is with setDocumentRetentionDays.
let allowanceBytes: number | null = null;

/**
 * Sets the storage allowance in bytes, or null for unlimited. Throws for a
 * value that is not a non-negative whole number.
 */
export function setStorageAllowanceBytes(bytes: number | null): void {
  if (bytes !== null && (!Number.isSafeInteger(bytes) || bytes < 0)) {
    throw new Error(`Storage allowance must be a whole number of bytes, got ${bytes}`);
  }
  allowanceBytes = bytes;
}

/**
 * Reads an allowance from configuration text: unset or blank is unlimited.
 * Throws for text that is not a whole number of bytes, so a typo stops the
 * server instead of turning the limit off.
 */
export function parseStorageAllowance(value: string | undefined): number | null {
  const text = value?.trim() ?? "";
  if (text === "") return null;
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text))) {
    throw new Error(`Storage allowance must be a whole number of bytes, got "${text}"`);
  }
  return Number(text);
}

/** The storage allowance in bytes, or null when it is unlimited. */
export function storageAllowanceBytes(): number | null {
  return allowanceBytes;
}

export interface StorageUse {
  usedBytes: number;
  /** Distinct files counted in `usedBytes`. */
  fileCount: number;
}

export interface StorageAllowanceStatus extends StorageUse {
  allowanceBytes: number | null;
  /** Above the allowance: new generations and uploads are refused (N7). */
  overAllowance: boolean;
  /** At or above the warning threshold of the allowance. */
  nearAllowance: boolean;
}

/** Size of each distinct committed hash in the owner's projects. */
async function committedSizes(userId: string): Promise<Map<string, number>> {
  const rows = await getPortableDb()
    .select({ hash: projectBlobs.hash, size: max(projectBlobs.size) })
    .from(projectBlobs)
    .where(and(eq(projectBlobs.user_id, userId), isNotNull(projectBlobs.committed_at)))
    .groupBy(projectBlobs.hash);
  return new Map(rows.map((row) => [row.hash, Number(row.size ?? 0)]));
}

/** The owner's storage use. Staged rows of open transfers do not count. */
export async function storageUse(userId: string): Promise<StorageUse> {
  const sizes = await committedSizes(userId);
  let usedBytes = 0;
  for (const size of sizes.values()) usedBytes += size;
  return { usedBytes, fileCount: sizes.size };
}

/** Use against the allowance, for the review sheet and the storage view. */
export async function storageAllowanceStatus(userId: string): Promise<StorageAllowanceStatus> {
  const use = await storageUse(userId);
  const allowance = allowanceBytes;
  return {
    ...use,
    allowanceBytes: allowance,
    overAllowance: allowance !== null && use.usedBytes > allowance,
    nearAllowance: allowance !== null && use.usedBytes >= allowance * STORAGE_WARNING_FRACTION
  };
}

/**
 * Whether `addedBytes` more would take the owner above the allowance. Always
 * false while the allowance is unlimited.
 */
export async function exceedsStorageAllowance(userId: string, addedBytes = 0): Promise<boolean> {
  const allowance = allowanceBytes;
  if (allowance === null) return false;
  const { usedBytes } = await storageUse(userId);
  return usedBytes + addedBytes > allowance;
}

/** What keeps a file in storage. */
export type StorageHolder =
  /** The current revision of a document refers to it. */
  | { kind: "current"; documentType: string; documentId: string }
  /** A saved version of a document refers to it. */
  | { kind: "version"; documentType: string; documentId: string; versionId: string }
  /** A deleted document inside or awaiting the end of its restore period. */
  | { kind: "deleted_document"; documentType: string; documentId: string; name: string; purgeAt: string }
  /** A deleted project whose content waits for its purge. */
  | { kind: "deleted_project"; projectId: string; name: string; purgeAt: string };

export interface StorageFile {
  hash: string;
  size: number;
  /** The owner's projects with a committed row for the hash. */
  projects: { id: string; name: string; deleted: boolean }[];
  /** The owner's assets with this content, which documents refer to by id. */
  assetIds: string[];
  /**
   * What refers to the file. Empty when nothing does: the file is kept only
   * by its blob row and erasing it frees it. Documents of other people that
   * refer to the owner's file are left out.
   */
  holders: StorageHolder[];
}

function chunks<T>(values: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += IN_LIST_CHUNK) {
    out.push(values.slice(i, i + IN_LIST_CHUNK));
  }
  return out;
}

function fileOfRow(row: unknown): string | null {
  if (typeof row !== "object" || row === null || !("file" in row)) return null;
  return typeof row.file === "string" ? row.file : null;
}

/** The files the reference rows in a deleted document's payload name, by asset id. */
export function deletedDocumentRefFiles(payload: string): Set<string> {
  const files = new Set<string>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    // A payload that does not parse names no file; the purge still runs.
    return files;
  }
  if (typeof parsed !== "object" || parsed === null || !("dependents" in parsed)) return files;
  const dependents = parsed.dependents;
  if (typeof dependents !== "object" || dependents === null || !("document_refs" in dependents)) {
    return files;
  }
  const refs = dependents.document_refs;
  if (!Array.isArray(refs)) return files;
  for (const row of refs) {
    const file = fileOfRow(row);
    if (file !== null) files.add(file);
  }
  return files;
}

/**
 * The data of the storage view: every file the owner's use counts, with its
 * projects and what keeps it, from the retention roots. Documents are named
 * by type and id. The caller decides which of them the owner may see named,
 * with `isOwnDocument`, which leaves out documents of other people.
 */
export async function storageFiles(
  userId: string,
  isOwnDocument: (documentType: string, documentId: string) => Promise<boolean>
): Promise<StorageFile[]> {
  const db = getPortableDb();
  const sizes = await committedSizes(userId);
  if (sizes.size === 0) return [];
  const hashes = [...sizes.keys()];

  const projectRows = await db
    .selectDistinct({ hash: projectBlobs.hash, projectId: projectBlobs.project_id })
    .from(projectBlobs)
    .where(and(eq(projectBlobs.user_id, userId), isNotNull(projectBlobs.committed_at)));
  const projectIds = [...new Set(projectRows.map((row) => row.projectId))];
  const projectInfo = new Map<string, { name: string; deleted: boolean }>();
  for (const part of chunks(projectIds)) {
    const rows = await db
      .select({ id: projects.id, name: projects.name, deleted_at: projects.deleted_at })
      .from(projects)
      .where(inArray(projects.id, part));
    for (const row of rows) {
      projectInfo.set(row.id, { name: row.name, deleted: row.deleted_at !== null });
    }
  }

  const assetsByHash = new Map<string, string[]>();
  const hashOfAsset = new Map<string, string>();
  for (const part of chunks(hashes)) {
    const rows = await db
      .select({ id: assets.id, hash: assets.content_hash })
      .from(assets)
      .where(and(eq(assets.user_id, userId), inArray(assets.content_hash, part)));
    for (const row of rows) {
      if (row.hash === null) continue;
      hashOfAsset.set(row.id, row.hash);
      const list = assetsByHash.get(row.hash) ?? [];
      list.push(row.id);
      assetsByHash.set(row.hash, list);
    }
  }

  const holders = new Map<string, StorageHolder[]>();
  const add = (hash: string, holder: StorageHolder) => {
    const list = holders.get(hash) ?? [];
    list.push(holder);
    holders.set(hash, list);
  };

  const ownership = new Map<string, boolean>();
  const own = async (documentType: string, documentId: string): Promise<boolean> => {
    const key = `${documentType}\u0000${documentId}`;
    let known = ownership.get(key);
    if (known === undefined) {
      known = await isOwnDocument(documentType, documentId);
      ownership.set(key, known);
    }
    return known;
  };

  const seen = new Set<string>();
  for (const part of chunks([...hashOfAsset.keys()])) {
    const rows = await db
      .select({
        document_type: documentRefs.document_type,
        document_id: documentRefs.document_id,
        version_id: documentRefs.version_id,
        file: documentRefs.file
      })
      .from(documentRefs)
      .where(inArray(documentRefs.file, part));
    for (const row of rows) {
      const hash = hashOfAsset.get(row.file);
      if (hash === undefined) continue;
      if (!(await own(row.document_type, row.document_id))) continue;
      const current = DocumentRefs.isCurrentKey(row.version_id);
      // A file in several scopes or stale current sets is one holder.
      const key = [hash, row.document_type, row.document_id, current ? "" : row.version_id].join("\u0000");
      if (seen.has(key)) continue;
      seen.add(key);
      add(
        hash,
        current
          ? { kind: "current", documentType: row.document_type, documentId: row.document_id }
          : {
              kind: "version",
              documentType: row.document_type,
              documentId: row.document_id,
              versionId: row.version_id
            }
      );
    }
  }

  const deletedRows = await db
    .select()
    .from(deletedDocuments)
    .where(eq(deletedDocuments.user_id, userId));
  const deletedProjects = new Map<string, { name: string; purgeAt: string }>();
  for (const row of deletedRows) {
    if (row.kind === "project") {
      deletedProjects.set(row.document_id, { name: row.name, purgeAt: row.purge_at });
      continue;
    }
    for (const file of deletedDocumentRefFiles(row.payload)) {
      const hash = hashOfAsset.get(file);
      if (hash === undefined) continue;
      const key = [hash, "deleted", row.kind, row.document_id].join("\u0000");
      if (seen.has(key)) continue;
      seen.add(key);
      add(hash, {
        kind: "deleted_document",
        documentType: row.kind,
        documentId: row.document_id,
        name: row.name,
        purgeAt: row.purge_at
      });
    }
  }

  const projectsByHash = new Map<string, string[]>();
  for (const row of projectRows) {
    const list = projectsByHash.get(row.hash) ?? [];
    list.push(row.projectId);
    projectsByHash.set(row.hash, list);
  }

  return hashes.map((hash) => {
    const fileProjects = (projectsByHash.get(hash) ?? []).map((id) => {
      const info = projectInfo.get(id);
      return { id, name: info?.name ?? "", deleted: info?.deleted ?? true };
    });
    const fileHolders = [...(holders.get(hash) ?? [])];
    for (const project of fileProjects) {
      const deleted = deletedProjects.get(project.id);
      if (deleted) {
        fileHolders.push({
          kind: "deleted_project",
          projectId: project.id,
          name: deleted.name,
          purgeAt: deleted.purgeAt
        });
      }
    }
    return {
      hash,
      size: sizes.get(hash) ?? 0,
      projects: fileProjects,
      assetIds: assetsByHash.get(hash) ?? [],
      holders: fileHolders
    };
  });
}
