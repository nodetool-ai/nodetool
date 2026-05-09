/**
 * Workflow model -- stores DAG-based workflow definitions.
 *
 * Port of Python's `nodetool.models.workflow`.
 */

import { eq, and, desc, or, isNull, sql, type SQL } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
import { workflows } from "./schema/workflows.js";
import { timelineSequences } from "./schema/timeline-sequences.js";
import { imageDocuments } from "./schema/image-documents.js";
import type { WorkflowRunMode } from "@nodetool-ai/protocol/api-schemas/workflows.js";

// ── Types ────────────────────────────────────────────────────────────

export type AccessLevel = "private" | "public";
export type { WorkflowRunMode };

export interface WorkflowGraph {
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
}

export class WorkflowNotClipPrivateError extends Error {
  constructor(workflowId: string) {
    super(`Workflow ${workflowId} is not clip-private`);
    this.name = "WorkflowNotClipPrivateError";
  }
}

function ensureSqlCondition(condition: SQL<unknown> | undefined): SQL<unknown> {
  if (!condition) {
    throw new Error("Expected SQL condition");
  }
  return condition;
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
  declare html_app: string | null;
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
    this.updated_at = new Date().toISOString();
  }

  // ── Graph helpers ─────────────────────────────────────────────────

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

  // ── Static queries ───────────────────────────────────────────────

  /** Find a workflow by id, respecting ownership or public access. */
  static async find(
    userId: string,
    workflowId: string
  ): Promise<Workflow | null> {
    const wf = await Workflow.get<Workflow>(workflowId);
    if (!wf) return null;
    if (wf.user_id === userId || wf.access === "public") return wf;
    return null;
  }

  /** Paginate workflows for a user. */
  static async paginate(
    userId: string,
    opts: {
      limit?: number;
      access?: AccessLevel;
      runMode?: WorkflowRunMode | string;
      tag?: string;
    } = {}
  ): Promise<[Workflow[], string]> {
    const { limit = 50, access, runMode, tag } = opts;
    const db = getDb();

    const conditions = [eq(workflows.user_id, userId)];
    if (access) conditions.push(eq(workflows.access, access));
    if (runMode) {
      conditions.push(eq(workflows.run_mode, runMode));
    } else {
      conditions.push(
        ensureSqlCondition(
          or(eq(workflows.run_mode, "workflow"), isNull(workflows.run_mode))
        )
      );
    }

    const rows = await db
      .select()
      .from(workflows)
      .where(and(...conditions))
      .orderBy(desc(workflows.updated_at))
      .limit(tag ? 10_000 : limit + 1)

    let items = rows.map((r: Record<string, unknown>) => new Workflow(r as Record<string, unknown>));

    // Filter by tag in-memory (JSON array field)
    if (tag) {
      items = items.filter((w: Workflow) => Array.isArray(w.tags) && w.tags.includes(tag));
      // Apply limit after tag filter
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

  /** Paginate public workflows only. */
  static async paginatePublic(
    opts: { limit?: number } = {}
  ): Promise<[Workflow[], string]> {
    const { limit = 50 } = opts;
    const db = getDb();
    const rows = await db
      .select()
      .from(workflows)
      .where(eq(workflows.access, "public"))
      .orderBy(desc(workflows.updated_at))
      .limit(limit + 1)

    const items = rows.map((r: Record<string, unknown>) => new Workflow(r as Record<string, unknown>));
    if (items.length <= limit) return [items, ""];
    items.pop();
    const cursor = items[items.length - 1]?.id ?? "";
    return [items, cursor];
  }

  /** Paginate workflows that are configured as tools. */
  static async paginateTools(
    userId: string,
    opts: { limit?: number } = {}
  ): Promise<[Workflow[], string]> {
    const { limit = 50 } = opts;
    const db = getDb();
    const rows = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.user_id, userId), eq(workflows.run_mode, "tool")))
      .orderBy(desc(workflows.updated_at))
      .limit(limit + 1)

    const items: Workflow[] = rows.map((r: Record<string, unknown>) => new Workflow(r as Record<string, unknown>));
    if (items.length <= limit) {
      const tools = items.filter((w: Workflow) => w.hasToolName());
      return [tools, ""];
    }
    items.pop();
    const tools = items.filter((w: Workflow) => w.hasToolName());
    const cursor = items[items.length - 1]?.id ?? "";
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
      graph: (data.graph as Record<string, unknown>) ?? {
        nodes: [],
        edges: []
      },
      run_mode: (data.run_mode as string) ?? null,
      workspace_id: (data.workspace_id as string) ?? null,
      html_app: (data.html_app as string) ?? null
    });
  }

  /** Find a workflow by tool name for a given user. */
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
    return row ? new Workflow(row as Record<string, unknown>) : null;
  }

  /**
   * Clone an existing workflow into a new `run_mode = "clip"` row owned by
   * `ownerUserId`. The clone has an empty `tags` set and no tool_name, so it
   * is invisible in standalone workflow listings.
   *
   * Returns the new persisted Workflow.
   */
  static async cloneAsClipPrivate(
    sourceId: string,
    ownerUserId: string
  ): Promise<Workflow> {
    const source = await Workflow.get<Workflow>(sourceId);
    if (!source) {
      throw new Error(`Source workflow ${sourceId} not found`);
    }
    const clone = new Workflow({
      user_id: ownerUserId,
      name: source.name,
      description: source.description ?? "",
      tags: [],
      thumbnail: null,
      thumbnail_url: null,
      graph: source.graph,
      settings: source.settings ?? null,
      package_name: null,
      path: null,
      tool_name: null,
      run_mode: "clip",
      workspace_id: source.workspace_id ?? null,
      html_app: null,
      access: "private"
    });
    await clone.save();
    return clone;
  }

  static async countClipReferences(workflowId: string): Promise<number> {
    const db = getDb();
    const rows = await db
      .select({ document: timelineSequences.document })
      .from(timelineSequences)
      .where(sql`instr(${timelineSequences.document}, ${workflowId}) > 0`);

    let count = 0;
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.document) as {
          clips?: Array<{ workflowId?: unknown }>;
        };
        const clips = Array.isArray(parsed.clips) ? parsed.clips : [];
        for (const clip of clips) {
          if (clip.workflowId === workflowId) {
            count += 1;
          }
        }
      } catch {
        // Skip invalid documents while scanning references.
      }
    }
    return count;
  }

  static async deleteIfOrphaned(workflowId: string): Promise<boolean> {
    const workflow = await Workflow.get<Workflow>(workflowId);
    if (!workflow || workflow.run_mode !== "clip") {
      return false;
    }

    const refs = await Workflow.countClipReferences(workflowId);
    if (refs > 0) {
      return false;
    }

    await workflow.delete();
    return true;
  }

  static async promoteToTemplate(workflowId: string): Promise<void> {
    const workflow = await Workflow.get<Workflow>(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }
    if (workflow.run_mode !== "clip" || workflow.access !== "private") {
      throw new WorkflowNotClipPrivateError(workflowId);
    }

    const tags = Array.isArray(workflow.tags) ? [...workflow.tags] : [];
    if (!tags.includes("timeline-template")) {
      tags.push("timeline-template");
    }

    workflow.run_mode = "workflow";
    workflow.tags = tags;
    await workflow.save();
  }

  static async cloneAsLayerPrivate(
    sourceId: string,
    ownerUserId: string
  ): Promise<Workflow> {
    const source = await Workflow.get<Workflow>(sourceId);
    if (!source) {
      throw new Error(`Source workflow ${sourceId} not found`);
    }
    const clone = new Workflow({
      user_id: ownerUserId,
      name: source.name,
      description: source.description ?? "",
      tags: [],
      thumbnail: null,
      thumbnail_url: null,
      graph: source.graph,
      settings: source.settings ?? null,
      package_name: null,
      path: null,
      tool_name: null,
      run_mode: "layer",
      workspace_id: source.workspace_id ?? null,
      html_app: null,
      access: "private"
    });
    await clone.save();
    return clone;
  }

  static async countLayerReferences(workflowId: string): Promise<number> {
    const db = getDb();
    const rows = await db
      .select({ document: imageDocuments.document })
      .from(imageDocuments)
      .where(sql`instr(${imageDocuments.document}, ${workflowId}) > 0`);

    let count = 0;
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.document) as {
          layers?: Array<{ workflowId?: unknown }>;
        };
        const layers = Array.isArray(parsed.layers) ? parsed.layers : [];
        for (const layer of layers) {
          if (layer.workflowId === workflowId) {
            count += 1;
          }
        }
      } catch {
        // Skip invalid documents while scanning references.
      }
    }
    return count;
  }

  static async deleteLayerIfOrphaned(workflowId: string): Promise<boolean> {
    const workflow = await Workflow.get<Workflow>(workflowId);
    if (!workflow || workflow.run_mode !== "layer") {
      return false;
    }

    const refs = await Workflow.countLayerReferences(workflowId);
    if (refs > 0) {
      return false;
    }

    await workflow.delete();
    return true;
  }
}
