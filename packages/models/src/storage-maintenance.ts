/**
 * Database history retention and maintenance.
 *
 * This service removes historical workflow snapshots, run records, and the
 * machine-generated exhaust a run leaves behind (run events, and the request
 * payload stored on a prediction). Current workflows, assets, messages,
 * memories, and user-authored documents are never candidates.
 *
 * Predictions are billing records, so their rows survive; the sweep only nulls
 * the columns that carry personal data with no accounting purpose
 * (`parameters`, `metadata`, `logs`), leaving cost, tokens, model, provider,
 * timestamps and ids intact.
 */
import { statSync } from "node:fs";
import { and, count, desc, eq, inArray, isNotNull, lt, or } from "drizzle-orm";
import { isAutomaticStorageCleanupEnabled } from "@nodetool-ai/config";
import { getDb, getDbType, getRawDb } from "./db.js";
import { jobs } from "./schema/jobs.js";
import { predictions } from "./schema/predictions.js";
import { runEvents } from "./schema/run-events.js";
import { runInboxMessages } from "./schema/run-inbox-messages.js";
import { triggerInputs } from "./schema/trigger-inputs.js";
import { workflowVersions } from "./schema/workflow-versions.js";

export interface StorageRetentionPolicy {
  maxAutosavesPerWorkflow: number;
  autosaveRetentionDays: number;
  manualVersionRetentionDays: number;
  terminalJobRetentionDays: number;
  /**
   * How long a run's per-node event log is kept. Unset means
   * `DEFAULT_STORAGE_RETENTION_POLICY.runEventRetentionDays` — optional so a
   * policy built before this sweep existed still resolves to the default
   * instead of to zero days.
   */
  runEventRetentionDays?: number;
  /**
   * How long a prediction keeps its request payload. The row itself is never
   * deleted. Unset means
   * `DEFAULT_STORAGE_RETENTION_POLICY.predictionRetentionDays`.
   */
  predictionRetentionDays?: number;
  automaticCleanup: boolean;
}

export const DEFAULT_STORAGE_RETENTION_POLICY: StorageRetentionPolicy = {
  maxAutosavesPerWorkflow: 10,
  autosaveRetentionDays: 7,
  manualVersionRetentionDays: 90,
  terminalJobRetentionDays: 30,
  runEventRetentionDays: 30,
  predictionRetentionDays: 400,
  // A local install cleans up when asked. A hosted deployment sets
  // NODETOOL_STORAGE_AUTO_CLEANUP=1 so the sweep runs on its own.
  automaticCleanup: isAutomaticStorageCleanupEnabled()
};

export interface StorageCleanupPreview {
  autosaves: number;
  manualVersions: number;
  terminalJobs: number;
  /**
   * Run events removed by age. Events belonging to a job this pass deletes are
   * counted under `terminalJobs`, not here — the job takes them with it.
   */
  runEvents: number;
  /** Prediction rows whose payload columns are nulled. Rows are kept. */
  redactedPredictions: number;
  /** Records deleted. Redactions are not deletions, so they are not in it. */
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
  /** Events recorded against this user's runs. */
  runEvents: number;
  /** Prediction rows still holding `parameters`, `metadata`, or `logs`. */
  predictionsWithPayload: number;
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

function retentionDays(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function batches<T>(items: T[], size = DELETE_BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let offset = 0; offset < items.length; offset += size) {
    out.push(items.slice(offset, offset + size));
  }
  return out;
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

interface VersionAndJobCandidates {
  autosaveIds: string[];
  manualVersionIds: string[];
  terminalJobIds: string[];
  /**
   * Runs that survive this pass. Their events are the only ones the age sweep
   * looks at, because a deleted job already takes its events with it.
   */
  survivingRunIds: string[];
}

function cleanupCandidates(
  rows: Awaited<ReturnType<typeof retentionRows>>,
  policy: StorageRetentionPolicy,
  now: Date
): VersionAndJobCandidates {
  const autosaveCutoff = cutoffTime(now, policy.autosaveRetentionDays);
  const manualCutoff = cutoffTime(now, policy.manualVersionRetentionDays);
  const jobCutoff = cutoffTime(now, policy.terminalJobRetentionDays);
  const autosavesByWorkflow = new Map<string, number>();
  const autosaveIds: string[] = [];
  const manualVersionIds: string[] = [];
  const terminalJobIds: string[] = [];
  const survivingRunIds: string[] = [];

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
    } else {
      survivingRunIds.push(row.id);
    }
  }

  return { autosaveIds, manualVersionIds, terminalJobIds, survivingRunIds };
}

/**
 * `run_events` has no `user_id`. The run it belongs to does, so the sweep is
 * scoped by joining through the user's job ids — the same rows `retentionRows`
 * already loaded — and filtered by `event_time` in SQL, one indexed
 * `run_id IN (…) AND event_time < cutoff` per batch of run ids. Nothing walks
 * the events in JavaScript, so the cost is one indexed scan per batch rather
 * than events × runs.
 *
 * Events whose job row is already gone cannot be attributed to a user and are
 * left alone; the job delete path below removes a run's events with the job.
 */
async function countRunEvents(
  runIds: string[],
  cutoffIso: string | null
): Promise<number> {
  const db = getDb();
  let total = 0;
  for (const batch of batches(runIds)) {
    const scope = inArray(runEvents.run_id, batch);
    const [row] = await db
      .select({ value: count() })
      .from(runEvents)
      .where(
        cutoffIso ? and(scope, lt(runEvents.event_time, cutoffIso)) : scope
      );
    total += Number(row?.value ?? 0);
  }
  return total;
}

async function deleteExpiredRunEvents(
  runIds: string[],
  cutoffIso: string
): Promise<void> {
  const db = getDb();
  for (const batch of batches(runIds)) {
    await db
      .delete(runEvents)
      .where(
        and(
          inArray(runEvents.run_id, batch),
          lt(runEvents.event_time, cutoffIso)
        )
      );
  }
}

/**
 * Prediction rows that still carry a request payload past the retention window.
 * A row with no `created_at` cannot be aged and is skipped; a row already
 * redacted no longer matches, so a second pass reports zero instead of
 * recounting it.
 */
async function redactablePredictionIds(
  userId: string,
  cutoffIso: string | null
): Promise<string[]> {
  const db = getDb();
  const hasPayload = or(
    isNotNull(predictions.parameters),
    isNotNull(predictions.metadata),
    isNotNull(predictions.logs)
  );
  const rows = await db
    .select({ id: predictions.id })
    .from(predictions)
    .where(
      and(
        eq(predictions.user_id, userId),
        cutoffIso ? lt(predictions.created_at, cutoffIso) : undefined,
        hasPayload
      )
    );
  return rows.map((row: { id: string }) => row.id);
}

async function redactPredictions(ids: string[]): Promise<void> {
  const db = getDb();
  for (const batch of batches(ids)) {
    await db
      .update(predictions)
      .set({ parameters: null, metadata: null, logs: null })
      .where(inArray(predictions.id, batch));
  }
}

interface CleanupCandidates extends VersionAndJobCandidates {
  runEventCutoff: string;
  expiredRunEvents: number;
  redactablePredictionIds: string[];
}

async function collectCandidates(
  userId: string,
  rows: Awaited<ReturnType<typeof retentionRows>>,
  policy: StorageRetentionPolicy,
  now: Date
): Promise<CleanupCandidates> {
  const base = cleanupCandidates(rows, policy, now);
  const runEventCutoff = new Date(
    cutoffTime(
      now,
      retentionDays(
        policy.runEventRetentionDays,
        DEFAULT_STORAGE_RETENTION_POLICY.runEventRetentionDays ?? 30
      )
    )
  ).toISOString();
  const predictionCutoff = new Date(
    cutoffTime(
      now,
      retentionDays(
        policy.predictionRetentionDays,
        DEFAULT_STORAGE_RETENTION_POLICY.predictionRetentionDays ?? 400
      )
    )
  ).toISOString();
  return {
    ...base,
    runEventCutoff,
    expiredRunEvents: await countRunEvents(
      base.survivingRunIds,
      runEventCutoff
    ),
    redactablePredictionIds: await redactablePredictionIds(
      userId,
      predictionCutoff
    )
  };
}

function previewFromCandidates(
  candidates: CleanupCandidates
): StorageCleanupPreview {
  const autosaves = candidates.autosaveIds.length;
  const manualVersions = candidates.manualVersionIds.length;
  const terminalJobs = candidates.terminalJobIds.length;
  const runEventCount = candidates.expiredRunEvents;
  return {
    autosaves,
    manualVersions,
    terminalJobs,
    runEvents: runEventCount,
    redactedPredictions: candidates.redactablePredictionIds.length,
    total: autosaves + manualVersions + terminalJobs + runEventCount
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
  const candidates = await collectCandidates(userId, rows, policy, now);
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
    runEvents: await countRunEvents(
      rows.jobs.map((row) => row.id),
      null
    ),
    predictionsWithPayload: (await redactablePredictionIds(userId, null))
      .length,
    cleanup: previewFromCandidates(candidates)
  };
}

async function deleteVersions(ids: string[]): Promise<void> {
  const db = getDb();
  for (const batch of batches(ids)) {
    await db
      .delete(workflowVersions)
      .where(inArray(workflowVersions.id, batch));
  }
}

async function deleteJobs(ids: string[]): Promise<void> {
  const db = getDb();
  for (const batch of batches(ids)) {
    await db.delete(runEvents).where(inArray(runEvents.run_id, batch));
    await db
      .delete(runInboxMessages)
      .where(inArray(runInboxMessages.run_id, batch));
    await db.delete(triggerInputs).where(inArray(triggerInputs.run_id, batch));
    await db.delete(jobs).where(inArray(jobs.id, batch));
  }
}

export async function cleanupStorage(
  userId: string,
  policy: StorageRetentionPolicy,
  now = new Date()
): Promise<StorageCleanupResult> {
  const candidates = await collectCandidates(
    userId,
    await retentionRows(userId),
    policy,
    now
  );
  await deleteVersions([
    ...candidates.autosaveIds,
    ...candidates.manualVersionIds
  ]);
  await deleteExpiredRunEvents(
    candidates.survivingRunIds,
    candidates.runEventCutoff
  );
  await deleteJobs(candidates.terminalJobIds);
  await redactPredictions(candidates.redactablePredictionIds);
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
