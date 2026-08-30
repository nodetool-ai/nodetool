/**
 * scriptVoicing — the per-line voicing pipeline.
 *
 * Identical to TimelineTranscriptStore.generateBeat, minus the timeline
 * coupling: text is the source of truth, a voiced take is derived.
 *
 *   line text → generate_media (TTS) → probe duration →
 *   transcribe_audio (word timings, best-effort) → append take
 *
 * Reuses the unified WebSocket runner's `generate_media` / `transcribe_audio`
 * RPCs — no inline graphs, no bespoke engine.
 */

import { randomRequestId, rpcRequest } from "../../lib/websocket/rpcRequest";
import { useAssetStore } from "../AssetStore";
import { getAssetUrl } from "../../utils/assetHelpers";
import {
  useScriptStore,
  effectiveVoice,
  lineStatus,
  type ScriptDraft,
  type ScriptCaptionWord,
  type ScriptLine,
  type ScriptTake,
  type VoiceBinding
} from "./ScriptStore";
import { syncLineClipToTimeline } from "./timelineSync";
import { isNumber, isObjectLike, isString } from "../../utils/typePredicates";

/** Speech-to-text default for word-level take timing (best-effort). */
interface AsrConfig {
  provider: string;
  model: string;
}

const DEFAULT_ASR_CONFIG: AsrConfig = {
  provider: "openai",
  model: "whisper-1"
};

// ── RPC helpers (mirror TimelineTranscriptStore's request/response pattern) ──

async function probeAudioDurationMs(url: string): Promise<number | null> {
  if (typeof Audio === "undefined") return null;
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      resolve(
        Number.isFinite(audio.duration) && audio.duration > 0
          ? Math.round(audio.duration * 1000)
          : null
      );
    };
    audio.onerror = () => resolve(null);
    audio.src = url;
  });
}

async function resolveAssetUrl(assetId: string): Promise<string | null> {
  try {
    const asset = await useAssetStore.getState().get(assetId);
    return getAssetUrl(asset);
  } catch {
    return null;
  }
}

function parseCaptionWords(
  result: Record<string, unknown>
): ScriptCaptionWord[] {
  const raw = Array.isArray(result.words) ? result.words : [];
  const words: ScriptCaptionWord[] = [];
  for (const entry of raw) {
    if (!isObjectLike(entry)) continue;
    const w = entry as Record<string, unknown>;
    if (
      isString(w.word) &&
      isNumber(w.startMs) &&
      isNumber(w.endMs)
    ) {
      words.push({ word: w.word, startMs: w.startMs, endMs: w.endMs });
    }
  }
  return words;
}

function takeId(): string {
  return `take_${randomRequestId()}`;
}

/**
 * Voice one line into a new take and set it current. Resolves to the appended
 * take, or throws when the line has no voice or no text. Word timings are
 * best-effort: a failed transcription still yields a playable take.
 */
export async function voiceLine(
  scriptId: string,
  lineId: string,
  asr: AsrConfig = DEFAULT_ASR_CONFIG
): Promise<ScriptTake> {
  const store = useScriptStore;
  const script = store.getState().scripts[scriptId];
  if (!script) throw new Error("Script not found");
  const line = script.sections
    .flatMap((s) => s.lines)
    .find((l) => l.id === lineId);
  if (!line) throw new Error("Line not found");

  const text = line.text.trim();
  if (!text) throw new Error("Line has no text to voice");

  const voice: VoiceBinding | null = effectiveVoice(line, script.cast);
  if (!voice) {
    throw new Error(
      "Line has no voice — assign the speaker a voice or set a per-line override"
    );
  }

  store.getState().setVoicing(lineId, true);
  try {
    const ttsResult = await rpcRequest("generate_media", {
      mode: "audio",
      provider: voice.provider,
      model: voice.model,
      voice: voice.voice,
      prompt: text
    });
    const assetIds = Array.isArray(ttsResult.asset_ids)
      ? (ttsResult.asset_ids as unknown[]).filter(
          (id): id is string => typeof id === "string"
        )
      : [];
    const audioAssetId = assetIds[0];
    if (!audioAssetId) throw new Error("TTS returned no audio asset");

    const url = await resolveAssetUrl(audioAssetId);
    const durationMs = url ? ((await probeAudioDurationMs(url)) ?? 0) : 0;

    let words: ScriptCaptionWord[] = [];
    try {
      const asrResult = await rpcRequest("transcribe_audio", {
        provider: asr.provider,
        model: asr.model,
        asset_id: audioAssetId
      });
      words = parseCaptionWords(asrResult);
    } catch (error) {
      console.warn("Take transcription failed; take stays playable", error);
    }

    const take: ScriptTake = {
      id: takeId(),
      assetId: audioAssetId,
      durationMs,
      words,
      textSnapshot: line.text,
      voiceSnapshot: voice,
      createdAt: new Date().toISOString(),
      costCredits:
        isNumber(ttsResult.cost_credits)
          ? ttsResult.cost_credits
          : undefined
    };
    store.getState().appendTake(scriptId, lineId, take);
    // If this script was already assembled into a timeline, round-trip the new
    // take into the linked clip. Fire-and-forget; a sync miss never fails the
    // take (the sync logs and returns false).
    void syncLineClipToTimeline(scriptId, lineId, take);
    return take;
  } finally {
    store.getState().setVoicing(lineId, false);
  }
}

/** A line `voiceAll` would voice, with the voice it would use. */
export interface VoiceTarget {
  line: ScriptLine;
  voice: VoiceBinding;
}

/**
 * The lines a *Voice all* would synthesize: every draft or stale line that has
 * text and a voice to say it in. Shared with the cost estimate, so what the
 * toolbar quotes is what the click will voice.
 */
export function voiceTargets(script: ScriptDraft): VoiceTarget[] {
  const targets: VoiceTarget[] = [];
  for (const section of script.sections) {
    for (const line of section.lines) {
      if (!line.text.trim()) continue;
      const voice = effectiveVoice(line, script.cast);
      // Re-voice drafts and stale lines; skip up-to-date ones.
      if (!voice || lineStatus(line, voice) === "voiced") continue;
      targets.push({ line, voice });
    }
  }
  return targets;
}

/**
 * Voice every draft/stale line in the script, bounded concurrency, respecting
 * each line's effective voice. Lines already voiced (current take matches) and
 * lines with no text or no voice are skipped. Returns the count voiced.
 */
export async function voiceAll(
  scriptId: string,
  asr: AsrConfig = DEFAULT_ASR_CONFIG,
  concurrency = 3
): Promise<number> {
  const store = useScriptStore;
  const script = store.getState().scripts[scriptId];
  if (!script) return 0;

  const targets = voiceTargets(script).map((target) => target.line.id);

  let voiced = 0;
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < targets.length) {
      const lineId = targets[cursor++];
      try {
        await voiceLine(scriptId, lineId, asr);
        voiced += 1;
      } catch (error) {
        console.error("voiceAll: failed to voice line", lineId, error);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, targets.length) }, () =>
      worker()
    )
  );
  return voiced;
}
