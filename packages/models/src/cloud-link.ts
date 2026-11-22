/**
 * Rows of the link between a native app's local project and a cloud project
 * (docs/plans/native-cloud-sync/technical-design.md, "Identity" and
 * "Receiving: revision set, stage, check, apply", WP2.7). The transfer client
 * in `@nodetool-ai/project-services` decides what goes in them. These
 * functions only store and read the rows of the local database.
 */
import { and, asc, eq } from "drizzle-orm";
import { createTimeOrderedUuid } from "./base-model.js";
import { getPortableDb } from "./db.js";
import {
  cloudLinkDocuments,
  cloudLinkFiles,
  cloudLinks,
  cloudLinkWorkspaceFiles,
  cloudReceives,
  cloudSends
} from "./schema/cloud-links.js";

export type CloudLinkRow = typeof cloudLinks.$inferSelect;
export type CloudLinkDocumentRow = typeof cloudLinkDocuments.$inferSelect;
export type CloudLinkFileRow = typeof cloudLinkFiles.$inferSelect;
export type CloudLinkWorkspaceFileRow = typeof cloudLinkWorkspaceFiles.$inferSelect;
export type CloudReceiveRow = typeof cloudReceives.$inferSelect;
export type CloudReceiveState = CloudReceiveRow["state"];
export type CloudSendRow = typeof cloudSends.$inferSelect;
export type CloudSendState = CloudSendRow["state"];

/** The link of a local project, or null when it is not linked. */
export async function getCloudLink(userId: string, projectId: string): Promise<CloudLinkRow | null> {
  const [row] = await getPortableDb()
    .select()
    .from(cloudLinks)
    .where(and(eq(cloudLinks.user_id, userId), eq(cloudLinks.project_id, projectId)))
    .limit(1);
  return row ?? null;
}

/** The link with this id, or null. */
export async function getCloudLinkById(id: string): Promise<CloudLinkRow | null> {
  const [row] = await getPortableDb().select().from(cloudLinks).where(eq(cloudLinks.id, id)).limit(1);
  return row ?? null;
}

/** Links a local project to a cloud project. A project is linked once. */
export async function createCloudLink(input: {
  userId: string;
  projectId: string;
  serverKey: string;
  accountId: string;
  cloudProjectId: string;
  now?: Date;
}): Promise<CloudLinkRow> {
  const now = (input.now ?? new Date()).toISOString();
  const row: CloudLinkRow = {
    id: createTimeOrderedUuid(),
    user_id: input.userId,
    project_id: input.projectId,
    server_key: input.serverKey,
    account_id: input.accountId,
    cloud_project_id: input.cloudProjectId,
    state: "linked",
    created_at: now,
    updated_at: now
  };
  await getPortableDb().insert(cloudLinks).values(row);
  return row;
}

/** The document of a link that has `cloudId` on the cloud, or null when none was exchanged. */
export async function getCloudLinkDocumentByCloudId(
  linkId: string,
  kind: string,
  cloudId: string
): Promise<CloudLinkDocumentRow | null> {
  const [row] = await getPortableDb()
    .select()
    .from(cloudLinkDocuments)
    .where(
      and(eq(cloudLinkDocuments.link_id, linkId), eq(cloudLinkDocuments.kind, kind), eq(cloudLinkDocuments.cloud_id, cloudId))
    )
    .limit(1);
  return row ?? null;
}

/** The document of a link that has `localId` on this computer, or null when none was exchanged. */
export async function getCloudLinkDocumentByLocalId(
  linkId: string,
  kind: string,
  localId: string
): Promise<CloudLinkDocumentRow | null> {
  const [row] = await getPortableDb()
    .select()
    .from(cloudLinkDocuments)
    .where(
      and(eq(cloudLinkDocuments.link_id, linkId), eq(cloudLinkDocuments.kind, kind), eq(cloudLinkDocuments.local_id, localId))
    )
    .limit(1);
  return row ?? null;
}

/** Forgets a document of a link, after the cloud deleted it. */
export async function deleteCloudLinkDocument(linkId: string, kind: string, localId: string): Promise<void> {
  await getPortableDb()
    .delete(cloudLinkDocuments)
    .where(
      and(eq(cloudLinkDocuments.link_id, linkId), eq(cloudLinkDocuments.kind, kind), eq(cloudLinkDocuments.local_id, localId))
    );
}

/** Every document of a link. */
export async function listCloudLinkDocuments(linkId: string): Promise<CloudLinkDocumentRow[]> {
  return getPortableDb()
    .select()
    .from(cloudLinkDocuments)
    .where(eq(cloudLinkDocuments.link_id, linkId))
    .orderBy(asc(cloudLinkDocuments.kind), asc(cloudLinkDocuments.local_id));
}

/** Records the id pair and the base of a linked document. */
export async function setCloudLinkDocumentBase(
  link: CloudLinkRow,
  input: { kind: string; localId: string; cloudId: string; contentHash: string; cloudRevision: string | null; now?: Date }
): Promise<void> {
  const now = (input.now ?? new Date()).toISOString();
  await getPortableDb()
    .insert(cloudLinkDocuments)
    .values({
      id: createTimeOrderedUuid(),
      link_id: link.id,
      user_id: link.user_id,
      project_id: link.project_id,
      kind: input.kind,
      local_id: input.localId,
      cloud_id: input.cloudId,
      base_content_hash: input.contentHash,
      base_cloud_revision: input.cloudRevision,
      updated_at: now
    })
    .onConflictDoUpdate({
      target: [cloudLinkDocuments.link_id, cloudLinkDocuments.kind, cloudLinkDocuments.local_id],
      set: {
        cloud_id: input.cloudId,
        base_content_hash: input.contentHash,
        base_cloud_revision: input.cloudRevision,
        updated_at: now
      }
    });
}

/** The base of an asset file of a link, or null when none was exchanged. */
export async function getCloudLinkFile(linkId: string, assetId: string): Promise<CloudLinkFileRow | null> {
  const [row] = await getPortableDb()
    .select()
    .from(cloudLinkFiles)
    .where(and(eq(cloudLinkFiles.link_id, linkId), eq(cloudLinkFiles.asset_id, assetId)))
    .limit(1);
  return row ?? null;
}

/** Records the hash of the bytes the last exchange gave an asset of a link. */
export async function setCloudLinkFileBase(
  link: CloudLinkRow,
  input: { assetId: string; cloudAssetId: string; hash: string; now?: Date }
): Promise<void> {
  const now = (input.now ?? new Date()).toISOString();
  await getPortableDb()
    .insert(cloudLinkFiles)
    .values({
      id: createTimeOrderedUuid(),
      link_id: link.id,
      user_id: link.user_id,
      project_id: link.project_id,
      asset_id: input.assetId,
      cloud_asset_id: input.cloudAssetId,
      base_hash: input.hash,
      updated_at: now
    })
    .onConflictDoUpdate({
      target: [cloudLinkFiles.link_id, cloudLinkFiles.asset_id],
      set: { cloud_asset_id: input.cloudAssetId, base_hash: input.hash, updated_at: now }
    });
}

/** The bases of a link's workspace files, by path. */
export async function listCloudLinkWorkspaceFiles(linkId: string): Promise<Map<string, CloudLinkWorkspaceFileRow>> {
  const rows = await getPortableDb()
    .select()
    .from(cloudLinkWorkspaceFiles)
    .where(eq(cloudLinkWorkspaceFiles.link_id, linkId));
  return new Map(rows.map((row) => [row.path, row]));
}

/**
 * Records the bytes the last exchange gave a workspace file of a link: their
 * hash, and the size and modification time the file had, so a later capture
 * reads only a file whose size or time changed.
 */
export async function setCloudLinkWorkspaceFileBase(
  link: CloudLinkRow,
  input: { path: string; hash: string; size: number; mtimeMs: number; now?: Date }
): Promise<void> {
  const now = (input.now ?? new Date()).toISOString();
  await getPortableDb()
    .insert(cloudLinkWorkspaceFiles)
    .values({
      id: createTimeOrderedUuid(),
      link_id: link.id,
      user_id: link.user_id,
      project_id: link.project_id,
      path: input.path,
      base_hash: input.hash,
      size: input.size,
      mtime_ms: input.mtimeMs,
      updated_at: now
    })
    .onConflictDoUpdate({
      target: [cloudLinkWorkspaceFiles.link_id, cloudLinkWorkspaceFiles.path],
      set: { base_hash: input.hash, size: input.size, mtime_ms: input.mtimeMs, updated_at: now }
    });
}

/** Starts the record of a receive, in state `staging`. */
export async function createCloudReceive(
  link: CloudLinkRow,
  input: { setId: string; plan: unknown; now?: Date }
): Promise<CloudReceiveRow> {
  const now = (input.now ?? new Date()).toISOString();
  const row: CloudReceiveRow = {
    id: input.setId,
    link_id: link.id,
    user_id: link.user_id,
    project_id: link.project_id,
    state: "staging",
    plan: JSON.stringify(input.plan),
    created_at: now,
    updated_at: now
  };
  await getPortableDb().insert(cloudReceives).values(row);
  return row;
}

/** The receive of this revision set, or null. */
export async function getCloudReceive(setId: string): Promise<CloudReceiveRow | null> {
  const [row] = await getPortableDb().select().from(cloudReceives).where(eq(cloudReceives.id, setId)).limit(1);
  return row ?? null;
}

/** The receives a person has not finished, oldest first. */
export async function listCloudReceives(userId: string): Promise<CloudReceiveRow[]> {
  return getPortableDb()
    .select()
    .from(cloudReceives)
    .where(eq(cloudReceives.user_id, userId))
    .orderBy(asc(cloudReceives.created_at), asc(cloudReceives.id));
}

/** Moves a receive to `state`, with its plan when it changed. */
export async function updateCloudReceive(
  setId: string,
  input: { state?: CloudReceiveState; plan?: unknown; now?: Date }
): Promise<void> {
  const set: Partial<CloudReceiveRow> = { updated_at: (input.now ?? new Date()).toISOString() };
  if (input.state !== undefined) set.state = input.state;
  if (input.plan !== undefined) set.plan = JSON.stringify(input.plan);
  await getPortableDb().update(cloudReceives).set(set).where(eq(cloudReceives.id, setId));
}

/** Deletes the record of a finished receive. */
export async function deleteCloudReceive(setId: string): Promise<void> {
  await getPortableDb().delete(cloudReceives).where(eq(cloudReceives.id, setId));
}

/** Starts the record of a send, in state `open`. */
export async function createCloudSend(input: {
  transferId: string;
  link: CloudLinkRow | null;
  userId: string;
  projectId: string;
  serverKey: string;
  accountId: string;
  cloudProjectId: string;
  plan: unknown;
  now?: Date;
}): Promise<CloudSendRow> {
  const now = (input.now ?? new Date()).toISOString();
  const row: CloudSendRow = {
    id: input.transferId,
    link_id: input.link?.id ?? null,
    user_id: input.userId,
    project_id: input.projectId,
    server_key: input.serverKey,
    account_id: input.accountId,
    cloud_project_id: input.cloudProjectId,
    state: "open",
    attempt_id: null,
    plan: JSON.stringify(input.plan),
    created_at: now,
    updated_at: now
  };
  await getPortableDb().insert(cloudSends).values(row);
  return row;
}

/** The send of this transfer, or null. */
export async function getCloudSend(transferId: string): Promise<CloudSendRow | null> {
  const [row] = await getPortableDb().select().from(cloudSends).where(eq(cloudSends.id, transferId)).limit(1);
  return row ?? null;
}

/** The sends a person has not finished, oldest first. */
export async function listCloudSends(userId: string): Promise<CloudSendRow[]> {
  return getPortableDb()
    .select()
    .from(cloudSends)
    .where(eq(cloudSends.user_id, userId))
    .orderBy(asc(cloudSends.created_at), asc(cloudSends.id));
}

/** Records the state, the attempt in flight, or the plan of a send. */
export async function updateCloudSend(
  transferId: string,
  input: { state?: CloudSendState; attemptId?: string | null; plan?: unknown; now?: Date }
): Promise<void> {
  const set: Partial<CloudSendRow> = { updated_at: (input.now ?? new Date()).toISOString() };
  if (input.state !== undefined) set.state = input.state;
  if (input.attemptId !== undefined) set.attempt_id = input.attemptId;
  if (input.plan !== undefined) set.plan = JSON.stringify(input.plan);
  await getPortableDb().update(cloudSends).set(set).where(eq(cloudSends.id, transferId));
}

/** Deletes the record of a finished send. */
export async function deleteCloudSend(transferId: string): Promise<void> {
  await getPortableDb().delete(cloudSends).where(eq(cloudSends.id, transferId));
}
