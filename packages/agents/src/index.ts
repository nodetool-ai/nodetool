/**
 * @nodetool/agents -- Agent system for planning and executing multi-step LLM tasks.
 */

// Types
export type { Step, Task } from "./types.js";

// Tools
export { Tool } from "./tools/base-tool.js";
export { FinishStepTool } from "./tools/finish-step-tool.js";
export { CalculatorTool } from "./tools/calculator-tool.js";
export {
  StatisticsTool,
  GeometryTool,
  TrigonometryTool,
  ConversionTool,
} from "./tools/math-tools.js";
export {
  OpenAIWebSearchTool,
  OpenAIImageGenerationTool,
  OpenAITextToSpeechTool,
} from "./tools/openai-tools.js";
export {
  ReadFileTool,
  WriteFileTool,
  ListDirectoryTool,
} from "./tools/filesystem-tools.js";
export {
  DownloadFileTool,
  HttpRequestTool,
} from "./tools/http-tools.js";
export { RunCodeTool } from "./tools/code-tools.js";
export {
  GoogleSearchTool,
  GoogleNewsTool,
  GoogleImagesTool,
} from "./tools/search-tools.js";
export {
  GoogleGroundedSearchTool,
  GoogleImageGenerationTool,
} from "./tools/google-tools.js";
export {
  DataForSEOSearchTool,
  DataForSEONewsTool,
  DataForSEOImagesTool,
} from "./tools/dataseo-tools.js";
export type {
  SerpProvider,
  SearchResult,
  SearchOptions,
} from "./tools/serp-providers/index.js";
export {
  SerpApiProvider,
  DataForSeoProvider,
} from "./tools/serp-providers/index.js";
export {
  BrowserTool,
  ScreenshotTool,
  htmlToText,
} from "./tools/browser-tools.js";
export {
  SearchEmailTool,
  ArchiveEmailTool,
  AddLabelToEmailTool,
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
  getAllMcpTools,
} from "./tools/mcp-tools.js";
export {
  ExtractPDFTextTool,
  ExtractPDFTablesTool,
  ConvertPDFToMarkdownTool,
  ConvertMarkdownToPDFTool,
  ConvertDocumentTool,
} from "./tools/pdf-tools.js";
export {
  ChromaTextSearchTool,
  ChromaIndexTool,
  ChromaHybridSearchTool,
  ChromaRecursiveSplitAndIndexTool,
  ChromaMarkdownSplitAndIndexTool,
  ChromaBatchIndexTool,
} from "./tools/chroma-tools.js";
export type { ChromaCollection } from "./tools/chroma-tools.js";
export {
  registerTool,
  resolveTool,
  listTools,
  getAllTools,
} from "./tools/tool-registry.js";

export {
  WorkspaceReadTool,
  WorkspaceWriteTool,
  WorkspaceListTool,
} from "./tools/workspace-tools.js";
export { ListProviderModelsTool } from "./tools/model-tools.js";
export { SaveAssetTool, ReadAssetTool } from "./tools/asset-tools.js";
export { ControlNodeTool, sanitizeToolName } from "./tools/control-tool.js";
export type { ControlNodeInfo } from "./tools/control-tool.js";

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
  jsonSchemaForOutputType,
} from "./agent-executor.js";
export type { AgentExecutorOptions } from "./agent-executor.js";

// Agents
export { BaseAgent } from "./base-agent.js";
export { SimpleAgent } from "./simple-agent.js";
export { Agent, loadSkillsFromDirectory } from "./agent.js";
export type { AgentSkill, AgentOptions } from "./agent.js";

// Planning & orchestration
export { TaskPlanner } from "./task-planner.js";
export type { TaskPlannerOptions } from "./task-planner.js";
export { TaskExecutor } from "./task-executor.js";
export type { TaskExecutorOptions } from "./task-executor.js";
