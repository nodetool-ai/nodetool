/**
 * Art. 17 erasure and Art. 20 export, driven by {@link PERSONAL_DATA_REGISTRY}.
 *
 * Nothing here decides policy. The registry says what happens to each table
 * and why; this file is the walk that carries it out. Every step is keyed by
 * table name, and `tests/personal-data-audit.test.ts` requires those keys to
 * match the registry — a table registered but never wired up fails there,
 * which is the point of having a registry at all.
 *
 * Four things to know before changing this file:
 *
 * - **Ids are collected before the first delete.** `run_events`,
 *   `run_inbox_messages` and `trigger_inputs` carry no `user_id`; they are
 *   reached through `nodetool_jobs.user_id`. `collectContext` reads those job
 *   ids up front, so deleting the jobs cannot leave the rows orphaned and
 *   unreachable, still holding prompt text. Make that lookup lazy and it can.
 * - **Children run before parents** so the counts are true. Several child
 *   tables declare `ON DELETE CASCADE`; deleting `applications` first would
 *   take `application_versions` with it and the versions step would then
 *   report zero rows for work it did do. It is also the order
 *   `Application.delete` uses, and for its reason too: a failure part-way
 *   leaves the parent whole rather than half-erased.
 * - **Prediction redaction is not reimplemented.** `cleanupStorage` already
 *   nulls `parameters`/`metadata`/`logs` while keeping the billing columns.
 *   Erasure calls it with the retention horizon pushed past every row, which
 *   is the same operation with the clock moved rather than a second copy of
 *   the rule.
 * - **Blobs are a second surface, behind an interface.** `packages/models`
 *   does not depend on `@nodetool-ai/storage`; the caller injects an
 *   {@link ErasureObjectStore}. Deleting the asset row without the object
 *   leaves the media readable to anyone holding a URL.
 */

import { and, count, eq, inArray, notInArray, type SQL } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";

import { getDb } from "./db.js";
import {
  PERSONAL_DATA_REGISTRY,
  WITHHELD_VALUE,
  isActionable,
  type PersonalDataDisposition,
  type PersonalDataEntry,
  type PersonalDataReach
} from "./personal-data-registry.js";
import {
  cleanupStorage,
  type StorageRetentionPolicy
} from "./storage-maintenance.js";
import {
  NEVER_PRUNED_USER_EVENT_TYPES,
  UserEventType,
  deleteUserEventsForUser,
  recordUserEvent
} from "./user-event.js";

import { accessTokens } from "./schema/access-tokens.js";
import {
  applicationBudgets,
  applicationInvocations
} from "./schema/application-budgets.js";
import { applicationDeployments } from "./schema/application-deployments.js";
import { applications, applicationVersions } from "./schema/applications.js";
import { assets } from "./schema/assets.js";
import { creditLedger, userSubscriptions } from "./schema/credits.js";
import { externalIdentities } from "./schema/external-identities.js";
import { imageDocumentVersions } from "./schema/image-document-versions.js";
import { imageDocuments } from "./schema/image-documents.js";
import { jobs } from "./schema/jobs.js";
import { jsScriptVersions } from "./schema/js-script-versions.js";
import { jsScripts } from "./schema/js-scripts.js";
import { mcpOauthGrants, mcpOauthTokens } from "./schema/mcp-oauth.js";
import { memories } from "./schema/memories.js";
import { messages } from "./schema/messages.js";
import { oauthCredentials } from "./schema/oauth-credentials.js";
import { predictions } from "./schema/predictions.js";
import { projects } from "./schema/projects.js";
import { runEvents } from "./schema/run-events.js";
import { runInboxMessages } from "./schema/run-inbox-messages.js";
import { scripts } from "./schema/scripts.js";
import { secrets } from "./schema/secrets.js";
import { appSettings } from "./schema/settings.js";
import { skills } from "./schema/skills.js";
import { storyboards } from "./schema/storyboards.js";
import { threads } from "./schema/threads.js";
import { timelineSequenceVersions } from "./schema/timeline-sequence-versions.js";
import { timelineSequences } from "./schema/timeline-sequences.js";
import { triggerInputs } from "./schema/trigger-inputs.js";
import { triggerRegistrations } from "./schema/trigger-registrations.js";
import { userEvents } from "./schema/user-events.js";
import { workflowCollaborators, workflowShares } from "./schema/workflow-sharing.js";
import { workflowVersions } from "./schema/workflow-versions.js";
import { workflows } from "./schema/workflows.js";
import { workspaces as workspacesSchema } from "./schema/workspaces.js";

/** Any column on a schema table — what the generic helpers filter on. */
type TableColumn = SQLiteColumn;

// ── Object storage seam ───────────────────────────────────────────────

/**
 * The blob half of erasure, injected so `@nodetool-ai/models` keeps no
 * dependency on `@nodetool-ai/storage`.
 *
 * One method, taking the user id rather than a key prefix, because the key
 * layout belongs to the storage package: objects live at
 * `<userId>/<assetId>.<ext>` today, and older deployments still hold flat
 * `<assetId>.<ext>` keys from before the owner prefix existed. Passing a
 * prefix down here would freeze that layout into the persistence layer.
 *
 * A `StorageAdapter` satisfies it in a few lines at the call site:
 *
 * ```ts
 * const store: ErasureObjectStore = {
 *   async deleteObjectsForUser(userId) {
 *     const { entries } = await adapter.list(`${userId}/`);
 *     const gone: string[] = [];
 *     for (const entry of entries) {
 *       if (await adapter.delete(entry.uri)) gone.push(entry.key);
 *     }
 *     return gone;
 *   }
 * };
 * ```
 */
export interface ErasureObjectStore {
  /** Delete every stored object owned by `userId`; return the keys removed. */
  deleteObjectsForUser(userId: string): Promise<readonly string[]>;
}

// ── Reports ───────────────────────────────────────────────────────────

export interface TableErasureReport {
  readonly table: string;
  readonly disposition: PersonalDataDisposition;
  /** Rows removed by this pass. */
  readonly deleted: number;
  /** Rows whose personal columns were nulled by this pass. */
  readonly redacted: number;
  /** Rows deliberately left in place, and still there when it finished. */
  readonly retained: number;
}

export interface ErasureReport {
  readonly userId: string;
  readonly completedAt: string;
  readonly tables: readonly TableErasureReport[];
  readonly deleted: number;
  readonly redacted: number;
  readonly retained: number;
  /**
   * Object keys removed from blob storage, or `null` when no
   * {@link ErasureObjectStore} was injected — which means the DB rows are
   * gone and the bytes are not, so the caller has to say what it did.
   */
  readonly objectKeysDeleted: readonly string[] | null;
}

export interface ErasureOptions {
  /** Blob storage to sweep. Omit and the report says the bytes were skipped. */
  readonly objectStore?: ErasureObjectStore;
  /**
   * Also delete the consent, terms and data-subject-request events that
   * erasure otherwise keeps as evidence. Off by default: those rows are the
   * proof that consent was given and that this request was answered. Turn it
   * on only for a closed account with legal sign-off.
   */
  readonly purgeComplianceEvidence?: boolean;
  /**
   * Ties the `data_erasure_completed` audit event to the request that caused
   * it. Omit and no completion event is recorded.
   */
  readonly requestId?: string;
}

// ── Small helpers ─────────────────────────────────────────────────────

const CHUNK = 400;

function chunks<T>(items: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function countRows(
  table: SQLiteTable,
  where: SQL | undefined
): Promise<number> {
  const [row] = await getDb()
    .select({ value: count() })
    .from(table)
    .where(where);
  return Number((row as { value: number } | undefined)?.value ?? 0);
}

/**
 * Count, then delete. The count is read first because SQLite and PostgreSQL
 * report affected rows differently — the same reason `deleteUserEventsForUser`
 * does it this way.
 */
async function deleteRows(
  table: SQLiteTable,
  where: SQL | undefined
): Promise<number> {
  const total = await countRows(table, where);
  if (total === 0) return 0;
  await getDb().delete(table).where(where);
  return total;
}

/** Delete by a foreign key, in batches, tolerating an empty id list. */
async function deleteByIds(
  table: SQLiteTable,
  column: TableColumn,
  ids: readonly string[]
): Promise<number> {
  let total = 0;
  for (const batch of chunks(ids)) {
    total += await deleteRows(table, inArray(column, batch));
  }
  return total;
}

async function selectIds(
  table: SQLiteTable,
  column: TableColumn,
  where: SQL
): Promise<string[]> {
  const rows = await getDb().select({ id: column }).from(table).where(where);
  return (rows as { id: string }[]).map((row) => row.id);
}

function deleted(
  table: string,
  disposition: PersonalDataDisposition,
  n: number
): TableErasureReport {
  return { table, disposition, deleted: n, redacted: 0, retained: 0 };
}

// ── Erasure steps ─────────────────────────────────────────────────────

interface ErasureContext {
  readonly userId: string;
  /** Job ids, which are the run ids `run_events` and friends hang off. */
  readonly runIds: readonly string[];
  readonly applicationIds: readonly string[];
  readonly grantIds: readonly string[];
  readonly workflowIds: readonly string[];
  readonly options: ErasureOptions;
}

interface ErasureStep {
  readonly table: string;
  run(ctx: ErasureContext): Promise<TableErasureReport>;
}

/** Every id the walk needs, read before the first delete makes it unreachable. */
async function collectContext(
  userId: string,
  options: ErasureOptions
): Promise<ErasureContext> {
  return {
    userId,
    runIds: await selectIds(jobs, jobs.id, eq(jobs.user_id, userId)),
    applicationIds: await selectIds(
      applications,
      applications.id,
      eq(applications.user_id, userId)
    ),
    grantIds: await selectIds(
      mcpOauthGrants,
      mcpOauthGrants.id,
      eq(mcpOauthGrants.user_id, userId)
    ),
    workflowIds: await selectIds(
      workflows,
      workflows.id,
      eq(workflows.user_id, userId)
    ),
    options
  };
}

/** Erasure is the retention sweep with its horizon moved past every row. */
const ERASURE_HORIZON = new Date("9999-01-01T00:00:00.000Z");

const ERASURE_RETENTION_POLICY: StorageRetentionPolicy = {
  maxAutosavesPerWorkflow: 0,
  autosaveRetentionDays: 1,
  manualVersionRetentionDays: 1,
  terminalJobRetentionDays: 1,
  runEventRetentionDays: 1,
  predictionRetentionDays: 1,
  automaticCleanup: false
};

/** A table erased by one `WHERE <column> = <userId>`. */
function directStep(
  table: string,
  sqlTable: SQLiteTable,
  column: TableColumn
): ErasureStep {
  return {
    table,
    async run(ctx) {
      return deleted(
        table,
        "delete",
        await deleteRows(sqlTable, eq(column, ctx.userId))
      );
    }
  };
}

/** A table erased through a parent's ids. */
function indirectStep(
  table: string,
  sqlTable: SQLiteTable,
  column: TableColumn,
  ids: (ctx: ErasureContext) => readonly string[]
): ErasureStep {
  return {
    table,
    async run(ctx) {
      return deleted(table, "delete", await deleteByIds(sqlTable, column, ids(ctx)));
    }
  };
}

/**
 * Ordered: children first, then the parent, then the tables kept on a lawful
 * basis. See the file header for why the order and the up-front id collection
 * are separate concerns.
 */
export const ERASURE_STEPS: readonly ErasureStep[] = [
  // Run exhaust, reached through the jobs that are still present.
  indirectStep("run_events", runEvents, runEvents.run_id, (c) => c.runIds),
  indirectStep(
    "run_inbox_messages",
    runInboxMessages,
    runInboxMessages.run_id,
    (c) => c.runIds
  ),
  indirectStep(
    "trigger_inputs",
    triggerInputs,
    triggerInputs.run_id,
    (c) => c.runIds
  ),
  directStep("nodetool_jobs", jobs, jobs.user_id),
  directStep(
    "trigger_registrations",
    triggerRegistrations,
    triggerRegistrations.user_id
  ),

  // Applications: children first, the app itself last.
  indirectStep(
    "application_budgets",
    applicationBudgets,
    applicationBudgets.application_id,
    (c) => c.applicationIds
  ),
  directStep(
    "application_invocations",
    applicationInvocations,
    applicationInvocations.user_id
  ),
  directStep(
    "application_versions",
    applicationVersions,
    applicationVersions.user_id
  ),
  directStep(
    "application_deployments",
    applicationDeployments,
    applicationDeployments.user_id
  ),
  directStep("applications", applications, applications.user_id),

  // Credentials and consent.
  indirectStep(
    "mcp_oauth_tokens",
    mcpOauthTokens,
    mcpOauthTokens.grant_id,
    (c) => c.grantIds
  ),
  directStep("mcp_oauth_grants", mcpOauthGrants, mcpOauthGrants.user_id),
  directStep("access_tokens", accessTokens, accessTokens.user_id),
  directStep(
    "external_identities",
    externalIdentities,
    externalIdentities.user_id
  ),
  directStep(
    "nodetool_oauth_credentials",
    oauthCredentials,
    oauthCredentials.user_id
  ),
  directStep("nodetool_secrets", secrets, secrets.user_id),

  // Sharing, then the workflows the shares point at.
  {
    table: "nodetool_workflow_shares",
    async run(ctx) {
      // Two sweeps: links this person created, and links on this person's
      // workflows that someone else created. Leaving the second behind would
      // keep a live token for a graph that no longer exists.
      let total = await deleteRows(
        workflowShares,
        eq(workflowShares.created_by, ctx.userId)
      );
      total += await deleteByIds(
        workflowShares,
        workflowShares.workflow_id,
        ctx.workflowIds
      );
      return deleted("nodetool_workflow_shares", "delete", total);
    }
  },
  {
    table: "nodetool_workflow_collaborators",
    async run(ctx) {
      // This person's memberships elsewhere, plus everyone's membership of
      // this person's graphs — those rows name other people, but they point
      // at graphs about to be deleted.
      let total = await deleteRows(
        workflowCollaborators,
        eq(workflowCollaborators.user_id, ctx.userId)
      );
      total += await deleteByIds(
        workflowCollaborators,
        workflowCollaborators.workflow_id,
        ctx.workflowIds
      );
      return deleted("nodetool_workflow_collaborators", "delete", total);
    }
  },
  directStep(
    "nodetool_workflow_versions",
    workflowVersions,
    workflowVersions.user_id
  ),
  directStep("nodetool_workflows", workflows, workflows.user_id),

  // Content the person authored.
  directStep("nodetool_assets", assets, assets.user_id),
  directStep("nodetool_messages", messages, messages.user_id),
  directStep("nodetool_threads", threads, threads.user_id),
  directStep("nodetool_memories", memories, memories.user_id),
  directStep("nodetool_settings", appSettings, appSettings.user_id),
  directStep("nodetool_workspaces", workspacesSchema, workspacesSchema.user_id),
  directStep("projects", projects, projects.user_id),
  directStep("skills", skills, skills.user_id),
  directStep("scripts", scripts, scripts.user_id),
  directStep("storyboards", storyboards, storyboards.user_id),
  directStep("js_script_versions", jsScriptVersions, jsScriptVersions.user_id),
  directStep("js_scripts", jsScripts, jsScripts.user_id),
  directStep(
    "image_document_versions",
    imageDocumentVersions,
    imageDocumentVersions.user_id
  ),
  directStep("image_documents", imageDocuments, imageDocuments.user_id),
  directStep(
    "timeline_sequence_versions",
    timelineSequenceVersions,
    timelineSequenceVersions.user_id
  ),
  directStep("timeline_sequences", timelineSequences, timelineSequences.user_id),

  // Kept on a lawful basis that outlives the request.
  {
    table: "nodetool_predictions",
    async run(ctx) {
      // `cleanupStorage` owns this redaction. Running it at a horizon past
      // every row redacts all of them; by this point the jobs and versions it
      // also prunes are already gone, so it reports only the predictions.
      const result = await cleanupStorage(
        ctx.userId,
        ERASURE_RETENTION_POLICY,
        ERASURE_HORIZON
      );
      return {
        table: "nodetool_predictions",
        disposition: "redact",
        deleted: 0,
        redacted: result.redactedPredictions,
        retained: await countRows(
          predictions,
          eq(predictions.user_id, ctx.userId)
        )
      };
    }
  },
  {
    table: "nodetool_credit_ledger",
    async run(ctx) {
      return {
        table: "nodetool_credit_ledger",
        disposition: "retain",
        deleted: 0,
        redacted: 0,
        retained: await countRows(
          creditLedger,
          eq(creditLedger.user_id, ctx.userId)
        )
      };
    }
  },
  {
    table: "nodetool_user_subscriptions",
    async run(ctx) {
      return {
        table: "nodetool_user_subscriptions",
        disposition: "retain",
        deleted: 0,
        redacted: 0,
        retained: await countRows(
          userSubscriptions,
          eq(userSubscriptions.user_id, ctx.userId)
        )
      };
    }
  },
  {
    table: "nodetool_user_events",
    async run(ctx) {
      // Last, so the operational events written by the deletes above are
      // swept too. The consent/terms/DSR types stay: they are the evidence
      // that consent was given and that this erasure was performed, and
      // `pruneUserEvents` refuses to age them out for the same reason.
      if (ctx.options.purgeComplianceEvidence === true) {
        const gone = await deleteUserEventsForUser(ctx.userId);
        return {
          table: "nodetool_user_events",
          disposition: "retain",
          deleted: gone,
          redacted: 0,
          retained: 0
        };
      }
      const operational = and(
        eq(userEvents.user_id, ctx.userId),
        notInArray(userEvents.event_type, [...NEVER_PRUNED_USER_EVENT_TYPES])
      );
      const gone = await deleteRows(userEvents, operational);
      return {
        table: "nodetool_user_events",
        disposition: "retain",
        deleted: gone,
        redacted: 0,
        retained: await countRows(
          userEvents,
          eq(userEvents.user_id, ctx.userId)
        )
      };
    }
  }
];

// ── The two entry points ──────────────────────────────────────────────

/**
 * Erase one person's data, everywhere the registry says it lives.
 *
 * Idempotent: a second call finds nothing to delete and reports zeros, and
 * the redaction stops matching once the payload columns are null. Safe to
 * retry after a partial failure.
 */
export async function erasePersonalData(
  userId: string,
  options: ErasureOptions = {}
): Promise<ErasureReport> {
  if (!userId) throw new Error("erasePersonalData requires a user id");

  const ctx = await collectContext(userId, options);
  const tables: TableErasureReport[] = [];
  for (const step of ERASURE_STEPS) {
    tables.push(await step.run(ctx));
  }

  const objectKeysDeleted = options.objectStore
    ? [...(await options.objectStore.deleteObjectsForUser(userId))]
    : null;

  const totals = tables.reduce(
    (acc, row) => ({
      deleted: acc.deleted + row.deleted,
      redacted: acc.redacted + row.redacted,
      retained: acc.retained + row.retained
    }),
    { deleted: 0, redacted: 0, retained: 0 }
  );

  if (options.requestId) {
    // Written after the sweep, so it survives it. This row is the evidence
    // the erasure happened, which is why the sweep above keeps its type.
    await recordUserEvent({
      userId,
      eventType: UserEventType.DATA_ERASURE_COMPLETED,
      metadata: {
        request_id: options.requestId,
        rows_deleted: totals.deleted
      }
    });
  }

  return {
    userId,
    completedAt: new Date().toISOString(),
    tables,
    ...totals,
    objectKeysDeleted
  };
}

// ── Export ────────────────────────────────────────────────────────────

export interface PersonalDataExportTable {
  readonly disposition: PersonalDataDisposition;
  readonly reach: PersonalDataReach;
  readonly rowCount: number;
  /** True when `maxRowsPerTable` cut the list short. */
  readonly truncated: boolean;
  /** Columns present in the rows but blanked; empty when nothing is withheld. */
  readonly withheldColumns: readonly string[];
  readonly rows: readonly Record<string, unknown>[];
}

export interface PersonalDataExport {
  readonly format: "nodetool.personal-data-export/1";
  readonly subjectUserId: string;
  readonly generatedAt: string;
  readonly tables: Readonly<Record<string, PersonalDataExportTable>>;
  /** Tables holding no portable data for this person, and why. */
  readonly excluded: readonly { table: string; reason: string }[];
}

export interface PersonalDataExportOptions {
  /** Cap per table; `run_events` alone can run to millions of rows. */
  readonly maxRowsPerTable?: number;
}

const DEFAULT_MAX_ROWS_PER_TABLE = 50_000;

interface ExportContext {
  readonly userId: string;
  readonly runIds: readonly string[];
  readonly applicationIds: readonly string[];
  readonly limit: number;
}

type ExportHandler = (
  ctx: ExportContext
) => Promise<readonly Record<string, unknown>[]>;

async function selectRows(
  table: SQLiteTable,
  where: SQL | undefined,
  limit: number
): Promise<readonly Record<string, unknown>[]> {
  const rows = await getDb().select().from(table).where(where).limit(limit);
  return rows as Record<string, unknown>[];
}

function directExport(
  sqlTable: SQLiteTable,
  column: TableColumn
): ExportHandler {
  return (ctx) => selectRows(sqlTable, eq(column, ctx.userId), ctx.limit);
}

function indirectExport(
  sqlTable: SQLiteTable,
  column: TableColumn,
  ids: (ctx: ExportContext) => readonly string[]
): ExportHandler {
  return async (ctx) => {
    const out: Record<string, unknown>[] = [];
    for (const batch of chunks(ids(ctx))) {
      if (out.length >= ctx.limit) break;
      const rows = await selectRows(
        sqlTable,
        inArray(column, batch),
        ctx.limit - out.length
      );
      out.push(...rows);
    }
    return out;
  };
}

/**
 * One handler per exported table. Keyed by table name so the audit can prove
 * the set matches the registry's `exported: true` entries.
 *
 * The two sharing tables are deliberately narrower here than in erasure.
 * Erasure removes collaborator and share rows on this person's workflows even
 * when another person created them; the export must not hand those over,
 * because they are the other person's data. Both handlers therefore select on
 * the subject's own id only.
 */
export const EXPORT_HANDLERS: Readonly<Record<string, ExportHandler>> = {
  access_tokens: directExport(accessTokens, accessTokens.user_id),
  application_budgets: indirectExport(
    applicationBudgets,
    applicationBudgets.application_id,
    (c) => c.applicationIds
  ),
  application_deployments: directExport(
    applicationDeployments,
    applicationDeployments.user_id
  ),
  application_invocations: directExport(
    applicationInvocations,
    applicationInvocations.user_id
  ),
  application_versions: directExport(
    applicationVersions,
    applicationVersions.user_id
  ),
  applications: directExport(applications, applications.user_id),
  external_identities: directExport(
    externalIdentities,
    externalIdentities.user_id
  ),
  image_document_versions: directExport(
    imageDocumentVersions,
    imageDocumentVersions.user_id
  ),
  image_documents: directExport(imageDocuments, imageDocuments.user_id),
  js_script_versions: directExport(jsScriptVersions, jsScriptVersions.user_id),
  js_scripts: directExport(jsScripts, jsScripts.user_id),
  mcp_oauth_grants: directExport(mcpOauthGrants, mcpOauthGrants.user_id),
  nodetool_assets: directExport(assets, assets.user_id),
  nodetool_credit_ledger: directExport(creditLedger, creditLedger.user_id),
  nodetool_jobs: directExport(jobs, jobs.user_id),
  nodetool_memories: directExport(memories, memories.user_id),
  nodetool_messages: directExport(messages, messages.user_id),
  nodetool_oauth_credentials: directExport(
    oauthCredentials,
    oauthCredentials.user_id
  ),
  nodetool_predictions: directExport(predictions, predictions.user_id),
  nodetool_secrets: directExport(secrets, secrets.user_id),
  nodetool_settings: directExport(appSettings, appSettings.user_id),
  nodetool_threads: directExport(threads, threads.user_id),
  nodetool_user_events: directExport(userEvents, userEvents.user_id),
  nodetool_user_subscriptions: directExport(
    userSubscriptions,
    userSubscriptions.user_id
  ),
  nodetool_workflow_collaborators: directExport(
    workflowCollaborators,
    workflowCollaborators.user_id
  ),
  nodetool_workflow_shares: directExport(
    workflowShares,
    workflowShares.created_by
  ),
  nodetool_workflow_versions: directExport(
    workflowVersions,
    workflowVersions.user_id
  ),
  nodetool_workflows: directExport(workflows, workflows.user_id),
  nodetool_workspaces: directExport(workspacesSchema, workspacesSchema.user_id),
  projects: directExport(projects, projects.user_id),
  run_events: indirectExport(runEvents, runEvents.run_id, (c) => c.runIds),
  scripts: directExport(scripts, scripts.user_id),
  skills: directExport(skills, skills.user_id),
  storyboards: directExport(storyboards, storyboards.user_id),
  timeline_sequence_versions: directExport(
    timelineSequenceVersions,
    timelineSequenceVersions.user_id
  ),
  timeline_sequences: directExport(timelineSequences, timelineSequences.user_id),
  trigger_inputs: indirectExport(
    triggerInputs,
    triggerInputs.run_id,
    (c) => c.runIds
  ),
  trigger_registrations: directExport(
    triggerRegistrations,
    triggerRegistrations.user_id
  )
};

/**
 * Blank the registry's `withheldColumns` on a copy of the row.
 *
 * Applied centrally rather than inside each handler so a new table cannot
 * forget: the registry names the column, and every row for that table goes
 * through here.
 */
function mask(
  rows: readonly Record<string, unknown>[],
  entry: PersonalDataEntry
): readonly Record<string, unknown>[] {
  const withheld = entry.withheldColumns ?? [];
  if (withheld.length === 0) return rows;
  return rows.map((row) => {
    const copy: Record<string, unknown> = { ...row };
    for (const column of withheld) {
      if (column in copy) copy[column] = WITHHELD_VALUE;
    }
    return copy;
  });
}

/**
 * Build an Art. 20 portability export for one person.
 *
 * Two things it deliberately does not contain. Credential material — secret
 * ciphertext, OAuth tokens, token hashes, share and deployment tokens — is
 * replaced by {@link WITHHELD_VALUE}, so the record is visible and the
 * credential is not. And nobody else's data: the sharing tables are read on
 * the subject's own id, never on their workflows, so a collaborator's row
 * stays with the collaborator.
 */
export async function exportPersonalData(
  userId: string,
  options: PersonalDataExportOptions = {}
): Promise<PersonalDataExport> {
  if (!userId) throw new Error("exportPersonalData requires a user id");

  const limit = options.maxRowsPerTable ?? DEFAULT_MAX_ROWS_PER_TABLE;
  const ctx: ExportContext = {
    userId,
    runIds: await selectIds(jobs, jobs.id, eq(jobs.user_id, userId)),
    applicationIds: await selectIds(
      applications,
      applications.id,
      eq(applications.user_id, userId)
    ),
    limit
  };

  const tables: Record<string, PersonalDataExportTable> = {};
  const excluded: { table: string; reason: string }[] = [];

  for (const entry of PERSONAL_DATA_REGISTRY) {
    if (!entry.exported) {
      excluded.push({ table: entry.table, reason: entry.justification });
      continue;
    }
    const handler = EXPORT_HANDLERS[entry.table];
    if (!handler) {
      throw new Error(
        `No export handler for registered table "${entry.table}". ` +
          "Add one in personal-data.ts or set exported: false in the registry."
      );
    }
    const rows = await handler(ctx);
    tables[entry.table] = {
      disposition: entry.disposition,
      reach: entry.reach,
      rowCount: rows.length,
      truncated: rows.length >= limit,
      withheldColumns: entry.withheldColumns ?? [],
      rows: mask(rows, entry)
    };
  }

  return {
    format: "nodetool.personal-data-export/1",
    subjectUserId: userId,
    generatedAt: new Date().toISOString(),
    tables,
    excluded
  };
}

/** Tables erasure actually walks. The audit compares it to the registry. */
export const ERASURE_HANDLED_TABLES: readonly string[] = ERASURE_STEPS.map(
  (step) => step.table
);

/** Registry entries erasure must handle. Exported for the audit. */
export function actionableEntries(): readonly PersonalDataEntry[] {
  return PERSONAL_DATA_REGISTRY.filter(isActionable);
}
