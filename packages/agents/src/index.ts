/**
 * @nodetool-ai/agents -- Agent system for planning and executing multi-step LLM tasks.
 */

// Types
export type { Step, Task, TaskPlan } from "./types.js";

// Tools
export { Tool } from "./tools/base-tool.js";
export { FinishStepTool } from "./tools/finish-step-tool.js";
export {
  FinishTool,
  jsonSchemaForOutputType
} from "./tools/finish-task-tool.js";
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
export {
  EditFileTool,
  GlobTool,
  GrepTool
} from "./tools/edit-search-tools.js";
export { RunCodeTool } from "./tools/code-tools.js";
export {
  TodoWriteTool,
  getThreadTodos,
  clearThreadTodos
} from "./tools/todo-tools.js";
export { MiniJSAgentTool } from "./tools/js-code-tool.js";
export { ViewImageTool, ListImagesTool } from "./tools/view-image-tool.js";
export {
  IMAGE_CONTENT_FIELD,
  IMAGE_CONTENTS_FIELD,
  OMITTED_IMAGE_NOTE,
  extractInjectableImages,
  stripImagePayload,
  buildImageInjectionMessage,
  downgradeInjectedImageMessage
} from "./tools/image-injection.js";
export type {
  InjectableImage,
  ExtractedImages
} from "./tools/image-injection.js";
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
  SearchOptions,
  SerpProviderType
} from "./tools/serp-providers/index.js";
export {
  SerpApiProvider,
  DataForSeoProvider,
  BraveProvider,
  ApifyProvider,
  createSerpProvider
} from "./tools/serp-providers/index.js";
export {
  createSearchTool,
  getConfiguredSerpProvider,
  resolveSerpProvider
} from "./tools/serp-tool-factory.js";
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
  DebugWorkflowTool,
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
  ListCollectionsTool,
  QueryCollectionTool
} from "./tools/collection-tools.js";
export {
  TOOL_PERMISSION_CATEGORIES,
  permissionCategoryFor,
  decidePermission,
  gateTools
} from "./tools/tool-permissions.js";
export type {
  PermissionCategory,
  PermissionMode,
  PermissionDecision,
  ApprovalDecision,
  ApprovalRequest,
  RequestApproval,
  PermissionGateOptions
} from "./tools/tool-permissions.js";
export {
  SecurityMonitor,
  createSecurityMonitorConsult
} from "./security-monitor.js";
export type {
  SecurityMonitorOptions,
  SecurityVerdict,
  SecuritySeverity,
  SecurityTier,
  PendingAction
} from "./security-monitor.js";
export {
  SECURITY_MONITOR_SYSTEM_PROMPT,
  buildSecurityMonitorUserPrompt
} from "./prompts/security-monitor-prompt.js";
export {
  registerTool,
  resolveTool,
  listTools,
  getAllTools
} from "./tools/tool-registry.js";
export {
  BUILTIN_TOOL_CLASSES,
  getBuiltinTools,
  registerBuiltinTools,
  resetBuiltinToolsRegistration
} from "./tools/builtin-tools.js";

export {
  WorkspaceReadTool,
  WorkspaceWriteTool,
  WorkspaceListTool
} from "./tools/workspace-tools.js";
export { ListProviderModelsTool } from "./tools/model-tools.js";
export { FindModelTool } from "./tools/find-model-tool.js";
export {
  GenerateImageTool,
  EditImageTool,
  GenerateVideoTool,
  AnimateImageTool,
  GenerateSpeechTool,
  TranscribeAudioTool,
  EmbedTextTool
} from "./tools/media-tools.js";
export {
  persistOutput,
  workspaceDir as workspaceDirFromContext,
  inferImageMime,
  timestampedName,
  MIME_TO_EXT,
  type SavedOutput
} from "./tools/asset-persist.js";
export {
  GENERIC_AI_NODES,
  CORE_BASELINE_NAMESPACES,
  PROVIDER_NAMESPACES,
  buildGraphPlannerSystemPrompt
} from "./prompts/graph-planner-prompt.js";
export type {
  GenericAINode,
  GenericNodeCapability,
  BuildPromptOptions
} from "./prompts/graph-planner-prompt.js";
export { SaveAssetTool, ReadAssetTool } from "./tools/asset-tools.js";
export { ControlNodeTool, sanitizeToolName } from "./tools/control-tool.js";
export type { ControlNodeInfo } from "./tools/control-tool.js";
export { CreatePlanTool } from "./tools/create-plan-tool.js";
export { CreateTaskPlanTool } from "./tools/create-task-tool.js";
export {
  RunSubtaskTool,
  SUBTASK_DEPTH_KEY,
  TOOL_CALL_ID_FIELD
} from "./tools/run-subtask-tool.js";
export type {
  RunSubtaskToolOptions,
  ForwardMessage
} from "./tools/run-subtask-tool.js";
export {
  RunSearchTool,
  READ_ONLY_TOOL_NAMES
} from "./tools/run-search-tool.js";
export type { RunSearchToolOptions } from "./tools/run-search-tool.js";
export {
  buildReadOnlySearchPrompt,
  READ_ONLY_SEARCH_DESCRIPTION
} from "./prompts/read-only-search-prompt.js";
export type { SearchBreadth } from "./prompts/read-only-search-prompt.js";
export {
  PlanBuilder,
  AddTaskTool,
  RemoveTaskTool,
  FinishPlanTool
} from "./tools/plan-builder-tools.js";

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
export {
  DEFAULT_TOKEN_LIMIT,
  MAX_TOOL_RESULT_CHARS,
  truncateToolResult
} from "./constants.js";

// Utilities
export { extractJSON } from "./utils/json-parser.js";
export { removeBase64Images } from "./utils/remove-base64-images.js";
export { wrapGeneratorsParallel } from "./utils/wrap-generators-parallel.js";

// Core execution
export { StepExecutor } from "./step-executor.js";
export type { StepExecutorOptions } from "./step-executor.js";

// Context compaction (opt-in, default OFF)
export {
  ContextCompactor,
  estimateMessageTokens,
  COMPACTION_THRESHOLD_RATIO,
  DEFAULT_COMPACTION_KEEP_RECENT
} from "./context-compactor.js";
export type { CompactionOptions } from "./context-compactor.js";
export { COMPACTION_SYSTEM_PROMPT } from "./prompts/compaction-prompt.js";
export { AgentExecutor } from "./agent-executor.js";
export type { AgentExecutorOptions } from "./agent-executor.js";

// Agents
export { Agent, loadSkillsFromDirectory } from "./agent.js";
export type { AgentSkill, AgentOptions } from "./agent.js";

// Long-term memory (cross-session, automatically queried)
export {
  LongTermMemory,
  formatMemoryForPrompt,
  createDefaultLongTermMemory
} from "./long-term-memory.js";
export type {
  LongTermMemoryItem,
  LongTermMemoryOptions,
  CreateDefaultLongTermMemoryOptions,
  MemoryKind as LongTermMemoryKind
} from "./long-term-memory.js";
export {
  formatSynthesizedMemoryForPrompt
} from "./prompts/memory-synthesis-prompt.js";
export type {
  SynthesizedFact,
  FactUtility
} from "./prompts/memory-synthesis-prompt.js";
export {
  LtmRecallTool,
  LtmRememberTool,
  getLongTermMemoryTools,
  LTM_TOOL_NAMES,
  setLongTermMemory,
  getLongTermMemory
} from "./tools/ltm-tools.js";

// Planning & orchestration
export { TaskPlanner } from "./task-planner.js";
export type { TaskPlannerOptions } from "./task-planner.js";
export { TaskExecutor } from "./task-executor.js";
export type { TaskExecutorOptions } from "./task-executor.js";
export { ParallelTaskExecutor } from "./parallel-task-executor.js";
export type { ParallelTaskExecutorOptions } from "./parallel-task-executor.js";
export { CompilerAgent } from "./compiler-agent.js";
export type { CompilerAgentOptions } from "./compiler-agent.js";

// Graph-native planning & execution
export { GraphBuilder, AGENT_STEP_NODE_TYPE } from "./graph-builder.js";
export { GraphPlanner } from "./graph-planner.js";
export type { GraphPlannerOptions } from "./graph-planner.js";
export { AgentStepExecutor } from "./agent-step-executor.js";
export type { AgentStepExecutorOptions } from "./agent-step-executor.js";
export { AgentWorkflowRunner } from "./agent-workflow-runner.js";
export type { AgentWorkflowRunnerOptions } from "./agent-workflow-runner.js";

