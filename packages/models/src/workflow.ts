/**
 * Workflow model -- stores DAG-based workflow definitions.
 *
 * Port of Python's `nodetool.models.workflow`.
 */

import { eq, and, desc, or, isNull, lt, inArray, type SQL } from "drizzle-orm";
import {
  DBModel,
  ModelChangeEvent,
  ModelObserver,
  createTimeOrderedUuid
} from "./base-model.js";
import { getDb } from "./db.js";
import { workflows } from "./schema/workflows.js";
import { WorkflowCollaborator } from "./workflow-collaborator.js";
import type { WorkflowRunMode } from "@nodetool-ai/protocol/api-schemas/workflows.js";

export type AccessLevel = "private" | "public";
export type { WorkflowRunMode };

export interface WorkflowGraph {
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
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

function nextUpdatedAtAfter(previous: string): string {
  const now = new Date();
  const previousMs = Date.parse(previous);
  if (Number.isFinite(previousMs) && now.getTime() <= previousMs) {
    return new Date(previousMs + 1).toISOString();
  }
  return now.toISOString();
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
  html_app: string | null;
  app_doc: Record<string, unknown> | null;
  receive_clipboard: boolean | null;
  access: AccessLevel;
}>;

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
  declare html_app: string | null;
  declare app_doc: Record<string, unknown> | null;
  declare receive_clipboard: boolean | null;
  declare access: AccessLevel;
  declare created_at: string;
  declare updated_at: string;

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
    this.html_app ??= null;
    this.app_doc ??= null;
    this.access ??= "private";
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
   * Atomically update a workflow only if its revision still matches the
   * caller's last read. Returns null instead of overwriting a newer change.
   */
  static async updateFieldsIfUnchanged(
    id: string,
    expectedUpdatedAt: string,
    fields: WorkflowUpdateFields
  ): Promise<Workflow | null> {
    const db = getDb();
    const rows = await db
      .update(workflows)
      .set({
        ...fields,
        updated_at: nextUpdatedAtAfter(expectedUpdatedAt)
      })
      .where(
        and(eq(workflows.id, id), eq(workflows.updated_at, expectedUpdatedAt))
      )
      .returning();

    const row = rows[0];
    if (!row) return null;

    const updated = new Workflow(row);
    ModelObserver.notify(updated, ModelChangeEvent.UPDATED);
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
    return {
      nodes: this.graph?.nodes ?? [],
      edges: this.graph?.edges ?? []
    };
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
    const grant = await WorkflowCollaborator.findFor(workflowId, userId);
    if (grant) return wf;
    return null;
  }

  static async paginate(
    userId: string,
    opts: {
      limit?: number;
      access?: AccessLevel;
      runMode?: WorkflowRunMode | string;
      tag?: string;
      startKey?: string;
    } = {}
  ): Promise<[Workflow[], string]> {
    const { limit = 50, access, runMode, tag, startKey } = opts;
    const db = getDb();

    const conditions = [eq(workflows.user_id, userId)];
    if (access) conditions.push(eq(workflows.access, access));
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
    opts: { limit?: number; startKey?: string } = {}
  ): Promise<[WorkflowSummary[], string]> {
    const { limit = 50, startKey } = opts;
    const db = getDb();
    const conditions = [eq(workflows.user_id, userId)];

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
    const db = getDb();
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
    const db = getDb();
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
    opts: { limit?: number; startKey?: string } = {}
  ): Promise<[Workflow[], string]> {
    const { limit = 50, startKey } = opts;
    const db = getDb();
    const conditions = [
      eq(workflows.user_id, userId),
      eq(workflows.run_mode, "tool")
    ];
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
    const db = getDb();
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
