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
import { eq, desc, and, max } from "drizzle-orm";
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
  ModelObserver,
  createTimeOrderedUuid
} from "./base-model.js";
import { getDb } from "./db.js";
import { applications, applicationVersions } from "./schema/applications.js";
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
    fields: Partial<{ name: string; description: string; document: string }>
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

    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;

    const updated = new Application(row);
    ModelObserver.notify(updated, ModelChangeEvent.UPDATED);
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

  await db
    .update(applicationVersions)
    .set({ released: 0 })
    .where(eq(applicationVersions.application_id, application.id));

  const rows = await db
    .insert(applicationVersions)
    .values({
      id: createTimeOrderedUuid(),
      application_id: application.id,
      version: nextVersion,
      document: JSON.stringify(document),
      capabilities: JSON.stringify(deriveCapabilities(document, graphHashes)),
      workflow_graphs: JSON.stringify(Object.fromEntries(pinned)),
      released: 1,
      created_at: new Date().toISOString()
    })
    .returning();

  return toReleaseResponse(rows[0] as Record<string, unknown>);
}

export async function listApplicationVersions(
  applicationId: string,
  limit = 50
): Promise<ApplicationVersionResponse[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(applicationVersions)
    .where(eq(applicationVersions.application_id, applicationId))
    .orderBy(desc(applicationVersions.version))
    .limit(limit);
  return rows.map((r: Record<string, unknown>) => toVersionResponse(r));
}

/** The snapshot a published app currently serves, if any. */
export async function releasedApplicationVersion(
  applicationId: string
): Promise<ApplicationVersionResponse | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(applicationVersions)
    .where(
      and(
        eq(applicationVersions.application_id, applicationId),
        eq(applicationVersions.released, 1)
      )
    )
    .limit(1);
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? toVersionResponse(row) : null;
}

/**
 * The released snapshot plus the graphs it is pinned to — everything a client
 * needs to run the release rather than the draft.
 */
export async function releasedApplicationRelease(
  applicationId: string
): Promise<ApplicationReleaseResponse | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(applicationVersions)
    .where(
      and(
        eq(applicationVersions.application_id, applicationId),
        eq(applicationVersions.released, 1)
      )
    )
    .limit(1);
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? toReleaseResponse(row) : null;
}

/** Move the release pointer to an existing version (publish or rollback). */
export async function releaseApplicationVersion(
  applicationId: string,
  version: number
): Promise<ApplicationVersionResponse | null> {
  const db = getDb();
  await db
    .update(applicationVersions)
    .set({ released: 0 })
    .where(eq(applicationVersions.application_id, applicationId));
  const rows = await db
    .update(applicationVersions)
    .set({ released: 1 })
    .where(
      and(
        eq(applicationVersions.application_id, applicationId),
        eq(applicationVersions.version, version)
      )
    )
    .returning();
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? toVersionResponse(row) : null;
}
