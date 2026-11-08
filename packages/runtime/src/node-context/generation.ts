/**
 * The generation envelope behind `NodeContext.runGeneration`,
 * `runProviderPrediction`, `streamProviderPrediction`, `textToSpeechEncoded`,
 * `textToMusic` and `audioToAudio`: the prediction messages, the receipt
 * scope, the durable lifecycle callbacks, persistence and the content-filter
 * retry, over a {@link GenerationHost}. See `context-host.ts` for the host
 * contract and the QuickJS constraints.
 */
import type {
  AssetRef,
  GenerationOrigin,
  GenerationReceipt,
  ProcessingMessage
} from "@nodetool-ai/protocol";
import { buildAssetGenerationMetadata, isRecord } from "@nodetool-ai/protocol";
import type {
  GenerationRequest,
  GenerationResult,
  GenerationRunOptions,
  ProviderCapability,
  ProviderPredictionRequest
} from "../context.js";
import {
  GenerationScopeError,
  type GenerationProviderRequestOptions,
  isAuthoritativeProviderTerminalError,
  runWithGenerationReceipt
} from "../generation-receipt.js";
import type { GenerationDelivery } from "../generation-registry.js";
import {
  redactGenerationOutput,
  redactGenerationParams
} from "../redact-params.js";
import type { BaseProvider } from "../providers/base-provider.js";
import {
  CONTENT_FILTER_MAX_RETRIES,
  contentFilterRetryDelayMs,
  isContentFilterRefusal
} from "../providers/content-filter.js";
import { extForImageMime, sniffImageMime } from "../providers/image-mime.js";
import type {
  EncodedAudioResult,
  Message,
  ProviderStreamItem
} from "../providers/types.js";
import { withSpan } from "../tracing-helpers.js";
import type { GenerationContext, GenerationHost } from "./context-host.js";
import { dispatchCapability } from "./provider-dispatch.js";

export type PredictionStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

function randomUUID(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `id_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

/**
 * Resolves after `delayMs`, or rejects with the signal's reason when it
 * aborts first. The context's HTTP retries use it too.
 */
export function waitForRetry(
  delayMs: number,
  signal?: AbortSignal | null
): Promise<void> {
  return new Promise((resolveWait, rejectWait) => {
    if (signal?.aborted) {
      rejectWait(signal.reason ?? new Error("HTTP request aborted"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      rejectWait(signal?.reason ?? new Error("HTTP request aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolveWait();
    }, delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Raised by a durable host when an idempotent request is already owned. */
export class GenerationAlreadyAcceptedError extends Error {
  constructor(readonly generationId: string) {
    super(`Generation ${generationId} was already accepted`);
    this.name = "GenerationAlreadyAcceptedError";
  }
}

export function emitPrediction(
  context: GenerationContext,
  status: PredictionStatus,
  req: ProviderPredictionRequest,
  id: string,
  data?: unknown,
  error?: string,
  startedAt?: number,
  extra?: {
    origin?: GenerationOrigin;
    asset_ids?: string[];
    receipt?: GenerationReceipt | null;
  }
): void {
  const message: Extract<ProcessingMessage, { type: "prediction" }> = {
    type: "prediction",
    id,
    user_id: context.userId,
    node_id: req.nodeId ?? "",
    workflow_id: req.workflowId ?? context.workflowId ?? null,
    provider: req.provider,
    model: req.model,
    capability: req.capability,
    status,
    // Redacted: bytes and data URLs become their length. The row stores
    // this bag and every listener receives it.
    params: redactGenerationParams(req.params),
    data: data ?? null,
    error: error ?? null,
    duration: startedAt ? Date.now() - startedAt : null,
    origin: extra?.origin ?? generationOrigin(context, req),
    receipt: extra?.receipt ?? null
  };
  // Only a terminal message names assets; `running` has none to name.
  if (extra?.asset_ids) message.asset_ids = extra.asset_ids;
  context.emit(message);
}

/**
 * Who asked, defaulted from the context: a chat turn names its thread, a
 * run names its job and node. A capability passes `surface` and its
 * `tool_call_id` explicitly, the one id the context does not hold.
 */
function generationOrigin(
  context: GenerationContext,
  req: ProviderPredictionRequest,
  override?: Partial<GenerationOrigin>
): GenerationOrigin {
  const base: GenerationOrigin = context.threadId
    ? {
        surface: "chat",
        thread_id: context.threadId,
        job_id: context.jobId || null,
        node_id: req.nodeId ?? null
      }
    : {
        surface: "workflow",
        job_id: context.jobId || null,
        node_id: req.nodeId ?? null
      };
  if (!override) return base;
  const merged: GenerationOrigin = { ...base };
  if (override.surface !== undefined) merged.surface = override.surface;
  if (override.thread_id !== undefined) merged.thread_id = override.thread_id;
  if (override.tool_call_id !== undefined)
    merged.tool_call_id = override.tool_call_id;
  if (override.request_id !== undefined)
    merged.request_id = override.request_id;
  if (override.job_id !== undefined) merged.job_id = override.job_id;
  if (override.node_id !== undefined) merged.node_id = override.node_id;
  return merged;
}

/**
 * Run one generation: open the record, call the provider inside a receipt
 * scope, persist what came back, close the record. Every terminal state is
 * a message — `completed`, `failed`, `cancelled` — and the tracker turns
 * those into the row. Design: docs/media-generation-tracking-design.md § 5.
 */
export async function runGeneration(
  host: GenerationHost,
  req: GenerationRequest
): Promise<GenerationResult> {
  return runGenerationWith(host, req, (provider, signal) => {
    if (!provider) {
      throw new Error("Provider generation requires a provider.");
    }
    const dispatchReq: ProviderPredictionRequest = {
      ...req,
      params: { ...(req.params ?? {}), signal }
    };
    return retryContentFilterRefusal(host.context, req, () =>
      dispatchCapability(host.context, provider, dispatchReq)
    );
  });
}

/**
 * The generation envelope around an arbitrary provider call: the same
 * record, receipt scope, persistence and terminal messages as
 * {@link runGeneration}, for a caller whose call shape the capability
 * switch has no case for — N images in one request, streamed PCM wrapped
 * into a WAV. `call` receives the provider and the generation's abort
 * signal; what it returns is the output, and its media buffers are what
 * `persist` saves.
 */
export async function runGenerationWith<T>(
  host: GenerationHost,
  req: GenerationRequest,
  call: (provider: BaseProvider | null, signal: AbortSignal) => Promise<T>,
  opts?: GenerationRunOptions
): Promise<GenerationResult<T>> {
  const id = req.id ?? randomUUID();
  return withSpan("generation", { "generation.id": id, "generation.provider": req.provider, "generation.kind": req.capability }, async () => {
  const startedAt = Date.now();
  const origin = generationOrigin(host.context, req, req.origin);
  const controller = new AbortController();
  const signals: AbortSignal[] = [controller.signal, host.context.signal];
  if (req.signal) signals.push(req.signal);
  const signal = AbortSignal.any(signals);
  const accept =
    opts?.onGenerationAccepted ??
    host.lifecycle?.onGenerationAccepted;
  const terminal =
    opts?.onGenerationTerminal ??
    host.lifecycle?.onGenerationTerminal;
  let durableAccepted = false;
  let terminalAttempted = false;
  try {
    const accepted = await accept?.({ generationId: id, request: req });
    if (accepted?.skipProvider) {
      throw new GenerationAlreadyAcceptedError(
        accepted.existingGenerationId ?? id
      );
    }
    durableAccepted = accepted?.durable === true;
    host.registry.register(id, {
      userId: host.context.userId,
      abort: () => controller.abort(new Error("Generation cancelled"))
    });
    emitPrediction(host.context, "running", req, id, null, undefined, startedAt, {
      origin
    });
    const provider = opts?.withoutProvider
      ? null
      : await host.context.getProvider(req.provider);
    const {
      value: output,
      receipt: recorded,
      providerResult
    } = await runWithGenerationReceipt(() => call(provider, signal), {
      providerRequestOptions: accepted ?? undefined,
      onProviderRequestAccepted:
        opts?.onProviderRequestAccepted ??
        host.lifecycle?.onProviderRequestAccepted,
      onProviderRequestBound:
        opts?.onProviderRequestBound ??
        host.lifecycle?.onProviderRequestBound
    });
    const encoded = encodedAudioOf(output);
    const persistedAssets = req.persist
      ? await persistGenerationBytes(host.context, 
          id,
          req,
          encoded ? [encoded.data] : mediaBuffers(output),
          encoded?.mimeType
        )
      : [];
    const assets = persistedAssets.filter(
      (asset): asset is AssetRef => asset !== null
    );
    let delivery: GenerationDelivery | undefined;
    if (opts?.finalizeOutput) {
      try {
        delivery = await opts.finalizeOutput(output, assets);
      } catch (error) {
        delivery = {
          status: "failed",
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
    const deliveryFields: { delivery?: GenerationDelivery } = {};
    if (delivery) {
      deliveryFields.delivery = delivery;
    }
    const late = opts?.receiptAfterPersist?.() ?? null;
    const receipt: GenerationReceipt | null =
      late || recorded ? { ...(recorded ?? {}), ...(late ?? {}) } : null;
    const assetIds = assets
      .map((asset) => asset.asset_id)
      .filter((assetId): assetId is string => typeof assetId === "string");
    const durableAssetIds = persistedAssets.map(
      (asset) => asset?.asset_id ?? null
    );
    try {
      terminalAttempted = true;
      await terminal?.({
        generationId: id,
        request: req,
        status: "completed",
        output: providerResult ?? output,
        receipt,
        assetIds: durableAssetIds,
        ...deliveryFields
      });
    } catch (terminalError) {
      host.context.emit({
        type: "log_update",
        node_id: req.nodeId ?? "",
        node_name: req.nodeId ?? "",
        workflow_id: req.workflowId ?? host.context.workflowId ?? null,
        severity: "warning",
        content: `Generation ${id} completed but durable finalization will be recovered: ${terminalError instanceof Error ? terminalError.message : String(terminalError)}`
      });
    }
    emitPrediction(host.context, 
      "completed",
      req,
      id,
      delivery ? { delivery } : generationResultData(req.capability, output),
      undefined,
      startedAt,
      { origin, asset_ids: assetIds, receipt }
    );
    host.registry.settle(id, {
      status: "completed",
      asset_ids: assetIds,
      receipt,
      ...deliveryFields
    });
    return {
      id,
      output,
      assets,
      receipt,
      duration_ms: Date.now() - startedAt,
      ...deliveryFields
    };
  } catch (error) {
    const cause = error instanceof GenerationScopeError ? error.cause : error;
    const receipt =
      error instanceof GenerationScopeError ? error.receipt : null;
    const providerResult =
      error instanceof GenerationScopeError
        ? error.providerResult
        : undefined;
    const message = cause instanceof Error ? cause.message : String(cause);
    if (cause instanceof GenerationAlreadyAcceptedError) {
      throw cause;
    }
    const status: PredictionStatus = signal.aborted
      ? durableAccepted
        ? "running"
        : "cancelled"
      : durableAccepted && !isAuthoritativeProviderTerminalError(cause)
        ? "running"
        : "failed";
    if (durableAccepted && !terminalAttempted) {
      try {
        terminalAttempted = true;
        await terminal?.({
          generationId: id,
          request: req,
          status: isAuthoritativeProviderTerminalError(cause)
            ? "failed"
            : "recovering",
          output: providerResult,
          error: message,
          receipt,
          assetIds: []
        });
      } catch {
        // The provider observation remains authoritative. The durable row
        // can be finalized by the recovery worker.
      }
    }
    if (host.insideAppRun() && !durableAccepted && !terminalAttempted) {
      try {
        terminalAttempted = true;
        await terminal?.({
          generationId: id,
          request: req,
          status: signal.aborted ? "cancelled" : "failed",
          error: message,
          receipt,
          assetIds: []
        });
      } catch {
        // Preserve the provider failure; the live ledger can retry its write.
      }
    }
    emitPrediction(host.context, status, req, id, null, message, startedAt, {
      origin,
      receipt
    });
    host.registry.settle(id, {
      status,
      error: message,
      asset_ids: [],
      receipt
    });
    throw cause;
  }
  });
}

/**
 * Save a generation's media output as assets, stamping the generation id
 * on each. Bytes only: a segmentation result, a transcript or an embedding
 * is a result and stays on the message.
 */
async function persistGenerationBytes(
  context: GenerationContext,
  id: string,
  req: GenerationRequest,
  buffers: Uint8Array[],
  mimeOverride?: string
): Promise<Array<AssetRef | null>> {
  if (!context.hasModelInterface("createAsset")) {
    return buffers.map(() => null);
  }
  const assets: Array<AssetRef | null> = [];
  // The prompt and settings ride on the asset, not only on the ledger row:
  // the row has its own retention and lives in another table, while the
  // asset is what somebody opens weeks later to make a variant.
  const provenance = buildAssetGenerationMetadata({
    prompt: req.params?.prompt,
    provider: req.provider,
    model: req.model,
    capability: req.capability,
    params: req.params
  });
  const metadata = { generation_id: id, ...provenance };
  for (const [index, bytes] of buffers.entries()) {
    const mime =
      req.persist?.mime ??
      mimeOverride ??
      generationMime(req.capability, bytes);
    const ext = extForGenerationMime(mime);
    // The asset's `uri` takes its extension from the name, so a caller's
    // bare name (`shot-1-still`) gets the one the bytes have; otherwise the
    // row reads `asset://<id>` while this result says `asset://<id>.<ext>`.
    const persistName =
      req.persist?.name && !/\.[a-z0-9]+$/i.test(req.persist.name)
        ? `${req.persist.name}.${ext}`
        : req.persist?.name;
    const name =
      buffers.length === 1 || !persistName
        ? (persistName ?? `${req.capability}-${startedName(id)}.${ext}`)
        : persistName.replace(/(\.[a-z0-9]+)?$/i, `-${index + 1}$1`);
    try {
      const created = await context.createAsset({
        name,
        contentType: mime,
        content: bytes,
        parentId: req.persist?.parentId ?? null,
        nodeId: req.nodeId ?? null,
        metadata: { ...metadata }
      });
      const assetId =
        isRecord(created) && typeof created.id === "string"
          ? created.id
          : null;
      if (!assetId) {
        assets.push(null);
        continue;
      }
      assets.push({
        type: assetRefType(mime),
        uri: `asset://${assetId}.${ext}`,
        asset_id: assetId,
        metadata: { ...metadata }
      });
    } catch (error) {
      assets.push(null);
      // The generation happened and was billed; a failed save must not turn
      // it into a failed generation. The caller still gets the bytes.
      context.emit({
        type: "log_update",
        node_id: req.nodeId ?? "",
        node_name: req.nodeId ?? "",
        workflow_id: req.workflowId ?? context.workflowId ?? null,
        severity: "warning",
        content: `Generated ${mime} could not be saved as an asset: ${
          error instanceof Error ? error.message : String(error)
        }`
      });
    }
  }
  return assets;
}

/**
 * Run a prediction, retrying a content-filter refusal a bounded number of
 * times. The filter is non-deterministic — Veo refused one shot of a
 * five-shot trailer on an ordinary cinematic prompt and passed the same
 * prompt on retry — and a refused take is not charged, so the cheap answer to
 * a refusal is to ask again before failing the node that asked.
 *
 * A refusal that survives the retries is rethrown as-is, so the kernel can
 * still drop the item rather than the run.
 */
async function retryContentFilterRefusal<T>(
  context: GenerationContext,
  req: ProviderPredictionRequest,
  attemptFn: () => Promise<T>
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await attemptFn();
    } catch (error) {
      if (
        !isContentFilterRefusal(error) ||
        attempt > CONTENT_FILTER_MAX_RETRIES
      ) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      context.emit({
        type: "log_update",
        node_id: req.nodeId ?? "",
        node_name: req.nodeId ?? "",
        workflow_id: req.workflowId ?? context.workflowId ?? null,
        severity: "warning",
        content: `${req.provider}/${req.model} content-filtered this request (attempt ${attempt} of ${CONTENT_FILTER_MAX_RETRIES + 1}); retrying. ${message}`
      });
      await waitForRetry(contentFilterRetryDelayMs(attempt), context.signal);
    }
  }
}

/**
 * Generate speech as an encoded audio file (mp3/wav/…). Returns null when the
 * provider doesn't implement the encoded path. Used for providers (FAL, KIE,
 * ElevenLabs) that return audio files instead of streaming PCM.
 */
export async function textToSpeechEncoded(
  host: GenerationHost,
  req: GenerationRequest
): Promise<EncodedAudioResult | null> {
  return runEncodedGeneration(host, req, async (provider) => {
    const params = req.params ?? {};
    return provider.textToSpeechEncoded({
      text: String(params.text ?? ""),
      model: req.model,
      voice: params.voice as string | undefined,
      speed: params.speed as number | undefined,
      referenceAudio: params.reference_audio as Uint8Array | undefined,
      referenceText: params.reference_text as string | undefined,
      language: params.language as string | undefined,
      instructions: params.instructions as string | undefined,
      audioFormat: params.audioFormat as string | undefined
    });
  });
}

/**
 * The generation lifecycle for the encoded-audio paths: same id on every
 * message, origin on `running`, the receipt on the terminal message,
 * `cancelled` on abort. These return an encoded result rather than bytes,
 * so the caller persists.
 */
export async function runEncodedGeneration<T>(
  host: GenerationHost,
  req: GenerationRequest,
  call: (provider: BaseProvider, signal: AbortSignal) => Promise<T>
): Promise<T> {
  const id = req.id ?? randomUUID();
  const startedAt = Date.now();
  const origin = generationOrigin(host.context, req, req.origin);
  const controller = new AbortController();
  const signals: AbortSignal[] = [controller.signal, host.context.signal];
  if (req.signal) signals.push(req.signal);
  const signal = AbortSignal.any(signals);
  const accept = host.lifecycle?.onGenerationAccepted;
  const terminal = host.lifecycle?.onGenerationTerminal;
  let durableAccepted = false;
  let terminalAttempted = false;
  let accepted: GenerationProviderRequestOptions | void;
  try {
    accepted = await accept?.({ generationId: id, request: req });
    if (accepted?.skipProvider) {
      throw new GenerationAlreadyAcceptedError(
        accepted.existingGenerationId ?? id
      );
    }
    durableAccepted = accepted?.durable === true;
    host.registry.register(id, {
      userId: host.context.userId,
      abort: () => controller.abort(new Error("Generation cancelled"))
    });
    emitPrediction(host.context, "running", req, id, null, undefined, startedAt, {
      origin
    });
    const provider = await host.context.getProvider(req.provider);
    const { value, receipt, providerResult } = await runWithGenerationReceipt(
      () => call(provider, signal),
      {
        providerRequestOptions: accepted ?? undefined,
        onProviderRequestAccepted:
          host.lifecycle?.onProviderRequestAccepted,
        onProviderRequestBound:
          host.lifecycle?.onProviderRequestBound
      }
    );
    const encoded = encodedAudioOf(value);
    const persistedAssets =
      req.persist && encoded
        ? await persistGenerationBytes(host.context, 
            id,
            req,
            [encoded.data],
            encoded.mimeType
          )
        : [];
    const assets = persistedAssets.filter(
      (asset): asset is AssetRef => asset !== null
    );
    const assetIds = assets
      .map((asset) => asset.asset_id)
      .filter((assetId): assetId is string => typeof assetId === "string");
    const durableAssetIds = persistedAssets.map(
      (asset) => asset?.asset_id ?? null
    );
    try {
      terminalAttempted = true;
      await terminal?.({
        generationId: id,
        request: req,
        status: "completed",
        output: providerResult ?? value,
        receipt,
        assetIds: durableAssetIds
      });
    } catch {
      // Provider success remains authoritative even when durable finalization
      // needs a later recovery attempt.
    }
    emitPrediction(host.context, "completed", req, id, null, undefined, startedAt, {
      origin,
      asset_ids: assetIds,
      receipt
    });
    host.registry.settle(id, {
      status: "completed",
      asset_ids: assetIds,
      receipt
    });
    return value;
  } catch (error) {
    const cause = error instanceof GenerationScopeError ? error.cause : error;
    const receipt =
      error instanceof GenerationScopeError ? error.receipt : null;
    const providerResult =
      error instanceof GenerationScopeError
        ? error.providerResult
        : undefined;
    const message = cause instanceof Error ? cause.message : String(cause);
    if (cause instanceof GenerationAlreadyAcceptedError) {
      throw cause;
    }
    const status: PredictionStatus = signal.aborted
      ? durableAccepted
        ? "running"
        : "cancelled"
      : durableAccepted && !isAuthoritativeProviderTerminalError(cause)
        ? "running"
        : "failed";
    if (durableAccepted && !terminalAttempted) {
      try {
        terminalAttempted = true;
        await terminal?.({
          generationId: id,
          request: req,
          status: isAuthoritativeProviderTerminalError(cause)
            ? "failed"
            : "recovering",
          output: providerResult,
          error: message,
          receipt,
          assetIds: []
        });
      } catch {
        // Keep the provider outcome visible while durable finalization is
        // retried by the recovery worker.
      }
    }
    if (host.insideAppRun() && !durableAccepted && !terminalAttempted) {
      try {
        terminalAttempted = true;
        await terminal?.({
          generationId: id,
          request: req,
          status: signal.aborted ? "cancelled" : "failed",
          error: message,
          receipt,
          assetIds: []
        });
      } catch {
        // Preserve the provider failure; the live ledger can retry its write.
      }
    }
    emitPrediction(host.context, status, req, id, null, message, startedAt, {
      origin,
      receipt
    });
    host.registry.settle(id, {
      status,
      error: message,
      asset_ids: [],
      receipt
    });
    throw cause;
  }
}

/**
 * Generate music as an encoded audio file (mp3/wav/flac). Mirrors
 * {@link textToSpeechEncoded} for the `text_to_music` capability — the
 * provider returns a fully-encoded audio file rather than streaming PCM.
 */
export async function textToMusic(
  host: GenerationHost,
  req: GenerationRequest
): Promise<EncodedAudioResult> {
  return runEncodedGeneration(host, req, async (provider) => {
    const params = req.params ?? {};
    return provider.textToMusic({
      prompt: String(params.prompt ?? ""),
      model: { id: req.model, name: req.model, provider: req.provider },
      lyrics: params.lyrics as string | undefined,
      durationSeconds: params.duration_seconds as number | undefined,
      seed: params.seed as number | undefined,
      audioFormat: params.audioFormat as string | undefined,
      timeoutSeconds: params.timeout_seconds as number | undefined
    });
  });
}

/**
 * Rewrite a recording into another one. Mirrors {@link textToMusic} for the
 * `audio_to_audio` capability: the provider hands back an encoded file, and
 * the source bytes ride in `params.audio`.
 */
export async function audioToAudio(
  host: GenerationHost,
  req: GenerationRequest
): Promise<EncodedAudioResult> {
  return runEncodedGeneration(host, req, async (provider) => {
    const params = req.params ?? {};
    const audio = params.audio;
    if (!(audio instanceof Uint8Array) || audio.length === 0) {
      throw new Error("audio_to_audio needs source audio bytes");
    }
    return provider.audioToAudio(audio, {
      model: { id: req.model, name: req.model, provider: req.provider },
      prompt: params.prompt as string | undefined,
      voice: params.voice as string | undefined,
      strength: params.strength as number | undefined,
      seed: params.seed as number | undefined,
      audioFormat: params.audioFormat as string | undefined,
      timeoutSeconds: params.timeout_seconds as number | undefined
    });
  });
}

/**
 * A streaming generation (`generate_messages`, `text_to_speech`): `running`
 * before the first item and one terminal message after the last.
 */
export async function* streamGeneration(
  context: GenerationContext,
  req: GenerationRequest
): AsyncGenerator<ProviderStreamItem | unknown> {
  const id = req.id ?? randomUUID();
  const startedAt = Date.now();
  const origin = generationOrigin(context, req, req.origin);
  emitPrediction(context, "running", req, id, null, undefined, startedAt, {
    origin
  });
  let terminalStatusEmitted = false;
  try {
    const provider = await context.getProvider(req.provider);
    const params = req.params ?? {};

    if (req.capability === "generate_messages") {
      for await (const item of provider.generateMessagesTraced({
        messages: await context.resolveMessageMediaUris(
          (params.messages as Message[]) ?? []
        ),
        model: req.model,
        tools: params.tools as Parameters<
          BaseProvider["generateMessages"]
        >[0]["tools"],
        maxTokens: params.max_tokens as number | undefined,
        temperature: params.temperature as number | undefined,
        topP: params.top_p as number | undefined,
        presencePenalty: params.presence_penalty as number | undefined,
        frequencyPenalty: params.frequency_penalty as number | undefined,
        audio: params.audio as Record<string, unknown> | undefined,
        threadId: params.thread_id as string | undefined
      })) {
        yield item;
      }
    } else if (req.capability === "text_to_speech") {
      for await (const item of provider.textToSpeech({
        text: String(params.text ?? ""),
        model: req.model,
        voice: params.voice as string | undefined,
        speed: params.speed as number | undefined,
        referenceAudio: params.reference_audio as Uint8Array | undefined,
        referenceText: params.reference_text as string | undefined,
        language: params.language as string | undefined,
        instructions: params.instructions as string | undefined
      })) {
        yield item;
      }
    } else {
      throw new Error(`Capability '${req.capability}' is not streamable`);
    }

    emitPrediction(context, "completed", req, id, null, undefined, startedAt, {
      origin,
      asset_ids: []
    });
    terminalStatusEmitted = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status: PredictionStatus =
      context.signal.aborted || req.signal?.aborted ? "cancelled" : "failed";
    emitPrediction(context, status, req, id, null, message, startedAt, {
      origin
    });
    terminalStatusEmitted = true;
    throw error;
  } finally {
    if (!terminalStatusEmitted) {
      emitPrediction(context, "completed", req, id, null, undefined, startedAt, {
        origin,
        asset_ids: []
      });
    }
  }
}

/** The media buffers a capability result carries, if any. */
function mediaBuffers(output: unknown): Uint8Array[] {
  if (output instanceof Uint8Array) return [output];
  if (
    Array.isArray(output) &&
    output.length > 0 &&
    output.every((item) => item instanceof Uint8Array)
  ) {
    return output as Uint8Array[];
  }
  return [];
}

/** An encoded-audio result (`{data, mimeType}`), or null for anything else. */
function encodedAudioOf(
  value: unknown
): { data: Uint8Array; mimeType?: string } | null {
  if (!isRecord(value)) return null;
  const data = value.data;
  if (!(data instanceof Uint8Array) || data.length === 0) return null;
  const mimeType = value.mimeType;
  return {
    data,
    mimeType: typeof mimeType === "string" ? mimeType : undefined
  };
}

/** What a `completed` prediction message carries as `data`: never bytes. */
function generationResultData(
  capability: ProviderCapability,
  output: unknown
): unknown {
  if (output instanceof Uint8Array) return null;
  if (encodedAudioOf(output)) return null;
  if (Array.isArray(output)) {
    if (output.every((item) => item instanceof Uint8Array)) {
      return { count: output.length };
    }
    if (capability === "segment_image") {
      return output.map((item) => {
        if (!isRecord(item)) return item;
        const { mask: _mask, ...rest } = item;
        return rest;
      });
    }
    if (capability === "generate_embedding") {
      const first = output[0];
      return {
        count: output.length,
        dimensions: Array.isArray(first) ? first.length : null
      };
    }
    return { count: output.length };
  }
  return redactGenerationOutput(output) ?? null;
}

const VIDEO_CAPABILITIES: ReadonlySet<ProviderCapability> = new Set([
  "text_to_video",
  "image_to_video",
  "reference_to_video",
  "video_to_video",
  "extend_video",
  "lip_sync"
]);
const AUDIO_CAPABILITIES: ReadonlySet<ProviderCapability> = new Set([
  "text_to_speech",
  "text_to_music",
  "audio_to_audio",
  "video_to_audio"
]);
const MODEL3D_CAPABILITIES: ReadonlySet<ProviderCapability> = new Set([
  "text_to_3d",
  "image_to_3d"
]);

/** The MIME a generation's bytes carry when the caller stated none. */
function generationMime(
  capability: ProviderCapability,
  bytes: Uint8Array
): string {
  if (VIDEO_CAPABILITIES.has(capability)) return "video/mp4";
  if (AUDIO_CAPABILITIES.has(capability)) return "audio/mpeg";
  if (MODEL3D_CAPABILITIES.has(capability)) return "model/gltf-binary";
  if (capability === "vectorize_image") return "image/svg+xml";
  return sniffImageMime(bytes) ?? "image/png";
}

const GENERATION_MIME_EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/flac": "flac",
  "audio/ogg": "ogg",
  "model/gltf-binary": "glb",
  "model/gltf+json": "gltf",
  "image/svg+xml": "svg"
};

function extForGenerationMime(mime: string): string {
  if (mime.startsWith("image/") && mime !== "image/svg+xml") {
    return extForImageMime(mime) ?? "bin";
  }
  return GENERATION_MIME_EXT[mime] ?? "bin";
}

function assetRefType(mime: string): AssetRef["type"] {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "asset";
}

/** A short, sortable name fragment for an unnamed generation asset. */
function startedName(id: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${stamp}-${id.slice(0, 8)}`;
}

