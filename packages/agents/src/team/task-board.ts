/**
 * TaskBoard — Shared task pool with atomic claiming, dependency DAG,
 * and skill-based matching.
 *
 * Follows the A2A task lifecycle: open → claimed → working → done/failed.
 * Agents pull tasks (claim-based) rather than being assigned (push-based).
 */

import { randomUUID } from "node:crypto";
import type {
  AgentIdentity,
  BoardTask,
  ITaskBoard,
  TaskStatus,
  TeamEvent
} from "./types.js";

export type BoardEventHandler = (event: TeamEvent) => void;

export class TaskBoard implements ITaskBoard {
  private tasks = new Map<string, BoardTask>();
  private listeners: BoardEventHandler[] = [];
  /** Lock set for atomic claiming — taskId currently being claimed. */
  private claimLocks = new Set<string>();

  /**
   * Create a new task on the board.
   */
  create(opts: {
    title: string;
    description: string;
    createdBy: string;
    dependsOn?: string[];
    requiredSkills?: string[];
    priority?: number;
    parentTaskId?: string;
  }): BoardTask {
    const now = Date.now();
    const task: BoardTask = {
      id: randomUUID(),
      title: opts.title,
      description: opts.description,
      status: "open",
      createdBy: opts.createdBy,
      dependsOn: opts.dependsOn ?? [],
      requiredSkills: opts.requiredSkills ?? [],
      priority: opts.priority ?? 5,
      artifacts: [],
      parentTaskId: opts.parentTaskId,
      createdAt: now,
      updatedAt: now
    };

    // Validate dependencies exist
    for (const depId of task.dependsOn) {
      if (!this.tasks.has(depId)) {
        throw new Error(`Dependency task ${depId} not found`);
      }
    }

    // Cycle detection
    if (task.dependsOn.length > 0) {
      this.tasks.set(task.id, task); // temporarily add
      if (this.hasCycle()) {
        this.tasks.delete(task.id);
        throw new Error(
          `Adding task ${task.id} would create a dependency cycle`
        );
      }
    } else {
      this.tasks.set(task.id, task);
    }

    this.emit({ type: "task_created", task: { ...task }, timestamp: now });
    return { ...task };
  }

  /**
   * Atomically claim an open task. Returns true if successful.
   * Fails if task is not open, dependencies aren't met, or another agent claimed it first.
   */
  claim(taskId: string, agentId: string): boolean {
    // Atomic lock check
    if (this.claimLocks.has(taskId)) return false;
    this.claimLocks.add(taskId);

    try {
      const task = this.tasks.get(taskId);
      if (!task || task.status !== "open") return false;

      // Check all dependencies are done
      if (!this.dependenciesMet(taskId)) return false;

      task.status = "claimed";
      task.claimedBy = agentId;
      task.updatedAt = Date.now();

      this.emit({
        type: "task_claimed",
        taskId,
        agentId,
        timestamp: task.updatedAt
      });
      return true;
    } finally {
      this.claimLocks.delete(taskId);
    }
  }

  /**
   * Mark a claimed task as actively being worked on.
   */
  startWork(taskId: string, agentId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.claimedBy !== agentId || task.status !== "claimed") {
      return false;
    }
    task.status = "working";
    task.updatedAt = Date.now();
    this.emit({
      type: "task_working",
      taskId,
      agentId,
      timestamp: task.updatedAt
    });
    return true;
  }

  /**
   * Complete a task with optional result and artifacts.
   */
  complete(
    taskId: string,
    opts?: { result?: unknown; artifacts?: unknown[] }
  ): boolean {
    const task = this.tasks.get(taskId);
    if (!task || (task.status !== "working" && task.status !== "claimed")) {
      return false;
    }
    task.status = "done";
    task.result = opts?.result;
    if (opts?.artifacts) {
      task.artifacts.push(...opts.artifacts);
    }
    task.updatedAt = Date.now();

    this.emit({
      type: "task_completed",
      taskId,
      artifacts: task.artifacts,
      timestamp: task.updatedAt
    });
    return true;
  }

  /**
   * Mark a task as failed.
   */
  fail(taskId: string, reason: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status === "done" || task.status === "failed") {
      return false;
    }
    task.status = "failed";
    task.failureReason = reason;
    task.updatedAt = Date.now();

    this.emit({
      type: "task_failed",
      taskId,
      reason,
      timestamp: task.updatedAt
    });
    return true;
  }

  /**
   * Mark a task as blocked (waiting on external input or another agent).
   */
  block(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status === "done" || task.status === "failed") {
      return false;
    }
    task.status = "blocked";
    task.updatedAt = Date.now();
    return true;
  }

  /**
   * Unblock a task back to open (so it can be reclaimed).
   */
  unblock(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "blocked") return false;
    task.status = "open";
    task.claimedBy = undefined;
    task.updatedAt = Date.now();
    return true;
  }

  /**
   * Decompose a task into subtasks. Parent task is marked blocked
   * until all subtasks complete.
   */
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
    const parent = this.tasks.get(parentTaskId);
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
    parent.status = "blocked";
    parent.updatedAt = Date.now();

    return created;
  }

  /**
   * Get tasks available for an agent to claim.
   * Filters by: open status, dependencies met, skill match.
   * Sorted by priority (lower number = higher priority).
   */
  getAvailable(agent?: AgentIdentity): BoardTask[] {
    const available: BoardTask[] = [];
    for (const task of this.tasks.values()) {
      if (task.status !== "open") continue;
      if (!this.dependenciesMet(task.id)) continue;

      // Skill matching: task requires skills the agent has
      if (agent && task.requiredSkills.length > 0) {
        const hasAllSkills = task.requiredSkills.every((s) =>
          agent.skills.includes(s)
        );
        if (!hasAllSkills) continue;
      }

      available.push({ ...task });
    }

    return available.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get a single task by ID.
   */
  get(taskId: string): BoardTask | undefined {
    const task = this.tasks.get(taskId);
    return task ? { ...task } : undefined;
  }

  /**
   * Get full board snapshot.
   */
  getSnapshot(): BoardTask[] {
    return [...this.tasks.values()].map((t) => ({ ...t }));
  }

  /**
   * Get subtasks of a parent task.
   */
  getSubtasks(parentTaskId: string): BoardTask[] {
    return [...this.tasks.values()]
      .filter((t) => t.parentTaskId === parentTaskId)
      .map((t) => ({ ...t }));
  }

  /**
   * Check if all tasks are in terminal states (done/failed).
   */
  isComplete(): boolean {
    if (this.tasks.size === 0) return false;
    for (const task of this.tasks.values()) {
      if (task.status !== "done" && task.status !== "failed") return false;
    }
    return true;
  }

  /**
   * Check if there's a deadlock (no progress possible).
   * Deadlock = tasks exist that aren't done/failed, but none are claimable or in-progress.
   */
  detectDeadlock(): string[] | null {
    const active: string[] = [];
    const stuck: string[] = [];

    for (const task of this.tasks.values()) {
      if (task.status === "done" || task.status === "failed") continue;
      if (task.status === "claimed" || task.status === "working") {
        active.push(task.id);
      } else if (task.status === "open" && !this.dependenciesMet(task.id)) {
        stuck.push(task.id);
      } else if (task.status === "blocked") {
        stuck.push(task.id);
      }
    }

    // Deadlock: stuck tasks exist but no one is working
    if (stuck.length > 0 && active.length === 0) {
      // Also check if any open tasks have met dependencies
      const claimable = [...this.tasks.values()].filter(
        (t) => t.status === "open" && this.dependenciesMet(t.id)
      );
      if (claimable.length === 0) return stuck;
    }

    return null;
  }

  /**
   * Auto-complete parent tasks when all subtasks are done.
   */
  resolveParents(): void {
    for (const task of this.tasks.values()) {
      if (task.status !== "blocked") continue;
      const subtasks = this.getSubtasks(task.id);
      if (subtasks.length === 0) continue;
      const allFinished = subtasks.every(
        (s) => s.status === "done" || s.status === "failed"
      );
      if (allFinished) {
        const anyFailed = subtasks.some((s) => s.status === "failed");
        task.status = anyFailed ? "failed" : "done";
        task.result = subtasks.map((s) => s.result);
        task.artifacts = subtasks.flatMap((s) => s.artifacts);
        task.updatedAt = Date.now();
        if (anyFailed) {
          const failedNames = subtasks
            .filter((s) => s.status === "failed")
            .map((s) => s.title)
            .join(", ");
          this.emit({
            type: "task_failed",
            taskId: task.id,
            reason: `Subtask(s) failed: ${failedNames}`,
            timestamp: task.updatedAt
          });
        } else {
          this.emit({
            type: "task_completed",
            taskId: task.id,
            artifacts: task.artifacts,
            timestamp: task.updatedAt
          });
        }
      }
    }
  }

  /**
   * Subscribe to board events.
   */
  onEvent(handler: BoardEventHandler): () => void {
    this.listeners.push(handler);
    return () => {
      const idx = this.listeners.indexOf(handler);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  // ─── Internal ───

  private dependenciesMet(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    return task.dependsOn.every((depId) => {
      const dep = this.tasks.get(depId);
      return dep?.status === "done";
    });
  }

  private hasCycle(): boolean {
    const visited = new Set<string>();
    const stack = new Set<string>();

    const dfs = (id: string): boolean => {
      if (stack.has(id)) return true;
      if (visited.has(id)) return false;
      visited.add(id);
      stack.add(id);
      const task = this.tasks.get(id);
      if (task) {
        for (const depId of task.dependsOn) {
          if (dfs(depId)) return true;
        }
      }
      stack.delete(id);
      return false;
    };

    for (const id of this.tasks.keys()) {
      if (dfs(id)) return true;
    }
    return false;
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
