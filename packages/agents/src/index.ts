/**
 * @nodetool-ai/agents -- Agent system for planning and executing multi-step LLM tasks.
 */

// Types
export type {
  Step,
  Task,
  TaskPlan,
  PlanApprovalDecision,
  RequestPlanApproval
} from "./types.js";
export { PLAN_APPROVAL_CONTEXT_KEY } from "./types.js";

// Tools
export { Tool } from "./tools/base-tool.js";
export {
  searchTools,
  formatToolSearchResult,
  formatDeferredToolsReminder,
  TOOL_SEARCH_DESCRIPTION
} from "./tools/tool-search.js";
export type { ToolSearchEntry } from "./tools/tool-search.js";
export { FinishStepTool } from "./tools/finish-step-tool.js";
export {
  getThreadTodos,
  clearThreadTodos
} from "./tools/todo-tools.js";
export {
  IMAGE_CONTENT_FIELD,
  IMAGE_CONTENTS_FIELD,
  extractInjectableImages,
  stripImagePayload
} from "./tools/image-injection.js";
export type {
  InjectableImage,
  ExtractedImages
} from "./tools/image-injection.js";
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
export { htmlToText } from "./tools/browser-tools.js";
export {
  getAllMcpTools,
  createWorkflowDocumentTools
} from "./tools/mcp-tools.js";
export type {
  GetAllMcpToolsOptions,
  SecretAvailabilityFactory,
  ExampleWorkflowCatalog,
  WorkflowDslExporter,
  PackageAssetLister,
  WorkflowEnvironmentProvider,
  TimelineLoader,
  TimelineToolRecord,
  SketchLoader,
  SketchToolRecord
} from "./tools/mcp-tools.js";
export type { VecCollection } from "./tools/vector-tools.js";
export {
  TOOL_PERMISSION_CATEGORIES,
  permissionCategoryFor,
  decidePermission
} from "./tools/tool-permissions.js";
export { gateTools } from "./capabilities/gate-tools.js";
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
  PERMISSION_CATEGORIES,
  loadCapabilityModule,
  listCapabilityModules,
  loadAllCapabilityModules,
  findCapability,
  capabilityCategorySnapshot,
  capabilityModuleIssues,
  capabilityModuleDrift,
  DECLARED_CAPABILITY_MODULES,
  toolFromCapability,
  toolFromLazyCapability,
  toolForCapabilityName,
  capabilityFromTool,
  capabilitySpec,
  capabilityModuleOf,
  listCapabilitySpecs,
  createCapabilityRun,
  contextSecretAvailability,
  resolveCapabilityMessage,
  UNGATED
} from "./capabilities/index.js";
export type {
  AvailableSecretsResolver,
  CapabilitySpec,
  CapabilityImpl,
  CapabilityRun,
  CapabilityModule,
  CapabilityExport,
  CapabilityGate,
  CapabilityLoaders,
  ClientToolRouter,
  SecretPrompt,
  SecretPromptRequest,
  SecretPromptStatus,
  SubAgentRuntime,
  CapabilityRunSource,
  CreateCapabilityRunOptions
} from "./capabilities/index.js";
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
  BUILTIN_TOOL_NAMES,
  availableBuiltinToolNames,
  getBuiltinTools,
  getAgentToolbelt,
  registerBuiltinTools,
  resetBuiltinToolsRegistration
} from "./tools/builtin-tools.js";
export { isYtDlpEnabled } from "./yt-dlp-gate.js";
export {
  GOOGLE_WORKSPACE_TOOL_NAMES,
  getGoogleWorkspaceTools,
  registerGoogleWorkspaceTools
} from "./tools/google-workspace-tools.js";
export {
  APIFY_TOOL_NAMES,
  SERPAPI_TOOL_NAMES,
  getApifyTools,
  getSerpApiTools
} from "./tools/external-capability-tools.js";

export { getMediaTools } from "./tools/media-tools.js";
export { CREATIVE_CRITIQUE_TOOL_NAMES } from "./tools/creative-critique-tools.js";
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
  WORKFLOW_AUTHORING_KNOWLEDGE,
  renderWorkflowAuthoringKnowledge,
  resolveAvailableGenericNodes
} from "./prompts/workflow-authoring-knowledge.js";
export type {
  GenericAINode,
  GenericNodeCapability,
  GenericNodeAvailability,
  GenericNodeLookup
} from "./prompts/workflow-authoring-knowledge.js";
export { installedSandboxPacks } from "./prompts/sandbox-pack-catalog.js";
export type { InstalledSandboxPack } from "./prompts/sandbox-pack-catalog.js";
export { ControlNodeTool, sanitizeToolName } from "./tools/control-tool.js";
export type { ControlNodeInfo } from "./tools/control-tool.js";
export { CreateTaskPlanTool } from "./tools/create-task-tool.js";
export {
  runSubAgent,
  forwardSubAgentStream,
  tagSubAgentMessage,
  settleStepResult,
  enterSubAgentDepth,
  SubAgentTool,
  DEFAULT_SUBAGENT_MAX_DEPTH
} from "./subagent.js";
export type {
  SubAgentOutcome,
  SubAgentRunOptions,
  SubAgentStreamTag,
  ForwardSubAgentStreamOptions,
  SubAgentDepthGate,
  SubAgentToolRuntime,
  SubAgentToolRun
} from "./subagent.js";
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
  StartSubtaskTool
} from "./tools/start-subtask-tool.js";
export type { StartSubtaskToolOptions } from "./tools/start-subtask-tool.js";
export {
  WaitSubtasksTool
} from "./tools/wait-subtasks-tool.js";
export type { WaitSubtasksToolOptions } from "./tools/wait-subtasks-tool.js";
export {
  BackgroundSubtaskRegistry,
  DEFAULT_WAIT_TIMEOUT_MS,
  MAX_WAIT_TIMEOUT_MS
} from "./background-subtasks.js";
export type {
  BackgroundSubtaskStatus,
  BackgroundSubtaskSettlement,
  BackgroundSubtaskSnapshot,
  WaitedSubtask,
  WaitBackgroundOptions
} from "./background-subtasks.js";
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

// Shared JS sandbox engine
export {
  buildSandbox,
  runInSandbox,
  serializeResult,
  resolveSandboxLimits,
  createSandboxClock
} from "./js-sandbox.js";
export {
  DEFAULT_TIMEOUT_MS,
  MAX_OUTPUT_SIZE,
  MAX_LOOP_ITERATIONS,
  DEFAULT_SUSPEND_ALLOWANCE_MS,
  EXPOSED_BRIDGE_NAMES,
  GUEST_HELPER_NAMES,
  RESERVED_SANDBOX_NAMES
} from "./js-sandbox.js";
export type {
  RunSandboxOptions,
  RunSandboxResult,
  SandboxClock,
  SandboxLimits,
  ResolvedSandboxLimits,
  SandboxProgressCallback,
  ExposedBridgeName,
  GuestHelperName
} from "./js-sandbox.js";

// Mounting NodeTool's own guest modules (`@nodetool-ai/sandbox-nodetool/*`)
// for one body. The Code node calls this through its hidden import of this
// package, the way it already loads the toolbelt.
export { mountCapabilityModules } from "./codeact/capability-modules.js";
export type { CapabilityModuleMount } from "./codeact/capability-modules.js";
export { ungatedCapabilityRun } from "./capabilities/invoke.js";

// Code Node authoring: the sandbox capability manifest and prompt rendering
export {
  getSandboxManifest,
  sandboxManifestNames,
  SANDBOX_MANIFEST_NODE_TYPE
} from "./code-gen/sandbox-manifest.js";
export type {
  SandboxManifest,
  SandboxBridgeDoc,
  SandboxMemberDoc,
  SandboxLimitDoc
} from "./code-gen/sandbox-manifest.js";
export {
  renderSandboxApiReference,
  extractApiReferences,
  unknownApiReferences
} from "./code-gen/sandbox-prompt.js";
export {
  buildCodeGenSystemPrompt,
  buildCodeGenUserPrompt,
  buildCodeGenRetryPrompt
} from "./code-gen/prompt.js";
export type { CodeGenPromptInput } from "./code-gen/prompt.js";
export { analyzeGeneratedCode, collectBoundNames } from "./code-gen/analyze.js";
export type { CodeAnalysis } from "./code-gen/analyze.js";
export { SubmitCodeTool } from "./tools/submit-code-tool.js";
export type { SubmitCodeToolOptions } from "./tools/submit-code-tool.js";
export { CodePlanner } from "./code-planner.js";
export type { CodePlannerOptions } from "./code-planner.js";

// Constants
export { MAX_TOOL_RESULT_CHARS, truncateToolResult } from "./constants.js";

// Utilities
export { extractJSON } from "./utils/json-parser.js";
export { removeBase64Images } from "./utils/remove-base64-images.js";
export { wrapGeneratorsParallel } from "./utils/wrap-generators-parallel.js";

// Core execution
export {
  CodeActExecutor,
  DEFAULT_CODEACT_MAX_ITERATIONS,
  EXECUTE_CODE_TOOL_NAME,
  CODEACT_RESIDENT_TOOL_NAMES,
  CODEACT_DEFER_THRESHOLD
} from "./codeact/codeact-executor.js";
export type { CodeActExecutorOptions } from "./codeact/codeact-executor.js";
export { buildCodeActSystemPrompt } from "./codeact/prompt.js";
export {
  MCP_GUEST_CONTRACT,
  MCP_SANDBOX_ACTION_SNIPPET,
  MCP_SANDBOX_ASSET_SNIPPET,
  MCP_SANDBOX_PROBE_SNIPPET,
  MCP_SANDBOX_RESOURCE_URI,
  MCP_SANDBOX_PROMPTS,
  buildMcpSandboxCatalog
} from "./codeact/mcp-guest-contract.js";
export type {
  McpSandboxCatalog,
  McpSandboxCatalogOptions,
  McpSandboxBridge
} from "./codeact/mcp-guest-contract.js";
export {
  sandboxPackageSkills,
  wrapUntrustedPackageDocs
} from "./codeact/sandbox-package-docs.js";
export {
  SANDBOX_PACKAGE_DOCS_TOOL_NAME,
  SANDBOX_PACKAGE_LIST_TOOL_NAME,
  sandboxPackageDocsTool,
  sandboxPackageListTool
} from "./capabilities/packs.js";
export type { SandboxPackageDocs } from "./capabilities/packs.js";
export { scanModuleExports } from "./codeact/sandbox-package-listing.js";
export type {
  SandboxModuleExports,
  SandboxPackageEntry,
  SandboxPackageListing,
  SandboxPlatformEntry
} from "./codeact/sandbox-package-listing.js";
export {
  buildToolBridge,
  renderToolCatalog,
  renderToolSignature,
  toolSignature,
  CODEACT_PRELUDE,
  CODEACT_INJECTED_GLOBALS,
  DEFAULT_MAX_TOOL_CALLS_PER_ACTION
} from "./codeact/tool-api.js";
export {
  assembleSandboxToolbelt,
  sandboxToolBridgeGlobals,
  NODETOOL_PRELUDE
} from "./sandbox-toolbelt.js";
export type { ToolSignatureSource } from "./codeact/tool-api.js";
export { createChatCodeActSession } from "./codeact/chat-codeact.js";
export type {
  ChatCodeActSession,
  ChatCodeActSessionOptions,
  ChatCodeActToolCall
} from "./codeact/chat-codeact.js";
export {
  GRAPH_MODEL_PRELUDE,
  GRAPH_MODEL_PROMPT_SECTION,
  GRAPH_MODEL_TOOL_NAMES,
  hasGraphModelTools
} from "./codeact/graph-model.js";
export {
  NODETOOL_API_NAMESPACE_TOOLS,
  NODETOOL_API_PRELUDE_FULL,
  buildNodetoolApiPromptSection,
  hasNodetoolApiTools,
  nodetoolApiCoveredToolNames
} from "./codeact/nodetool-api.js";
export {
  installedPackAllowlist,
  sandboxPackagesForChat
} from "./codeact/sandbox-packages.js";
export {
  GRAPH_DSL_PACKAGE,
  GRAPH_DSL_PROMPT_SECTION,
  hasGraphDslTools,
  withGraphDslPackage
} from "./codeact/graph-dsl-package.js";
export {
  FABRIC_PACKAGE,
  FABRIC_PROMPT_SECTION,
  catalogServesFabric,
  withFabricPackage
} from "./codeact/fabric-package.js";

// Agents
export { Agent, loadSkillsFromDirectory } from "./agent.js";
export type { AgentSkill, AgentOptions } from "./agent.js";

// Long-term memory (cross-session, automatically queried)
export {
  LongTermMemory,
  formatMemoryForPrompt,
  createDefaultLongTermMemory,
  setLongTermMemory,
  getLongTermMemory
} from "./long-term-memory.js";
export type {
  LongTermMemoryItem,
  LongTermMemoryOptions,
  CreateDefaultLongTermMemoryOptions,
  MemoryKind as LongTermMemoryKind
} from "./long-term-memory.js";
export { formatSynthesizedMemoryForPrompt } from "./prompts/memory-synthesis-prompt.js";
export type {
  SynthesizedFact,
  FactUtility
} from "./prompts/memory-synthesis-prompt.js";
export {
  getThreadMemoryTools,
  formatThreadMemoriesForPrompt,
  THREAD_MEMORY_TOOL_NAMES
} from "./tools/thread-memory-tools.js";
export {
  getAssetLibraryTools,
  ASSET_LIBRARY_TOOL_NAMES
} from "./tools/asset-library-tools.js";
export { SCRIPT_VOICE_TOOL_NAMES } from "./tools/script-voice-tools.js";
export { STORYBOARD_RENDER_TOOL_NAMES } from "./tools/storyboard-render-tools.js";
export { SKETCH_VERSION_TOOL_NAMES } from "./tools/sketch-version-tools.js";
export { TIMELINE_VERSION_TOOL_NAMES } from "./tools/timeline-version-tools.js";

// Plan cache + checkpoint store (opt-in planning/execution persistence)
export {
  hashPlanKey,
  hashPlanCheckpointKey,
  InMemoryPlanCache,
  FilePlanCache,
  InMemoryCheckpointStore,
  FileCheckpointStore
} from "./checkpoint-store.js";
export type {
  PlanCache,
  CheckpointStore,
  Checkpoint,
  PlanKeyInput,
  PlanCheckpointKeyInput
} from "./checkpoint-store.js";

// Shared execution policy (bounds every agent mode obeys)
export { DEFAULT_AGENT_POLICY, resolveAgentPolicy } from "./agent-policy.js";
export type { AgentPolicy, AgentPolicyOptions } from "./agent-policy.js";

// Planning & orchestration
export { TaskPlanner } from "./task-planner.js";
export type { TaskPlannerOptions } from "./task-planner.js";
export { TaskExecutor } from "./task-executor.js";
export type { TaskExecutorOptions } from "./task-executor.js";
export { ParallelTaskExecutor } from "./parallel-task-executor.js";
export type { ParallelTaskExecutorOptions } from "./parallel-task-executor.js";
export { CompilerAgent } from "./compiler-agent.js";
export type { CompilerAgentOptions } from "./compiler-agent.js";

// GraphPlanner evaluation harness
export {
  runGraphPlannerEval,
  formatEvalReport,
  checkExpectations
} from "./evals/graph-planner-eval.js";
export type {
  GraphPlannerEvalCase,
  GraphPlannerEvalExpectations,
  GraphPlannerCaseResult,
  GraphPlannerEvalReport,
  RunGraphPlannerEvalOptions,
  EvalCheck
} from "./evals/graph-planner-eval.js";
export { GRAPH_PLANNER_EVAL_CASES } from "./evals/graph-planner-cases.js";

// End-to-end graph evaluation harness (plan → execute → judge)
export {
  runGraphE2eEval,
  formatGraphE2eReport,
  checkRunOutputs,
  outputsByName,
  previewOutputValue
} from "./evals/graph-e2e-eval.js";
export type {
  GraphE2eEvalCase,
  GraphE2eExpectations,
  GraphE2eCaseResult,
  GraphE2eEvalReport,
  RunGraphE2eEvalOptions,
  GraphRunner,
  GraphRunResult,
  GraphRunOutput
} from "./evals/graph-e2e-eval.js";
export { GRAPH_E2E_EVAL_CASES } from "./evals/graph-e2e-cases.js";
export {
  judgeGoalAchievement,
  parseJudgeVerdict,
  renderValueForJudge
} from "./evals/goal-judge.js";
export type { GoalJudgeVerdict, JudgeGoalOptions } from "./evals/goal-judge.js";

// Code node authoring evaluation harness (CodePlanner)
export {
  runCodeGenEval,
  formatCodeGenReport,
  checkCodeGenExpectations
} from "./evals/code-gen-eval.js";
export type {
  CodeGenEvalCase,
  CodeGenEvalExpectations,
  CodeGenEvalCheck,
  CodeGenCaseResult,
  CodeGenEvalReport,
  RunCodeGenEvalOptions
} from "./evals/code-gen-eval.js";
export { CODE_GEN_EVAL_CASES } from "./evals/code-gen-cases.js";

// Tool-loop evaluation harness (frontend ui_* tool surface)
export {
  runToolLoopEval,
  formatToolLoopReport,
  checkToolLoopExpectations
} from "./evals/tool-loop-eval.js";
export type {
  HeadlessSurfaceBridge,
  ToolLoopEvalCase,
  ToolLoopEvalExpectations,
  ToolLoopStatePredicate,
  ToolLoopObservation,
  ToolCallRecord,
  ToolLoopCaseResult,
  ToolLoopEvalReport,
  RunToolLoopEvalOptions
} from "./evals/tool-loop-eval.js";
export {
  createToolLoopBridge,
  DEFAULT_TOOL_NAMES
} from "./evals/tool-loop-bridge.js";
export type {
  ToolLoopInitialState,
  ToolLoopFinalState,
  ToolLoopState,
  HeadlessTool,
  HeadlessBridge,
  HeadlessNode,
  HeadlessEdge
} from "./evals/tool-loop-bridge.js";
export {
  TOOL_LOOP_EVAL_CASES,
  TOOL_LOOP_NODE_CATALOG
} from "./evals/tool-loop-cases.js";
export {
  scoreToolLoopChecks,
  countCriticalFailures,
  CRITICAL_FAILURE_SCORE_CAP
} from "./evals/tool-loop-eval.js";

// Interactive escalation: an `ask_user` tool backed by a scripted user, plus
// the workflow-tool cases that require escalating before acting.
export {
  createEscalationChannel,
  checkEscalationExpectations,
  DEFAULT_ESCALATION_TOOL_NAME
} from "./evals/escalation.js";
export type {
  EscalationConfig,
  EscalationReply,
  EscalationTurn,
  EscalationChannel,
  EscalationExpectations
} from "./evals/escalation.js";
export { WORKFLOW_ESCALATION_TOOL_LOOP_CASES } from "./evals/escalation-cases.js";

// Editor-surface tool-loop suites (script, sketch, timeline, storyboard, 3D)
export {
  createScriptToolBridge,
  SCRIPT_TOOL_LOOP_CASES
} from "./evals/surfaces/script.js";
export type {
  ScriptBridgeFinalState,
  ScriptBridgeInitialState
} from "./evals/surfaces/script.js";
export {
  gradeCodeCases,
  deepEqual as codeCaseDeepEqual
} from "./capabilities/code-grading.js";
export type {
  CodeTestReport,
  GradedCase,
  TestCaseReport
} from "./capabilities/code-grading.js";
export {
  createJsScriptToolBridge,
  JS_SCRIPT_TOOL_LOOP_CASES
} from "./evals/surfaces/js-script.js";
export type {
  JsScriptBridgeFinalState,
  JsScriptBridgeInitialState,
  JsScriptToolBridge
} from "./evals/surfaces/js-script.js";
export {
  createSketchToolBridge,
  getLastSketchToolBridge,
  SKETCH_TOOL_LOOP_CASES
} from "./evals/surfaces/sketch.js";
export type {
  SketchBridgeFinalState,
  SketchBridgeInitialState,
  SketchToolBridge
} from "./evals/surfaces/sketch.js";
export {
  createTimelineToolBridge,
  TIMELINE_TOOL_LOOP_CASES
} from "./evals/surfaces/timeline.js";
export type {
  TimelineBridgeFinalState,
  TimelineBridgeInitialState,
  TimelineBridgeSequenceSeed
} from "./evals/surfaces/timeline.js";
export {
  createStoryboardToolBridge,
  STORYBOARD_TOOL_LOOP_CASES
} from "./evals/surfaces/storyboard.js";
export type {
  StoryboardBridgeFinalState,
  StoryboardBridgeInitialState
} from "./evals/surfaces/storyboard.js";
export {
  createModel3DToolBridge,
  MODEL3D_TOOL_LOOP_CASES
} from "./evals/surfaces/model3d.js";
export type {
  Model3DBridgeFinalState,
  Model3DBridgeInitialState
} from "./evals/surfaces/model3d.js";
export {
  createAppToolBridge,
  APP_TOOL_LOOP_CASES
} from "./evals/surfaces/app.js";
export type {
  AppBridgeFinalState,
  AppBridgeInitialState,
  AppComponentSummary,
  SeedComponent
} from "./evals/surfaces/app.js";
/* App-build: the shared bridge and the generic tool-loop driver. */
export type {
  AppBridgeDocument,
  AppToolBridge,
  ComponentNode
} from "./app-build/bridge.js";
export {
  runToolLoop,
  DEFAULT_MAX_ITERATIONS as DEFAULT_TOOL_LOOP_ITERATIONS
} from "./app-build/tool-loop.js";
export type {
  RunToolLoopOptions,
  ToolLoopCallRecord,
  ToolLoopRun
} from "./app-build/tool-loop.js";
export {
  createThreadMemoryToolBridge,
  THREAD_MEMORY_TOOL_LOOP_CASES
} from "./evals/surfaces/thread-memory.js";
export type { ThreadMemoryBridgeFinalState } from "./evals/surfaces/thread-memory.js";
export {
  createCreativePipelineBridge,
  CREATIVE_PIPELINE_TOOL_LOOP_CASES,
  ATLAS_BRIEF,
  LANTERN_BRIEF
} from "./evals/surfaces/creative-pipeline.js";
export type {
  CreativeBrief,
  CreativeConcept,
  CreativePipelineFinalState,
  CreativePipelineInitialState,
  ReviewNote
} from "./evals/surfaces/creative-pipeline.js";

// Sub-agent execution evaluation harness (RunSubtaskTool + inherited toolset)
export {
  runSubtaskEval,
  formatSubtaskReport,
  checkSubtaskExpectations
} from "./evals/subtask-eval.js";
export type {
  SubtaskObservation,
  SubtaskSpawnRecord,
  SubtaskCaseResult,
  SubtaskEvalReport,
  RunSubtaskEvalOptions
} from "./evals/subtask-eval.js";
export {
  SUBTASK_EVAL_CASES,
  createInstrumentedTools,
  createToolRecorder,
  INSTRUMENTED_TOOL_NAMES
} from "./evals/subtask-cases.js";
export type {
  SubtaskEvalCase,
  SubtaskEvalExpectations,
  ToolInvocation,
  ToolRecorder
} from "./evals/subtask-cases.js";

// CodeAct evaluation harness (code actions vs JSON tool calls)
export {
  runCodeActEval,
  formatCodeActReport,
  checkCodeActExpectations
} from "./evals/codeact-eval.js";
export type {
  CodeActObservation,
  CodeActCaseResult,
  CodeActEvalReport,
  RunCodeActEvalOptions
} from "./evals/codeact-eval.js";
export {
  CODEACT_EVAL_CASES,
  createCodeActTools,
  createCodeActRecorder
} from "./evals/codeact-cases.js";
export type {
  CodeActEvalCase,
  CodeActEvalExpectations,
  CodeActToolRecorder
} from "./evals/codeact-cases.js";
export {
  CODEACT_API_EVAL_CASES,
  uncoveredNodetoolApiNamespaces
} from "./evals/codeact-api-cases.js";
export { CODEACT_API_CORE_CASES } from "./evals/codeact-api-core.js";
export { CODEACT_API_SURFACE_CASES } from "./evals/codeact-api-surfaces.js";
export {
  CODEACT_SANDBOX_PACK_EVAL_CASES,
  SANDBOX_PACK_DOCS_TOOL,
  shippedPackCatalog
} from "./evals/codeact-sandbox-pack-cases.js";

// Planning-mode evaluation harness (TaskPlanner DAG)
export {
  runTaskPlannerEval,
  formatTaskPlanReport,
  checkTaskPlanExpectations,
  criticalPathDepth
} from "./evals/task-planner-eval.js";
export type {
  TaskPlanCaseResult,
  TaskPlanEvalReport,
  RunTaskPlannerEvalOptions
} from "./evals/task-planner-eval.js";
export { TASK_PLANNER_EVAL_CASES } from "./evals/task-planner-cases.js";
export type {
  TaskPlannerEvalCase,
  TaskPlannerEvalExpectations
} from "./evals/task-planner-cases.js";
export {
  createPlannerTools,
  PLANNER_TOOL_NAMES
} from "./evals/planner-tools.js";

// Mini-app build evaluation harness (`nodetool eval app-build`)
export {
  runAppBuildEval,
  formatAppBuildReport,
  checkAppBuild,
  APP_BUILD_TRAITS
} from "./evals/app-build-eval.js";
export type {
  AppBuildEvalCase,
  AppBuildExpectations,
  AppBuildCheck,
  AppBuildCaseResult,
  AppBuildEvalReport,
  AppBuildEvalSummary,
  AppBuildTrait,
  AppBuildGraph,
  DeterministicAppBuild,
  ScriptedToolCall,
  RunAppBuildEvalOptions
} from "./evals/app-build-eval.js";
export {
  APP_BUILD_EVAL_CASES,
  APP_BUILD_DETERMINISTIC_CASE_IDS,
  uncoveredAppBuildTraits
} from "./evals/app-build-cases.js";

// Graph-native planning & execution
export { evaluateGraphDsl } from "./graph-dsl.js";
export type { GraphDslResult, EvaluateGraphDslOptions } from "./graph-dsl.js";
export { GraphBuilder, AGENT_NODE_TYPE } from "./graph-builder.js";
export {
  declareDynamicSlotsFromEdges,
  toSlotTypeRecord,
  type SlotTypeLookup
} from "./dynamic-slots.js";
export { normalizeModelProperties } from "./normalize-model-properties.js";
export type { ModelPropertyRegistry } from "./normalize-model-properties.js";
export { authorGraph, AUTHOR_GRAPH_MAX_ITERATIONS } from "./author-graph.js";
export type { AuthorGraphOptions } from "./author-graph.js";
export { executeAgentGraph, applyRunPolicy } from "./execute-agent-graph.js";
export type {
  ExecuteAgentGraphOptions,
  RunPolicy
} from "./execute-agent-graph.js";
export { resolveAgentGraph, runWorkflowAsAgent } from "./workflow-agent.js";
export type {
  AgentGraphSource,
  WorkflowAgentRunOptions
} from "./workflow-agent.js";
export {
  SupervisorAgent,
  DEFAULT_MAX_SUPERVISOR_COST_USD,
  DEFAULT_SUPERVISOR_MAX_OUTPUT_TOKENS
} from "./supervisor/supervisor-agent.js";
export type { SupervisorAgentOptions } from "./supervisor/supervisor-agent.js";
export { buildVerdictSchema } from "./supervisor/verdict-schema.js";
export { buildSupervisorPrompt } from "./supervisor/prompt.js";
export {
  createSupervisorTools,
  GetRunStateTool,
  ReadNodeOutputTool
} from "./supervisor/tools.js";
export {
  validateAgainstSchema,
  formatViolations
} from "./utils/json-schema-validate.js";
export type { SchemaViolation } from "./utils/json-schema-validate.js";
export { issueFingerprint } from "./app-build/types.js";
export type {
  BuildComplaint,
  BuildExpectation,
  BuildExpectCheck,
  BuildIssue,
  BuildReport,
  BuildSpec,
  BuildSpecInput,
  BuildSpecInteraction,
  BuildSpecOperation,
  BuildSpecOutput,
  BuildSpecVariable,
  BuildSpecWidget,
  BuildStage,
  BuildSupervision,
  CompletedInteraction,
  JudgeInteractionVerdict,
  JudgeRecord,
  StageRecord
} from "./app-build/types.js";
export {
  BUILD_SPEC_SCHEMA,
  buildSpecPrompt,
  operationsExercised,
  parseBuildSpec,
  resolveSpecWidget,
  runSpecStage,
  specFromFile,
  validateBuildSpec
} from "./app-build/spec.js";
export type { SpecStageOptions, SpecStageResult } from "./app-build/spec.js";
export { completeInteractions } from "./app-build/interactions.js";
export {
  runAuthorStage,
  renderAuthorSystemPrompt,
  renderComplaintPrompt,
  AUTHORED_APP_ID,
  DEFAULT_AUTHOR_TURNS
} from "./app-build/author.js";
export type {
  AuthorStageOptions,
  AuthorStageResult,
  AuthorWorkflow
} from "./app-build/author.js";
export {
  buildApp,
  DEFAULT_MAX_REPAIRS,
  DEFAULT_BUILD_TIMEOUT_MS,
  DEFAULT_BUILD_COST_CAP_USD
} from "./app-build/build.js";
export type {
  BuildAppOptions,
  BuildJudgeOptions,
  BuildLedgerAttribution
} from "./app-build/build.js";
export {
  DEFAULT_JUDGE_TIMEOUT_MS,
  JUDGE_MODEL_CANDIDATES,
  judgeInteraction,
  parseJudgeAnswer,
  renderJudgePrompt,
  resolveJudgeModelSpec,
  runJudgeStage
} from "./app-build/judge.js";
export type {
  JudgeInteractionInput,
  JudgeModelResolution,
  JudgeStageOptions,
  JudgeWidgetState
} from "./app-build/judge.js";
export { renderBuildReportMarkdown } from "./app-build/markdown.js";
// The build as a service: what `POST /api/applications/build` calls, minus
// request parsing.
export { runApplicationBuild } from "./app-build/build-service.js";
export type {
  AppBuildDeps,
  AppBuildRequest
} from "./app-build/build-service.js";

// The Code-body executor `run_code`/`test_code` share (hermetic), and what
// the JS-script run endpoint executes a script document with (with the
// Code-node toolbelt).
export { runCodeBody } from "./capabilities/code.js";
export { createJsScriptAppRunner } from "./js-script-app-runner.js";
export type { HarnessRunResult } from "./capabilities/code.js";
