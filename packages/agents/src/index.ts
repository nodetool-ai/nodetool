/**
 * @nodetool/agents -- Agent system for planning and executing multi-step LLM tasks.
 */

// Types
export type { Step, Task, TaskPlan, AgentMode, SubAgentConfig } from "./types.js";

// Tools
export { Tool } from "./tools/base-tool.js";
export { FinishStepTool } from "./tools/finish-step-tool.js";
export { CalculatorTool } from "./tools/calculator-tool.js";
export {
  StatisticsTool,
  GeometryTool,
  TrigonometryTool,
  ConversionTool
} from "./tools/math-tools.js";
export {
  OpenAIWebSearchTool,
  OpenAIImageGenerationTool,
  OpenAITextToSpeechTool
} from "./tools/openai-tools.js";
export {
  ReadFileTool,
  WriteFileTool,
  ListDirectoryTool
} from "./tools/filesystem-tools.js";
export { DownloadFileTool, HttpRequestTool } from "./tools/http-tools.js";
export { RunCodeTool } from "./tools/code-tools.js";
export { MiniJSAgentTool } from "./tools/js-code-tool.js";
export {
  GoogleSearchTool,
  GoogleNewsTool,
  GoogleImagesTool
} from "./tools/search-tools.js";
export {
  GoogleGroundedSearchTool,
  GoogleImageGenerationTool
} from "./tools/google-tools.js";
export {
  DataForSEOSearchTool,
  DataForSEONewsTool,
  DataForSEOImagesTool
} from "./tools/dataseo-tools.js";
export type {
  SerpProvider,
  SearchResult,
  SearchOptions
} from "./tools/serp-providers/index.js";
export {
  SerpApiProvider,
  DataForSeoProvider
} from "./tools/serp-providers/index.js";
export {
  BrowserTool,
  ScreenshotTool,
  htmlToText
} from "./tools/browser-tools.js";
export {
  SearchEmailTool,
  ArchiveEmailTool,
  AddLabelToEmailTool
} from "./tools/email-tools.js";
export {
  ListWorkflowsTool,
  GetWorkflowTool,
  CreateWorkflowTool,
  RunWorkflowTool,
  ValidateWorkflowTool,
  GetExampleWorkflowTool,
  ExportWorkflowDigraphTool,
  ListNodesTool,
  SearchNodesTool,
  GetNodeInfoTool,
  ListJobsTool,
  GetJobTool,
  GetJobLogsTool,
  StartBackgroundJobTool,
  ListAssetsTool,
  GetAssetTool,
  ListModelsTool,
  getAllMcpTools
} from "./tools/mcp-tools.js";
export {
  ExtractPDFTextTool,
  ExtractPDFTablesTool,
  ConvertPDFToMarkdownTool,
  ConvertMarkdownToPDFTool,
  ConvertDocumentTool
} from "./tools/pdf-tools.js";
export {
  VecTextSearchTool,
  VecIndexTool,
  VecHybridSearchTool,
  VecRecursiveSplitAndIndexTool,
  VecMarkdownSplitAndIndexTool,
  VecBatchIndexTool
} from "./tools/vector-tools.js";
export type { VecCollection } from "./tools/vector-tools.js";
export {
  registerTool,
  resolveTool,
  listTools,
  getAllTools
} from "./tools/tool-registry.js";

export {
  WorkspaceReadTool,
  WorkspaceWriteTool,
  WorkspaceListTool
} from "./tools/workspace-tools.js";
export { ListProviderModelsTool } from "./tools/model-tools.js";
export { SaveAssetTool, ReadAssetTool } from "./tools/asset-tools.js";
export { ControlNodeTool, sanitizeToolName } from "./tools/control-tool.js";
export type { ControlNodeInfo } from "./tools/control-tool.js";
export { CreatePlanTool } from "./tools/create-plan-tool.js";
export { CreateTaskPlanTool } from "./tools/create-task-tool.js";

// Graph-native planner tools
export { AddNodeTool } from "./tools/add-node-tool.js";
export { AddEdgeTool } from "./tools/add-edge-tool.js";
export { FinishGraphTool } from "./tools/finish-graph-tool.js";
export {
  LocalSearchNodesTool
} from "./tools/local-search-nodes-tool.js";
export {
  LocalGetNodeInfoTool
} from "./tools/local-get-node-info-tool.js";
export {
  LocalListNodesTool
} from "./tools/local-list-nodes-tool.js";

// Shared JS sandbox engine
export { buildSandbox, runInSandbox, serializeResult } from "./js-sandbox.js";
export type { RunSandboxOptions, RunSandboxResult } from "./js-sandbox.js";

// Constants
export { DEFAULT_TOKEN_LIMIT, MAX_TOOL_RESULT_CHARS } from "./constants.js";

// Utilities
export { extractJSON } from "./utils/json-parser.js";
export { removeBase64Images } from "./utils/remove-base64-images.js";
export { wrapGeneratorsParallel } from "./utils/wrap-generators-parallel.js";

// Core execution
export { StepExecutor } from "./step-executor.js";
export type { StepExecutorOptions } from "./step-executor.js";
export {
  AgentExecutor,
  FinishTool,
  jsonSchemaForOutputType
} from "./agent-executor.js";
export type { AgentExecutorOptions } from "./agent-executor.js";

// Agents
export { BaseAgent } from "./base-agent.js";
export { SimpleAgent } from "./simple-agent.js";
export { Agent, loadSkillsFromDirectory } from "./agent.js";
export type { AgentSkill, AgentOptions } from "./agent.js";
export { MultiModeAgent } from "./multi-mode-agent.js";
export type { MultiModeAgentOptions } from "./multi-mode-agent.js";
export { SubAgentPlanner } from "./sub-agent-planner.js";
export type { SubAgentPlannerOptions } from "./sub-agent-planner.js";

// Planning & orchestration
export { TaskPlanner } from "./task-planner.js";
export type { TaskPlannerOptions } from "./task-planner.js";
export { TaskExecutor } from "./task-executor.js";
export type { TaskExecutorOptions } from "./task-executor.js";
export { ParallelTaskExecutor } from "./parallel-task-executor.js";
export type { ParallelTaskExecutorOptions } from "./parallel-task-executor.js";

// Graph-native planning & execution
export { GraphBuilder, AGENT_STEP_NODE_TYPE } from "./graph-builder.js";
export { GraphPlanner } from "./graph-planner.js";
export type { GraphPlannerOptions } from "./graph-planner.js";
export { AgentStepExecutor } from "./agent-step-executor.js";
export type { AgentStepExecutorOptions } from "./agent-step-executor.js";
export { AgentWorkflowRunner } from "./agent-workflow-runner.js";
export type { AgentWorkflowRunnerOptions } from "./agent-workflow-runner.js";

// Multi-agent team system
export {
  // In-memory implementations
  MessageBus,
  TaskBoard,
  // Edge-native implementations
  EdgeMessageBus,
  EdgeTaskBoard,
  // DB-backed implementation
  DbTaskBoard,
  // Orchestration
  TeamExecutor,
  // Tools
  createTeamTools,
  SendMessageTool,
  BroadcastTool,
  CheckMessagesTool,
  CreateTaskTool,
  ListTasksTool,
  ClaimTaskTool,
  CompleteTaskTool,
  FailTaskTool,
  DecomposeTaskTool
} from "./team/index.js";
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
  ITaskBoard,
  TeamExecutorOptions,
  MessageHandler,
  BoardEventHandler
} from "./team/index.js";
