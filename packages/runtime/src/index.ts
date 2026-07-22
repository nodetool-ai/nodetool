/**
 * @nodetool-ai/runtime – Public API
 */

export {
  ProcessingContext,
  MemoryCache,
  InMemoryStorageAdapter,
  FileStorageAdapter,
  S3StorageAdapter,
  resolveWorkspacePath,
  type AssetOutputMode,
  type CacheAdapter,
  type FolderAssetEntry,
  type ProcessingContextModelInterfaces,
  type InjectedTool,
  type S3Client,
  type StorageAdapter
} from "./context.js";
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
export { createPythonBridge } from "./python-bridge-factory.js";
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
  extractImageRegion
} from "./image-codec.js";
export type { ImageRegion } from "./image-codec.js";
export { PythonNodeExecutor } from "./python-node-executor.js";
export {
  connectPythonBridgeForGraph,
  resolvePythonNodeExecutor
} from "./python-graph-resolver.js";
export { loadMediaRefBytes, type MediaRefValue } from "./media-ref-bytes.js";
export {
  assetRefToPromptToken,
  classifyAssetToken,
  classifyTextToken,
  expandAssetReferences,
  expandEntityRefs,
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
  type InjectedAssetRef
} from "./prompt-asset-refs.js";
export { logPythonWorkerStderr } from "./python-worker-stderr.js";
export {
  type NodeExecutor,
  type StreamingInputs,
  type StreamingOutputs,
  type MessageEnvelopeLike
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
