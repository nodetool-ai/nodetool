/**
 * DbTaskBoard — ITaskBoard implementation backed by SQLite via Drizzle.
 *
 * All tasks are persisted to the `nodetool_team_tasks` table, keyed by
 * team_id. This replaces the in-memory TaskBoard for production use,
 * ensuring tasks survive restarts and are queryable across sessions.
 */

import { randomUUID } from "node:crypto";
import { eq, and, inArray } from "drizzle-orm";
import { getDb, teamTasks } from "@nodetool-ai/models";
import type {
  AgentIdentity,
  BoardTask,
  ITaskBoard,
  TaskStatus,
  TeamEvent
} from "./types.js";

export type BoardEventHandler = (event: TeamEvent) => void;

function rowToTask(row: typeof teamTasks.$inferSelect): BoardTask {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as TaskStatus,
    createdBy: row.created_by,
    claimedBy: row.claimed_by ?? undefined,
    dependsOn: row.depends_on ?? [],
    requiredSkills: row.required_skills ?? [],
    priority: row.priority,
    artifacts: row.artifacts ?? [],
    parentTaskId: row.parent_task_id ?? undefined,
    result: row.result ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime()
  };
}

export class DbTaskBoard implements ITaskBoard {
  private teamId: string;
  private listeners: BoardEventHandler[] = [];

  constructor(teamId: string) {
    this.teamId = teamId;
  }

  private db() {
    return getDb();
  }

  private now(): string {
    return new Date().toISOString();
  }

  private getRow(taskId: string) {
    const rows = this.db()
      .select()
      .from(teamTasks)
      .where(and(eq(teamTasks.id, taskId), eq(teamTasks.team_id, this.teamId)))
      .all();
    return rows[0] ?? null;
  }

  create(opts: {
    title: string;
    description: string;
    createdBy: string;
    dependsOn?: string[];
    requiredSkills?: string[];
    priority?: number;
    parentTaskId?: string;
  }): BoardTask {
    const now = this.now();
    const id = randomUUID();
    const dependsOn = opts.dependsOn ?? [];
    const requiredSkills = opts.requiredSkills ?? [];
    const priority = opts.priority ?? 5;

    // Validate dependencies exist
    for (const depId of dependsOn) {
      if (!this.getRow(depId)) {
        throw new Error(`Dependency task ${depId} not found`);
      }
    }

    this.db()
      .insert(teamTasks)
      .values({
        id,
        team_id: this.teamId,
        title: opts.title,
        description: opts.description,
        status: "open",
        created_by: opts.createdBy,
        depends_on: dependsOn,
        required_skills: requiredSkills,
        priority,
        artifacts: [],
        parent_task_id: opts.parentTaskId ?? null,
        result: null,
        failure_reason: null,
        created_at: now,
        updated_at: now
      })
      .run();

    const task = rowToTask(this.getRow(id)!);

    this.emit({
      type: "task_created",
      task: { ...task },
      timestamp: Date.now()
    });
    return task;
  }

  claim(taskId: string, agentId: string): boolean {
    const row = this.getRow(taskId);
    if (!row || row.status !== "open") return false;
    if (!this.dependenciesMet(taskId)) return false;

    const result = this.db()
      .update(teamTasks)
      .set({ status: "claimed", claimed_by: agentId, updated_at: this.now() })
      .where(and(eq(teamTasks.id, taskId), eq(teamTasks.status, "open")))
      .run();

    if (result.changes === 0) return false;

    this.emit({
      type: "task_claimed",
      taskId,
      agentId,
      timestamp: Date.now()
    });
    return true;
  }

  startWork(taskId: string, agentId: string): boolean {
    const row = this.getRow(taskId);
    if (!row || row.claimed_by !== agentId || row.status !== "claimed") {
      return false;
    }

    this.db()
      .update(teamTasks)
      .set({ status: "working", updated_at: this.now() })
      .where(eq(teamTasks.id, taskId))
      .run();

    this.emit({
      type: "task_working",
      taskId,
      agentId,
      timestamp: Date.now()
    });
    return true;
  }

  complete(
    taskId: string,
    opts?: { result?: unknown; artifacts?: unknown[] }
  ): boolean {
    const row = this.getRow(taskId);
    if (!row || (row.status !== "working" && row.status !== "claimed")) {
      return false;
    }

    const existingArtifacts = row.artifacts ?? [];
    const newArtifacts = opts?.artifacts
      ? [...existingArtifacts, ...opts.artifacts]
      : existingArtifacts;

    this.db()
      .update(teamTasks)
      .set({
        status: "done",
        result: opts?.result ?? null,
        artifacts: newArtifacts,
        updated_at: this.now()
      })
      .where(eq(teamTasks.id, taskId))
      .run();

    this.emit({
      type: "task_completed",
      taskId,
      artifacts: newArtifacts,
      timestamp: Date.now()
    });
    return true;
  }

  fail(taskId: string, reason: string): boolean {
    const row = this.getRow(taskId);
    if (!row || row.status === "done" || row.status === "failed") {
      return false;
    }

    this.db()
      .update(teamTasks)
      .set({ status: "failed", failure_reason: reason, updated_at: this.now() })
      .where(eq(teamTasks.id, taskId))
      .run();

    this.emit({
      type: "task_failed",
      taskId,
      reason,
      timestamp: Date.now()
    });
    return true;
  }

  block(taskId: string): boolean {
    const row = this.getRow(taskId);
    if (!row || row.status === "done" || row.status === "failed") {
      return false;
    }

    this.db()
      .update(teamTasks)
      .set({ status: "blocked", updated_at: this.now() })
      .where(eq(teamTasks.id, taskId))
      .run();
    return true;
  }

  unblock(taskId: string): boolean {
    const row = this.getRow(taskId);
    if (!row || row.status !== "blocked") return false;

    this.db()
      .update(teamTasks)
      .set({ status: "open", claimed_by: null, updated_at: this.now() })
      .where(eq(teamTasks.id, taskId))
      .run();
    return true;
  }

  decompose(
    parentTaskId: string,
    subtasks: Array<{
      title: string;
      description: string;
      createdBy: string;
      requiredSkills?: string[];
      priority?: number;
      dependsOn?: string[];
    }>
  ): BoardTask[] {
    const parent = this.getRow(parentTaskId);
    if (!parent) throw new Error(`Parent task ${parentTaskId} not found`);

    const created: BoardTask[] = [];
    for (const sub of subtasks) {
      created.push(
        this.create({
          ...sub,
          parentTaskId,
          dependsOn: sub.dependsOn ?? []
        })
      );
    }

    // Block parent until subtasks are done
    this.db()
      .update(teamTasks)
      .set({ status: "blocked", updated_at: this.now() })
      .where(eq(teamTasks.id, parentTaskId))
      .run();

    return created;
  }

  getAvailable(agent?: AgentIdentity): BoardTask[] {
    const rows = this.db()
      .select()
      .from(teamTasks)
      .where(
        and(eq(teamTasks.team_id, this.teamId), eq(teamTasks.status, "open"))
      )
      .all();

    const available: BoardTask[] = [];
    for (const row of rows) {
      const task = rowToTask(row);
      if (!this.dependenciesMet(task.id)) continue;

      if (agent && task.requiredSkills.length > 0) {
        const hasAllSkills = task.requiredSkills.every((s) =>
          agent.skills.includes(s)
        );
        if (!hasAllSkills) continue;
      }

      available.push(task);
    }

    return available.sort((a, b) => a.priority - b.priority);
  }

  get(taskId: string): BoardTask | undefined {
    const row = this.getRow(taskId);
    return row ? rowToTask(row) : undefined;
  }

  getSnapshot(): BoardTask[] {
    const rows = this.db()
      .select()
      .from(teamTasks)
      .where(eq(teamTasks.team_id, this.teamId))
      .all();
    return rows.map(rowToTask);
  }

  getSubtasks(parentTaskId: string): BoardTask[] {
    const rows = this.db()
      .select()
      .from(teamTasks)
      .where(
        and(
          eq(teamTasks.team_id, this.teamId),
          eq(teamTasks.parent_task_id, parentTaskId)
        )
      )
      .all();
    return rows.map(rowToTask);
  }

  isComplete(): boolean {
    const rows = this.db()
      .select()
      .from(teamTasks)
      .where(eq(teamTasks.team_id, this.teamId))
      .all();

    if (rows.length === 0) return false;
    return rows.every((r) => r.status === "done" || r.status === "failed");
  }

  detectDeadlock(): string[] | null {
    const rows = this.db()
      .select()
      .from(teamTasks)
      .where(eq(teamTasks.team_id, this.teamId))
      .all();

    const active: string[] = [];
    const stuck: string[] = [];

    for (const row of rows) {
      if (row.status === "done" || row.status === "failed") continue;
      if (row.status === "claimed" || row.status === "working") {
        active.push(row.id);
      } else if (row.status === "open" && !this.dependenciesMet(row.id)) {
        stuck.push(row.id);
      } else if (row.status === "blocked") {
        stuck.push(row.id);
      }
    }

    if (stuck.length > 0 && active.length === 0) {
      const claimable = rows.filter(
        (r) => r.status === "open" && this.dependenciesMet(r.id)
      );
      if (claimable.length === 0) return stuck;
    }

    return null;
  }

  resolveParents(): void {
    const rows = this.db()
      .select()
      .from(teamTasks)
      .where(
        and(eq(teamTasks.team_id, this.teamId), eq(teamTasks.status, "blocked"))
      )
      .all();

    for (const row of rows) {
      const subtasks = this.getSubtasks(row.id);
      if (subtasks.length === 0) continue;
      if (subtasks.every((s) => s.status === "done")) {
        const allArtifacts = subtasks.flatMap((s) => s.artifacts);
        const result = subtasks.map((s) => s.result);

        this.db()
          .update(teamTasks)
          .set({
            status: "done",
            result,
            artifacts: allArtifacts,
            updated_at: this.now()
          })
          .where(eq(teamTasks.id, row.id))
          .run();

        this.emit({
          type: "task_completed",
          taskId: row.id,
          artifacts: allArtifacts,
          timestamp: Date.now()
        });
      }
    }
  }

  onEvent(handler: BoardEventHandler): () => void {
    this.listeners.push(handler);
    return () => {
      const idx = this.listeners.indexOf(handler);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  // ─── Internal ───

  private dependenciesMet(taskId: string): boolean {
    const row = this.getRow(taskId);
    if (!row) return false;
    const deps = row.depends_on ?? [];
    if (deps.length === 0) return true;

    for (const depId of deps) {
      const dep = this.getRow(depId);
      if (dep?.status !== "done") return false;
    }
    return true;
  }

  private emit(event: TeamEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Don't let listener errors break the board
      }
    }
  }
}
