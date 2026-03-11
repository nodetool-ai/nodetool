/**
 * Workflow model -- stores DAG-based workflow definitions.
 *
 * Port of Python's `nodetool.models.workflow`.
 */

import type { TableSchema } from "./database-adapter.js";
import type { Row } from "./database-adapter.js";
import {
  DBModel,
  createTimeOrderedUuid,
  type IndexSpec,
  type ModelClass,
} from "./base-model.js";
import { field } from "./condition-builder.js";

// ── Types ────────────────────────────────────────────────────────────

export type AccessLevel = "private" | "public";

export interface WorkflowGraph {
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
}

// ── Schema ───────────────────────────────────────────────────────────

const WORKFLOW_SCHEMA: TableSchema = {
  table_name: "nodetool_workflows",
  primary_key: "id",
  columns: {
    id: { type: "string" },
    user_id: { type: "string" },
    name: { type: "string" },
    tool_name: { type: "string", optional: true },
    description: { type: "string", optional: true },
    tags: { type: "json", optional: true },
    thumbnail: { type: "string", optional: true },
    thumbnail_url: { type: "string", optional: true },
    graph: { type: "json" },
    settings: { type: "json", optional: true },
    package_name: { type: "string", optional: true },
    path: { type: "string", optional: true },
    run_mode: { type: "string", optional: true },
    workspace_id: { type: "string", optional: true },
    html_app: { type: "string", optional: true },
    receive_clipboard: { type: "boolean", optional: true },
    access: { type: "string" },
    created_at: { type: "datetime" },
    updated_at: { type: "datetime" },
  },
};

const WORKFLOW_INDEXES: IndexSpec[] = [
  { name: "idx_workflows_user_id", columns: ["user_id"], unique: false },
  { name: "idx_workflows_access", columns: ["access"], unique: false },
];

// ── Model ────────────────────────────────────────────────────────────

export class Workflow extends DBModel {
  static override schema = WORKFLOW_SCHEMA;
  static override indexes = WORKFLOW_INDEXES;

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
  declare receive_clipboard: boolean | null;
  declare access: AccessLevel;
  declare created_at: string;
  declare updated_at: string;

  constructor(data: Row) {
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
    this.access ??= "private";
    this.created_at ??= now;
    this.updated_at ??= now;

    // SQLite stores booleans as 0/1
    if (typeof this.receive_clipboard === "number") {
      this.receive_clipboard = this.receive_clipboard !== 0;
    }
    this.receive_clipboard ??= null;
  }

  override beforeSave(): void {
    this.updated_at = new Date().toISOString();
  }

  // ── Graph helpers ─────────────────────────────────────────────────

  /** Check if the workflow graph contains trigger nodes. */
  hasTriggerNodes(): boolean {
    if (!this.graph || !this.graph.nodes) return false;
    return this.graph.nodes.some((node) => {
      const nodeType = (node.type as string) ?? "";
      return nodeType.includes("triggers.");
    });
  }

  /** Check if this workflow has a tool_name set. */
  hasToolName(): boolean {
    return this.tool_name != null && this.tool_name !== "";
  }

  /** Return the graph as a WorkflowGraph. */
  getGraph(): WorkflowGraph {
    return {
      nodes: this.graph?.nodes ?? [],
      edges: this.graph?.edges ?? [],
    };
  }

  /** Alias for getGraph (matches Python's get_api_graph). */
  getApiGraph(): WorkflowGraph {
    return this.getGraph();
  }

  // ── Static queries ───────────────────────────────────────────────

  /** Find a workflow by id, respecting ownership or public access. */
  static async find(
    userId: string,
    workflowId: string,
  ): Promise<Workflow | null> {
    const wf = await (Workflow as unknown as ModelClass<Workflow>).get(
      workflowId,
    );
    if (!wf) return null;
    if (wf.user_id === userId || wf.access === "public") return wf;
    return null;
  }

  /** Paginate workflows for a user (includes their own + public). */
  static async paginate(
    userId: string,
    opts: {
      limit?: number;
      access?: AccessLevel;
      runMode?: string;
    } = {},
  ): Promise<[Workflow[], string]> {
    const { limit = 50, access, runMode } = opts;
    let cond = field("user_id").equals(userId);
    if (access) cond = cond.and(field("access").equals(access));
    if (runMode) cond = cond.and(field("run_mode").equals(runMode));

    return (Workflow as unknown as ModelClass<Workflow>).query({
      condition: cond,
      orderBy: "updated_at",
      reverse: true,
      limit,
    });
  }

  /** Paginate public workflows only. */
  static async paginatePublic(
    opts: { limit?: number } = {},
  ): Promise<[Workflow[], string]> {
    const { limit = 50 } = opts;
    return (Workflow as unknown as ModelClass<Workflow>).query({
      condition: field("access").equals("public"),
      orderBy: "updated_at",
      reverse: true,
      limit,
    });
  }

  /** Paginate workflows that are configured as tools. */
  static async paginateTools(
    userId: string,
    opts: { limit?: number } = {},
  ): Promise<[Workflow[], string]> {
    const { limit = 50 } = opts;
    const cond = field("user_id")
      .equals(userId)
      .and(field("run_mode").equals("tool"));

    const [results, cursor] = await (
      Workflow as unknown as ModelClass<Workflow>
    ).query({
      condition: cond,
      orderBy: "updated_at",
      reverse: true,
      limit,
    });

    // Filter to only those with a tool_name set (matches Python)
    const tools = results.filter((w) => w.hasToolName());
    return [tools, cursor];
  }

  /** Create a Workflow instance from a plain dictionary. */
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
      graph: (data.graph as Record<string, unknown>) ?? { nodes: [], edges: [] },
      run_mode: (data.run_mode as string) ?? null,
      workspace_id: (data.workspace_id as string) ?? null,
      html_app: (data.html_app as string) ?? null,
    });
  }

  /** Find a workflow by tool name for a given user. */
  static async findByToolName(
    userId: string,
    toolName: string,
  ): Promise<Workflow | null> {
    const cond = field("user_id")
      .equals(userId)
      .and(field("tool_name").equals(toolName))
      .and(field("run_mode").equals("tool"));

    const [results] = await (
      Workflow as unknown as ModelClass<Workflow>
    ).query({
      condition: cond,
      limit: 1,
    });

    return results.length > 0 ? results[0] : null;
  }
}
