/**
 * The Application entity: a mini app's own record, independent of any one
 * workflow.
 *
 * An app used to *be* a workflow — its document lived on `workflow.app_doc`, so
 * the workflow id was the app's identity and an app could expose exactly one
 * operation and carry no history. An application row separates the two: the app
 * owns a UI document plus typed bindings, and each binding names a workflow.
 */
import { createHash } from "node:crypto";
import { eq, desc, and, max, sql } from "drizzle-orm";
import {
  APP_SCHEMA_VERSION,
  createEmptyDocument,
  parseApplicationDocument,
  type ApplicationDocument,
  type ResourceKind,
  type ResourceOperation
} from "@nodetool-ai/app-runtime";

import {
  DBModel,
  ModelChangeEvent,
  ModelChangeMeta,
  ModelObserver,
  createTimeOrderedUuid
} from "./base-model.js";
import { getDb, getDbType, type DbTransaction, forUpdate } from "./db.js";
import {
  applications,
  applicationDeployments,
  applicationVersions
} from "./schema/applications.js";
import {
  applicationBudgets,
  applicationInvocations
} from "./schema/application-budgets.js";
import { Workflow, type WorkflowGraph } from "./workflow.js";
import { WorkflowVersion } from "./workflow-version.js";

/**
 * What a release is allowed to do, derived from its bindings at publish time
 * rather than hand-written. There is nothing else to declare because there is
 * nothing else the app layer can do.
 */
export interface ApplicationCapabilities {
  /**
   * Workflow ids the release may invoke, with the version each is pinned to
   * and the hash of the graph that version froze. The hash identifies the
   * exact graph a release runs without carrying it.
   */
  workflows: Array<{
    workflowId: string;
    version?: number;
    graphHash?: string;
  }>;
  /** Resource kinds the release touches and the operations it uses on them. */
  resources: Array<{ kind: ResourceKind; operations: ResourceOperation[] }>;
}

/**
 * A workflow graph as a release froze it.
 *
 * `version` is a row in `nodetool_workflow_versions` written at publish time,
 * so the number means the same thing it means everywhere else in the app. The
 * graph itself is copied onto the release as well: a release must stay
 * reproducible even if that version row is later pruned or its workflow is
 * deleted.
 *
 * Both are null on a snapshot published before releases pinned anything; a
 * runtime that meets one has no frozen graph to run and falls back to the live
 * workflow.
 */
export interface PinnedWorkflow {
  workflowId: string;
  version: number | null;
  graphHash: string | null;
  graph: WorkflowGraph | null;
}

export interface ApplicationResponse {
  id: string;
  projectId: string;
  name: string;
  description: string;
  document: ApplicationDocument;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationVersionResponse {
  id: string;
  applicationId: string;
  version: number;
  document: ApplicationDocument;
  capabilities: ApplicationCapabilities;
  released: boolean;
  createdAt: string;
}

/**
 * Everything needed to *run* a release: the snapshot plus the frozen graph of
 * every workflow its operations name.
 */
export interface ApplicationReleaseResponse extends ApplicationVersionResponse {
  workflows: PinnedWorkflow[];
}

export class ApplicationConflictError extends Error {
  constructor(id: string) {
    super(`Application ${id} was modified concurrently`);
    this.name = "ApplicationConflictError";
  }
}

/** An id a client asked for that is already taken, by anyone. */
export class ApplicationIdInUseError extends Error {
  constructor(id: string) {
    super(`Application id ${id} is already in use`);
    this.name = "ApplicationIdInUseError";
  }
}

export class InvalidApplicationIdError extends Error {
  constructor(id: string) {
    super(`Application id ${id} is not a valid identifier`);
    this.name = "InvalidApplicationIdError";
  }
}

/**
 * Ids may be supplied by the client — bundle import and the example apps both
 * need a stable one — so the shape is pinned here: printable, path-safe, and
 * short enough to log. Anything else is rejected rather than normalized into
 * something the caller did not ask for.
 */
const APPLICATION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Trim and validate a client-supplied id, or throw. */
export function normalizeApplicationId(raw: string): string {
  const id = raw.trim();
  if (!APPLICATION_ID_RE.test(id)) throw new InvalidApplicationIdError(raw);
  return id;
}

/** Derive a release's capability summary from the document's bindings. */
export const deriveCapabilities = (
  document: ApplicationDocument,
  graphHashes: ReadonlyMap<string, string> = new Map()
): ApplicationCapabilities => {
  const workflows = new Map<
    string,
    { workflowId: string; version?: number; graphHash?: string }
  >();
  for (const operation of document.operations) {
    const key = `${operation.workflowId}@${operation.workflowVersion ?? ""}`;
    workflows.set(key, {
      workflowId: operation.workflowId,
      version: operation.workflowVersion,
      graphHash: graphHashes.get(operation.workflowId)
    });
  }
  const resources = new Map<ResourceKind, Set<ResourceOperation>>();
  for (const binding of document.resources) {
    const existing =
      resources.get(binding.kind) ?? new Set<ResourceOperation>();
    for (const op of binding.operations) existing.add(op);
    resources.set(binding.kind, existing);
  }
  return {
    workflows: [...workflows.values()],
    resources: [...resources.entries()].map(([kind, ops]) => ({
      kind,
      operations: [...ops]
    }))
  };
};

function parseDocumentOrThrow(raw: string): ApplicationDocument {
  const parsed = parseApplicationDocument(JSON.parse(raw));
  if (!parsed) {
    throw new Error(
      `application document is not valid at schema version ${APP_SCHEMA_VERSION}`
    );
  }
  return parsed;
}

function nextUpdatedAtAfter(previous: string): string {
  const now = new Date();
  const previousMs = Date.parse(previous);
  if (Number.isFinite(previousMs) && now.getTime() <= previousMs) {
    return new Date(previousMs + 1).toISOString();
  }
  return now.toISOString();
}

export class Application extends DBModel {
  static override table = applications;

  declare id: string;
  declare user_id: string;
  declare project_id: string;
  declare name: string;
  declare description: string;
  declare document: string;
  declare created_at: string;
  declare updated_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= createTimeOrderedUuid();
    this.project_id ??= "default";
    this.name ??= "Untitled app";
    this.description ??= "";
    this.document ??= JSON.stringify(createEmptyDocument());
    this.created_at ??= now;
    this.updated_at ??= now;
  }

  override beforeSave(): void {
    this.updated_at = nextUpdatedAtAfter(this.updated_at);
    parseDocumentOrThrow(this.document);
  }

  toDocument(): ApplicationDocument {
    return parseDocumentOrThrow(this.document);
  }

  toResponse(): ApplicationResponse {
    return {
      id: this.id,
      projectId: this.project_id,
      name: this.name,
      description: this.description,
      document: this.toDocument(),
      createdAt: this.created_at,
      updatedAt: this.updated_at
    };
  }

  static async findById(id: string): Promise<Application | null> {
    return Application.get<Application>(id);
  }

  /**
   * Create a row whose id is not already taken by anyone.
   *
   * `save()` upserts, so creating over an existing id would silently adopt —
   * or clobber — another account's app. Ids are global (a client may supply
   * one), so the insert is a plain insert and a collision is an error even
   * when the row belongs to the caller.
   */
  static async createUnique(
    data: Record<string, unknown>
  ): Promise<Application> {
    const app = new Application(data);
    app.id = normalizeApplicationId(app.id);
    app.beforeSave();
    const db = getDb();
    try {
      await db
        .insert(applications)
        .values(app.toRow() as typeof applications.$inferInsert);
    } catch (error) {
      if (await Application.findById(app.id)) {
        throw new ApplicationIdInUseError(app.id);
      }
      throw error;
    }
    ModelObserver.notify(app, ModelChangeEvent.CREATED);
    return app;
  }

  /**
   * Delete the app and everything hanging off it, in one transaction.
   *
   * The declared foreign keys cascade on PostgreSQL and on better-sqlite3,
   * which turns `PRAGMA foreign_keys` on — but that pragma is per-connection,
   * and a SQLite connection opened without it silently keeps the children.
   * They carry no owner of their own, so one left behind is readable by
   * whoever next claims this id. The children are therefore deleted
   * explicitly, and the parent last, so a failure anywhere leaves the app
   * intact rather than half-erased.
   */
  override async delete(): Promise<void> {
    const db = getDb();
    const id = this.id;

    const statements = (tx: DbTransaction): unknown[] => [
      tx
        .delete(applicationVersions)
        .where(eq(applicationVersions.application_id, id)),
      tx
        .delete(applicationInvocations)
        .where(eq(applicationInvocations.application_id, id)),
      tx
        .delete(applicationBudgets)
        .where(eq(applicationBudgets.application_id, id)),
      tx
        .delete(applicationDeployments)
        .where(eq(applicationDeployments.application_id, id)),
      tx.delete(applications).where(eq(applications.id, id))
    ];

    if (getDbType() === "sqlite") {
      // better-sqlite3 transactions must be fully synchronous; an async
      // callback returns a Promise the driver rejects.
      db.transaction((tx: DbTransaction): void => {
        for (const statement of statements(tx)) {
          (statement as { run: () => void }).run();
        }
      });
    } else {
      await db.transaction(async (tx: DbTransaction): Promise<void> => {
        for (const statement of statements(tx)) await statement;
      });
    }

    ModelObserver.notify(this, ModelChangeEvent.DELETED);
  }

  static async listByUser(userId: string, limit = 50): Promise<Application[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(applications)
      .where(eq(applications.user_id, userId))
      .orderBy(desc(applications.updated_at))
      .limit(limit);
    return rows.map((r: Record<string, unknown>) => new Application(r));
  }

  static async listByProject(
    projectId: string,
    userId: string,
    limit = 50
  ): Promise<Application[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.project_id, projectId),
          eq(applications.user_id, userId)
        )
      )
      .orderBy(desc(applications.updated_at))
      .limit(limit);
    return rows.map((r: Record<string, unknown>) => new Application(r));
  }

  /**
   * Atomic compare-and-swap save. Applies only when the row's `updated_at`
   * still equals `expectedUpdatedAt`; returns null on conflict so the caller
   * reports it instead of clobbering a concurrent write.
   */
  static async updateFieldsIfUnchanged(
    id: string,
    expectedUpdatedAt: string,
    fields: Partial<{ name: string; description: string; document: string }>,
    meta?: ModelChangeMeta
  ): Promise<Application | null> {
    if (fields.document !== undefined) parseDocumentOrThrow(fields.document);
    const db = getDb();
    const now = nextUpdatedAtAfter(expectedUpdatedAt);
    const rows = await db
      .update(applications)
      .set({ ...fields, updated_at: now })
      .where(
        and(
          eq(applications.id, id),
          eq(applications.updated_at, expectedUpdatedAt)
        )
      )
      .returning();

    const row = rows[0];
    if (!row) return null;

    const updated = new Application(row);
    ModelObserver.notify(updated, ModelChangeEvent.UPDATED, meta);
    return updated;
  }
}

const toVersionResponse = (
  row: Record<string, unknown>
): ApplicationVersionResponse => ({
  id: String(row.id),
  applicationId: String(row.application_id),
  version: Number(row.version),
  document: parseDocumentOrThrow(
    typeof row.document === "string"
      ? row.document
      : JSON.stringify(row.document)
  ),
  capabilities:
    typeof row.capabilities === "string"
      ? (JSON.parse(row.capabilities) as ApplicationCapabilities)
      : (row.capabilities as ApplicationCapabilities),
  released: Boolean(row.released),
  createdAt: String(row.created_at)
});

/** Stable hash of a graph — the identity of the code a release runs. */
const hashGraph = (graph: WorkflowGraph): string =>
  createHash("sha256").update(JSON.stringify(graph)).digest("hex");

const parsePinnedGraphs = (
  raw: unknown
): Map<
  string,
  { version: number | null; graphHash: string; graph: WorkflowGraph }
> => {
  if (raw == null) return new Map();
  const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as Record<
    string,
    { version: number | null; graphHash: string; graph: WorkflowGraph }
  >;
  return new Map(Object.entries(parsed));
};

/**
 * Freeze every workflow the document invokes.
 *
 * Each referenced workflow's live graph is written as a new row in the
 * workflow's own version history (`save_type: "publish"`), so the number the
 * release pins is a real workflow version, not one invented for apps. The
 * graph is returned alongside it so the release can carry its own copy.
 */
async function pinWorkflows(
  document: ApplicationDocument,
  userId: string,
  applicationVersion: number
): Promise<
  Map<
    string,
    { version: number | null; graphHash: string; graph: WorkflowGraph }
  >
> {
  const pinned = new Map<
    string,
    { version: number | null; graphHash: string; graph: WorkflowGraph }
  >();
  for (const operation of document.operations) {
    if (pinned.has(operation.workflowId)) continue;
    const workflow = await Workflow.find(userId, operation.workflowId);
    if (!workflow) {
      throw new Error(
        `Cannot publish: workflow ${operation.workflowId} bound to operation ` +
          `${operation.id} was not found`
      );
    }
    const graph = workflow.getGraph();
    // Only the workflow's owner may add to its version history; publishing an
    // app over someone else's shared workflow still pins the graph, it just
    // has no version of theirs to name.
    let version: number | null = null;
    if (workflow.user_id === userId) {
      version = await WorkflowVersion.nextVersion(operation.workflowId);
      await WorkflowVersion.create<WorkflowVersion>({
        workflow_id: operation.workflowId,
        user_id: workflow.user_id,
        name: workflow.name,
        description: `Pinned by application release v${applicationVersion}`,
        graph,
        version,
        save_type: "publish"
      });
    }
    pinned.set(operation.workflowId, {
      version,
      graphHash: hashGraph(graph),
      graph
    });
  }
  return pinned;
}

/**
 * A version plus the frozen graphs it runs. Snapshots published before pinning
 * carry no graphs; their entries report null so the caller can tell "pinned to
 * nothing" from "pinned to this".
 */
const toReleaseResponse = (
  row: Record<string, unknown>
): ApplicationReleaseResponse => {
  const version = toVersionResponse(row);
  const graphs = parsePinnedGraphs(row.workflow_graphs);
  const workflowIds = new Set(
    version.document.operations.map((operation) => operation.workflowId)
  );
  return {
    ...version,
    workflows: [...workflowIds].map((workflowId) => {
      const pinned = graphs.get(workflowId);
      return {
        workflowId,
        version: pinned?.version ?? null,
        graphHash: pinned?.graphHash ?? null,
        graph: pinned?.graph ?? null
      };
    })
  };
};

/**
 * Publish the application's current draft as an immutable, released snapshot.
 * The release pointer moves to the new version; rollback is `release(id, n)`.
 *
 * Publishing pins: every operation's `workflowVersion` is set to a workflow
 * version written now, and that version's graph is copied onto the snapshot.
 * Editing the workflow afterwards changes the draft's runs, never the
 * release's.
 */
export async function publishApplication(
  application: Application
): Promise<ApplicationReleaseResponse> {
  const db = getDb();
  const draft = application.toDocument();
  const highest = await db
    .select({ value: max(applicationVersions.version) })
    .from(applicationVersions)
    .where(eq(applicationVersions.application_id, application.id));
  // Only names the pinned workflow versions. The number the release actually
  // gets is read again inside the transaction below, where it is authoritative.
  const nextVersion = Number(highest[0]?.value ?? 0) + 1;

  const pinned = await pinWorkflows(draft, application.user_id, nextVersion);
  const document: ApplicationDocument = {
    ...draft,
    operations: draft.operations.map((operation) => ({
      ...operation,
      workflowVersion: pinned.get(operation.workflowId)?.version ?? undefined
    }))
  };
  const graphHashes = new Map(
    [...pinned].map(([workflowId, entry]) => [workflowId, entry.graphHash])
  );

  const snapshot = {
    id: createTimeOrderedUuid(),
    application_id: application.id,
    user_id: application.user_id,
    document: JSON.stringify(document),
    capabilities: JSON.stringify(deriveCapabilities(document, graphHashes)),
    workflow_graphs: JSON.stringify(Object.fromEntries(pinned)),
    released: 1,
    created_at: new Date().toISOString()
  };

  // Reading the highest version, clearing the old release flag and inserting
  // the new snapshot are one step. Two publishers that interleaved here used to
  // mint the same version number and leave two rows flagged released, which
  // made "the released version" whichever row the engine happened to return
  // first. The unique index on (application_id, version) is the backstop: a
  // publisher that still races through fails instead of duplicating.
  if (getDbType() === "sqlite") {
    // better-sqlite3 transactions must be fully synchronous; an async callback
    // returns a Promise the driver rejects.
    const row = db.transaction((tx: DbTransaction): Record<string, unknown> => {
      const highestInTx = tx
        .select({ value: max(applicationVersions.version) })
        .from(applicationVersions)
        .where(eq(applicationVersions.application_id, application.id))
        .get();
      tx.update(applicationVersions)
        .set({ released: 0 })
        .where(eq(applicationVersions.application_id, application.id))
        .run();
      return tx
        .insert(applicationVersions)
        .values({ ...snapshot, version: Number(highestInTx?.value ?? 0) + 1 })
        .returning()
        .get() as Record<string, unknown>;
    });
    return toReleaseResponse(row);
  }

  const row = await db.transaction(async (tx: DbTransaction) => {
    // Locking the app row serializes publishes of the same app: a second
    // publisher waits here instead of reading a version number this one is
    // about to take.
    await forUpdate(
      tx
        .select()
        .from(applications)
        .where(eq(applications.id, application.id))
        .limit(1)
    );
    const [highestInTx] = await tx
      .select({ value: max(applicationVersions.version) })
      .from(applicationVersions)
      .where(eq(applicationVersions.application_id, application.id));
    await tx
      .update(applicationVersions)
      .set({ released: 0 })
      .where(eq(applicationVersions.application_id, application.id));
    const [inserted] = await tx
      .insert(applicationVersions)
      .values({ ...snapshot, version: Number(highestInTx?.value ?? 0) + 1 })
      .returning();
    return inserted as Record<string, unknown>;
  });
  return toReleaseResponse(row);
}

/**
 * The application's rows, optionally narrowed to one owner. Snapshots written
 * before the column existed carry a null `user_id` and stay visible — the app
 * row's ownership check is what covered them.
 */
const ownedBy = (applicationId: string, userId?: string) =>
  userId === undefined
    ? eq(applicationVersions.application_id, applicationId)
    : and(
        eq(applicationVersions.application_id, applicationId),
        sql`(${applicationVersions.user_id} IS NULL OR ${applicationVersions.user_id} = ${userId})`
      );

/**
 * Snapshots of an application, newest first.
 *
 * `userId` scopes the read to the owner the snapshots were written for. A
 * version row is looked up by application id alone, and ids are
 * client-supplied, so a caller acting for a user passes theirs rather than
 * trusting that the app row holding this id is still the one that published.
 */
export async function listApplicationVersions(
  applicationId: string,
  limit = 50,
  userId?: string
): Promise<ApplicationVersionResponse[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(applicationVersions)
    .where(ownedBy(applicationId, userId))
    .orderBy(desc(applicationVersions.version))
    .limit(limit);
  return rows.map((r: Record<string, unknown>) => toVersionResponse(r));
}

/**
 * The released row, or null. Ordered by version so an inconsistent table —
 * two rows flagged released by some earlier write — resolves to the newest
 * one rather than to whichever row the engine returns first.
 */
async function releasedRow(
  applicationId: string,
  userId?: string
): Promise<Record<string, unknown> | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(applicationVersions)
    .where(
      and(ownedBy(applicationId, userId), eq(applicationVersions.released, 1))
    )
    .orderBy(desc(applicationVersions.version))
    .limit(1);
  return rows[0] ?? null;
}

/** The snapshot a published app currently serves, if any. */
export async function releasedApplicationVersion(
  applicationId: string,
  userId?: string
): Promise<ApplicationVersionResponse | null> {
  const row = await releasedRow(applicationId, userId);
  return row ? toVersionResponse(row) : null;
}

/**
 * The released snapshot plus the graphs it is pinned to — everything a client
 * needs to run the release rather than the draft.
 */
export async function releasedApplicationRelease(
  applicationId: string,
  userId?: string
): Promise<ApplicationReleaseResponse | null> {
  const row = await releasedRow(applicationId, userId);
  return row ? toReleaseResponse(row) : null;
}

/**
 * Move the release pointer to an existing version (publish or rollback).
 *
 * The target is checked first and the flag is moved in one transaction:
 * rolling back to a version that does not exist used to clear the current
 * release before discovering there was nothing to promote, leaving a published
 * app serving nothing.
 */
export async function releaseApplicationVersion(
  applicationId: string,
  version: number,
  userId?: string
): Promise<ApplicationVersionResponse | null> {
  const db = getDb();
  const target = and(
    ownedBy(applicationId, userId),
    eq(applicationVersions.version, version)
  );

  if (getDbType() === "sqlite") {
    const row = db.transaction((tx: DbTransaction): Record<string, unknown> | null => {
      const existing = tx
        .select()
        .from(applicationVersions)
        .where(target)
        .limit(1)
        .get();
      if (!existing) return null;
      tx.update(applicationVersions)
        .set({ released: 0 })
        .where(eq(applicationVersions.application_id, applicationId))
        .run();
      return tx
        .update(applicationVersions)
        .set({ released: 1 })
        .where(target)
        .returning()
        .get() as Record<string, unknown>;
    });
    return row ? toVersionResponse(row) : null;
  }

  const row = await db.transaction(async (tx: DbTransaction) => {
    const [existing] = await forUpdate(
      tx
        .select()
        .from(applicationVersions)
        .where(target)
        .limit(1)
    );
    if (!existing) return null;
    await tx
      .update(applicationVersions)
      .set({ released: 0 })
      .where(eq(applicationVersions.application_id, applicationId));
    const [promoted] = await tx
      .update(applicationVersions)
      .set({ released: 1 })
      .where(target)
      .returning();
    return (promoted as Record<string, unknown>) ?? null;
  });
  return row ? toVersionResponse(row) : null;
}
