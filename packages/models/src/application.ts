/**
 * The Application entity: a mini app's own record, independent of any one
 * workflow.
 *
 * An app used to *be* a workflow — its document lived on `workflow.app_doc`, so
 * the workflow id was the app's identity and an app could expose exactly one
 * operation and carry no history. An application row separates the two: the app
 * owns a UI document plus typed bindings, and each binding names a workflow.
 */
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

/**
 * What a release is allowed to do, derived from its bindings at publish time
 * rather than hand-written. There is nothing else to declare because there is
 * nothing else the app layer can do.
 */
export interface ApplicationCapabilities {
  /** Workflow ids the release may invoke, with the version each is pinned to. */
  workflows: Array<{ workflowId: string; version?: number }>;
  /** Resource kinds the release touches and the operations it uses on them. */
  resources: Array<{ kind: ResourceKind; operations: ResourceOperation[] }>;
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

export class ApplicationConflictError extends Error {
  constructor(id: string) {
    super(`Application ${id} was modified concurrently`);
    this.name = "ApplicationConflictError";
  }
}

/** Derive a release's capability summary from the document's bindings. */
export const deriveCapabilities = (
  document: ApplicationDocument
): ApplicationCapabilities => {
  const workflows = new Map<string, { workflowId: string; version?: number }>();
  for (const operation of document.operations) {
    const key = `${operation.workflowId}@${operation.workflowVersion ?? ""}`;
    workflows.set(key, {
      workflowId: operation.workflowId,
      version: operation.workflowVersion
    });
  }
  const resources = new Map<ResourceKind, Set<ResourceOperation>>();
  for (const binding of document.resources) {
    const existing = resources.get(binding.kind) ?? new Set<ResourceOperation>();
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
    typeof row.document === "string" ? row.document : JSON.stringify(row.document)
  ),
  capabilities:
    typeof row.capabilities === "string"
      ? (JSON.parse(row.capabilities) as ApplicationCapabilities)
      : (row.capabilities as ApplicationCapabilities),
  released: Boolean(row.released),
  createdAt: String(row.created_at)
});

/**
 * Publish the application's current draft as an immutable, released snapshot.
 * The release pointer moves to the new version; rollback is `release(id, n)`.
 */
export async function publishApplication(
  application: Application
): Promise<ApplicationVersionResponse> {
  const db = getDb();
  const document = application.toDocument();
  const highest = await db
    .select({ value: max(applicationVersions.version) })
    .from(applicationVersions)
    .where(eq(applicationVersions.application_id, application.id));
  const nextVersion = Number(highest[0]?.value ?? 0) + 1;

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
      capabilities: JSON.stringify(deriveCapabilities(document)),
      released: 1,
      created_at: new Date().toISOString()
    })
    .returning();

  return toVersionResponse(rows[0] as Record<string, unknown>);
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
