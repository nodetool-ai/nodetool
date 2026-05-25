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
  PythonStdioBridge,
  type PythonBridgeOptions,
  type PythonNodeMetadata,
  type ExecuteResult,
  type ProgressEvent,
  type PythonWorkerLoadError,
  type PythonWorkerStatus
} from "./python-stdio-bridge.js";
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
  encodeRawImageRef
} from "./image-codec.js";
export { PythonNodeExecutor } from "./python-node-executor.js";
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
export { executeComfy } from "./comfy-executor.js";
export type {
  ComfyExecutorResult,
  ComfyImage,
  ComfyProgressEvent,
  ComfyExecutionHandle
} from "./comfy-executor.js";
export { RECOMMENDED_MODELS } from "./recommended-models.js";
export type { RecommendedUnifiedModel } from "./recommended-models.js";
export { clearProviderCache, getProviderCacheVersion } from "./provider-cache.js";
