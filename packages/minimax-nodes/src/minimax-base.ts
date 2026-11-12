/**
 * Shared helpers and constants for the MiniMax node pack.
 *
 * Each node builds MiniMax's own request body, so it can expose the
 * MiniMax-specific knobs — emotion, volume, pitch, lyrics, camera direction —
 * that the generic provider capabilities do not carry. The request itself goes
 * through `context.callProviderEndpoint` to the runtime `MinimaxProvider`,
 * which holds the API key, checks `base_resp` and writes the generation
 * record. Result URLs download through `context.downloadProviderMedia`.
 *
 * Docs: https://platform.minimax.io/docs/api-reference/api-overview
 */

import { isNonEmptyString, isRecord } from "@nodetool-ai/node-sdk";
import { detectImageMime } from "@nodetool-ai/runtime";
import type {
  EndpointCallRequest,
  EndpointCallResult,
  ProcessingContext
} from "@nodetool-ai/runtime";

/** The endpoint families of `MinimaxProvider.callEndpoint` the nodes use. */
export type MinimaxRoute = "tts" | "music" | "image" | "video";

/** The fields of a MiniMax reply the nodes read. */
export interface MinimaxReply {
  /** `data.audio`: hex-encoded audio, or a download URL. */
  audio: string | null;
  /** `data.image_base64`. */
  imageBase64: string[];
  /** `data.image_urls`. */
  imageUrls: string[];
  /** `file.download_url` of a files/retrieve reply. */
  downloadUrl: string | null;
  /** The whole reply as JSON, for error messages. */
  describe: () => string;
}

function parseReply(result: EndpointCallResult): MinimaxReply {
  const output = result.output;
  const data =
    isRecord(output) && isRecord(output.data) ? output.data : undefined;
  const file =
    isRecord(output) && isRecord(output.file) ? output.file : undefined;
  const downloadUrl = file?.download_url ?? file?.downloadURL;
  return {
    audio: isNonEmptyString(data?.audio) ? data.audio : null,
    imageBase64: Array.isArray(data?.image_base64)
      ? data.image_base64.filter(isNonEmptyString)
      : [],
    imageUrls: Array.isArray(data?.image_urls)
      ? data.image_urls.filter(isNonEmptyString)
      : [],
    downloadUrl: isNonEmptyString(downloadUrl) ? downloadUrl : null,
    describe: () => JSON.stringify(output)
  };
}

/**
 * Call one MiniMax endpoint through the runtime provider, inside the
 * generation seam. The provider throws on an HTTP error and on a non-zero
 * `base_resp.status_code`.
 */
export async function callMinimax(
  context: ProcessingContext,
  args: {
    route: MinimaxRoute;
    capability:
      | "text_to_speech"
      | "text_to_music"
      | "text_to_image"
      | "text_to_video"
      | "image_to_video";
    model: string;
    input: EndpointCallRequest["input"];
    nodeId?: string;
  }
): Promise<MinimaxReply> {
  const result = await context.callProviderEndpoint({
    provider: "minimax",
    ...args,
    signal: context.signal
  });
  return parseReply(result);
}

/** Decode MiniMax's hex-encoded audio payloads to raw bytes. */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const len = Math.floor(clean.length / 2);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/**
 * MiniMax audio endpoints return either hex-encoded bytes or, when configured,
 * a download URL. Normalise both to raw bytes. The provider downloads the URL
 * through its screened fetch.
 */
export async function resolveAudioPayload(
  context: ProcessingContext,
  audio: string
): Promise<Uint8Array> {
  if (/^https?:\/\//i.test(audio)) {
    return context.downloadProviderMedia({
      provider: "minimax",
      url: audio,
      signal: context.signal
    });
  }
  return hexToBytes(audio);
}

export const AUDIO_FORMAT_MIME = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  flac: "audio/flac",
  pcm: "audio/pcm"
} satisfies Record<string, string>;

type MinimaxAudioFormat = keyof typeof AUDIO_FORMAT_MIME;

/** Inline media refs the nodes emit. `data` is raw base64, never a data URL. */
export interface MinimaxAudioRef {
  type: string;
  data: string;
  content_type: string;
}

export interface MinimaxImageRef {
  type: string;
  data: string;
  mimeType: string;
}

export interface MinimaxVideoRef {
  type: string;
  data: string;
}

/**
 * Build an inline AudioRef from raw bytes for the given format.
 *
 * `data` is RAW base64 (no `data:` prefix); the MIME type goes in
 * `content_type`. Asset-saving (`decodeAssetBytes`) and provider forwarding
 * (`asUint8Array`) decode `data` directly with `Buffer.from(data, "base64")`,
 * so a `data:` prefix would corrupt the bytes.
 */
export function audioRefFromBytes(
  bytes: Uint8Array,
  format: string
): MinimaxAudioRef {
  // SAFETY: the `in` check just established that `format` is one of the four
  // own keys of AUDIO_FORMAT_MIME, so the indexed read hits a declared entry.
  const contentType =
    format in AUDIO_FORMAT_MIME
      ? AUDIO_FORMAT_MIME[format as MinimaxAudioFormat]
      : "audio/mpeg";
  return {
    type: "audio",
    data: bytesToBase64(bytes),
    content_type: contentType
  };
}

/**
 * Guess an image MIME type from magic bytes; defaults to PNG. The local copy
 * this replaced read `bytes[8]` with no length guard and matched WebP on two
 * bytes of "RIFF".
 */
export const inferImageMime = detectImageMime;

export function imageRefFromBytes(bytes: Uint8Array): MinimaxImageRef {
  return {
    type: "image",
    data: bytesToBase64(bytes),
    mimeType: inferImageMime(bytes)
  };
}

export function videoRefFromBytes(bytes: Uint8Array): MinimaxVideoRef {
  return { type: "video", data: bytesToBase64(bytes) };
}

// ---------------------------------------------------------------------------
// Catalogues
// ---------------------------------------------------------------------------

/**
 * Curated subset of MiniMax's 300+ system voices — enough for a UI picker.
 * Any MiniMax voice_id (including cloned voices) can still be passed directly
 * to the Text to Speech node.
 */
export const MINIMAX_VOICES: string[] = [
  "English_Trustworth_Man",
  "English_CalmWoman",
  "English_UpsetGirl",
  "English_Gentle-voiced_man",
  "English_Whispering_girl_v3",
  "English_Diligent_Man",
  "English_Graceful_Lady",
  "English_ReservedYoungMan",
  "English_PlayfulGirl",
  "English_ManWithDeepVoice",
  "English_GentleTeacher",
  "English_MaturePartner",
  "English_FriendlyPerson",
  "English_MatureBoss",
  "English_Debator",
  "English_LovelyGirl",
  "English_Steadymentor",
  "English_Deep-VoicedGentleman",
  "English_DecentYoungMan",
  "English_SentimentalLady",
  "English_ImposingManner",
  "English_SadTeen",
  "English_Wiselady",
  "English_CaptivatingStoryteller",
  "English_AttractiveGirl",
  "English_DescendPriest",
  "English_ConfidentWoman",
  "English_CuteElf",
  "English_radiant_girl",
  "English_Insightful_Speaker",
  "Chinese (Mandarin)_Warm_Bestie",
  "Chinese (Mandarin)_Gentleman",
  "Chinese (Mandarin)_Kind-hearted_Antie",
  "Chinese (Mandarin)_Lyrical_Voice",
  "Chinese (Mandarin)_Straightforward_Boy",
  "Chinese (Mandarin)_Stubborn_Friend",
  "Chinese (Mandarin)_Sweet_Girl_2",
  "Chinese (Mandarin)_Gentle_Youth",
  "Chinese (Mandarin)_Warm_Girl",
  "Chinese (Mandarin)_Male_Announcer"
];

export const DEFAULT_VOICE = "English_Trustworth_Man";

export const MINIMAX_TTS_MODELS: string[] = [
  "speech-2.8-hd",
  "speech-2.8-turbo",
  "speech-2.6-hd",
  "speech-2.6-turbo",
  "speech-02-hd",
  "speech-02-turbo"
];

/** "auto" is a node-only sentinel meaning "omit emotion from the request". */
export const MINIMAX_EMOTIONS: string[] = [
  "auto",
  "neutral",
  "happy",
  "sad",
  "angry",
  "fearful",
  "disgusted",
  "surprised"
];

/** "auto" is a node-only sentinel meaning "let MiniMax autodetect the language". */
export const MINIMAX_LANGUAGE_BOOST: string[] = [
  "auto",
  "English",
  "Chinese",
  "Chinese,Yue",
  "Japanese",
  "Korean",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Portuguese",
  "Russian",
  "Arabic",
  "Turkish",
  "Dutch",
  "Ukrainian",
  "Vietnamese",
  "Indonesian",
  "Thai",
  "Polish"
];

export const MINIMAX_MUSIC_MODELS: string[] = [
  "music-2.6",
  "music-1.5",
  "music-01"
];

export const MINIMAX_IMAGE_ASPECTS: string[] = [
  "1:1",
  "16:9",
  "4:3",
  "3:2",
  "2:3",
  "3:4",
  "9:16",
  "21:9"
];

export const MINIMAX_T2V_MODELS: string[] = [
  "MiniMax-Hailuo-2.3",
  "MiniMax-Hailuo-02",
  "T2V-01-Director"
];

export const MINIMAX_I2V_MODELS: string[] = [
  "MiniMax-Hailuo-2.3",
  "MiniMax-Hailuo-2.3-Fast",
  "MiniMax-Hailuo-02",
  "I2V-01-Director",
  "S2V-01"
];

export const MINIMAX_VIDEO_RESOLUTIONS: string[] = ["512P", "768P", "1080P"];
export const MINIMAX_VIDEO_DURATIONS: number[] = [6, 10];

/**
 * Sanitize duration/resolution for a video request. They are Hailuo-only
 * knobs — the 01-series models (T2V-01-Director, I2V-01-Director, S2V-01)
 * are fixed at 6s/720P and reject both parameters. Within the Hailuo family,
 * 512P exists only on Hailuo-02 and 10s clips render only at 768P; invalid
 * combinations fall back to 768P (the API default) so MiniMax doesn't reject
 * the request.
 */
export interface MinimaxVideoRenderSettings {
  duration?: number;
  resolution?: string;
}

export function videoRenderSettings(
  model: string,
  duration: number,
  resolution: string
): MinimaxVideoRenderSettings {
  if (!model.startsWith("MiniMax-Hailuo")) return {};
  const d = duration >= 9 ? 10 : 6;
  let r = resolution;
  if (r === "512P" && model !== "MiniMax-Hailuo-02") r = "768P";
  if (r === "1080P" && d === 10) r = "768P";
  return { duration: d, resolution: r };
}

// ---------------------------------------------------------------------------
// Async video generation (submit → poll → download)
// ---------------------------------------------------------------------------

/**
 * Request body for `/v1/video_generation`. `first_frame_image` and
 * `subject_reference` are mutually exclusive: the 01-series S2V model animates
 * a character reference, every other model takes a first frame.
 */
export interface MinimaxVideoRequest extends MinimaxVideoRenderSettings {
  model: string;
  prompt?: string;
  first_frame_image?: string;
  /** The frame the clip ends on. MiniMax-Hailuo-02 only. */
  last_frame_image?: string;
  subject_reference?: Array<{ type: string; image: string[] }>;
}

/**
 * Generate a video through the provider's `video` route, which submits the
 * task, polls it and retrieves the file record, then download the file.
 */
export async function generateVideo(
  context: ProcessingContext,
  body: MinimaxVideoRequest,
  capability: "text_to_video" | "image_to_video",
  nodeId?: string
): Promise<Uint8Array> {
  const reply = await callMinimax(context, {
    route: "video",
    capability,
    model: body.model,
    input: { ...body },
    nodeId
  });
  if (!reply.downloadUrl) {
    throw new Error(
      `MiniMax files/retrieve returned no download_url: ${reply.describe()}`
    );
  }
  return context.downloadProviderMedia({
    provider: "minimax",
    url: reply.downloadUrl,
    signal: context.signal
  });
}
