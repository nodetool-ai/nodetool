/**
 * Workflow model -- stores DAG-based workflow definitions.
 *
 * Port of Python's `nodetool.models.workflow`.
 */

import { eq, and, desc, or, isNull, lt, inArray, count, max, type SQL } from "drizzle-orm";
import {
  DBModel,
  ModelChangeEvent,
  ModelChangeMeta,
  ModelObserver,
  computeEtag,
  createTimeOrderedUuid,
  nextUpdatedAtAfter
} from "./base-model.js";
import { allowLegacyProjectWritesForTests, getPortableDb } from "./db.js";
import { projects } from "./schema/projects.js";
import { eraseRunTraceParentForModelDeletion } from "./run-trace.js";
import { workflows } from "./schema/workflows.js";
import { workflowVersions } from "./schema/workflow-versions.js";
import { saveKeepingRevision, type KeepRevision } from "./kept-revision.js";
import { WorkflowCollaborator } from "./workflow-collaborator.js";
import { TriggerRegistration } from "./trigger-registration.js";
import {
  assertDocumentFileMayLeave,
  deleteWithFile,
  type DocumentFileLocation,
  type DocumentFileSync
} from "./document-file-sync.js";
import type { GraphLink } from "@nodetool-ai/protocol";
import type { WorkflowRunMode } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import { workflowCollaborators, workflowShares } from "./schema/workflow-sharing.js";
import {
  deleteDocumentKeeping,
  documentRefTables,
  insertDependents,
  insertDocumentRow,
  registerDeletedDocumentKind,
  type DependentTable
} from "./deleted-document.js";
import { changingAccess } from "./access-epoch.js";

export type AccessLevel = "private" | "public";
export type { WorkflowRunMode };

export interface WorkflowGraph {
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
  /** Lineage links: no value, no execution order. */
  links?: GraphLink[];
}

export interface WorkflowSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly updated_at: string;
  readonly run_mode: string | null;
}

function ensureSqlCondition(condition: SQL<unknown> | undefined): SQL<unknown> {
  if (!condition) {
    throw new Error("Expected SQL condition");
  }
  return condition;
}

export type WorkflowUpdateFields = Partial<{
  name: string;
  tool_name: string | null;
  description: string;
  tags: string[];
  thumbnail: string | null;
  thumbnail_url: string | null;
  graph: WorkflowGraph;
  settings: Record<string, unknown> | null;
  package_name: string | null;
  path: string | null;
  run_mode: string | null;
  workspace_id: string | null;
  project_id: string;
  html_app: string | null;
  app_doc: Record<string, unknown> | null;
  receive_clipboard: boolean | null;
  access: AccessLevel;
  last_writer_instance: string | null;
  schema_version: number;
}>;

let workflowFileSync: DocumentFileSync<Workflow> | null = null;

/**
 * Per workflow instance: the project whose folder holds the file at
 * `file_path`, as last read from or written to the database. A save that
 * changes `project_id` uses it to remove the file from the folder the
 * workflow left.
 */
const fileProjects = new WeakMap<Workflow, string>();

/**
 * Install what writes a workflow's file in its project folder after the row
 * is saved, and deletes it after the row is deleted. See
 * {@link DocumentFileSync}.
 */
export function setWorkflowFileSync(
  sync: DocumentFileSync<Workflow> | null
): void {
  workflowFileSync = sync;
}

export class Workflow extends DBModel {
  static override table = workflows;

  declare id: string;
  declare user_id: string;
  declare name: string;
  declare tool_name: string | null;
  declare description: string;
  declare tags: string[];
  declare thumbnail: string | null;
  declare thumbnail_url: string | null;
  declare graph: WorkflowGraph;
  declare settings: Record<string, unknown> | null;
  declare package_name: string | null;
  declare path: string | null;
  declare run_mode: string | null;
  declare workspace_id: string | null;
  declare project_id: string;
  declare html_app: string | null;
  declare app_doc: Record<string, unknown> | null;
  declare receive_clipboard: boolean | null;
  declare access: AccessLevel;
  /** The workflow's file, relative to its project's folder. */
  declare file_path: string | null;
  /**
   * SHA-256 of the file as NodeTool last wrote or imported it. A file with
   * another hash holds an edit NodeTool has not seen. Null until the row is
   * first synced with a file. A host with no file sync leaves it as it is,
   * and the reconcile then finds the row newer than its untouched file.
   */
  declare file_hash: string | null;
  /** What the last reconcile found wrong with the file, or null. */
  declare file_error: string | null;
  /**
   * The editing instance that wrote the stored revision, or null when that
   * save carried none. A save from another instance first keeps the stored
   * revision as a version.
   */
  declare last_writer_instance: string | null;
  /** The document schema version the stored revision was written in. */
  declare schema_version: number;
  declare created_at: string;
  declare updated_at: string;

  override async delete(): Promise<void> {
    await eraseRunTraceParentForModelDeletion({ kind: "workflow", id: this.id });
    await deleteWithFile(workflowFileSync, this, async () => {
      await super.delete();
      return this;
    });
    await eraseRunTraceParentForModelDeletion({ kind: "workflow", id: this.id });
  }

  /**
   * The etag of the workflow, without the state of its file. Where the file
   * is, its hash and what the last reconcile found wrong with it are records
   * about the file and no content of the workflow. Recording them must not
   * read as a change of the workflow to a client that holds its etag, such
   * as an SDK client checking `workflow_etag` or an open editor.
   * The writer instance and schema version describe the save, and stay out
   * of the etag for the same reason.
   */
  override getEtag(): string {
    const {
      file_path: _path,
      file_hash: _hash,
      file_error: _error,
      last_writer_instance: _writer,
      schema_version: _schema,
      ...content
    } = this.toRow();
    return computeEtag(content);
  }

  /** Every create and save of a workflow row writes its file afterwards. */
  protected override async persist(event: ModelChangeEvent): Promise<this> {
    const previous = this.previousFile();
    if (previous && workflowFileSync) {
      // The save moves the workflow to another project. The stored row is
      // asked first, because its file in the folder it leaves is deleted.
      const [stored] = await getPortableDb()
        .select()
        .from(workflows)
        .where(eq(workflows.id, this.id))
        .limit(1);
      await assertDocumentFileMayLeave(
        workflowFileSync,
        stored ? new Workflow(stored) : null
      );
    }
    await super.persist(event);
    await this.syncFile(previous);
    return this;
  }

  /** The file this row had in another project, when a save moved the row. */
  private previousFile(): DocumentFileLocation | null {
    const project = fileProjects.get(this);
    return this.file_path && project !== undefined && project !== this.project_id
      ? { project_id: project, file_path: this.file_path }
      : null;
  }

  /** Write the file of this row, which a restore inserted without one. */
  async writeFile(): Promise<void> {
    await this.syncFile(null);
  }

  private async syncFile(previous: DocumentFileLocation | null): Promise<void> {
    await workflowFileSync?.saved(this, previous);
    this.rememberFileProject();
  }

  private rememberFileProject(): void {
    if (this.file_path) fileProjects.set(this, this.project_id);
    else fileProjects.delete(this);
  }

  /**
   * Record the file the row was last synced with. `updated_at` stays as it
   * is, because the file is not content: bumping it would break the
   * compare-and-swap save of an editor that has the workflow open. No change
   * is announced for the same reason.
   */
  static async setFileState(
    id: string,
    state: Partial<Pick<Workflow, "file_path" | "file_hash" | "file_error">>
  ): Promise<void> {
    await getPortableDb()
      .update(workflows)
      .set(state)
      .where(eq(workflows.id, id));
  }

  /**
   * Create a workflow without ever rewriting a row that already exists.
   *
   * `create()` and `save()` are upserts, and the primary key is
   * install-global: an id the caller did not mint, such as one read from a
   * file in a project folder, could otherwise replace the workflow of
   * another user or another project. This inserts and answers null on
   * conflict, leaving the existing row as it is. A lookup before the insert
   * does not replace it, since another writer can create the row in between.
   *
   * It applies the project rule of every save: the project must be the
   * owner's and not deleted. The file sync runs and the creation is
   * announced, as for `create()`.
   */
  static async insertNew(
    data: Record<string, unknown>
  ): Promise<Workflow | null> {
    const workflow = new Workflow(data);
    workflow.beforeSave();
    const db = getPortableDb();
    if (workflow.project_id !== "default" && !allowLegacyProjectWritesForTests()) {
      const [project] = await db
        .select({ deletedAt: projects.deleted_at })
        .from(projects)
        .where(
          and(
            eq(projects.id, workflow.project_id),
            eq(projects.user_id, workflow.user_id)
          )
        )
        .limit(1);
      if (!project) throw new Error("Project not found");
      if (project.deletedAt) throw new Error("Project has been deleted");
    }
    const rows = await db
      .insert(workflows)
      // SAFETY: `toRow` holds the table's columns, which the constructor
      // filled. The dynamic base model cannot express the insert shape.
      .values(workflow.toRow() as typeof workflows.$inferInsert)
      .onConflictDoNothing()
      .returning();
    const row = rows[0];
    if (!row) return null;
    const created = new Workflow(row);
    await created.syncFile(null);
    ModelObserver.notify(created, ModelChangeEvent.CREATED);
    return created;
  }

  /** The workflows whose files belong in the folder of `projectIds`. */
  static async listForProjects(
    userId: string,
    projectIds: readonly string[]
  ): Promise<Workflow[]> {
    if (projectIds.length === 0) return [];
    const rows = await getPortableDb()
      .select()
      .from(workflows)
      .where(
        and(
          eq(workflows.user_id, userId),
          inArray(workflows.project_id, [...projectIds])
        )
      );
    return rows.map((row) => new Workflow(row));
  }

  /**
   * The projects that hold a workflow whose file was never written, each
   * with its owner and how many such documents it holds, for every user or
   * for `userId`. A workflow from before project folders is one of them.
   */
  static async projectsWithUnwrittenFiles(userId?: string): Promise<
    Array<{ user_id: string; project_id: string; count: number }>
  > {
    return getPortableDb()
      .select({
        user_id: workflows.user_id,
        project_id: workflows.project_id,
        count: count()
      })
      .from(workflows)
      .where(
        and(
          isNull(workflows.file_path),
          userId === undefined ? undefined : eq(workflows.user_id, userId)
        )
      )
      .groupBy(workflows.user_id, workflows.project_id);
  }

  constructor(data: Record<string, unknown>) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= createTimeOrderedUuid();
    this.name ??= "";
    this.tool_name ??= null;
    this.description ??= "";
    this.tags ??= [];
    this.thumbnail ??= null;
    this.thumbnail_url ??= null;
    this.graph ??= { nodes: [], edges: [] };
    this.settings ??= null;
    this.package_name ??= null;
    this.path ??= null;
    this.run_mode ??= "workflow";
    this.workspace_id ??= null;
    this.project_id ??= "default";
    this.html_app ??= null;
    this.app_doc ??= null;
    this.access ??= "private";
    this.file_path ??= null;
    this.file_hash ??= null;
    this.file_error ??= null;
    this.last_writer_instance ??= null;
    this.schema_version ??= 1;
    this.rememberFileProject();
    this.created_at ??= now;
    this.updated_at ??= now;

    // Handle raw integer booleans from legacy data
    if (typeof this.receive_clipboard === "number") {
      this.receive_clipboard = this.receive_clipboard !== 0;
    }
    this.receive_clipboard ??= null;
  }

  override beforeSave(): void {
    this.updated_at = nextUpdatedAtAfter(this.updated_at);
  }

  /**
   * Find multiple workflows by id, efficiently checking ownership, public access,
   * or collaborator grants.
   */
  static async findMany(
    userId: string,
    workflowIds: string[]
  ): Promise<Workflow[]> {
    if (workflowIds.length === 0) return [];

    const workflowsMap = await Workflow.getManyByIds(workflowIds);
    const workflows = Array.from(workflowsMap.values());

    const accessibleWorkflows: Workflow[] = [];
    const needsGrantCheck: string[] = [];

    for (const wf of workflows) {
      if (wf.user_id === userId || wf.access === "public") {
        accessibleWorkflows.push(wf);
      } else {
        needsGrantCheck.push(wf.id);
      }
    }

    if (needsGrantCheck.length > 0) {
      const grantedIds = await WorkflowCollaborator.grantedWorkflowIds(
        userId,
        needsGrantCheck
      );
      for (const id of needsGrantCheck) {
        if (grantedIds.has(id)) {
          const wf = workflowsMap.get(id);
          if (wf) accessibleWorkflows.push(wf);
        }
      }
    }

    return accessibleWorkflows;
  }

  /**
   * Atomically update a workflow only if its revision still matches the
   * caller's last read. Returns null instead of overwriting a newer change.
   */
  static async updateFieldsIfUnchanged(
    id: string,
    expectedUpdatedAt: string,
    fields: WorkflowUpdateFields,
    meta?: ModelChangeMeta,
    keep?: KeepRevision
  ): Promise<Workflow | null> {
    const db = getPortableDb();
    // A change of project leaves the file in the folder the workflow was in.
    // The row is read first so the file can be taken along, and so that a
    // file edit that would be lost with the file refuses the move.
    let previous: DocumentFileLocation | null = null;
    if (workflowFileSync && fields.project_id !== undefined) {
      const [before] = await db
        .select()
        .from(workflows)
        .where(eq(workflows.id, id))
        .limit(1);
      if (before?.file_path && before.project_id !== fields.project_id) {
        await assertDocumentFileMayLeave(workflowFileSync, new Workflow(before));
        previous = { project_id: before.project_id, file_path: before.file_path };
      }
    }
    const unchanged = and(
      eq(workflows.id, id),
      eq(workflows.updated_at, expectedUpdatedAt)
    );
    const set = { ...fields, updated_at: nextUpdatedAtAfter(expectedUpdatedAt) };
    let row: typeof workflows.$inferSelect | null | undefined;
    if (keep) {
      // The replaced revision becomes a version in the same transaction as
      // the compare-and-set, so a lost race or a crash writes neither.
      row = await saveKeepingRevision<
        typeof workflows.$inferSelect,
        typeof workflows.$inferSelect
      >({
        stored: (tx) => tx.select().from(workflows).where(unchanged).limit(1),
        highestVersion: (tx) =>
          tx
            .select({ value: max(workflowVersions.version) })
            .from(workflowVersions)
            .where(eq(workflowVersions.workflow_id, id)),
        keep: (tx, stored, version) =>
          tx.insert(workflowVersions).values({
            id: createTimeOrderedUuid(),
            workflow_id: id,
            user_id: stored.user_id,
            name: keep.name ?? stored.name,
            description: keep.description ?? null,
            graph: stored.graph,
            version,
            save_type: keep.saveType,
            created_at: new Date().toISOString()
          }),
        write: (tx) => tx.update(workflows).set(set).where(unchanged).returning()
      });
    } else {
      [row] = await db.update(workflows).set(set).where(unchanged).returning();
    }
    if (!row) return null;

    const updated = new Workflow(row);
    await updated.syncFile(previous);
    ModelObserver.notify(updated, ModelChangeEvent.UPDATED, meta);
    return updated;
  }

  hasTriggerNodes(): boolean {
    if (!this.graph || !this.graph.nodes) return false;
    return this.graph.nodes.some((node) => {
      const nodeType = (node.type as string) ?? "";
      return nodeType.includes("triggers.");
    });
  }

  hasToolName(): boolean {
    return this.tool_name != null && this.tool_name !== "";
  }

  getGraph(): WorkflowGraph {
    const graph: WorkflowGraph = {
      nodes: this.graph?.nodes ?? [],
      edges: this.graph?.edges ?? []
    };
    // Exports and validation read the graph through here; links ride along.
    if (this.graph?.links?.length) {
      graph.links = this.graph.links;
    }
    return graph;
  }

  getApiGraph(): WorkflowGraph {
    return this.getGraph();
  }

  /**
   * Find a workflow by id, respecting ownership, public access, or a
   * collaborator grant (private sharing). This is the read-access gate for
   * every "fetch someone's workflow" path.
   */
  static async find(
    userId: string,
    workflowId: string
  ): Promise<Workflow | null> {
    const wf = await Workflow.get<Workflow>(workflowId);
    if (!wf) return null;
    if (wf.user_id === userId || wf.access === "public") return wf;
    const grant = await WorkflowCollaborator.findFor(wf.id, userId);
    if (grant) return wf;
    return null;
  }

  /**
   * Find a workflow the caller may edit. Public access and viewer grants are
   * deliberately excluded because they only authorize reading and running.
   */
  static async findForEdit(
    userId: string,
    workflowId: string
  ): Promise<Workflow | null> {
    const wf = await Workflow.get<Workflow>(workflowId);
    if (!wf) return null;
    if (wf.user_id === userId) return wf;
    const grant = await WorkflowCollaborator.findFor(wf.id, userId);
    return grant?.role === "editor" ? wf : null;
  }

  /**
   * Delete a workflow the caller owns, together with everything that grants
   * access to it.
   *
   * Ownership is checked here rather than by the caller because `find` is not
   * an ownership test — it also answers for a public workflow and for one
   * shared with the caller, so a delete written on top of it would let anyone
   * remove any public workflow. Returns false when the row is missing or is
   * not the caller's, which are deliberately the same answer.
   *
   * The collaborator and share rows go with it. A workflow row can be
   * recreated under the same id; a grant left behind would then apply to a
   * workflow its holder was never given.
   */
  static async deleteOwned(
    userId: string,
    id: string,
    options: { deletedWithProject?: string } = {}
  ): Promise<boolean> {
    return changingAccess([{ kind: "workflow", id }], async () => {
      const wf = await Workflow.get<Workflow>(id);
      if (!wf || wf.user_id !== userId) return false;
      // `id` may be a 12-character prefix; the rows below key on the full id.
      // The row, its versions, grants and references go in one transaction,
      // with the copy kept for a restore (PRD D4).
      await eraseRunTraceParentForModelDeletion({ kind: "workflow", id: wf.id });
      // The file goes under the same folder lock as the row, so a reconcile
      // cannot find the file without its row and import it again.
      let sharedWith: string[] | undefined;
      const gone = await deleteWithFile(workflowFileSync, wf, async () => {
        const deleted = await deleteDocumentKeeping({
          kind: "workflow",
          userId,
          table: workflows,
          where: and(eq(workflows.id, wf.id), eq(workflows.user_id, userId)) as SQL,
          dependents: workflowDependents(wf.id),
          grants: "workflow_collaborators",
          deletedWithProject: options.deletedWithProject,
          describe: (row) => ({
            documentId: String(row["id"]),
            projectId: (row["project_id"] as string | null) ?? null,
            name: String(row["name"])
          })
        });
        if (!deleted) return null;
        sharedWith = deleted.sharedWith;
        return new Workflow(deleted.row);
      });
      if (!gone) return false;
      ModelObserver.notify(gone, ModelChangeEvent.DELETED, { sharedWith });
      await eraseRunTraceParentForModelDeletion({ kind: "workflow", id: gone.id });
      // No foreign key ties registrations to the workflow, so a deleted
      // workflow's webhook kept accepting events and its file watch kept firing.
      await TriggerRegistration.deleteByWorkflow(wf.id);
      return true;
    });
  }

  static async paginate(
    userId: string,
    opts: {
      limit?: number;
      access?: AccessLevel;
      runMode?: WorkflowRunMode | string;
      tag?: string;
      projectId?: string;
      startKey?: string;
    } = {}
  ): Promise<[Workflow[], string]> {
    const { limit = 50, access, runMode, tag, projectId, startKey } = opts;
    const db = getPortableDb();

    const conditions = [eq(workflows.user_id, userId)];
    if (projectId !== undefined) {
      conditions.push(eq(workflows.project_id, projectId));
    }
    if (access) conditions.push(eq(workflows.access, access));
    if (projectId) conditions.push(eq(workflows.project_id, projectId));
    if (runMode) {
      conditions.push(eq(workflows.run_mode, runMode));
    } else {
      // Default listing surfaces standalone workflows plus legacy layer/clip
      // rows (the layer/clip clone-on-bind machinery has been removed; these
      // rows now show up alongside regular workflows).
      conditions.push(
        ensureSqlCondition(
          or(
            eq(workflows.run_mode, "workflow"),
            eq(workflows.run_mode, "layer"),
            eq(workflows.run_mode, "clip"),
            eq(workflows.run_mode, "comfy"),
            isNull(workflows.run_mode)
          )
        )
      );
    }
    if (startKey) {
      const cursor = await Workflow.get<Workflow>(startKey);
      if (cursor && cursor.user_id === userId) {
        conditions.push(lt(workflows.updated_at, cursor.updated_at));
      }
    }

    const rows = await db
      .select()
      .from(workflows)
      .where(and(...conditions))
      .orderBy(desc(workflows.updated_at))
      .limit(tag ? 10_000 : limit + 1);

    let items = rows.map(
      (r: Record<string, unknown>) => new Workflow(r)
    );

    // Filter by tag in-memory (JSON array field)
    if (tag) {
      items = items.filter(
        (w: Workflow) => Array.isArray(w.tags) && w.tags.includes(tag)
      );
      const capped = items.slice(0, limit + 1);
      if (capped.length <= limit) return [capped, ""];
      capped.pop();
      const cursor = capped[capped.length - 1]?.id ?? "";
      return [capped, cursor];
    }

    if (items.length <= limit) return [items, ""];
    items.pop();
    const cursor = items[items.length - 1]?.id ?? "";
    return [items, cursor];
  }

  /**
   * Lists workflow identity fields without selecting or parsing graph JSON.
   * `updated_at` is the lightweight discovery revision; the authoritative
   * graph-derived etag is returned by the workflow-interface endpoint.
   */
  static async paginateSummaries(
    userId: string,
    opts: { limit?: number; projectId?: string; startKey?: string } = {}
  ): Promise<[WorkflowSummary[], string]> {
    const { limit = 50, projectId, startKey } = opts;
    const db = getPortableDb();
    const conditions = [eq(workflows.user_id, userId)];
    if (projectId !== undefined) {
      conditions.push(eq(workflows.project_id, projectId));
    }

    if (startKey) {
      const [cursor] = await db
        .select({ id: workflows.id, updated_at: workflows.updated_at })
        .from(workflows)
        .where(and(eq(workflows.id, startKey), eq(workflows.user_id, userId)))
        .limit(1);
      if (cursor) {
        conditions.push(
          ensureSqlCondition(
            or(
              lt(workflows.updated_at, cursor.updated_at),
              and(
                eq(workflows.updated_at, cursor.updated_at),
                lt(workflows.id, cursor.id)
              )
            )
          )
        );
      }
    }

    conditions.push(
      ensureSqlCondition(
        or(
          eq(workflows.run_mode, "workflow"),
          eq(workflows.run_mode, "layer"),
          eq(workflows.run_mode, "clip"),
            eq(workflows.run_mode, "comfy"),
          isNull(workflows.run_mode)
        )
      )
    );

    const rows = await db
      .select({
        id: workflows.id,
        name: workflows.name,
        description: workflows.description,
        updated_at: workflows.updated_at,
        run_mode: workflows.run_mode
      })
      .from(workflows)
      .where(and(...conditions))
      .orderBy(desc(workflows.updated_at), desc(workflows.id))
      .limit(limit + 1);

    const hasNext = rows.length > limit;
    const selectedRows = hasNext ? rows.slice(0, limit) : rows;
    const items = selectedRows.map((row) => ({
      ...row,
      description: row.description ?? ""
    }));
    return [items, hasNext ? (items.at(-1)?.id ?? "") : ""];
  }

  /** Loads a bounded set of workflows in one query, keyed by workflow id. */
  static async getManyByIds(
    workflowIds: readonly string[]
  ): Promise<Map<string, Workflow>> {
    if (workflowIds.length === 0) return new Map();
    const db = getPortableDb();
    const rows = await db
      .select()
      .from(workflows)
      .where(inArray(workflows.id, [...workflowIds]));
    const result = new Map<string, Workflow>();
    for (const row of rows) {
      const workflow = new Workflow(row);
      result.set(workflow.id, workflow);
    }
    return result;
  }

  static async paginatePublic(
    opts: { limit?: number; startKey?: string } = {}
  ): Promise<[Workflow[], string]> {
    const { limit = 50, startKey } = opts;
    const db = getPortableDb();
    const conditions = [eq(workflows.access, "public")];
    if (startKey) {
      const cursor = await Workflow.get<Workflow>(startKey);
      if (cursor && cursor.access === "public") {
        conditions.push(lt(workflows.updated_at, cursor.updated_at));
      }
    }
    const rows = await db
      .select()
      .from(workflows)
      .where(and(...conditions))
      .orderBy(desc(workflows.updated_at))
      .limit(limit + 1);

    const items = rows.map(
      (r: Record<string, unknown>) => new Workflow(r)
    );
    if (items.length <= limit) return [items, ""];
    items.pop();
    const cursor = items[items.length - 1]?.id ?? "";
    return [items, cursor];
  }

  static async paginateTools(
    userId: string,
    opts: { limit?: number; projectId?: string; startKey?: string } = {}
  ): Promise<[Workflow[], string]> {
    const { limit = 50, projectId, startKey } = opts;
    const db = getPortableDb();
    const conditions = [
      eq(workflows.user_id, userId),
      eq(workflows.run_mode, "tool")
    ];
    if (projectId !== undefined) {
      conditions.push(eq(workflows.project_id, projectId));
    }
    if (startKey) {
      const cursor = await Workflow.get<Workflow>(startKey);
      if (cursor && cursor.user_id === userId) {
        conditions.push(lt(workflows.updated_at, cursor.updated_at));
      }
    }
    const rows = await db
      .select()
      .from(workflows)
      .where(and(...conditions))
      .orderBy(desc(workflows.updated_at))
      .limit(limit + 1);

    const items: Workflow[] = rows.map(
      (r: Record<string, unknown>) => new Workflow(r)
    );
    if (items.length <= limit) {
      const tools = items.filter((w: Workflow) => w.hasToolName());
      return [tools, ""];
    }
    items.pop();
    const tools = items.filter((w: Workflow) => w.hasToolName());
    const cursor = items[items.length - 1]?.id ?? "";
    return [tools, cursor];
  }

  static fromDict(data: Record<string, unknown>): Workflow {
    return new Workflow({
      id: (data.id as string) ?? "",
      user_id: (data.user_id as string) ?? "",
      access: (data.access as string) ?? "private",
      created_at: data.created_at as string | undefined,
      updated_at: data.updated_at as string | undefined,
      name: (data.name as string) ?? "",
      tool_name: (data.tool_name as string) ?? null,
      package_name: (data.package_name as string) ?? null,
      tags: (data.tags as string[]) ?? [],
      description: (data.description as string) ?? "",
      thumbnail: (data.thumbnail as string) ?? null,
      thumbnail_url: (data.thumbnail_url as string) ?? null,
      settings: (data.settings as Record<string, unknown>) ?? null,
      graph: (data.graph as Record<string, unknown>) ?? {
        nodes: [],
        edges: []
      },
      run_mode: (data.run_mode as string) ?? null,
      workspace_id: (data.workspace_id as string) ?? null,
      html_app: (data.html_app as string) ?? null,
      app_doc: (data.app_doc as Record<string, unknown>) ?? null
    });
  }

  static async findByToolName(
    userId: string,
    toolName: string
  ): Promise<Workflow | null> {
    const db = getPortableDb();
    const [row] = await db
      .select()
      .from(workflows)
      .where(
        and(
          eq(workflows.user_id, userId),
          eq(workflows.tool_name, toolName),
          eq(workflows.run_mode, "tool")
        )
      )
      .limit(1);
    return row ? new Workflow(row) : null;
  }
}

/**
 * The rows kept with a deleted workflow and put back on restore. Trigger
 * registrations are not kept: a restored workflow registers its triggers
 * again when it is next saved or run.
 */
function workflowDependents(id: string): DependentTable[] {
  return [
    { name: "workflow_versions", table: workflowVersions, where: eq(workflowVersions.workflow_id, id) },
    {
      name: "workflow_collaborators",
      table: workflowCollaborators,
      where: eq(workflowCollaborators.workflow_id, id)
    },
    { name: "workflow_shares", table: workflowShares, where: eq(workflowShares.workflow_id, id) },
    ...documentRefTables("workflow", id)
  ];
}

registerDeletedDocumentKind("workflow", {
  *restore(tx, payload) {
    const id = String(payload.row["id"]);
    yield insertDocumentRow(tx, workflows, payload.row);
    yield* insertDependents(tx, workflowDependents(id), payload.dependents);
  },
  async restored(payload) {
    const restored = await Workflow.get<Workflow>(String(payload.row["id"]));
    if (!restored) return;
    ModelObserver.notify(restored, ModelChangeEvent.CREATED);
    // The file is written after the rows commit. A row without a file path
    // gets its file at its next save.
    await restored.writeFile();
  }
});
