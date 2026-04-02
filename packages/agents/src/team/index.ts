/**
 * Multi-agent team system — agents collaborate via shared task board
 * and message bus.
 */

// Types & interfaces
export type {
  AgentIdentity,
  AgentMessage,
  MessageType,
  BoardTask,
  TaskStatus,
  TeamEvent,
  TeamConfig,
  TeamStrategy,
  IMessageBus,
  ITaskBoard
} from "./types.js";

// In-memory implementations (programmatic use)
export { MessageBus } from "./message-bus.js";
export type { MessageHandler } from "./message-bus.js";
export { TaskBoard } from "./task-board.js";
export type { BoardEventHandler } from "./task-board.js";

// Edge-native implementations (workflow node use)
export { EdgeMessageBus } from "./edge-message-bus.js";
export { EdgeTaskBoard } from "./edge-task-board.js";

// DB-backed implementation (production use — tasks persisted in SQLite)
export { DbTaskBoard } from "./db-task-board.js";

// Team tools
export {
  SendMessageTool,
  BroadcastTool,
  CheckMessagesTool,
  CreateTaskTool,
  ListTasksTool,
  ClaimTaskTool,
  CompleteTaskTool,
  FailTaskTool,
  DecomposeTaskTool,
  createTeamTools
} from "./team-tools.js";

// Orchestration
export { TeamExecutor } from "./team-executor.js";
export type { TeamExecutorOptions } from "./team-executor.js";
