/**
 * EdgeTaskBoard — ITaskBoard implementation that wraps a TaskBoard
 * and bridges task operations through the workflow kernel.
 *
 * When running inside a workflow, task operations (create, claim, complete)
 * are sent as control events to a TaskBoardNode, which holds the actual
 * board state and processes operations synchronously. This ensures the
 * board state is visible to other nodes in the graph.
 *
 * When no workflow context is available, delegates to the inner TaskBoard
 * directly (same behavior as programmatic use).
 */

import { createLogger } from "@nodetool-ai/config";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { TaskBoard } from "./task-board.js";
import type {
  AgentIdentity,
  BoardTask,
  ITaskBoard,
  TeamEvent
} from "./types.js";

const log = createLogger("agents:edge-task-board");

export class EdgeTaskBoard implements ITaskBoard {
  private inner: TaskBoard;
  private context: ProcessingContext | null;
  /** Node ID of the TaskBoardNode in the workflow graph. */
  private boardNodeId: string | null;

  constructor(opts?: {
    context?: ProcessingContext;
    boardNodeId?: string;
    inner?: TaskBoard;
  }) {
    this.inner = opts?.inner ?? new TaskBoard();
    this.context = opts?.context ?? null;
    this.boardNodeId = opts?.boardNodeId ?? null;
  }

  /**
   * If a board node is configured and context supports control events,
   * route the operation through the workflow kernel. Otherwise, use
   * the inner board directly.
   */
  private canRouteToNode(): boolean {
    return !!(this.boardNodeId && this.context?.hasControlEventSupport);
  }

  /**
   * Send a task operation to the board node as a control event.
   * The board node processes it and returns the result.
   */
  private async routeOperation(
    operation: string,
    params: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (!this.boardNodeId || !this.context) {
      throw new Error("Cannot route: no board node configured");
    }
    return (
      (await this.context.sendControlEvent(this.boardNodeId, {
        __task_board_op__: true,
        operation,
        params
      })) ?? {}
    );
  }

  // All methods delegate to inner board directly.
  // When canRouteToNode() is true AND we want to notify the workflow graph
  // of state changes, we also fire-and-forget a control event so the board
  // node can broadcast updates to connected nodes.
  //
  // The inner board is the source of truth — the board node is a mirror
  // that the visual graph can observe. This "dual write" approach keeps
  // programmatic and edge-native usage consistent.

  create(opts: {
    title: string;
    description: string;
    createdBy: string;
    dependsOn?: string[];
    requiredSkills?: string[];
    priority?: number;
    parentTaskId?: string;
  }): BoardTask {
    const task = this.inner.create(opts);
    this.notifyNode("task_created", { task });
    return task;
  }

  claim(taskId: string, agentId: string): boolean {
    const result = this.inner.claim(taskId, agentId);
    if (result) this.notifyNode("task_claimed", { taskId, agentId });
    return result;
  }

  startWork(taskId: string, agentId: string): boolean {
    const result = this.inner.startWork(taskId, agentId);
    if (result) this.notifyNode("task_working", { taskId, agentId });
    return result;
  }

  complete(
    taskId: string,
    opts?: { result?: unknown; artifacts?: unknown[] }
  ): boolean {
    const result = this.inner.complete(taskId, opts);
    if (result) this.notifyNode("task_completed", { taskId, ...opts });
    return result;
  }

  fail(taskId: string, reason: string): boolean {
    const result = this.inner.fail(taskId, reason);
    if (result) this.notifyNode("task_failed", { taskId, reason });
    return result;
  }

  block(taskId: string): boolean {
    return this.inner.block(taskId);
  }

  unblock(taskId: string): boolean {
    return this.inner.unblock(taskId);
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
    const result = this.inner.decompose(parentTaskId, subtasks);
    this.notifyNode("task_decomposed", {
      parentTaskId,
      subtaskIds: result.map((t) => t.id)
    });
    return result;
  }

  getAvailable(agent?: AgentIdentity): BoardTask[] {
    return this.inner.getAvailable(agent);
  }

  get(taskId: string): BoardTask | undefined {
    return this.inner.get(taskId);
  }

  getSnapshot(): BoardTask[] {
    return this.inner.getSnapshot();
  }

  getSubtasks(parentTaskId: string): BoardTask[] {
    return this.inner.getSubtasks(parentTaskId);
  }

  isComplete(): boolean {
    return this.inner.isComplete();
  }

  detectDeadlock(): string[] | null {
    return this.inner.detectDeadlock();
  }

  resolveParents(): void {
    this.inner.resolveParents();
  }

  onEvent(handler: (event: TeamEvent) => void): () => void {
    return this.inner.onEvent(handler);
  }

  // ─── Internal ───

  /**
   * Fire-and-forget notification to the board node in the workflow graph.
   * Non-blocking — if it fails, the inner board is still consistent.
   */
  private notifyNode(operation: string, params: Record<string, unknown>): void {
    if (!this.canRouteToNode()) return;
    this.routeOperation(operation, params).catch((err) => {
      // Intentional: board node notification failed — inner board is still correct
      log.warn("Edge task board notification failed", {
        operation,
        error: String(err)
      });
    });
  }
}
