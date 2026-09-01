/**
 * @nodetool-ai/runtime – Public API
 */

export {
  ProcessingContext,
  ACTIVE_MODEL_CONTEXT_KEY,
  type ActiveModelSelection,
  MemoryCache,
  InMemoryStorageAdapter,
  FileStorageAdapter,
  S3StorageAdapter,
  resolveWorkspacePath,
  setDefaultModelInterfaces,
  getDefaultModelInterfaces,
  type AssetOutputMode,
  type CacheAdapter,
  type AssetInfoEntry,
  type FolderAssetEntry,
  type ProcessingContextModelInterfaces,
  type InjectedTool,
  type S3Client,
  type StorageAdapter,
  type StorageEntry,
  type StorageListResult,
  type StorageStat
} from "./context.js";

// The run's workspace, as an interface over any storage backend. Importing
// `storage-workspace.js` here also installs the factory ProcessingContext uses
// to build a workspace from a plain `workspaceDir`.
export {
  WorkspacePathError,
  WorkspaceNotLocalError,
  observeWorkspace,
  type Workspace,
  type WorkspaceChange,
  type WorkspaceEntry,
  type WorkspaceStat
} from "./workspace.js";
export {
  StorageWorkspace,
  createWorkspace,
  createLocalWorkspace
} from "./storage-workspace.js";
export { PrefixedStorageAdapter } from "./prefixed-storage-adapter.js";
export type { SandboxModuleCatalog } from "./sandbox-module-catalog.js";
export {
  getProcessSandboxModuleCatalog,
  refuseSandboxDelivery,
  setProcessSandboxModuleCatalog
} from "./sandbox-module-catalog.js";
export {
  AgentMemory,
  memoryKeys,
  type MemoryEntry,
  type MemoryFilter,
  type MemoryKind,
  type MemoryListener
} from "./agent-memory.js";

export * from "./providers/index.js";
export {
  initTelemetry,
  shutdownTelemetry,
  getTracer,
  type TelemetryOptions
} from "./telemetry.js";
export {
  spanToRecord,
  JsonlFileSpanExporter,
  StdoutSpanExporter,
  type TraceRecord,
  type StdoutFormat
} from "./trace-exporters.js";
export {
  withAgentSpan,
  withAgentSpanGen,
  withSpan,
  withWorkflowSpan,
  withNodeSpan,
  withSpanGen,
  setLastUsage,
  consumeLastUsage,
  peekLastUsage,
  createUsageSlot,
  type AgentSpanKind,
  type LlmUsage
} from "./tracing-helpers.js";
export {
  RecoverableNodeError,
  isRecoverableNodeError
} from "./recoverable-node-error.js";
export {
  createInvocationAccount,
  inInvocationAccount,
  recordInvocationCost,
  recordInvocationAsset,
  currentInvocationAccount,
  type InvocationAccount
} from "./invocation-account.js";
export {
  CostCappedTurnBudget,
  CompositeTurnBudget,
  createRunBudget,
  createDeadline,
  createSemaphore,
  createCounter,
  isRunBudget,
  budgetFromContext,
  RUN_BUDGET_CONTEXT_KEY,
  BUDGET_EXHAUSTION_KINDS,
  TURN_REFUSALS,
  type TurnBudget,
  type TurnReservation,
  type CostCappedTurnBudgetOptions,
  type CompositeTurnBudgetOptions,
  type CreateRunBudgetOptions,
  type RunBudget,
  type BudgetExhaustion,
  type BudgetExhaustionKind,
  type TurnRefusal,
  type Deadline,
  type Semaphore,
  type Release,
  type Counter
} from "./turn-budget.js";
export { packContext, type PackedContext } from "./context-packer.js";
export {
  isZodSchema,
  parseWithTypeCoercion,
  zodToJsonSchema,
  type JsonSchema,
  type ZodOrJsonSchema
} from "./zod-schema.js";
export { VariableChannel } from "./variable-channel.js";
export { countTokens, truncateToTokens } from "./token-counter.js";
export {
  PythonStdioBridge,
  type PythonBridgeOptions,
  type PythonNodeMetadata,
  type ExecuteResult,
  type ProgressEvent,
  type PythonWorkerLoadError,
  type PythonWorkerStatus
} from "./python-stdio-bridge.js";
import { PythonBridgeBase } from "./python-bridge-base.js";
export { PythonBridgeBase };
export type {
  UnifiedModelLike,
  ExecuteIdentity,
  JobBoundary,
  PythonJobLifecycle,
  ModelEvictRequest,
  ModelEvictResult,
  ModelDownloadRequest,
  ModelDownloadUpdate,
  ComfyStatusInfo,
  ComfyEvent,
  ComfyExecuteOptions,
  ComfyExecuteResult,
  ComfyModelDownloadRequest,
  ComfyModelDownloadUpdate,
  ComfyModelInfo
} from "./python-bridge-types.js";
export {
  WebsocketPythonBridge,
  type WebsocketPythonBridgeOptions
} from "./python-websocket-bridge.js";
export {
  createPythonBridge,
  onPythonBridgeCreated
} from "./python-bridge-factory.js";
export type { PythonBridgeObserver } from "./python-bridge-factory.js";
export {
  encodeFrame,
  FrameDecoder,
  FrameSizeError,
  DEFAULT_MAX_BRIDGE_FRAME_SIZE,
  type FrameDecoderOptions
} from "./python-bridge-framing.js";
export { SwappableBridge } from "./swappable-python-bridge.js";
/**
 * Transport-agnostic public handle for a Python worker bridge. An interface
 * (not the concrete base) so both the stdio/WebSocket bridges and the
 * {@link SwappableBridge} wrapper satisfy it — consumers hold one stable
 * reference whose behavior follows the active worker.
 */
export type { PythonBridge } from "./python-bridge-types.js";
// Public API re-export — the source of truth lives in @nodetool-ai/protocol
// so the Electron main bundle (which can't pull in the runtime barrel) and
// any other thin consumer can read these constants without dragging the
// providers in. Internal callers should import from protocol directly.
export {
  BRIDGE_PROTOCOL_VERSION,
  MIN_NODETOOL_CORE_VERSION
} from "@nodetool-ai/protocol/bridge-protocol";
export {
  encodeRawRgbaToPng,
  encodeRawImageRef,
  extractImageRegion,
  rasterizeSvg
} from "./image-codec.js";
export type { ImageRegion } from "./image-codec.js";
export { PythonNodeExecutor } from "./python-node-executor.js";
export {
  connectPythonBridgeForGraph,
  resolvePythonNodeExecutor
} from "./python-graph-resolver.js";
export { loadMediaRefBytes, type MediaRefValue } from "./media-ref-bytes.js";
export {
  fetchExternalMedia,
  privateMediaFetchAllowed
} from "./external-media-fetch.js";
export {
  assetRefToPromptToken,
  classifyAssetToken,
  classifyTextToken,
  expandAssetReferences,
  expandEntityRefs,
  expandEntitiesForGeneration,
  findAssetRefs,
  findImageAssetRefs,
  findTextAssetRefs,
  inlineTextAssetRefs,
  stripAssetRefs,
  mapPromptAssetsToInputs,
  type AssetMediaKind,
  type PromptAssetRef,
  type TextAssetRef,
  type PromptAssetTextField,
  type PromptAssetInputField,
  type InjectedAssetRef,
  type EntityRefResolver,
  type ExpandedEntityPrompt
} from "./prompt-asset-refs.js";
export { logPythonWorkerStderr } from "./python-worker-stderr.js";
export {
  type NodeExecutor,
  type StreamingInputs,
  type StreamingOutputs,
  type MessageEnvelopeLike,
  type TriggerEvent
} from "./node-executor.js";
export {
  createFakeContext,
  stubGlobalFetch,
  type FakeContextHandle,
  type FakeContextOptions
} from "./testing.js";
export { executeComfy, uploadComfyFile } from "./comfy-executor.js";
export type {
  ComfyExecutorResult,
  ComfyImage,
  ComfyFileOutput,
  ComfyNodeOutputs,
  ComfyProgressEvent,
  ComfyExecutionHandle
} from "./comfy-executor.js";
export { RECOMMENDED_MODELS } from "./recommended-models.js";
export type { RecommendedUnifiedModel } from "./recommended-models.js";
export { clearProviderCache, getProviderCacheVersion } from "./provider-cache.js";
export {
  registerCostReconciler,
  getCostReconciler
} from "./cost-reconciler.js";
export type {
  CostReconciler,
  CostReconcileInput,
  ReconciledCost
} from "./cost-reconciler.js";
export * from "./google/index.js";
