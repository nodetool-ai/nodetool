import { z } from "zod";
import type { BaseProvider } from "./base-provider.js";
import type { EncodedAudioResult } from "./types.js";

export const VIDEO_TO_AUDIO_TASK = "video_to_audio";

/** Source times are seconds in the original asset, before timeline retiming. */
export const VideoToAudioRequest = z
  .strictObject({
    task: z.literal(VIDEO_TO_AUDIO_TASK),
    model: z
      .strictObject({
        id: z.string().trim().min(1),
        provider: z.string().trim().min(1),
        supportedTasks: z
          .array(z.string())
          .refine(
            (tasks) => tasks.includes(VIDEO_TO_AUDIO_TASK),
            "The model must explicitly support video_to_audio"
          )
          .readonly()
      })
      .readonly(),
    source: z
      .strictObject({
        assetId: z.string().trim().min(1),
        durationSeconds: z.number().finite().positive(),
        startSeconds: z.number().finite().nonnegative(),
        endSeconds: z.number().finite().positive()
      })
      .refine(
        (source) => source.endSeconds > source.startSeconds,
        "The source window must have positive duration"
      )
      .refine(
        (source) => source.endSeconds <= source.durationSeconds,
        "The source window must fit within the asset duration"
      )
      .readonly(),
    sceneContext: z.string().trim().min(1)
  })
  .readonly();

export type VideoToAudioRequest = z.infer<typeof VideoToAudioRequest>;
export type VideoToAudioParams = VideoToAudioRequest & {
  readonly signal?: AbortSignal;
};

/**
 * Validate before provider dispatch. `video` contains the original source asset.
 * The provider must condition on the captured window and return encoded audio
 * starting at that window's zero, with its duration. Retiming and timeline
 * placement belong to a future caller. This function never applies the result.
 */
export async function requestVideoToAudio(
  provider: Pick<BaseProvider, "provider" | "getCapabilities" | "getAvailableVideoModels" | "videoToAudio">,
  video: Uint8Array,
  input: unknown,
  options: { readonly signal?: AbortSignal } = {}
): Promise<EncodedAudioResult> {
  const request = VideoToAudioRequest.parse(input);
  if (!(video instanceof Uint8Array) || video.byteLength === 0) {
    throw new Error("video_to_audio requires nonempty source video bytes");
  }
  if (request.model.provider !== provider.provider) {
    throw new Error("The video_to_audio model belongs to a different provider");
  }
  if (!provider.getCapabilities().includes(VIDEO_TO_AUDIO_TASK)) {
    throw new Error(`${provider.provider} does not support video_to_audio`);
  }
  options.signal?.throwIfAborted();
  const model = (await provider.getAvailableVideoModels()).find(
    (candidate) => candidate.id === request.model.id && candidate.provider === provider.provider
  );
  if (!model?.supportedTasks?.includes(VIDEO_TO_AUDIO_TASK)) {
    throw new Error(`Model ${request.model.id} does not support video_to_audio in the provider catalog`);
  }
  options.signal?.throwIfAborted();
  const validatedRequest: VideoToAudioRequest = {
    ...request,
    model: { ...request.model, supportedTasks: [...model.supportedTasks] }
  };
  if (options.signal) {
    return provider.videoToAudio(video, { ...validatedRequest, signal: options.signal });
  }
  return provider.videoToAudio(video, validatedRequest);
}
