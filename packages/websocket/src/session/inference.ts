import { randomUUID } from "node:crypto";

import { createLogger } from "@nodetool-ai/config";
import { getModelUnitPrice } from "@nodetool-ai/model-pricing";
import { Asset, Prediction } from "@nodetool-ai/models";
import { extractPricingParams } from "@nodetool-ai/node-sdk/pricing-params";
import { resolveNodetoolDelegate } from "@nodetool-ai/protocol";
import {
  ProcessingContext as GenerationContext,
  calculateChatCost,
  detectImageMime,
  expandEntitiesForGeneration,
  generateStructured,
  IMAGE_MIME_TO_EXT,
  messageText
} from "@nodetool-ai/runtime";
import type { GenerationReceipt } from "@nodetool-ai/protocol";
import { attachRunCostLedger, linkGenerationAssets } from "@nodetool-ai/execution";
import { createAssetModelInterface } from "../lib/asset-model-interface.js";
import type {
  BaseProvider,
  GenerationRequest,
  GenerationResult,
  ImageModel as ProviderImageModel,
  ImageToImageParams,
  ImageToVideoParams,
  InpaintingParams,
  Message as ProviderMessage,
  MessageContent,
  PromptAssetRef,
  ProviderTool,
  TextToImageParams,
  TextToVideoParams,
  VideoModel as ProviderVideoModel
} from "@nodetool-ai/runtime";

import { admitSpend, releaseSpend, reserveSpend } from "../credit-gate.js";
import { retrieveAssetBytes } from "../lib/asset-paths.js";
import { resolveImageSize } from "../lib/media-size.js";
import { getAssetAdapter } from "../lib/storage.js";
import { storeAssetWithThumbnail } from "../lib/thumbnail.js";
import { isFiniteNumber, isString } from "../lib/wire-values.js";
import type { ClientSession } from "./client-session.js";

const log = createLogger("nodetool.websocket.runner");

export interface DirectMediaGenerationRequest {
  mode: "image" | "image_edit" | "inpaint" | "video" | "video_edit" | "audio";
  provider: string;
  model: string;
  prompt: string;
  sourceAssetId?: string;
  maskAssetId?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  resolution?: string;
  strength?: number;
  numInferenceSteps?: number;
  durationSeconds?: number;
  variations?: number;
  voice?: string;
  speed?: number;
  audioFormat?: string;
}

/**
 * Chars per token for the up-front spend estimate. Deliberately low (real
 * English averages nearer 4) so the estimate over-books rather than under.
 */
const ESTIMATE_CHARS_PER_TOKEN = 3;

/** Output budget assumed when a request names no `max_tokens`. */
const ESTIMATE_DEFAULT_OUTPUT_TOKENS = 4096;

/**
 * A conservative up-front price for one text generation, in USD: every
 * character the messages carry counted as input tokens, plus the request's
 * whole output budget as output tokens, at the delegate model's rate.
 *
 * It over-estimates on purpose. The figure is what gets *reserved* for the
 * duration of the call, and the real cost replaces it afterwards — an
 * over-booking that is released beats letting concurrent calls each admit
 * against a balance none of them has spent yet.
 */
export function estimateDirectTextSpend(req: {
  provider: string;
  model: string;
  messages: Array<{ content: string }>;
  maxTokens?: number;
}): number {
  const delegate =
    req.provider === "nodetool" ? resolveNodetoolDelegate(req.model) : null;
  const modelId = delegate?.model ?? req.model;
  const providerId = delegate?.provider ?? req.provider;
  const chars = req.messages.reduce((sum, m) => sum + m.content.length, 0);
  const inputTokens = Math.ceil(chars / ESTIMATE_CHARS_PER_TOKEN);
  const outputTokens = req.maxTokens ?? ESTIMATE_DEFAULT_OUTPUT_TOKENS;
  try {
    return calculateChatCost(modelId, inputTokens, outputTokens, 0, providerId);
  } catch {
    // An unpriced model estimates at zero: the gate still admits against the
    // balance, and the real cost is recorded when the call returns.
    return 0;
  }
}

export interface DirectTextGenerationRequest {
  provider: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens?: number;
  /** Present → the call is structured output against this JSON Schema. */
  schema?: Record<string, unknown>;
  schemaName: string;
  schemaDescription: string;
}

/**
 * Entity-mention resolver over the Asset model, scoped to one user. Backs
 * `expandEntitiesForGeneration` on every direct-generation surface.
 */
export function entityRefResolver(
  userId: string
): {
  getAssetInfo: (assetId: string) => Promise<{
    id: string;
    content_type: string;
    name: string;
    metadata: Record<string, unknown> | null;
  } | null>;
} {
  return {
    getAssetInfo: async (assetId) => {
      const asset = await Asset.find(userId, assetId);
      if (!asset) return null;
      return {
        id: asset.id,
        content_type: asset.content_type,
        name: asset.name,
        metadata: asset.metadata ?? null
      };
    }
  };
}

/**
 * Resolve entity-derived reference images to provider input bytes. A ref
 * whose asset is gone (or reads back empty) contributes nothing — the same
 * drop rule as an unresolvable mention.
 */
export async function resolveEntityReferenceImages(
  userId: string,
  refs: PromptAssetRef[]
): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  for (const ref of refs) {
    const bare = ref.uri.slice("asset://".length);
    const assetId = bare.slice(0, bare.lastIndexOf("."));
    if (!assetId) continue;
    const asset = await Asset.find(userId, assetId);
    if (!asset) continue;
    const bytes = await retrieveAssetBytes(
      getAssetAdapter(),
      userId,
      asset.id,
      asset.content_type
    );
    if (!bytes || bytes.length === 0) continue;
    out.push(bytes);
  }
  return out;
}

/**
 * Read one owned asset's bytes, with the descriptive errors the generation
 * paths surface verbatim to callers.
 */
export async function retrieveSourceAssetBytes(
  userId: string,
  assetId: string
): Promise<Uint8Array> {
  const asset = await Asset.find(userId, assetId);
  if (!asset) {
    throw new Error(`Source asset not found: ${assetId}`);
  }
  const bytes = await retrieveAssetBytes(
    getAssetAdapter(),
    userId,
    assetId,
    asset.content_type
  );
  if (!bytes) {
    throw new Error(`Source asset bytes not found: ${assetId}`);
  }
  return bytes;
}

/**
 * What the handler needs from the connection beyond {@link ClientSession}.
 */
export interface DirectInferenceDeps {
  /** Provider and model a request that names neither falls back to. */
  defaults: { provider: string; model: string };
  /**
   * The connection's current chat/inference turn seq. `handleInference`
   * compares the seq it was started with against this one at every yield, so
   * a superseding turn or a `stop` discards the rest of the stream.
   */
  currentRequestSeq: () => number;
  /**
   * Register an abort controller and hand back its deregistration. Backed by
   * the host's `rpcAborts` set, so `stop` and disconnect interrupt a model
   * that is still generating instead of billing for an answer nobody reads.
   */
  registerAbort: (controller: AbortController) => () => void;
}

/**
 * One-shot model calls that skip the chat thread and the workflow runner:
 * the streamed `inference` command, and the direct text / media / speech
 * generation the sketch, timeline and Studio surfaces drive over RPC.
 */
export class DirectInferenceHandler {
  constructor(
    private readonly session: ClientSession,
    private readonly deps: DirectInferenceDeps
  ) {}

  async handleInference(
    data: Record<string, unknown>,
    requestSeq: number,
    signal?: AbortSignal
  ): Promise<void> {
    const providerId = isString(data.provider)
      ? data.provider
      : this.deps.defaults.provider;
    const model = isString(data.model) ? data.model : this.deps.defaults.model;
    const rawMessages = Array.isArray(data.messages) ? data.messages : [];
    log.debug("Inference request", {
      model,
      provider: providerId,
      messages: rawMessages.length
    });

    const messages: ProviderMessage[] = rawMessages.map((m) => {
      const msg = m as Record<string, unknown>;
      return {
        role: (isString(msg.role)
          ? msg.role
          : "user") as ProviderMessage["role"],
        content: isString(msg.content)
          ? msg.content
          : Array.isArray(msg.content)
            ? (msg.content as MessageContent[])
            : "",
        toolCallId: isString(msg.toolCallId) ? msg.toolCallId : null,
        toolCalls: Array.isArray(msg.toolCalls)
          ? (msg.toolCalls as Array<{
              id: string;
              name: string;
              args: Record<string, unknown>;
            }>)
          : null,
        threadId: null
      };
    });

    if (!this.session.resolveProvider) {
      await this.session.send({
        type: "error",
        message: "No provider resolver configured"
      });
      return;
    }

    const rawTools = Array.isArray(data.tools) ? data.tools : [];
    const tools: ProviderTool[] = rawTools
      .map((t) => {
        const tool = t as Record<string, unknown>;
        return {
          name: isString(tool.name) ? tool.name : "",
          description: isString(tool.description)
            ? tool.description
            : undefined,
          inputSchema:
            typeof tool.inputSchema === "object"
              ? (tool.inputSchema as Record<string, unknown>)
              : undefined
        };
      })
      .filter((t) => t.name.length > 0);

    const provider = await this.session.resolveProvider(providerId, this.session.requireUserId());
    for await (const item of provider.generateMessagesTraced({
      messages,
      model,
      tools: tools.length > 0 ? tools : undefined,
      signal
    })) {
      if (requestSeq !== this.deps.currentRequestSeq()) break; // cancelled
      if ("type" in item && item.type === "chunk") {
        await this.session.send({ ...item, seq: requestSeq });
      } else if ("name" in item) {
        const toolItem = item as {
          id: string;
          name: string;
          args: Record<string, unknown>;
        };
        log.info("Tool call", { tool: toolItem.name, args: toolItem.args });
        await this.session.send({
          type: "tool_call",
          id: toolItem.id,
          name: toolItem.name,
          args: toolItem.args,
          seq: requestSeq
        });
      }
    }

    if (requestSeq === this.deps.currentRequestSeq()) {
      log.debug("Inference complete");
      await this.session.send({ type: "inference_done", seq: requestSeq });
    }
  }

  /**
   * Run a one-shot text generation and return the answer — no chat thread, no
   * job row, no workflow. The text twin of `runDirectMediaGeneration`, and
   * what a surface calls when it needs a model to write or decide one thing.
   *
   * With a schema the call is structured output: the model is forced through
   * one tool whose input schema is that shape, and the parsed object comes
   * back in `data`. `generateStructured` owns that mechanism, shared with the
   * Director node and the agent nodes, so a schema answered here and a schema
   * answered in a workflow are answered the same way.
   */
  async runDirectTextGeneration(
    req: DirectTextGenerationRequest
  ): Promise<{ text: string; data: Record<string, unknown> | null }> {
    if (!this.session.resolveProvider) {
      throw new Error("No provider resolver configured");
    }
    if (!req.model) {
      throw new Error("model is required");
    }
    if (req.messages.length === 0) {
      throw new Error("prompt or messages is required");
    }
    const userId = this.session.requireUserId();
    const provider = await this.session.resolveProvider(req.provider, userId);
    if (req.provider !== "nodetool") {
      // BYOK: the user's own keys, never metered.
      return this.runDirectTextGenerationInner(req, provider);
    }

    // NodeTool's managed provider: admit against the balance (including
    // in-flight reservations), hold the estimate for the duration of the call
    // so concurrent requests admit against each other, and record the real
    // token cost as a prediction row so the balance decrements.
    const estimatedUsd = estimateDirectTextSpend(req);
    const decision = await admitSpend(userId, estimatedUsd, [req.model]);
    if (!decision.allowed) {
      throw new Error(decision.reason);
    }
    const reservationKey = `text:${randomUUID()}`;
    reserveSpend(userId, reservationKey, estimatedUsd);
    try {
      const result = await this.runDirectTextGenerationInner(req, provider);
      // The estimate deliberately over-books, so the tracked token cost is
      // the charge — never the reservation.
      const cost = provider.getTotalCost();
      if (cost > 0) {
        try {
          await Prediction.create<Prediction>({
            user_id: userId,
            provider: "nodetool",
            model: req.model,
            node_type: req.schema ? "direct.structured" : "direct.text",
            cost,
            currency: "USD",
            billing_unit: "tokens",
            quantity: 1,
            workflow_id: null,
            node_id: "",
            status: "completed"
          });
        } catch (err) {
          this.session.logError("direct text cost persistence failed", err);
        }
      }
      return result;
    } finally {
      releaseSpend(userId, reservationKey);
    }
  }

  /**
   * The provider call itself. Runs under an abort signal registered on the
   * connection, so a `stop` command or a dropped socket interrupts a model
   * that is still generating instead of billing for an answer nobody reads.
   */
  private async runDirectTextGenerationInner(
    req: DirectTextGenerationRequest,
    provider: BaseProvider
  ): Promise<{ text: string; data: Record<string, unknown> | null }> {
    const messages: ProviderMessage[] = req.messages.map((m) => ({
      role: (m.role === "system" || m.role === "assistant" || m.role === "tool"
        ? m.role
        : "user") as ProviderMessage["role"],
      content: m.content,
      toolCallId: null,
      toolCalls: null,
      threadId: null
    }));

    const abort = new AbortController();
    const deregister = this.deps.registerAbort(abort);
    try {
      if (req.schema) {
        const data = await generateStructured(provider, {
          messages,
          model: req.model,
          maxTokens: req.maxTokens,
          toolName: req.schemaName,
          toolDescription: req.schemaDescription,
          schema: req.schema,
          signal: abort.signal
        });
        return { text: "", data };
      }
      const result = await provider.generateMessageTraced({
        messages,
        model: req.model,
        maxTokens: req.maxTokens,
        signal: abort.signal
      });
      return { text: messageText(result.content), data: null };
    } finally {
      deregister();
    }
  }

  /**
   * Run a one-shot media-generation request (text-to-image, image-to-image,
   * text-to-video, or text-to-audio) and return the produced asset ids.
   * Mirrors the image / image_edit / video / audio branches of
   * `handleMediaGenerationMessage` but skips the chat-thread machinery —
   * the caller wants asset ids, not a streamed Message row.
   *
   * Used by the `generate_media` RPC for the sketch editor's direct-gen
   * image layers and the timeline's direct-gen video / audio clips; the
   * chat-path equivalents stay in `handleMediaGenerationMessage` for now.
   */
  async runDirectMediaGeneration(
    req: DirectMediaGenerationRequest
  ): Promise<{ asset_ids: string[] }> {
    if (!this.session.resolveProvider) {
      throw new Error("No provider resolver configured");
    }
    if (!req.model) {
      throw new Error("model is required");
    }
    if (!req.prompt || !req.prompt.trim()) {
      throw new Error("prompt is required");
    }
    const userId = this.session.requireUserId();
    const provider = await this.session.resolveProvider(req.provider, userId);
    if (req.provider !== "nodetool") {
      // BYOK: the user's own keys, never metered.
      return this.runDirectMediaGenerationInner(req, provider);
    }

    // NodeTool's managed provider: admit against the balance (including
    // in-flight reservations), reserve the unit-price estimate for the
    // duration of the call, and record the spend as a prediction row so the
    // balance actually decrements. Cost is the larger of the delegate's own
    // tracked cost and the unit-price estimate — fal-style delegates bill
    // per unit and track nothing themselves.
    const variations = Math.max(1, Math.min(Number(req.variations ?? 1), 8));
    // What the request states about the job, in the vocabulary the catalogs
    // bill in — a per-second video model prices the clip asked for, not one
    // second of it.
    const priceParams = extractPricingParams({
      resolution: req.resolution,
      duration_seconds: req.durationSeconds,
      width: req.width,
      height: req.height
    });
    const unit = getModelUnitPrice(
      { id: req.model, provider: "nodetool" },
      priceParams
    );
    const unitPrice =
      unit && !unit.declined && isFiniteNumber(unit.unit_price)
        ? unit.unit_price
        : 0;
    const estimatedUsd = unitPrice * variations;
    const decision = await admitSpend(userId, estimatedUsd, [req.model]);
    if (!decision.allowed) {
      throw new Error(decision.reason);
    }
    const reservationKey = `media:${randomUUID()}`;
    reserveSpend(userId, reservationKey, estimatedUsd);
    try {
      // The generation seam writes the row (docs/media-generation-tracking-
      // design.md § 8, S5). The managed provider's charge is the larger of the
      // delegate's own tracked cost and the unit-price estimate — fal-style
      // delegates bill per unit and track nothing themselves — and reaches the
      // row as the receipt, which wins over the catalog.
      const generationIds: string[] = [];
      const result = await this.runDirectMediaGenerationInner(req, provider, {
        generationIds,
        statedCost: (tracked) => {
          const cost = Math.max(tracked, estimatedUsd);
          return cost > 0
            ? {
                amount: cost,
                currency: "USD",
                billing_unit: unit?.billing_unit ?? null,
                quantity: variations,
                unit_price: cost / variations
              }
            : null;
        }
      });
      // The tracker writes best-effort and says so in its own log; the
      // managed path is the one that decrements a balance, so a row that did
      // not land is reported on the session as well.
      for (const id of generationIds) {
        try {
          const row = await Prediction.findForUser(userId, id);
          if (!row || row.status !== "completed") {
            throw new Error(`generation ${id} has no completed row`);
          }
        } catch (err) {
          this.session.logError("direct media cost persistence failed", err);
          break;
        }
      }
      return result;
    } finally {
      releaseSpend(userId, reservationKey);
    }
  }

  private async runDirectMediaGenerationInner(
    req: DirectMediaGenerationRequest,
    provider: BaseProvider,
    metering?: {
      /** The charge to state on the row, given what the delegate tracked. */
      statedCost: (
        trackedUsd: number
      ) => NonNullable<GenerationReceipt["cost"]> | null;
      /** Every generation id this call opened, for the caller to verify. */
      generationIds: string[];
    }
  ): Promise<{ asset_ids: string[] }> {
    const userId = this.session.requireUserId();
    const variations = Math.max(1, Math.min(Number(req.variations ?? 1), 8));

    // Every provider call below runs inside the generation seam: one ledger
    // row per call, opened before the call and closed with its cost and asset
    // ids. The seam saves the assets; `storeAsset` is the fallback.
    const generationContext = new GenerationContext({
      jobId: randomUUID(),
      userId
    });
    generationContext.registerProvider(req.provider, provider);
    generationContext.setModelInterfaces({
      createAsset: createAssetModelInterface
    });
    const ledger = attachRunCostLedger(generationContext, {
      userId,
      workflowId: null,
      // The row names the RPC mode the way it always did.
      nodeType: () => `direct.${req.mode}`
    });
    const generate = async <T>(
      capability: GenerationRequest["capability"],
      params: Record<string, unknown>,
      persist: GenerationRequest["persist"] | null,
      call: (abort: AbortSignal) => Promise<T>,
      id?: string
    ): Promise<GenerationResult<T>> => {
      const result = await generationContext.runGenerationWith(
        {
          id,
          provider: req.provider,
          capability,
          model: req.model,
          params,
          origin: { surface: "rpc" },
          persist: persist ? { ...persist, parentId: userId } : undefined
        },
        (_provider, abort) => call(abort),
        {
          // The delegate's running total, read once the assets are stored,
          // as the row always recorded it: a fal-style delegate tracks
          // nothing and the estimate wins. A test double may be a bare
          // object; only a real provider tracks.
          receiptAfterPersist: () => {
            if (!metering) return null;
            const tracked =
              typeof provider.getTotalCost === "function"
                ? provider.getTotalCost()
                : 0;
            const stated = metering.statedCost(tracked);
            return stated ? { cost: stated } : null;
          }
        }
      );
      metering?.generationIds.push(result.id);
      // The client reads the ledger right after this answers.
      await ledger.settled();
      return result;
    };
    const seamAssetId = (
      result: { assets: ReadonlyArray<{ asset_id?: string | null }> },
      index = 0
    ): string | null => result.assets[index]?.asset_id ?? null;

    // Entity mentions in the prompt (`entity://<id>`, written by @-mention
    // pickers) expand against the library here: name inline, descriptor into
    // a Consistency references block, reference image routed into the
    // generation inputs below — the same rule node prompts get through
    // mapPromptAssetsToInputs. A mention that resolves to no entity drops.
    const { prompt, referenceImages } = await expandEntitiesForGeneration(
      req.prompt,
      entityRefResolver(userId)
    );
    const entityImageBytes = await resolveEntityReferenceImages(
      userId,
      referenceImages
    );

    const storeAsset = async (
      bytes: Uint8Array,
      contentType: string,
      ext: string
    ): Promise<string> => {
      const asset = new Asset({
        user_id: userId,
        workflow_id: null,
        name: `${req.mode}_${Date.now()}`,
        content_type: contentType,
        // Home, the same folder an upload lands in — the rule
        // `handleMediaGenerationMessage` in websocket-client-session.ts
        // applies. A null parent is unreachable from the folder the
        // asset browser opens on.
        parent_id: userId
      });
      const fileName = `${asset.id}.${ext}`;
      await storeAssetWithThumbnail(
        asset.user_id,
        asset.id,
        fileName,
        bytes,
        contentType
      );
      asset.size = bytes.length;
      await asset.save();
      return asset.id;
    };

    // Image modes are pixel-addressed on several providers (GPT Image's
    // `size`): derive explicit dimensions from the resolution tier + aspect
    // ratio when the caller sent none — the same numbers the generation nodes
    // always computed. Caller-supplied pixels win.
    const imageSize =
      req.mode === "image" || req.mode === "image_edit"
        ? (resolveImageSize(req.resolution, req.aspectRatio) ?? undefined)
        : undefined;
    const width = req.width ?? imageSize?.width;
    const height = req.height ?? imageSize?.height;

    if (req.mode === "video") {
      const videoModel: ProviderVideoModel = {
        id: req.model,
        name: req.model,
        provider: req.provider
      };
      const videoParams = {
        prompt,
        aspect_ratio: req.aspectRatio ?? null,
        resolution: req.resolution ?? null,
        duration_seconds: req.durationSeconds ?? null
      };
      let generated: GenerationResult<Uint8Array>;
      if (req.sourceAssetId) {
        // A source image turns the request into image-to-video: the image is
        // the frame the animation starts from.
        const sourceBytes = await retrieveSourceAssetBytes(
          userId,
          req.sourceAssetId
        );
        const i2vParams: ImageToVideoParams = {
          model: videoModel,
          prompt,
          aspectRatio: req.aspectRatio ?? null,
          resolution: req.resolution ?? null,
          durationSeconds: req.durationSeconds ?? null
        };
        generated = await generate(
          "image_to_video",
          { ...videoParams, images: [sourceBytes] },
          { mime: "video/mp4" },
          (abort) =>
            provider.imageToVideo([sourceBytes], { ...i2vParams, signal: abort })
        );
      } else {
        const params: TextToVideoParams = {
          model: videoModel,
          prompt,
          durationSeconds: req.durationSeconds ?? null
        };
        generated = await generate(
          "text_to_video",
          videoParams,
          { mime: "video/mp4" },
          (abort) => provider.textToVideo({ ...params, signal: abort })
        );
      }
      const assetId =
        seamAssetId(generated) ??
        (await storeAsset(generated.output, "video/mp4", "mp4"));
      return { asset_ids: [assetId] };
    }

    if (req.mode === "video_edit") {
      if (!req.sourceAssetId) {
        throw new Error("source_asset_id is required for video_edit");
      }
      const sourceBytes = await retrieveSourceAssetBytes(
        userId,
        req.sourceAssetId
      );
      const videoModel: ProviderVideoModel = {
        id: req.model,
        name: req.model,
        provider: req.provider
      };
      const generated = await generate(
        "video_to_video",
        {
          prompt,
          strength: req.strength ?? null,
          duration_seconds: req.durationSeconds ?? null,
          resolution: req.resolution ?? null,
          video: sourceBytes
        },
        { mime: "video/mp4" },
        () =>
          provider.videoToVideo(sourceBytes, {
            model: videoModel,
            prompt,
            strength: req.strength ?? null,
            durationSeconds: req.durationSeconds ?? null,
            resolution: req.resolution ?? null
          })
      );
      const assetId =
        seamAssetId(generated) ??
        (await storeAsset(generated.output, "video/mp4", "mp4"));
      return { asset_ids: [assetId] };
    }

    if (req.mode === "audio") {
      const supportedFormats = new Set([
        "mp3",
        "wav",
        "flac",
        "ogg",
        "aac",
        "pcm"
      ]);
      const requestedFormat =
        req.audioFormat && supportedFormats.has(req.audioFormat)
          ? req.audioFormat
          : null;

      const audioGenerationId = randomUUID();
      const generated = await generate(
        "text_to_speech",
        {
          text: prompt,
          voice: req.voice,
          speed: req.speed,
          audio_format: requestedFormat
        },
        null,
        async () => {
      // Prefer providers that return fully-encoded audio (OpenAI, HuggingFace).
      const encoded = await provider.textToSpeechEncoded({
        text: prompt,
        model: req.model,
        voice: req.voice,
        speed: req.speed,
        audioFormat: requestedFormat ?? undefined
      });

      if (encoded) {
        const mimeToExt: Record<string, string> = {
          "audio/mpeg": "mp3",
          "audio/wav": "wav",
          "audio/ogg": "ogg",
          "audio/flac": "flac",
          "audio/aac": "aac"
        };
        const ext = mimeToExt[encoded.mimeType] ?? "flac";
        const assetId = await storeAsset(encoded.data, encoded.mimeType, ext);
        return assetId;
      }

      // Streaming-PCM fallback (OpenAI / Gemini), wrap in WAV unless caller
      // explicitly asked for raw PCM.
      const pcmChunks: Uint8Array[] = [];
      let totalBytes = 0;
      let chunkSampleRate = 24000;
      for await (const chunk of provider.textToSpeech({
        text: prompt,
        model: req.model,
        voice: req.voice,
        speed: req.speed,
        audioFormat: requestedFormat ?? undefined
      })) {
        if (chunk?.samples) {
          if (chunk.sampleRate) chunkSampleRate = chunk.sampleRate;
          const view = new Uint8Array(
            chunk.samples.buffer,
            chunk.samples.byteOffset,
            chunk.samples.byteLength
          );
          const copy = new Uint8Array(view);
          pcmChunks.push(copy);
          totalBytes += copy.byteLength;
        }
      }
      const merged = new Uint8Array(totalBytes);
      let off = 0;
      for (const c of pcmChunks) {
        merged.set(c, off);
        off += c.byteLength;
      }

      if (requestedFormat === "pcm") {
        const assetId = await storeAsset(merged, "audio/pcm", "pcm");
        return assetId;
      }

      // Wrap raw 16-bit PCM in a WAV container so browsers can play it back.
      const sampleRate = chunkSampleRate;
      const numChannels = 1;
      const bitsPerSample = 16;
      const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
      const blockAlign = numChannels * (bitsPerSample / 8);
      const wavHeader = new ArrayBuffer(44);
      const dv = new DataView(wavHeader);
      const writeStr = (pos: number, str: string) => {
        for (let i = 0; i < str.length; i++)
          dv.setUint8(pos + i, str.charCodeAt(i));
      };
      writeStr(0, "RIFF");
      dv.setUint32(4, 36 + merged.byteLength, true);
      writeStr(8, "WAVE");
      writeStr(12, "fmt ");
      dv.setUint32(16, 16, true);
      dv.setUint16(20, 1, true);
      dv.setUint16(22, numChannels, true);
      dv.setUint32(24, sampleRate, true);
      dv.setUint32(28, byteRate, true);
      dv.setUint16(32, blockAlign, true);
      dv.setUint16(34, bitsPerSample, true);
      writeStr(36, "data");
      dv.setUint32(40, merged.byteLength, true);

      const wav = new Uint8Array(44 + merged.byteLength);
      wav.set(new Uint8Array(wavHeader), 0);
      wav.set(merged, 44);

      const assetId = await storeAsset(wav, "audio/wav", "wav");
      return assetId;
        },
        audioGenerationId
      );
      await linkGenerationAssets([audioGenerationId], [generated.output]);
      return { asset_ids: [generated.output] };
    }

    const imageModel: ProviderImageModel = {
      id: req.model,
      name: req.model,
      provider: req.provider
    };

    let generated: GenerationResult<Uint8Array[]>;
    if (req.mode === "image" && entityImageBytes.length > 0) {
      // A mentioned entity carries a reference image: the generation becomes
      // an edit against those images, mirroring how node prompts with
      // entity images route through ImageToImage. The provider throws when
      // the chosen model cannot take input images.
      const params: ImageToImageParams = {
        model: imageModel,
        prompt,
        targetWidth: width ?? null,
        targetHeight: height ?? null,
        aspectRatio: req.aspectRatio ?? null,
        resolution: req.resolution ?? null,
        strength: req.strength ?? null,
        numInferenceSteps: req.numInferenceSteps ?? null
      };
      generated = await generate(
        "image_to_image",
        {
          prompt,
          target_width: width ?? null,
          target_height: height ?? null,
          aspect_ratio: req.aspectRatio ?? null,
          resolution: req.resolution ?? null,
          strength: req.strength ?? null,
          num_images: variations,
          images: entityImageBytes
        },
        {},
        (abort) =>
          provider.imageToImages(
            entityImageBytes,
            { ...params, signal: abort },
            variations
          )
      );
    } else if (req.mode === "image") {
      const params: TextToImageParams = {
        model: imageModel,
        prompt,
        width,
        height,
        aspectRatio: req.aspectRatio ?? null,
        resolution: req.resolution ?? null
      };
      generated = await generate(
        "text_to_image",
        {
          prompt,
          width,
          height,
          aspect_ratio: req.aspectRatio ?? null,
          resolution: req.resolution ?? null,
          num_images: variations
        },
        {},
        (abort) =>
          provider.textToImages({ ...params, signal: abort }, variations)
      );
    } else if (req.mode === "inpaint") {
      if (!req.sourceAssetId) {
        throw new Error("source_asset_id is required for inpaint");
      }
      if (!req.maskAssetId) {
        throw new Error("mask_asset_id is required for inpaint");
      }
      const adapter = getAssetAdapter();
      const [sourceAsset, maskAsset] = await Promise.all([
        Asset.find(userId, req.sourceAssetId),
        Asset.find(userId, req.maskAssetId)
      ]);
      if (!sourceAsset)
        throw new Error(`Source asset not found: ${req.sourceAssetId}`);
      if (!maskAsset)
        throw new Error(`Mask asset not found: ${req.maskAssetId}`);
      const [sourceBytes, maskBytes] = await Promise.all([
        retrieveAssetBytes(
          adapter,
          userId,
          req.sourceAssetId,
          sourceAsset.content_type
        ),
        retrieveAssetBytes(
          adapter,
          userId,
          req.maskAssetId,
          maskAsset.content_type
        )
      ]);
      if (!sourceBytes)
        throw new Error(`Source asset bytes not found: ${req.sourceAssetId}`);
      if (!maskBytes)
        throw new Error(`Mask asset bytes not found: ${req.maskAssetId}`);
      const params: InpaintingParams = {
        model: imageModel,
        prompt,
        targetWidth: req.width ?? null,
        targetHeight: req.height ?? null,
        aspectRatio: req.aspectRatio ?? null,
        resolution: req.resolution ?? null,
        strength: req.strength ?? null,
        numInferenceSteps: req.numInferenceSteps ?? null,
        mask: maskBytes
      };
      generated = await generate(
        "inpainting",
        {
          prompt,
          target_width: req.width ?? null,
          target_height: req.height ?? null,
          strength: req.strength ?? null,
          num_images: variations,
          images: [sourceBytes],
          mask: maskBytes
        },
        {},
        (abort) =>
          provider.inpaintImages(
            [sourceBytes],
            { ...params, signal: abort },
            variations
          )
      );
    } else {
      if (!req.sourceAssetId) {
        throw new Error("source_asset_id is required for image_edit");
      }
      const sourceAsset = await Asset.find(userId, req.sourceAssetId);
      if (!sourceAsset) {
        throw new Error(`Source asset not found: ${req.sourceAssetId}`);
      }
      const sourceBytes = await retrieveAssetBytes(
        getAssetAdapter(),
        userId,
        req.sourceAssetId,
        sourceAsset.content_type
      );
      if (!sourceBytes) {
        throw new Error(`Source asset bytes not found: ${req.sourceAssetId}`);
      }
      const params: ImageToImageParams = {
        model: imageModel,
        prompt,
        targetWidth: width ?? null,
        targetHeight: height ?? null,
        aspectRatio: req.aspectRatio ?? null,
        resolution: req.resolution ?? null,
        strength: req.strength ?? null,
        numInferenceSteps: req.numInferenceSteps ?? null
      };
      generated = await generate(
        "image_to_image",
        {
          prompt,
          target_width: width ?? null,
          target_height: height ?? null,
          aspect_ratio: req.aspectRatio ?? null,
          resolution: req.resolution ?? null,
          strength: req.strength ?? null,
          num_inference_steps: req.numInferenceSteps ?? null,
          num_images: variations,
          images: [sourceBytes, ...entityImageBytes]
        },
        {},
        (abort) =>
          provider.imageToImages(
            [sourceBytes, ...entityImageBytes],
            { ...params, signal: abort },
            variations
          )
      );
    }

    const assetIds: string[] = [];
    for (const [index, bytes] of generated.output.entries()) {
      const mimeType = detectImageMime(bytes);
      assetIds.push(
        seamAssetId(generated, index) ??
          (await storeAsset(
            bytes,
            mimeType,
            IMAGE_MIME_TO_EXT[mimeType] ?? "png"
          ))
      );
    }
    return { asset_ids: assetIds };
  }

  /**
   * Transcribe a stored audio asset to word-level caption timing. Mirrors the
   * provider path used by the ASR node but skips the workflow machinery — the
   * caller (Studio transcript beats) wants `{ word, startMs, endMs }[]` back in
   * one shot. Timestamps are returned in milliseconds relative to the start of
   * the audio.
   */
  async runDirectTranscription(req: {
    provider: string;
    model: string;
    assetId: string;
    language?: string;
  }): Promise<{
    text: string;
    words: Array<{ word: string; startMs: number; endMs: number }>;
  }> {
    if (!this.session.resolveProvider) {
      throw new Error("No provider resolver configured");
    }
    if (!req.model) {
      throw new Error("model is required");
    }
    if (!req.assetId) {
      throw new Error("asset_id is required");
    }

    const userId = this.session.requireUserId();
    if (req.provider === "nodetool") {
      const creditDecision = await admitSpend(userId, 0, [req.model]);
      if (!creditDecision.allowed) {
        throw new Error(creditDecision.reason);
      }
    }
    const asset = await Asset.find(userId, req.assetId);
    if (!asset) {
      throw new Error(`Audio asset not found: ${req.assetId}`);
    }
    const bytes = await retrieveAssetBytes(
      getAssetAdapter(),
      userId,
      req.assetId,
      asset.content_type
    );
    if (!bytes) {
      throw new Error(`Audio asset bytes not found: ${req.assetId}`);
    }

    const provider = await this.session.resolveProvider(req.provider, userId);
    const result = await provider.automaticSpeechRecognition({
      audio: bytes,
      model: req.model,
      language: req.language,
      word_timestamps: true
    });

    // Metered provider: record what the delegate tracked so the spend lands
    // in the ledger the balance is computed from. Best-effort, never throws.
    if (req.provider === "nodetool" && provider.getTotalCost() > 0) {
      try {
        await Prediction.create<Prediction>({
          user_id: userId,
          provider: "nodetool",
          model: req.model,
          node_type: "direct.transcription",
          cost: provider.getTotalCost(),
          currency: "USD",
          workflow_id: null,
          node_id: "",
          status: "completed"
        });
      } catch (err) {
        this.session.logError("direct transcription cost persistence failed", err);
      }
    }

    const words = (result.chunks ?? [])
      .map((chunk) => ({
        word: chunk.text.trim(),
        startMs: Math.round(chunk.timestamp[0] * 1000),
        endMs: Math.round(chunk.timestamp[1] * 1000)
      }))
      .filter((w) => w.word.length > 0);

    return { text: result.text, words };
  }
}
