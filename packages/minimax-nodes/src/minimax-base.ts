/**
 * Shared helpers and constants for the MiniMax node pack.
 *
 * Nodes talk to MiniMax's REST API directly (mirroring the elevenlabs-nodes
 * pattern) rather than going through the runtime provider. That lets each node
 * expose MiniMax-specific knobs — emotion, volume, pitch, lyrics, camera
 * direction — that the generic provider interface does not carry. All network
 * access goes through the global `fetch` so tests can stub it.
 *
 * Docs: https://platform.minimax.io/docs/api-reference/api-overview
 */

export const MINIMAX_BASE_URL = "https://api.minimax.io";

/** Resolve the MiniMax API key from injected secrets or the environment. */
export function getMinimaxApiKey(secrets: Record<string, string>): string {
  const key = secrets?.MINIMAX_API_KEY || process.env.MINIMAX_API_KEY || "";
  if (!key) throw new Error("MINIMAX_API_KEY is not configured");
  return key;
}

export function minimaxHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

interface MinimaxBaseResp {
  status_code?: number;
  status_msg?: string;
}

/** MiniMax embeds a `base_resp` on most responses; surface failures as errors. */
export function assertBaseResp(
  data: Record<string, unknown>,
  context: string
): void {
  const baseResp = data.base_resp as MinimaxBaseResp | undefined;
  if (baseResp && baseResp.status_code && baseResp.status_code !== 0) {
    throw new Error(
      `MiniMax ${context} failed: ${baseResp.status_msg ?? "unknown error"} (code ${baseResp.status_code})`
    );
  }
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
 * a download URL. Normalise both to raw bytes.
 */
export async function resolveAudioPayload(audio: string): Promise<Uint8Array> {
  if (/^https?:\/\//i.test(audio)) {
    const dl = await fetch(audio);
    if (!dl.ok) {
      throw new Error(`Failed to download MiniMax audio from ${audio}`);
    }
    return new Uint8Array(await dl.arrayBuffer());
  }
  return hexToBytes(audio);
}

export const AUDIO_FORMAT_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  flac: "audio/flac",
  pcm: "audio/pcm"
};

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
): { type: "audio"; data: string; content_type: string } {
  return {
    type: "audio",
    data: bytesToBase64(bytes),
    content_type: AUDIO_FORMAT_MIME[format] ?? "audio/mpeg"
  };
}

/** Guess an image MIME type from magic bytes; defaults to PNG. */
export function inferImageMime(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) {
    return "image/webp";
  }
  return "image/png";
}

export function imageRefFromBytes(
  bytes: Uint8Array
): { type: "image"; data: string; mimeType: string } {
  return {
    type: "image",
    data: bytesToBase64(bytes),
    mimeType: inferImageMime(bytes)
  };
}

export function videoRefFromBytes(
  bytes: Uint8Array
): { type: "video"; data: string } {
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
  "MiniMax-Hailuo-2.3-Fast",
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

// ---------------------------------------------------------------------------
// Async video generation (submit → poll → download)
// ---------------------------------------------------------------------------

export interface VideoTaskOptions {
  pollIntervalMs?: number;
  maxAttempts?: number;
}

/**
 * Submit a video generation task, poll until it succeeds, and download the
 * resulting file. Mirrors the runtime provider's flow so the node behaves
 * identically while exposing MiniMax-specific request fields.
 */
export async function generateVideo(
  apiKey: string,
  body: Record<string, unknown>,
  options: VideoTaskOptions = {}
): Promise<Uint8Array> {
  const submit = await fetch(`${MINIMAX_BASE_URL}/v1/video_generation`, {
    method: "POST",
    headers: minimaxHeaders(apiKey),
    body: JSON.stringify(body)
  });
  if (!submit.ok) {
    throw new Error(
      `MiniMax video_generation submit failed: ${submit.status} ${await submit.text()}`
    );
  }
  const submitData = (await submit.json()) as Record<string, unknown>;
  assertBaseResp(submitData, "video_generation submit");

  const taskId = submitData.task_id as string | undefined;
  if (!taskId) {
    throw new Error(
      `MiniMax video_generation returned no task_id: ${JSON.stringify(submitData)}`
    );
  }

  const fileId = await pollVideoTask(apiKey, taskId, options);
  return downloadFile(apiKey, fileId);
}

async function pollVideoTask(
  apiKey: string,
  taskId: string,
  options: VideoTaskOptions = {}
): Promise<string> {
  const pollIntervalMs = options.pollIntervalMs ?? 5000;
  const maxAttempts = options.maxAttempts ?? 360;
  const url = `${MINIMAX_BASE_URL}/v1/query/video_generation?task_id=${encodeURIComponent(
    taskId
  )}`;
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(url, { headers: minimaxHeaders(apiKey) });
    if (!res.ok) {
      throw new Error(
        `MiniMax video status failed: ${res.status} ${await res.text()}`
      );
    }
    const data = (await res.json()) as Record<string, unknown>;
    const status = String(data.status ?? "").toLowerCase();
    if (status === "success") {
      const fileId = data.file_id as string | undefined;
      if (!fileId) {
        throw new Error("MiniMax video task succeeded but returned no file_id");
      }
      return fileId;
    }
    if (status === "fail" || status === "failed") {
      throw new Error(
        `MiniMax video task failed: ${JSON.stringify(data.base_resp ?? data)}`
      );
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  throw new Error(
    `MiniMax video task timed out after ${maxAttempts * pollIntervalMs}ms`
  );
}

async function downloadFile(
  apiKey: string,
  fileId: string
): Promise<Uint8Array> {
  const url = `${MINIMAX_BASE_URL}/v1/files/retrieve?file_id=${encodeURIComponent(
    fileId
  )}`;
  const res = await fetch(url, { headers: minimaxHeaders(apiKey) });
  if (!res.ok) {
    throw new Error(
      `MiniMax files/retrieve failed: ${res.status} ${await res.text()}`
    );
  }
  const data = (await res.json()) as Record<string, unknown>;
  assertBaseResp(data, "files/retrieve");
  const file = data.file as Record<string, unknown> | undefined;
  const downloadUrl = (file?.download_url ?? file?.downloadURL) as
    | string
    | undefined;
  if (!downloadUrl) {
    throw new Error(
      `MiniMax files/retrieve returned no download_url: ${JSON.stringify(data)}`
    );
  }
  const dl = await fetch(downloadUrl);
  if (!dl.ok) {
    throw new Error(`Failed to download MiniMax file from ${downloadUrl}`);
  }
  return new Uint8Array(await dl.arrayBuffer());
}
