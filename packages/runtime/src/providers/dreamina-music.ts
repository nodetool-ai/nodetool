import { randomUUID } from "node:crypto";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import type { EncodedAudioResult, MusicModel, TextToMusicParams } from "./types.js";

/**
 * Dreamina's AI music, built on the same web API as images and video. The page
 * calls it `generate_instrumental` (no model, no lyrics) and `generate_song`
 * (a vocal model from `audio_generate/get_common_config`, optional lyrics).
 * This module holds the request shapes. The provider supplies the signed
 * transport, so the module has no browser dependency of its own.
 */
export interface DreaminaMusicApi {
  callApi<T>(path: string, body: unknown): Promise<T>;
  submitAndAwait(body: Record<string, unknown>, submitId: string, timeoutMs: number, signal?: AbortSignal): Promise<DreaminaMusicRecord>;
  download(url: string, signal?: AbortSignal): Promise<Uint8Array>;
  appId: number;
  daVersion: string;
}

export interface DreaminaMusicRecord {
  item_list?: Array<{
    audio?: { origin_audio?: { url?: string; audio_url?: string; format?: string; duration_ms?: number } };
    common_attr?: { item_urls?: string[] };
  }>;
}

interface SongOption { key: string; enum_val?: { string_value?: string[] | null; int_value?: number[] | null; default_val_idx?: number | null } }
interface SongModelConfig { model_req_key: string; model_name: string; model_status?: number; options?: SongOption[] }

/** The one model id that needs no Dreamina model key. */
export const DREAMINA_INSTRUMENTAL_MODEL = "instrumental";

const MUSIC_MIN_VERSION = "3.2.3";
const MUSIC_TIMEOUT_MS = 5 * 60_000;
const CONFIG_TTL_MS = 5 * 60_000;
const DEFAULT_DURATION_SECONDS = 10;
const ONLINE = 0;

const MIME_BY_FORMAT: Record<string, string> = { wav: "audio/wav", mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac" };

/** Lyrics travel as a rich prompt: one paragraph node per line, each holding one text node. */
function lyricsNode(lyrics: string): Record<string, unknown> {
  const lines = lyrics.split(/\r?\n/).map((line) => line.trimEnd());
  return {
    type: "",
    id: randomUUID(),
    children: lines.map((content) => ({ type: "paragraph", id: randomUUID(), children: [{ type: "text", id: randomUUID(), content }] }))
  };
}

interface MusicDraftInput { kind: "generate_instrumental" | "generate_song"; prompt: string; durationSeconds: number; modelKey?: string; lyrics?: string }

export function musicDraftFor(input: MusicDraftInput, daVersion: string): string {
  const id = (): string => randomUUID();
  const ability: Record<string, unknown> = {
    type: "",
    id: id(),
    prompt: input.prompt,
    duration: input.durationSeconds,
    title: ""
  };
  if (input.kind === "generate_song") {
    ability.tags = [];
    ability.model_req_key = input.modelKey;
    if (input.lyrics) { ability.lyrics = lyricsNode(input.lyrics); }
  }
  const component = {
    type: "audio_base_component",
    id: id(),
    min_version: MUSIC_MIN_VERSION,
    aigc_mode: "workbench",
    metadata: { type: "", id: id(), created_platform: 3, created_platform_version: "", created_time_in_ms: String(Date.now()), created_did: "" },
    generate_type: input.kind,
    abilities: { type: "", id: id(), [input.kind]: ability }
  };
  return JSON.stringify({ type: "draft", id: id(), min_version: MUSIC_MIN_VERSION, min_features: [], is_from_tsn: true, version: daVersion, main_component_id: component.id, component_list: [component] });
}

function songEnum(model: SongModelConfig, key: string): number[] {
  const values = model.options?.find((o) => o.key === key)?.enum_val?.int_value;
  return Array.isArray(values) ? values : [];
}

/** First audio URL on a finished record: the original track, then the item's file list. */
export function musicUrlOf(record: DreaminaMusicRecord): { url: string; format: string } | undefined {
  const item = record.item_list?.[0];
  const original = item?.audio?.origin_audio;
  const url = original?.url ?? original?.audio_url ?? item?.common_attr?.item_urls?.[0];
  return url ? { url, format: (original?.format ?? "wav").toLowerCase() } : undefined;
}

export interface DreaminaMusic {
  models(): Promise<MusicModel[]>;
  generate(params: TextToMusicParams): Promise<EncodedAudioResult>;
}

export function createDreaminaMusic(api: DreaminaMusicApi): DreaminaMusic {
  let cache: { at: number; songs: SongModelConfig[] } | null = null;

  /** Vocal models. Some accounts and regions list none, and then only instrumental music is offered. */
  const songModels = async (): Promise<SongModelConfig[]> => {
    if (cache && Date.now() - cache.at < CONFIG_TTL_MS) return cache.songs;
    const data = await api.callApi<{ song?: { model_list?: SongModelConfig[] | null } }>("/mweb/v1/audio_generate/get_common_config", { scene_list: ["song"] });
    const songs = (data.song?.model_list ?? []).filter((m) => (m.model_status ?? ONLINE) === ONLINE);
    cache = { at: Date.now(), songs };
    return songs;
  };

  return {
    async models(): Promise<MusicModel[]> {
      const instrumental: MusicModel = { id: DREAMINA_INSTRUMENTAL_MODEL, name: "Dreamina Instrumental", provider: PROVIDER_IDS.DREAMINA, supportedTasks: ["text_to_music"] };
      const songs = await songModels().catch(() => []);
      return [instrumental, ...songs.map((m): MusicModel => ({ id: m.model_req_key, name: m.model_name, provider: PROVIDER_IDS.DREAMINA, supportedTasks: ["text_to_music"] }))];
    },

    async generate(params: TextToMusicParams): Promise<EncodedAudioResult> {
      const prompt = params.prompt?.trim();
      if (!prompt) throw new Error("prompt must not be empty");
      const seconds = params.durationSeconds ?? DEFAULT_DURATION_SECONDS;
      if (!Number.isInteger(seconds) || seconds <= 0) throw new Error(`Dreamina music takes a whole number of seconds, not ${seconds}`);
      const lyrics = params.lyrics?.trim();

      let draft: string;
      if (params.model.id === DREAMINA_INSTRUMENTAL_MODEL) {
        if (lyrics) throw new Error("The Dreamina instrumental model takes no lyrics. Pick a vocal model to sing them");
        draft = musicDraftFor({ kind: "generate_instrumental", prompt, durationSeconds: seconds }, api.daVersion);
      } else {
        const config = (await songModels()).find((m) => m.model_req_key === params.model.id);
        if (!config) throw new Error(`Unknown Dreamina music model: ${params.model.id}`);
        const durations = songEnum(config, "duration");
        if (durations.length > 0 && !durations.includes(seconds)) throw new Error(`Dreamina model ${config.model_name} offers ${durations.join(", ")} second tracks, not ${seconds}`);
        const draftInput: MusicDraftInput = { kind: "generate_song", prompt, durationSeconds: seconds, modelKey: config.model_req_key };
        if (lyrics) { draftInput.lyrics = lyrics; }
        draft = musicDraftFor(draftInput, api.daVersion);
      }

      const submitId = randomUUID();
      const record = await api.submitAndAwait({
        submit_id: submitId,
        metrics_extra: JSON.stringify({ isDefaultSeed: 1, originSubmitId: submitId, isRegenerate: false }),
        draft_content: draft,
        http_common_info: { aid: api.appId }
      }, submitId, (params.timeoutSeconds ?? MUSIC_TIMEOUT_MS / 1000) * 1000, params.signal);
      const found = musicUrlOf(record);
      if (!found) throw new Error("Dreamina finished without audio");
      return { data: await api.download(found.url, params.signal), mimeType: MIME_BY_FORMAT[found.format] ?? `audio/${found.format}` };
    }
  };
}
