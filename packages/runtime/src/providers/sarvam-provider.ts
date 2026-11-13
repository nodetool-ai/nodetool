/**
 * Sarvam AI provider (India): Bulbul text-to-speech, Saaras speech-to-text,
 * and Token Factory chat.
 *
 * - Chat speaks the OpenAI Chat Completions dialect against
 *   `https://api.sarvam.ai/v2`. Models come from `GET /v2/models`.
 * - Text-to-speech is `POST https://api.sarvam.ai/text-to-speech`, which
 *   answers JSON with base64 audio, so only the encoded path is offered.
 * - Speech-to-text is `POST https://api.sarvam.ai/speech-to-text` as
 *   multipart form data (clips under 30 seconds).
 *
 * Every endpoint takes the key in the `api-subscription-key` header. The
 * OpenAI SDK example in Sarvam's Token Factory docs sends it as a Bearer
 * token instead, so chat sends both.
 */

import { createLogger } from "@nodetool-ai/config";
import { isRecord } from "@nodetool-ai/protocol";
import type { ProviderCapability } from "./base-provider.js";
import { sniffAudioMimeOrNull } from "./audio-mime.js";
import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import type { ChatCompletionsRequest } from "./openai-compat/index.js";
import {
  PROVIDER_IDS,
  type ASRModel,
  type ASRResult,
  type EncodedAudioResult,
  type LanguageModel,
  type StreamingAudioChunk,
  type TextToSpeechParams,
  type TTSModel
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.sarvam");

const SARVAM_API_BASE = "https://api.sarvam.ai";
const SARVAM_CHAT_BASE_URL = `${SARVAM_API_BASE}/v2`;

/** Languages the Bulbul TTS endpoint accepts for `language_code`. */
export const SARVAM_TTS_LANGUAGES = [
  "bn-IN",
  "en-IN",
  "gu-IN",
  "hi-IN",
  "kn-IN",
  "ml-IN",
  "mr-IN",
  "od-IN",
  "pa-IN",
  "ta-IN",
  "te-IN"
] as const;

/** Languages the Saaras REST transcribe endpoint accepts for `language_code`. */
export const SARVAM_ASR_LANGUAGES = [
  "hi-IN",
  "bn-IN",
  "kn-IN",
  "ml-IN",
  "mr-IN",
  "od-IN",
  "pa-IN",
  "ta-IN",
  "te-IN",
  "en-IN",
  "gu-IN",
  "as-IN",
  "ur-IN",
  "ne-IN",
  "kok-IN",
  "ks-IN",
  "sd-IN",
  "sa-IN",
  "sat-IN",
  "mni-IN",
  "brx-IN",
  "mai-IN",
  "doi-IN"
] as const;

/** Bulbul v3 speakers, default (`shubh`) first. */
const BULBUL_V3_SPEAKERS = [
  "shubh",
  "aditya",
  "ritu",
  "priya",
  "neha",
  "rahul",
  "pooja",
  "rohan",
  "simran",
  "kavya",
  "amit",
  "dev",
  "ishita",
  "shreya",
  "ratan",
  "varun",
  "manan",
  "sumit",
  "roopa",
  "kabir",
  "aayan",
  "ashutosh",
  "advait",
  "anand",
  "tanya",
  "tarun",
  "sunny",
  "mani",
  "gokul",
  "vijay",
  "shruti",
  "suhani",
  "mohit",
  "kavitha",
  "rehan",
  "soham",
  "rupali"
];

/** Bulbul v2 speakers, default (`anushka`) first. */
const BULBUL_V2_SPEAKERS = [
  "anushka",
  "manisha",
  "vidya",
  "arya",
  "abhilash",
  "karun",
  "hitesh"
];

/**
 * Bulbul v4-flash personas (`<name>_<language>_<style>`), default
 * (`shubh_enhi_ads`) first, from the Voices guide at
 * https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/voices.
 * Sarvam has no listing endpoint for preset voices, and new personas may
 * appear before this list catches up, so a speaker outside it is still sent
 * as given.
 */
const BULBUL_V4_FLASH_SPEAKERS = [
  "shubh_enhi_ads",
  // Hindi
  "aayan_hi_conversational", "amit_hi_conversational", "ashutosh_hi_conversational",
  "kabir_hi_conversational", "kavya_hi_conversational", "manan_hi_conversational",
  "rahul_hi_conversational", "sumit_hi_conversational", "aditya_hi_conversational",
  "aditya_hi_sales", "anand_hi_documentary", "anand_hi_news", "aparna_hi_customer",
  "aparna_hi_kyc", "ashok_hi_character", "ashok_hi_news", "chhavi_hi_kids",
  "ishita_hi_ads", "ishita_hi_edtech", "ishita_hi_banking", "ishita_hi_ads_informal",
  "ishita_hi_devotional", "ishita_hi_numbers", "ishita_hi_social", "kunal_hi_kids",
  "mahesh_hi_documentary", "mani_hi_devotional", "mani_hi_conversational",
  "mohit_hi_conversational", "nachiket_hi_devotional", "priya_hi_recovery",
  "ratan_hi_latenight", "ratan_hi_customer_expressive", "ratan_hi_documentary",
  "ratan_hi_devotional", "ratan_hi_recovery", "ratan_hi_social", "ratan_hi_sports",
  "ratan_hi_latenight_warm", "rehan_hi_social", "ritu_hi_customer_utility",
  "ritu_hi_kids", "ritu_hi_conversation", "ritu_hi_customer", "ritu_hi_edtech",
  "ritu_hi_ads_formal", "ritu_hi_banking", "ritu_hi_ads_informal", "ritu_hi_insurance",
  "ritu_hi_edtech_bot", "ritu_hi_medical", "ritu_hi_sales", "ritu_hi_reels",
  "ritu_hi_social", "ritu_hi_customer_warm", "ritu_hi_social_lively",
  "roopa_hi_companion", "roopa_hi_narration", "roopa_hi_recovery", "roopa_hi_market",
  "roopa_hi_conversational", "sanchita_hi_assistant", "sanchita_hi_edtech",
  "sanchita_hi_banking", "sanchita_hi_feedback", "sanchita_hi_ads_formal",
  "sanchita_hi_ads_informal", "sanchita_hi_interview", "sanchita_hi_romantic",
  "sanchita_hi_market", "sanchita_hi_social", "sanchita_hi_kyc",
  "sarika_hi_conversation", "shalini_hi_companion", "shalini_hi_social",
  "shreya_hi_conversational", "shreya_hi_news", "shruti_hi_edtech",
  "shubh_hi_customer", "shubh_hi_ecomm", "shubh_hi_stories_mixed",
  "shubh_hi_devotional", "shubh_hi_ads", "shubh_hi_recovery",
  "shubh_hi_stories_dramatic", "simran_hi_assistant", "simran_hi_narration",
  "simran_hi_automobile", "simran_hi_conversation", "simran_hi_news_breaking",
  "simran_hi_social_energetic", "simran_hi_social_excited", "simran_hi_latenight",
  "simran_hi_news", "simran_hi_recovery", "simran_hi_sales", "suchitra_hi_ecomm",
  "suhani_hi_social", "sunny_hi_ads", "sunny_hi_reels", "tarun_hi_conversational",
  "tarun_hi_sales", "chaitra_hi_customer", "shilpa_hi_narration", "tanya_hi_narration",
  "aarti_hi_customer", "advait_hi_character", "aryaman_hi_ads", "chirag_hi_social",
  "girish_hi_devotional", "mukul_hi_ads", "mukul_hi_suspense", "suman_hi_companion",
  "vaibhav_hi_social", "vandana_hi_ecomm", "vipul_hi_social",
  // English
  "aditi_en_stories", "aparna_en_companion", "aparna_en_edtech", "ashwin_en_sports",
  "ashwin_en_sports_energetic", "chandrika_en_stories", "dev_en_recovery",
  "dev_en_conversational", "deven_en_conversation", "ishita_en_customer",
  "ishita_en_medical", "ishita_en_numbers", "ishita_en_social", "ishita_en_stories",
  "kalpit_en_edtech", "nachiket_en_ads", "neha_en_customer", "neha_en_latenight",
  "nupur_en_kids", "ojas_en_social", "ritu_en_edtech", "ritu_en_latenight",
  "ritu_en_medical", "ritu_en_reels", "rohan_en_recovery", "roopa_en_conversational",
  "rustom_en_suspense", "sanchita_en_companion", "sanchita_en_insurance",
  "sanchita_en_recovery", "sanchita_en_market", "sanchita_en_social",
  "shabana_en_edtech", "shalini_en_companion", "shalini_en_customer",
  "shubh_en_narration", "shubh_en_numbers", "shubh_en_ads", "shubh_en_recovery",
  "shubh_en_audiobook", "shubh_en_narration_gentle", "shubh_en_sports",
  "simran_en_narration", "simran_en_automobile", "simran_en_conversation",
  "simran_en_customer", "simran_en_edtech", "simran_en_edtech_bot", "simran_en_sales",
  "simran_en_recovery", "simran_en_ads", "simran_en_therapist", "sunny_en_social",
  "varun_en_ads", "varun_en_suspense", "zarina_en_conversation",
  "amelia_en_conversational", "sophia_en_conversational", "girish_en_documentary",
  "girish_en_devotional", "payal_en_edtech", "sarang_en_narration",
  // Hindi-English code-mixed
  "ishita_enhi_companion", "ishita_enhi_customer", "ishita_enhi_customer_expressive",
  "sanchita_enhi_companion", "shalini_enhi_companion", "shalini_enhi_customer",
  "shubh_enhi_companion", "shubh_enhi_banking", "simran_enhi_companion",
  "simran_enhi_customer", "simran_enhi_banking_expressive", "sunny_enhi_customer",
  // Marathi
  "ishita_mr_conversational", "mrunal_mr_narration", "neha_mr_narration",
  "nilesh_mr_conversation", "ritu_mr_insurance", "ritu_mr_narration",
  "rupali_mr_stories", "soham_mr_narration", "mukul_mr_stories",
  // Kannada
  "chaitra_kn_conversation", "chaitra_kn_narration", "chetan_kn_conversation",
  "suchitra_kn_narration",
  // Punjabi
  "anand_pa_conversation", "anand_pa_customer", "harpreet_pa_narration",
  "jaspal_pa_banking",
  // Tamil
  "aravind_ta_ads", "aravind_ta_suspense", "gokul_ta_narration", "vijay_ta_narration",
  // Telugu
  "kavitha_te_conversation", "kavitha_te_narration", "pooja_te_conversation",
  "tarun_te_narration",
  // Gujarati
  "bhavik_gu_conversation", "pooja_gu_conversational", "pooja_gu_customer",
  // Bengali
  "arnab_bn_conversation", "roopa_bn_conversational", "bimal_bn_suspense"
];

interface BulbulModelSpec {
  id: string;
  name: string;
  voices: string[];
  /** Inclusive `pace` range the model accepts. */
  pace: [number, number];
}

/**
 * Bulbul models. Sarvam has no listing endpoint for TTS models, so this is
 * hand-listed from the Text-to-Speech REST reference.
 */
const BULBUL_MODELS: BulbulModelSpec[] = [
  {
    id: "bulbul:v4-flash",
    name: "Bulbul v4 Flash",
    voices: BULBUL_V4_FLASH_SPEAKERS,
    pace: [0.5, 2.0]
  },
  {
    id: "bulbul:v3",
    name: "Bulbul v3",
    voices: BULBUL_V3_SPEAKERS,
    pace: [0.5, 2.0]
  },
  {
    id: "bulbul:v2",
    name: "Bulbul v2",
    voices: BULBUL_V2_SPEAKERS,
    pace: [0.3, 3.0]
  }
];

/**
 * Saaras models. Sarvam has no listing endpoint for speech-to-text models,
 * so this is hand-listed from the Speech-to-Text REST reference.
 */
const SAARAS_MODELS: Array<{ id: string; name: string }> = [
  { id: "saaras:v4", name: "Saaras v4" },
  { id: "saaras:v3", name: "Saaras v3" }
];

/** `output_audio_codec` values this provider requests, with their MIME type. */
const TTS_CODEC_MIME: Record<string, string> = {
  wav: "audio/wav",
  mp3: "audio/mpeg",
  flac: "audio/flac",
  aac: "audio/aac"
};

const AUDIO_MIME_EXT: Record<string, string> = {
  "audio/wav": "wav",
  "audio/mpeg": "mp3",
  "audio/flac": "flac",
  "audio/ogg": "ogg"
};

/**
 * Unicode script blocks for the Indic scripts Bulbul speaks, mapped to the
 * language code to send when the caller named none. Devanagari maps to Hindi
 * (Marathi shares the script; name `mr-IN` explicitly for it).
 */
const SCRIPT_LANGUAGES: Array<[RegExp, string]> = [
  [/[ऀ-ॿ]/, "hi-IN"],
  [/[ঀ-৿]/, "bn-IN"],
  [/[਀-੿]/, "pa-IN"],
  [/[઀-૿]/, "gu-IN"],
  [/[଀-୿]/, "od-IN"],
  [/[஀-௿]/, "ta-IN"],
  [/[ఀ-౿]/, "te-IN"],
  [/[ಀ-೿]/, "kn-IN"],
  [/[ഀ-ൿ]/, "ml-IN"]
];

/**
 * Map a caller's language (`hi`, `hi-IN`, `HI-in`, ISO `or` for Odia) onto a
 * code from `allowed`. Undefined when nothing matches.
 */
export function normalizeSarvamLanguage(
  language: string | undefined,
  allowed: readonly string[]
): string | undefined {
  const raw = language?.trim().toLowerCase();
  if (!raw) return undefined;
  const exact = allowed.find((code) => code.toLowerCase() === raw);
  if (exact) return exact;
  const base = raw.split(/[-_]/)[0] === "or" ? "od" : raw.split(/[-_]/)[0];
  return allowed.find((code) => code.toLowerCase() === `${base}-in`);
}

/** The language to synthesize in when the caller named none. */
function inferTtsLanguage(text: string, speaker: string | undefined): string {
  for (const [pattern, code] of SCRIPT_LANGUAGES) {
    if (pattern.test(text)) return code;
  }
  // v4-flash personas carry their language: `ritu_hi_kids` is Hindi.
  const tag = speaker?.split("_")[1];
  if (tag && tag !== "enhi") {
    const code = normalizeSarvamLanguage(tag, SARVAM_TTS_LANGUAGES);
    if (code) return code;
  }
  return "en-IN";
}

/** Read Sarvam's `{ error: { message, code, request_id } }` failure body. */
async function sarvamError(
  response: Response,
  operation: string
): Promise<Error> {
  const text = await response.text().catch(() => "");
  let detail = text;
  try {
    const parsed: unknown = JSON.parse(text);
    const error = isRecord(parsed) ? parsed.error : undefined;
    if (isRecord(error) && typeof error.message === "string") {
      detail =
        typeof error.code === "string"
          ? `${error.code}: ${error.message}`
          : error.message;
    }
  } catch {
    // Not JSON: keep the raw body.
  }
  return new Error(
    `Sarvam ${operation} failed: ${response.status}${detail ? ` ${detail}` : ""}`
  );
}

export class SarvamProvider extends OpenAICompatProvider {
  static override requiredSecrets(): string[] {
    return ["SARVAM_API_KEY"];
  }

  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return ["text_to_speech", "automatic_speech_recognition"];
  }

  constructor(
    secrets: { SARVAM_API_KEY?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.SARVAM_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("SARVAM_API_KEY is not configured");
    }
    super(
      {
        providerId: PROVIDER_IDS.SARVAM,
        apiKey,
        baseURL: SARVAM_CHAT_BASE_URL,
        defaultHeaders: { "api-subscription-key": apiKey }
      },
      options
    );
  }

  override getContainerEnv() {
    return { SARVAM_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  /** Sarvam documents `max_tokens`, not `max_completion_tokens`. */
  protected override transformChatRequest(
    request: ChatCompletionsRequest
  ): ChatCompletionsRequest {
    const { max_completion_tokens, ...rest } = request;
    if (max_completion_tokens === undefined) return request;
    return { ...rest, max_tokens: max_completion_tokens };
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return this.listCompatModels();
  }

  // ─── Text-to-speech ─────────────────────────────────────────────────────

  override async getAvailableTTSModels(): Promise<TTSModel[]> {
    return BULBUL_MODELS.map((model) => ({
      id: model.id,
      name: model.name,
      provider: PROVIDER_IDS.SARVAM,
      voices: model.voices,
      languages: [...SARVAM_TTS_LANGUAGES],
      capabilities: ["language_selection"]
    }));
  }

  /** The endpoint returns base64 files in JSON, never a PCM stream. */
  override supportsStreamingTextToSpeech(): boolean {
    return false;
  }

  // eslint-disable-next-line require-yield
  override async *textToSpeech(
    _args: TextToSpeechParams
  ): AsyncGenerator<StreamingAudioChunk> {
    throw new Error(
      "sarvam returns encoded audio only; use textToSpeechEncoded"
    );
  }

  override async textToSpeechEncoded(
    args: TextToSpeechParams
  ): Promise<EncodedAudioResult> {
    if (!args.text) throw new Error("text must not be empty");
    const spec = BULBUL_MODELS.find((m) => m.id === args.model);
    const speaker = args.voice?.trim().toLowerCase() || undefined;

    let languageCode: string;
    if (args.language?.trim()) {
      const code = normalizeSarvamLanguage(args.language, SARVAM_TTS_LANGUAGES);
      if (!code) {
        throw new Error(
          `Sarvam TTS does not support language "${args.language}". Supported: ${SARVAM_TTS_LANGUAGES.join(", ")}`
        );
      }
      languageCode = code;
    } else {
      languageCode = inferTtsLanguage(args.text, speaker);
    }

    const requested = (args.audioFormat ?? "wav").toLowerCase();
    const codec =
      requested === "mpeg" ? "mp3" : requested in TTS_CODEC_MIME ? requested : "wav";

    const body: Record<string, unknown> = {
      text: args.text,
      language_code: languageCode,
      model: args.model,
      output_audio_codec: codec
    };
    if (speaker) body.speaker = speaker;
    if (args.speed != null && args.speed !== 1.0) {
      const [min, max] = spec?.pace ?? [0.5, 2.0];
      body.pace = Math.max(min, Math.min(max, args.speed));
    }

    log.debug("Sarvam textToSpeech", { model: args.model, codec });
    const init: RequestInit = {
      method: "POST",
      headers: {
        "api-subscription-key": this.apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    };
    if (args.signal) init.signal = args.signal;
    const response = await this.compatFetch(
      `${SARVAM_API_BASE}/text-to-speech`,
      init
    );
    if (!response.ok) throw await sarvamError(response, "text-to-speech");

    const payload: unknown = await response.json();
    const audios = isRecord(payload) ? payload.audios : undefined;
    const first = Array.isArray(audios) ? audios[0] : undefined;
    if (typeof first !== "string" || first.length === 0) {
      throw new Error("Sarvam text-to-speech returned no audio");
    }
    return {
      data: new Uint8Array(Buffer.from(first, "base64")),
      mimeType: TTS_CODEC_MIME[codec]
    };
  }

  // ─── Speech-to-text ─────────────────────────────────────────────────────

  override async getAvailableASRModels(): Promise<ASRModel[]> {
    return SAARAS_MODELS.map((model) => ({
      id: model.id,
      name: model.name,
      provider: PROVIDER_IDS.SARVAM
    }));
  }

  /**
   * Transcribe with the REST endpoint. `word_timestamps` maps to
   * `with_timestamps`, which Sarvam answers with sentence or phrase chunks,
   * not single words. `prompt` and `temperature` have no Sarvam equivalent
   * and are ignored.
   */
  override async automaticSpeechRecognition(args: {
    audio: Uint8Array;
    model: string;
    language?: string;
    prompt?: string;
    temperature?: number;
    word_timestamps?: boolean;
  }): Promise<ASRResult> {
    if (!args.audio || args.audio.length === 0) {
      throw new Error("audio must not be empty");
    }
    const mimeType = sniffAudioMimeOrNull(args.audio) ?? "audio/wav";
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(args.audio)], { type: mimeType }),
      `audio.${AUDIO_MIME_EXT[mimeType] ?? "wav"}`
    );
    form.append("model", args.model);
    const languageCode = normalizeSarvamLanguage(
      args.language,
      SARVAM_ASR_LANGUAGES
    );
    // No language (or one Sarvam lacks) leaves the field out: auto-detect.
    if (languageCode) form.append("language_code", languageCode);
    if (args.word_timestamps) form.append("with_timestamps", "true");

    log.debug("Sarvam speechToText", { model: args.model });
    const response = await this.compatFetch(
      `${SARVAM_API_BASE}/speech-to-text`,
      {
        method: "POST",
        headers: { "api-subscription-key": this.apiKey },
        body: form
      }
    );
    if (!response.ok) throw await sarvamError(response, "speech-to-text");

    const payload: unknown = await response.json();
    if (!isRecord(payload) || typeof payload.transcript !== "string") {
      throw new Error("Sarvam speech-to-text returned no transcript");
    }
    const result: ASRResult = { text: payload.transcript };
    const timestamps = payload.timestamps;
    if (isRecord(timestamps)) {
      const words = timestamps.words;
      const starts = timestamps.start_time_seconds;
      const ends = timestamps.end_time_seconds;
      if (Array.isArray(words) && Array.isArray(starts) && Array.isArray(ends)) {
        result.chunks = words.flatMap((text, i) =>
          typeof text === "string" &&
          typeof starts[i] === "number" &&
          typeof ends[i] === "number"
            ? [{ text, timestamp: [starts[i], ends[i]] as [number, number] }]
            : []
        );
      }
    }
    return result;
  }
}
