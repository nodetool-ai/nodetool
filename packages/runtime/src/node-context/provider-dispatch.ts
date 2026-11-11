/**
 * The provider call of each non-streaming capability, as
 * `NodeContext.runGeneration` and `runProviderPrediction` make it, over a
 * {@link ProviderCallHost}. See `context-host.ts` for the host contract and
 * the QuickJS constraints.
 */
import {
  isBoolean,
  isCallable,
  isNonEmptyString,
  isNumber,
  isObjectLike,
  isRecord,
  isString
} from "@nodetool-ai/protocol";
import type {
  ProviderPredictionRequest,
  ProviderPredictionResult
} from "../context.js";
import { loadMediaRefBytes, type MediaRefValue } from "../media-ref-bytes.js";
import type { BaseProvider } from "../providers/base-provider.js";
import {
  objectTrackingRequestSchema,
  parseObjectTrackingResult
} from "../providers/object-tracking.js";
import type {
  EntityReference,
  ImageBox,
  Message,
  Model3D,
  OutpaintPadding,
  SegmentPoint
} from "../providers/types.js";
import {
  requestVideoToAudio,
  VIDEO_TO_AUDIO_TASK,
  VideoToAudioRequest
} from "../providers/video-to-audio.js";
import type {
  MediaHost,
  ProviderCallHost,
  ProviderHost
} from "./context-host.js";
import { resolveRequiredImageEvidence } from "./message-media.js";

/**
 * Whether a provider streams raw PCM for text-to-speech. When false, the
 * caller uses `textToSpeechEncoded` (the provider returns an encoded audio
 * file rather than samples).
 */
export async function providerSupportsStreamingTTS(
  host: ProviderHost,
  providerId: string
): Promise<boolean> {
  const provider = await host.getProvider(providerId);
  return provider.supportsStreamingTextToSpeech();
}

/**
 * Normalize the image input for image-to-image / image-to-video predictions
 * into a list of byte buffers. Accepts the modern `images` array as well as
 * the legacy singular `image` field so older callers keep working.
 */
function coerceImageList(params: Record<string, unknown>): Uint8Array[] {
  const list = params.images;
  if (Array.isArray(list)) {
    return list.filter((b): b is Uint8Array => b instanceof Uint8Array);
  }
  const single = params.image;
  return single instanceof Uint8Array ? [single] : [];
}

/**
 * Read an outpaint padding bag off the loose params. Only the four side keys
 * are read, and only when numeric: a caller that passes nothing gets
 * `undefined`, which lets the provider fall back to its endpoint's default
 * expansion rather than sending zeros that would outpaint nothing.
 */
function coerceOutpaintPadding(value: unknown): OutpaintPadding | undefined {
  if (!isObjectLike(value)) return undefined;
  const side = (key: string): number | undefined =>
    isNumber(value[key]) ? value[key] : undefined;
  const padding: OutpaintPadding = {
    left: side("left"),
    right: side("right"),
    top: side("top"),
    bottom: side("bottom")
  };
  return Object.values(padding).some((v) => v !== undefined)
    ? padding
    : undefined;
}

function coerceByteList(value: unknown): Uint8Array[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Uint8Array =>
      item instanceof Uint8Array && item.byteLength > 0
  );
}

function coerceStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isNonEmptyString);
}

function firstNonEmptyByteList(value: Uint8Array[]): Uint8Array {
  return value.find((bytes) => bytes.byteLength > 0) ?? new Uint8Array();
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return (
    isObjectLike(value) &&
    isBoolean(value.aborted) &&
    isCallable(value.addEventListener)
  );
}

/**
 * Normalize `params.entities` into provider-level {@link EntityReference}s.
 *
 * Consumers send entities in whatever shape they hold: a full protocol Entity
 * (`reference_images` list), a lean `{name, descriptor, image}` where `image`
 * is bytes, an ImageRef-like object, or a bare URI string. Images are resolved
 * to bytes here — the last point with a ProcessingContext — so providers only
 * ever see `Uint8Array`s. Entities without a name are dropped; an unresolvable
 * image degrades to a text-only entity (the descriptor still applies).
 */
async function coerceEntityList(
  params: Record<string, unknown>,
  context: MediaHost
): Promise<EntityReference[] | undefined> {
  const raw = params.entities;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;

  const out: EntityReference[] = [];
  for (const item of raw) {
    if (!isObjectLike(item)) continue;
    const entity = item as Record<string, unknown>;
    const name = isString(entity.name) ? entity.name.trim() : "";
    if (!name) continue;
    const descriptor = isString(entity.descriptor)
      ? entity.descriptor
      : undefined;

    const imageSource =
      entity.image ??
      (Array.isArray(entity.reference_images)
        ? entity.reference_images[0]
        : undefined);
    let image: Uint8Array | undefined;
    if (imageSource instanceof Uint8Array) {
      image = imageSource;
    } else if (isNonEmptyString(imageSource)) {
      image =
        (await loadMediaRefBytes(
          { type: "image", uri: imageSource },
          context
        )) ?? undefined;
    } else if (isObjectLike(imageSource)) {
      image =
        (await loadMediaRefBytes(imageSource as MediaRefValue, context)) ??
        undefined;
    }
    out.push({ name, descriptor, image });
  }
  return out.length > 0 ? out : undefined;
}

export async function dispatchCapability(
  host: ProviderCallHost,
  provider: BaseProvider,
  req: ProviderPredictionRequest
): Promise<ProviderPredictionResult> {
  const params = req.params ?? {};
  switch (req.capability) {
    case "generate_message":
      return provider.generateMessageTraced({
        messages:
          params.strict_image_evidence === true
            ? await resolveRequiredImageEvidence(
                host,
                (params.messages as Message[]) ?? [],
                Array.isArray(params.required_images)
                  ? params.required_images.filter(isString)
                  : []
              )
            : await host.resolveMessageMediaUris(
                (params.messages as Message[]) ?? []
              ),
        model: req.model,
        tools: params.tools as Parameters<
          BaseProvider["generateMessage"]
        >[0]["tools"],
        toolChoice: params.tool_choice as string | undefined,
        maxTokens: params.max_tokens as number | undefined,
        temperature: params.temperature as number | undefined,
        topP: params.top_p as number | undefined,
        presencePenalty: params.presence_penalty as number | undefined,
        frequencyPenalty: params.frequency_penalty as number | undefined
      });
    case "text_to_image":
      return provider.textToImage({
        signal: params.signal as AbortSignal | undefined,
        prompt: String(params.prompt ?? ""),
        entities: await coerceEntityList(params, host),
        model: { id: req.model, name: req.model, provider: req.provider },
        width: params.width as number | undefined,
        height: params.height as number | undefined,
        aspectRatio: params.aspect_ratio as string | undefined,
        resolution: params.resolution as string | undefined,
        negativePrompt: params.negative_prompt as string | undefined,
        quality: params.quality as string | undefined
      });
    case "image_to_image":
      return provider.imageToImage(coerceImageList(params), {
        signal: params.signal as AbortSignal | undefined,
        prompt: String(params.prompt ?? ""),
        entities: await coerceEntityList(params, host),
        model: { id: req.model, name: req.model, provider: req.provider },
        negativePrompt: params.negative_prompt as string | undefined,
        targetWidth: params.target_width as number | undefined,
        targetHeight: params.target_height as number | undefined,
        aspectRatio: params.aspect_ratio as string | undefined,
        resolution: params.resolution as string | undefined,
        strength: params.strength as number | undefined,
        quality: params.quality as string | undefined
      });
    case "inpainting":
      return provider.inpaint(coerceImageList(params), {
        prompt: String(params.prompt ?? ""),
        entities: await coerceEntityList(params, host),
        model: { id: req.model, name: req.model, provider: req.provider },
        mask: params.mask as Uint8Array,
        negativePrompt: params.negative_prompt as string | undefined,
        targetWidth: params.target_width as number | undefined,
        targetHeight: params.target_height as number | undefined,
        aspectRatio: params.aspect_ratio as string | undefined,
        resolution: params.resolution as string | undefined,
        strength: params.strength as number | undefined,
        quality: params.quality as string | undefined
      });
    case "text_to_video":
      return provider.textToVideo({
        signal: params.signal as AbortSignal | undefined,
        prompt: String(params.prompt ?? ""),
        entities: await coerceEntityList(params, host),
        model: { id: req.model, name: req.model, provider: req.provider },
        negativePrompt: params.negative_prompt as string | undefined,
        numFrames: params.num_frames as number | undefined,
        durationSeconds: params.duration_seconds as number | undefined,
        aspectRatio: params.aspect_ratio as string | undefined,
        resolution: params.resolution as string | undefined,
        timeoutSeconds: params.timeout_seconds as number | undefined
      });
    case "image_to_video":
      return provider.imageToVideo(
        firstNonEmptyByteList(coerceImageList(params)),
        {
          signal: params.signal as AbortSignal | undefined,
          prompt: params.prompt as string | undefined,
          endImage: coerceByteList([params.end_image])[0],
          seed: isNumber(params.seed) ? params.seed : undefined,
          entities: await coerceEntityList(params, host),
          model: { id: req.model, name: req.model, provider: req.provider },
          negativePrompt: params.negative_prompt as string | undefined,
          numFrames: params.num_frames as number | undefined,
          durationSeconds: params.duration_seconds as number | undefined,
          aspectRatio: params.aspect_ratio as string | undefined,
          resolution: params.resolution as string | undefined,
          timeoutSeconds: params.timeout_seconds as number | undefined
        }
      );
    case "reference_to_video": {
      const images = coerceByteList(params.reference_images);
      const videos = coerceByteList(params.reference_videos);
      if (images.length === 0 && videos.length === 0) {
        throw new Error(
          "reference_to_video requires at least one reference image or video"
        );
      }
      return provider.referenceToVideo(
        { images, videos },
        {
          model: { id: req.model, name: req.model, provider: req.provider },
          prompt: isString(params.prompt) ? params.prompt : "",
          entities: await coerceEntityList(params, host),
          useReferenceVideoAudio: isBoolean(params.use_reference_video_audio)
            ? params.use_reference_video_audio
            : undefined,
          negativePrompt: isString(params.negative_prompt)
            ? params.negative_prompt
            : undefined,
          numFrames: isNumber(params.num_frames)
            ? params.num_frames
            : undefined,
          durationSeconds: isNumber(params.duration_seconds)
            ? params.duration_seconds
            : undefined,
          aspectRatio: isString(params.aspect_ratio)
            ? params.aspect_ratio
            : undefined,
          resolution: isString(params.resolution)
            ? params.resolution
            : undefined,
          timeoutSeconds: isNumber(params.timeout_seconds)
            ? params.timeout_seconds
            : undefined,
          signal: isAbortSignal(params.signal) ? params.signal : undefined
        }
      );
    }
    case "outpaint_image":
      return provider.outpaintImage(coerceImageList(params), {
        signal: params.signal as AbortSignal | undefined,
        prompt: params.prompt as string | undefined,
        entities: await coerceEntityList(params, host),
        model: { id: req.model, name: req.model, provider: req.provider },
        negativePrompt: params.negative_prompt as string | undefined,
        padding: coerceOutpaintPadding(params.padding),
        aspectRatio: params.aspect_ratio as string | undefined,
        seed: params.seed as number | undefined
      });
    case "upscale_image":
      return provider.upscaleImage(params.image as Uint8Array, {
        model: { id: req.model, name: req.model, provider: req.provider },
        scale: params.scale as number | undefined,
        prompt: params.prompt as string | undefined,
        creativity: params.creativity as number | undefined,
        seed: params.seed as number | undefined
      });
    case "remove_background":
      return provider.removeBackground(params.image as Uint8Array, {
        model: { id: req.model, name: req.model, provider: req.provider }
      });
    case "relight_image":
      return provider.relightImage(params.image as Uint8Array, {
        model: { id: req.model, name: req.model, provider: req.provider },
        prompt: params.prompt as string | undefined,
        negativePrompt: params.negative_prompt as string | undefined,
        seed: params.seed as number | undefined
      });
    case "segment_image":
      return provider.segmentImage(params.image as Uint8Array, {
        signal: params.signal as AbortSignal | undefined,
        model: { id: req.model, name: req.model, provider: req.provider },
        prompt: params.prompt as string | undefined,
        points: params.points as SegmentPoint[] | undefined,
        box: params.box as ImageBox | undefined,
        maxMasks: params.max_masks as number | undefined,
        minConfidence: params.min_confidence as number | undefined
      });
    case "vectorize_image":
      return provider.vectorizeImage(params.image as Uint8Array, {
        model: { id: req.model, name: req.model, provider: req.provider }
      });
    case "estimate_depth":
      return provider.estimateDepth(params.image as Uint8Array, {
        model: { id: req.model, name: req.model, provider: req.provider },
        signal: isAbortSignal(params.signal) ? params.signal : host.signal
      });
    case "rerank":
      return provider.rerank({
        model: req.model,
        query: isString(params.query) ? params.query : "",
        // Every entry stays, so result indices point into the caller's list.
        documents: Array.isArray(params.documents)
          ? params.documents.map((doc) => (isString(doc) ? doc : String(doc)))
          : [],
        topK: isNumber(params.top_k) ? params.top_k : undefined,
        signal: isAbortSignal(params.signal) ? params.signal : host.signal
      });
    case "track_object": {
      const request = objectTrackingRequestSchema.parse(params);
      if (!provider.getCapabilities().includes("track_object")) {
        throw new Error(
          "The selected provider does not support object tracking."
        );
      }
      const signal =
        params.signal instanceof AbortSignal ? params.signal : host.signal;
      signal.throwIfAborted();
      const video = await loadMediaRefBytes(
        { type: "video", asset_id: request.sourceAssetId },
        host
      );
      if (!video?.byteLength) {
        throw new Error("The tracking source video could not be loaded.");
      }
      signal.throwIfAborted();
      const output = await provider.trackObject(video, {
        ...request,
        model: req.model,
        signal
      });
      signal.throwIfAborted();
      return parseObjectTrackingResult(output, request);
    }
    case "video_to_video": {
      const signal = isAbortSignal(params.signal)
        ? params.signal
        : host.signal;
      const referenceImages = coerceByteList(
        params.reference_images ?? params.referenceImages
      );
      const referenceAssetIds = coerceStringList(
        params.reference_asset_ids ?? params.referenceAssetIds
      );
      signal.throwIfAborted();
      return provider.videoToVideo(params.video as Uint8Array, {
        model: { id: req.model, name: req.model, provider: req.provider },
        prompt: params.prompt as string | undefined,
        referenceImages:
          referenceImages.length > 0 ? referenceImages : undefined,
        referenceAssetIds:
          referenceAssetIds.length > 0 ? referenceAssetIds : undefined,
        signal,
        entities: await coerceEntityList(params, host),
        negativePrompt: params.negative_prompt as string | undefined,
        strength: params.strength as number | undefined,
        durationSeconds: params.duration_seconds as number | undefined,
        resolution: params.resolution as string | undefined,
        seed: params.seed as number | undefined
      });
    }
    case "video_to_audio": {
      const source = isRecord(params.source)
        ? {
            assetId: params.source.assetId ?? params.source.asset_id,
            durationSeconds:
              params.source.durationSeconds ?? params.source.duration_seconds,
            startSeconds:
              params.source.startSeconds ?? params.source.start_seconds,
            endSeconds: params.source.endSeconds ?? params.source.end_seconds
          }
        : params.source;
      const request = VideoToAudioRequest.parse({
        task: VIDEO_TO_AUDIO_TASK,
        model: {
          id: req.model,
          provider: req.provider,
          supportedTasks: [VIDEO_TO_AUDIO_TASK]
        },
        source,
        sceneContext: params.sceneContext ?? params.scene_context
      });
      const video =
        params.video instanceof Uint8Array
          ? params.video
          : await loadMediaRefBytes(
              { type: "video", asset_id: request.source.assetId },
              host
            );
      if (!video?.byteLength) {
        throw new Error(
          "video_to_audio requires nonempty source video bytes"
        );
      }
      return requestVideoToAudio(provider, video, request, {
        signal: params.signal as AbortSignal | undefined
      });
    }
    case "extend_video": {
      if (
        (params.mode !== "start" && params.mode !== "end") ||
        typeof params.duration_seconds !== "number" ||
        !Number.isFinite(params.duration_seconds) ||
        params.duration_seconds <= 0
      ) {
        throw new Error(
          "extend_video requires start/end mode and positive duration_seconds"
        );
      }
      return provider.extendVideo(params.video as Uint8Array, {
        model: { id: req.model, name: req.model, provider: req.provider },
        prompt: typeof params.prompt === "string" ? params.prompt : "",
        mode: params.mode,
        durationSeconds: params.duration_seconds
      });
    }
    case "upscale_video":
      return provider.upscaleVideo(params.video as Uint8Array, {
        signal: params.signal as AbortSignal | undefined,
        model: { id: req.model, name: req.model, provider: req.provider },
        scale: params.scale as number | undefined,
        targetResolution: params.target_resolution as string | undefined,
        prompt: params.prompt as string | undefined,
        creativity: params.creativity as number | undefined,
        seed: params.seed as number | undefined,
        timeoutSeconds: params.timeout_seconds as number | undefined
      });
    case "interpolate_video":
      return provider.interpolateVideo(params.video as Uint8Array, {
        signal: params.signal as AbortSignal | undefined,
        model: { id: req.model, name: req.model, provider: req.provider },
        targetFps: params.target_fps as number | undefined,
        factor: params.factor as number | undefined,
        seed: params.seed as number | undefined,
        timeoutSeconds: params.timeout_seconds as number | undefined
      });
    case "outpaint_video":
      return provider.outpaintVideo(params.video as Uint8Array, {
        signal: params.signal as AbortSignal | undefined,
        model: { id: req.model, name: req.model, provider: req.provider },
        prompt: params.prompt as string | undefined,
        entities: await coerceEntityList(params, host),
        negativePrompt: params.negative_prompt as string | undefined,
        padding: coerceOutpaintPadding(params.padding),
        expandRatio: params.expand_ratio as number | undefined,
        aspectRatio: params.aspect_ratio as string | undefined,
        resolution: params.resolution as string | undefined,
        seed: params.seed as number | undefined,
        timeoutSeconds: params.timeout_seconds as number | undefined
      });
    case "matte_video":
      return provider.matteVideo(params.video as Uint8Array, {
        signal: params.signal as AbortSignal | undefined,
        model: { id: req.model, name: req.model, provider: req.provider },
        timeoutSeconds: params.timeout_seconds as number | undefined
      });
    case "lip_sync":
      return provider.lipSync(params.video as Uint8Array, {
        model: { id: req.model, name: req.model, provider: req.provider },
        audio: params.audio as Uint8Array,
        visualMimeType: params.visualMimeType as string | undefined,
        audioMimeType: params.audioMimeType as string | undefined,
        seed: params.seed as number | undefined
      });
    case "text_to_music":
      return provider.textToMusic({
        prompt: String(params.prompt ?? ""),
        model: { id: req.model, name: req.model, provider: req.provider },
        lyrics: params.lyrics as string | undefined,
        durationSeconds: params.duration_seconds as number | undefined,
        seed: params.seed as number | undefined,
        audioFormat: params.audioFormat as string | undefined,
        timeoutSeconds: params.timeout_seconds as number | undefined
      });
    case "audio_to_audio":
      return provider.audioToAudio(params.audio as Uint8Array, {
        model: { id: req.model, name: req.model, provider: req.provider },
        prompt: params.prompt as string | undefined,
        voice: params.voice as string | undefined,
        strength: params.strength as number | undefined,
        seed: params.seed as number | undefined,
        audioFormat: params.audioFormat as string | undefined,
        timeoutSeconds: params.timeout_seconds as number | undefined
      });
    case "automatic_speech_recognition":
      return provider.automaticSpeechRecognition({
        audio: params.audio as Uint8Array,
        model: req.model,
        language: params.language as string | undefined,
        prompt: params.prompt as string | undefined,
        temperature: params.temperature as number | undefined
      });
    case "generate_embedding":
      return provider.generateEmbedding({
        text: (params.text as string | string[]) ?? "",
        model: req.model,
        dimensions: params.dimensions as number | undefined
      });
    case "text_to_3d":
      return provider.textTo3D({
        model: model3dOf(params, req),
        prompt: String(params.prompt ?? ""),
        negativePrompt:
          (params.negative_prompt as string | undefined) ?? null,
        artStyle: (params.art_style as string | undefined) ?? null,
        outputFormat: params.output_format as string | undefined,
        seed: (params.seed as number | undefined) ?? null,
        timeoutSeconds:
          (params.timeout_seconds as number | undefined) ?? null,
        enableTextures: params.enable_textures as boolean | undefined
      });
    case "image_to_3d":
      return provider.imageTo3D(
        coerceImageList(params)[0] ?? new Uint8Array(),
        {
          model: model3dOf(params, req),
          prompt: (params.prompt as string | undefined) ?? null,
          outputFormat: params.output_format as string | undefined,
          seed: (params.seed as number | undefined) ?? null,
          timeoutSeconds:
            (params.timeout_seconds as number | undefined) ?? null
        }
      );
    default:
      throw new Error(
        `Capability '${req.capability}' requires streaming API`
      );
  }
}

/**
 * The 3D model a request names: the full `Model3D` the node resolved (with
 * its supported tasks and formats) when it passed one, else the minimal ref.
 */
function model3dOf(
  params: Record<string, unknown>,
  req: ProviderPredictionRequest
): Model3D {
  const given = params.model;
  if (
    isRecord(given) &&
    typeof given.id === "string" &&
    typeof given.provider === "string"
  ) {
    return given as unknown as Model3D;
  }
  return {
    id: req.model,
    name: req.model,
    provider: req.provider as Model3D["provider"]
  };
}
