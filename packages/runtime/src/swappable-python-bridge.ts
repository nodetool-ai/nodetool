/**
 * A {@link PythonBridge} that delegates every call to a current target bridge
 * and re-emits the target's events. Swapping the target is transparent to
 * holders of the reference: callers keep one stable handle whose behavior
 * follows the active worker.
 *
 * `swap()` only re-points event forwarding — it never connects or closes a
 * bridge. The owner of the lifecycle (the server) connects a worker bridge
 * before swapping it in and closes it after swapping away.
 */

import { EventEmitter } from "node:events";

import type {
  PythonBridge,
  ExecuteResult,
  ExecuteInputBlobs,
  ProgressEvent,
  PythonNodeMetadata,
  PythonWorkerLoadError,
  PythonWorkerStatus,
  PythonProviderInfo,
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
import type { ASRResult } from "./providers/types.js";

/**
 * Events re-emitted from the active target. The set is the union of what the
 * bridges emit (stderr, exit, progress, activity, reconnected) and what
 * consumers listen for (error, stdout). `"error"` is special-cased below.
 */
const FORWARDED_EVENTS = [
  "stderr",
  "stdout",
  "error",
  "exit",
  "activity",
  "progress",
  "reconnected"
] as const;

export class SwappableBridge extends EventEmitter implements PythonBridge {
  private _target: PythonBridge;
  // Bound forwarders kept so listeners can be removed on swap.
  private readonly _forwarders = new Map<
    string,
    (...args: unknown[]) => void
  >();

  constructor(initial: PythonBridge) {
    super();
    this._target = initial;
    for (const event of FORWARDED_EVENTS) {
      this._forwarders.set(event, (...args: unknown[]) => {
        if (event === "error") {
          // Re-emitting "error" with no listener throws on an EventEmitter;
          // swallow it instead (a no-listener error must not crash the server).
          if (this.listenerCount("error") > 0) {
            this.emit("error", ...args);
          }
          return;
        }
        this.emit(event, ...args);
      });
    }
    this._subscribe(initial);
  }

  /** The currently-delegated target (the server compares this to the local bridge). */
  get target(): PythonBridge {
    return this._target;
  }

  /** Swap the delegate. Re-points event forwarding; does NOT close either bridge. */
  swap(next: PythonBridge): void {
    if (next === this._target) return;
    this._unsubscribe(this._target);
    this._target = next;
    this._subscribe(next);
  }

  private _subscribe(target: PythonBridge): void {
    for (const [event, forwarder] of this._forwarders) {
      target.on(event, forwarder);
    }
  }

  private _unsubscribe(target: PythonBridge): void {
    for (const [event, forwarder] of this._forwarders) {
      target.off(event, forwarder);
    }
  }

  // ── Delegated PythonBridge surface ─────────────────────────────────────

  connect(): Promise<void> {
    return this._target.connect();
  }

  ensureConnected(): Promise<void> {
    return this._target.ensureConnected();
  }

  execute(
    nodeType: string,
    fields: Record<string, unknown>,
    secrets: Record<string, string>,
    blobs: ExecuteInputBlobs,
    onProgress?: (event: ProgressEvent) => void
  ): Promise<ExecuteResult> {
    return this._target.execute(nodeType, fields, secrets, blobs, onProgress);
  }

  executeStream(
    nodeType: string,
    fields: Record<string, unknown>,
    secrets: Record<string, string>,
    blobs: ExecuteInputBlobs,
    onProgress?: (event: ProgressEvent) => void
  ): AsyncGenerator<ExecuteResult> {
    return this._target.executeStream(
      nodeType,
      fields,
      secrets,
      blobs,
      onProgress
    );
  }

  cancel(requestId: string): void {
    this._target.cancel(requestId);
  }

  getNodeMetadata(): PythonNodeMetadata[] {
    return this._target.getNodeMetadata();
  }

  getLoadErrors(): PythonWorkerLoadError[] {
    return this._target.getLoadErrors();
  }

  getWorkerStatus(): Promise<PythonWorkerStatus> {
    return this._target.getWorkerStatus();
  }

  hasNodeType(nodeType: string): boolean {
    return this._target.hasNodeType(nodeType);
  }

  get isConnected(): boolean {
    return this._target.isConnected;
  }

  isAvailable(): boolean {
    return this._target.isAvailable();
  }

  listProviders(): Promise<PythonProviderInfo[]> {
    return this._target.listProviders();
  }

  getProviderModels(
    providerId: string,
    modelType: string,
    secrets?: Record<string, string>
  ): Promise<Record<string, unknown>[]> {
    return this._target.getProviderModels(providerId, modelType, secrets);
  }

  providerGenerate(
    providerId: string,
    messages: Record<string, unknown>[],
    model: string,
    options?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return this._target.providerGenerate(providerId, messages, model, options);
  }

  providerStream(
    providerId: string,
    messages: Record<string, unknown>[],
    model: string,
    options?: Record<string, unknown>
  ): AsyncGenerator<Record<string, unknown>> {
    return this._target.providerStream(providerId, messages, model, options);
  }

  providerTTS(
    providerId: string,
    text: string,
    model: string,
    options?: Record<string, unknown>
  ): AsyncGenerator<Uint8Array> {
    return this._target.providerTTS(providerId, text, model, options);
  }

  providerTextToImage(
    providerId: string,
    params: Record<string, unknown>,
    secrets?: Record<string, string>
  ): Promise<Uint8Array> {
    return this._target.providerTextToImage(providerId, params, secrets);
  }

  providerImageToImage(
    providerId: string,
    image: Uint8Array,
    params: Record<string, unknown>,
    secrets?: Record<string, string>
  ): Promise<Uint8Array> {
    return this._target.providerImageToImage(providerId, image, params, secrets);
  }

  providerASR(
    providerId: string,
    audio: Uint8Array,
    model: string,
    options?: Record<string, unknown>
  ): Promise<ASRResult> {
    return this._target.providerASR(providerId, audio, model, options);
  }

  providerEmbedding(
    providerId: string,
    text: string | string[],
    model: string,
    dimensions?: number
  ): Promise<number[][]> {
    return this._target.providerEmbedding(providerId, text, model, dimensions);
  }

  listCachedModels(): Promise<UnifiedModelLike[]> {
    return this._target.listCachedModels();
  }

  downloadModel(
    req: ModelDownloadRequest,
    onProgress: (update: ModelDownloadUpdate) => void,
    requestId?: string
  ): Promise<void> {
    return this._target.downloadModel(req, onProgress, requestId);
  }

  cancelModelDownload(requestId: string): void {
    this._target.cancelModelDownload(requestId);
  }

  deleteCachedModel(repoId: string): Promise<boolean> {
    return this._target.deleteCachedModel(repoId);
  }

  supportsModelManagement(): boolean {
    return this._target.supportsModelManagement();
  }

  supportsComfy(): boolean {
    return this._target.supportsComfy();
  }

  getComfyStatus(): ComfyStatusInfo | null {
    return this._target.getComfyStatus();
  }

  comfyExecute(
    prompt: Record<string, unknown>,
    options?: ComfyExecuteOptions,
    onEvent?: (event: ComfyEvent) => void,
    requestId?: string
  ): Promise<ComfyExecuteResult> {
    return this._target.comfyExecute(prompt, options, onEvent, requestId);
  }

  cancelComfyExecute(requestId: string): void {
    this._target.cancelComfyExecute(requestId);
  }

  comfyQueue(): Promise<Record<string, unknown>> {
    return this._target.comfyQueue();
  }

  comfyInterrupt(): Promise<void> {
    return this._target.comfyInterrupt();
  }

  comfyCancelPrompt(promptId: string): Promise<void> {
    return this._target.comfyCancelPrompt(promptId);
  }

  comfyUpload(
    filename: string,
    bytes: Uint8Array,
    options?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return this._target.comfyUpload(filename, bytes, options);
  }

  comfyView(
    filename: string,
    options?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return this._target.comfyView(filename, options);
  }

  comfyObjectInfo(): Promise<Record<string, unknown>> {
    return this._target.comfyObjectInfo();
  }

  comfySystemStats(): Promise<Record<string, unknown>> {
    return this._target.comfySystemStats();
  }

  comfyStatus(): Promise<ComfyStatusInfo> {
    return this._target.comfyStatus();
  }

  comfyFree(options?: Record<string, unknown>): Promise<void> {
    return this._target.comfyFree(options);
  }

  comfyModelsList(folder?: string): Promise<ComfyModelInfo[]> {
    return this._target.comfyModelsList(folder);
  }

  comfyModelsDownload(
    req: ComfyModelDownloadRequest,
    onProgress: (update: ComfyModelDownloadUpdate) => void,
    requestId?: string
  ): Promise<void> {
    return this._target.comfyModelsDownload(req, onProgress, requestId);
  }

  comfyModelsDelete(folder: string, filename: string): Promise<boolean> {
    return this._target.comfyModelsDelete(folder, filename);
  }

  getRecentStderrSummary(limit?: number): string | null {
    return this._target.getRecentStderrSummary(limit);
  }

  close(): void {
    this._target.close();
  }
}
