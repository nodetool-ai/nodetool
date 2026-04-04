/**
 * Core type definitions for the multi-agent team system.
 *
 * Inspired by the A2A (Agent-to-Agent) protocol task lifecycle
 * and blackboard architecture patterns.
 */

// ─── Agent Identity (A2A Agent Card) ───

export interface AgentIdentity {
  /** Unique ID within the team. */
  id: string;
  /** Human-readable name, e.g. "researcher", "writer". */
  name: string;
  /** Freeform role description injected into LLM system prompt. */
  role: string;
  /** Skill tags for task matching, e.g. ["web_search", "code_generation"]. */
  skills: string[];
  /** LLM provider key. */
  provider: string;
  /** Model identifier. */
  model: string;
  /** Tool names this agent can use (beyond team tools). */
  tools: string[];
}

// ─── Message Bus ───

export type MessageType = "request" | "response" | "info" | "handoff";

export interface AgentMessage {
  id: string;
  from: string;
  to: string | "all";
  type: MessageType;
  subject: string;
  body: string;
  replyTo?: string;
  taskId?: string;
  timestamp: number;
}

// ─── Task Board (A2A Task Lifecycle) ───

export type TaskStatus =
  | "open"
  | "claimed"
  | "working"
  | "blocked"
  | "done"
  | "failed";

export interface BoardTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  createdBy: string;
  claimedBy?: string;
  dependsOn: string[];
  requiredSkills: string[];
  priority: number;
  artifacts: unknown[];
  parentTaskId?: string;
  result?: unknown;
  failureReason?: string;
  createdAt: number;
  updatedAt: number;
}

// ─── Team Events ───

export type TeamEvent =
  | { type: "agent_started"; agentId: string; timestamp: number }
  | { type: "agent_idle"; agentId: string; timestamp: number }
  | { type: "agent_finished"; agentId: string; timestamp: number }
  | { type: "task_created"; task: BoardTask; timestamp: number }
  | { type: "task_claimed"; taskId: string; agentId: string; timestamp: number }
  | { type: "task_working"; taskId: string; agentId: string; timestamp: number }
  | {
      type: "task_completed";
      taskId: string;
      artifacts: unknown[];
      timestamp: number;
    }
  | { type: "task_failed"; taskId: string; reason: string; timestamp: number }
  | { type: "message_sent"; message: AgentMessage; timestamp: number }
  | { type: "chunk"; agentId: string; content: string; timestamp: number }
  | { type: "team_complete"; result: unknown; timestamp: number }
  | { type: "deadlock_detected"; blockingTasks: string[]; timestamp: number };

// ─── Interfaces ───
// These interfaces decouple the team system from any specific implementation.
// The in-memory MessageBus/TaskBoard implement them for programmatic use.
// Edge-native implementations route through the workflow kernel for node use.

export interface IMessageBus {
  /** Register an agent so it has an inbox. */
  register(agentId: string): void;

  /** Send a message to a specific agent or broadcast to all. */
  send(opts: {
    from: string;
    to: string | "all";
    type: MessageType;
    subject: string;
    body: string;
    replyTo?: string;
    taskId?: string;
  }): AgentMessage;

  /** Pull and drain pending messages for an agent. */
  receive(agentId: string): AgentMessage[];

  /** Peek at pending messages without consuming. */
  peek(agentId: string): AgentMessage[];

  /** Subscribe to real-time message delivery. Returns unsubscribe fn. */
  subscribe(agentId: string, handler: (msg: AgentMessage) => void): () => void;

  /** Get the conversation thread from a message ID. */
  getThread(messageId: string): AgentMessage[];

  /** Get full message history. */
  getHistory(): AgentMessage[];

  /** Count of pending messages for an agent. */
  pendingCount(agentId: string): number;
}

export interface ITaskBoard {
  /** Create a new task on the board. */
  create(opts: {
    title: string;
    description: string;
    createdBy: string;
    dependsOn?: string[];
    requiredSkills?: string[];
    priority?: number;
    parentTaskId?: string;
  }): BoardTask;

  /** Atomically claim an open task. */
  claim(taskId: string, agentId: string): boolean;

  /** Mark a claimed task as actively being worked on. */
  startWork(taskId: string, agentId: string): boolean;

  /** Complete a task with optional result and artifacts. */
  complete(
    taskId: string,
    opts?: { result?: unknown; artifacts?: unknown[] }
  ): boolean;

  /** Mark a task as failed. */
  fail(taskId: string, reason: string): boolean;

  /** Block a task. */
  block(taskId: string): boolean;

  /** Unblock a task back to open. */
  unblock(taskId: string): boolean;

  /** Decompose a task into subtasks. Parent becomes blocked. */
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
  ): BoardTask[];

  /** Get tasks available for an agent to claim. */
  getAvailable(agent?: AgentIdentity): BoardTask[];

  /** Get a single task by ID. */
  get(taskId: string): BoardTask | undefined;

  /** Full board snapshot. */
  getSnapshot(): BoardTask[];

  /** Get subtasks of a parent. */
  getSubtasks(parentTaskId: string): BoardTask[];

  /** Check if all tasks are terminal. */
  isComplete(): boolean;

  /** Detect deadlock. Returns stuck task IDs or null. */
  detectDeadlock(): string[] | null;

  /** Auto-complete parent tasks when all subtasks done. */
  resolveParents(): void;

  /** Subscribe to board events. Returns unsubscribe fn. */
  onEvent(handler: (event: TeamEvent) => void): () => void;
}

// ─── Team Configuration ───

export type TeamStrategy = "coordinator" | "autonomous" | "hybrid";

export interface TeamConfig {
  /** Overall objective for the team. */
  objective: string;
  /** Team members. First agent is coordinator when strategy is "coordinator". */
  agents: AgentIdentity[];
  /** Execution strategy. */
  strategy: TeamStrategy;
  /** Maximum total iterations across all agents before forced completion. */
  maxIterations?: number;
  /** Maximum concurrent agents running simultaneously. */
  maxConcurrency?: number;
}
