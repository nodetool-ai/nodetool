/**
 * Database history retention and maintenance.
 *
 * This service only removes historical workflow snapshots and run records.
 * Current workflows, assets, messages, and user-authored documents are never
 * candidates.
 */
import { statSync } from "node:fs";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb, getDbType, getRawDb } from "./db.js";
import { jobs } from "./schema/jobs.js";
import { runEvents } from "./schema/run-events.js";
import { runInboxMessages } from "./schema/run-inbox-messages.js";
import { runLeases } from "./schema/run-leases.js";
import { runNodeState } from "./schema/run-node-state.js";
import { triggerInputs } from "./schema/trigger-inputs.js";
import { workflowVersions } from "./schema/workflow-versions.js";

export interface StorageRetentionPolicy {
  maxAutosavesPerWorkflow: number;
  autosaveRetentionDays: number;
  manualVersionRetentionDays: number;
  terminalJobRetentionDays: number;
  automaticCleanup: boolean;
}

export const DEFAULT_STORAGE_RETENTION_POLICY: StorageRetentionPolicy = {
  maxAutosavesPerWorkflow: 10,
  autosaveRetentionDays: 7,
  manualVersionRetentionDays: 90,
  terminalJobRetentionDays: 30,
  automaticCleanup: false
};

export interface StorageCleanupPreview {
  autosaves: number;
  manualVersions: number;
  terminalJobs: number;
  total: number;
}

export interface StorageStatus {
  dialect: "sqlite" | "postgres";
  databaseBytes: number | null;
  unusedBytes: number | null;
  workflowVersions: number;
  autosaves: number;
  manualVersions: number;
  jobs: number;
  terminalJobs: number;
  cleanup: StorageCleanupPreview;
}

export interface StorageCleanupResult extends StorageCleanupPreview {
  completedAt: string;
}

interface VersionRetentionRow {
  id: string;
  workflowId: string;
  saveType: string;
  version: number;
  createdAt: string;
}

interface JobRetentionRow {
  id: string;
  status: string;
  updatedAt: string;
  finishedAt: string | null;
}

const TERMINAL_JOB_STATUSES = ["completed", "failed", "cancelled"] as const;
const DELETE_BATCH_SIZE = 400;

function cutoffTime(now: Date, days: number): number {
  return now.getTime() - days * 24 * 60 * 60 * 1000;
}

function isBefore(value: string | null, cutoff: number): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp < cutoff;
}

async function retentionRows(userId: string): Promise<{
  versions: VersionRetentionRow[];
  jobs: JobRetentionRow[];
}> {
  const db = getDb();
  const versionRows = await db
    .select({
      id: workflowVersions.id,
      workflowId: workflowVersions.workflow_id,
      saveType: workflowVersions.save_type,
      version: workflowVersions.version,
      createdAt: workflowVersions.created_at
    })
    .from(workflowVersions)
    .where(eq(workflowVersions.user_id, userId))
    .orderBy(
      workflowVersions.workflow_id,
      desc(workflowVersions.created_at),
      desc(workflowVersions.version)
    );
  const jobRows = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      updatedAt: jobs.updated_at,
      finishedAt: jobs.finished_at
    })
    .from(jobs)
    .where(eq(jobs.user_id, userId));
  return { versions: versionRows, jobs: jobRows };
}

function cleanupCandidates(
  rows: Awaited<ReturnType<typeof retentionRows>>,
  policy: StorageRetentionPolicy,
  now: Date
): {
  autosaveIds: string[];
  manualVersionIds: string[];
  terminalJobIds: string[];
} {
  const autosaveCutoff = cutoffTime(now, policy.autosaveRetentionDays);
  const manualCutoff = cutoffTime(now, policy.manualVersionRetentionDays);
  const jobCutoff = cutoffTime(now, policy.terminalJobRetentionDays);
  const autosavesByWorkflow = new Map<string, number>();
  const autosaveIds: string[] = [];
  const manualVersionIds: string[] = [];
  const terminalJobIds: string[] = [];

  for (const row of rows.versions) {
    if (row.saveType === "autosave") {
      const position = autosavesByWorkflow.get(row.workflowId) ?? 0;
      autosavesByWorkflow.set(row.workflowId, position + 1);
      if (
        position >= policy.maxAutosavesPerWorkflow ||
        isBefore(row.createdAt, autosaveCutoff)
      ) {
        autosaveIds.push(row.id);
      }
    } else if (
      row.saveType === "manual" &&
      isBefore(row.createdAt, manualCutoff)
    ) {
      manualVersionIds.push(row.id);
    }
  }

  for (const row of rows.jobs) {
    if (
      TERMINAL_JOB_STATUSES.includes(
        row.status as (typeof TERMINAL_JOB_STATUSES)[number]
      ) &&
      isBefore(row.finishedAt ?? row.updatedAt, jobCutoff)
    ) {
      terminalJobIds.push(row.id);
    }
  }

  return { autosaveIds, manualVersionIds, terminalJobIds };
}

function previewFromCandidates(
  candidates: ReturnType<typeof cleanupCandidates>
): StorageCleanupPreview {
  const autosaves = candidates.autosaveIds.length;
  const manualVersions = candidates.manualVersionIds.length;
  const terminalJobs = candidates.terminalJobIds.length;
  return {
    autosaves,
    manualVersions,
    terminalJobs,
    total: autosaves + manualVersions + terminalJobs
  };
}

function sqliteFileStatus(): {
  databaseBytes: number | null;
  unusedBytes: number | null;
} {
  if (getDbType() !== "sqlite") {
    return { databaseBytes: null, unusedBytes: null };
  }
  const rawDb = getRawDb();
  let databaseBytes: number | null = null;
  if (rawDb.name !== ":memory:") {
    try {
      databaseBytes = statSync(rawDb.name).size;
    } catch {
      databaseBytes = null;
    }
  }
  const pageSize = rawDb.pragma("page_size", { simple: true }) as number;
  const freePages = rawDb.pragma("freelist_count", { simple: true }) as number;
  return { databaseBytes, unusedBytes: pageSize * freePages };
}

export async function getStorageStatus(
  userId: string,
  policy: StorageRetentionPolicy,
  now = new Date()
): Promise<StorageStatus> {
  const rows = await retentionRows(userId);
  const candidates = cleanupCandidates(rows, policy, now);
  const autosaves = rows.versions.filter(
    (row) => row.saveType === "autosave"
  ).length;
  const manualVersions = rows.versions.filter(
    (row) => row.saveType === "manual"
  ).length;
  const terminalJobs = rows.jobs.filter((row) =>
    TERMINAL_JOB_STATUSES.includes(
      row.status as (typeof TERMINAL_JOB_STATUSES)[number]
    )
  ).length;
  return {
    dialect: getDbType(),
    ...sqliteFileStatus(),
    workflowVersions: rows.versions.length,
    autosaves,
    manualVersions,
    jobs: rows.jobs.length,
    terminalJobs,
    cleanup: previewFromCandidates(candidates)
  };
}

async function deleteVersions(ids: string[]): Promise<void> {
  const db = getDb();
  for (let offset = 0; offset < ids.length; offset += DELETE_BATCH_SIZE) {
    await db
      .delete(workflowVersions)
      .where(
        inArray(
          workflowVersions.id,
          ids.slice(offset, offset + DELETE_BATCH_SIZE)
        )
      );
  }
}

async function deleteJobs(ids: string[]): Promise<void> {
  const db = getDb();
  for (let offset = 0; offset < ids.length; offset += DELETE_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + DELETE_BATCH_SIZE);
    await db.delete(runEvents).where(inArray(runEvents.run_id, batch));
    await db.delete(runNodeState).where(inArray(runNodeState.run_id, batch));
    await db
      .delete(runInboxMessages)
      .where(inArray(runInboxMessages.run_id, batch));
    await db.delete(runLeases).where(inArray(runLeases.run_id, batch));
    await db.delete(triggerInputs).where(inArray(triggerInputs.run_id, batch));
    await db.delete(jobs).where(inArray(jobs.id, batch));
  }
}

export async function cleanupStorage(
  userId: string,
  policy: StorageRetentionPolicy,
  now = new Date()
): Promise<StorageCleanupResult> {
  const candidates = cleanupCandidates(
    await retentionRows(userId),
    policy,
    now
  );
  await deleteVersions([
    ...candidates.autosaveIds,
    ...candidates.manualVersionIds
  ]);
  await deleteJobs(candidates.terminalJobIds);
  return {
    ...previewFromCandidates(candidates),
    completedAt: now.toISOString()
  };
}

/**
 * Rebuild a local SQLite file so deleted pages return to the file system.
 * This is intentionally explicit: VACUUM takes an exclusive write lock and
 * can take time on a large database. PostgreSQL manages space separately.
 */
export async function compactStorage(): Promise<void> {
  if (getDbType() !== "sqlite") {
    throw new Error("Database compaction is only available for local SQLite.");
  }
  getRawDb().exec("VACUUM");
}
