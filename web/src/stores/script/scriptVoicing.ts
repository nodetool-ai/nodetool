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

import {
  globalWebSocketManager,
  type WebSocketMessage
} from "../../lib/websocket/GlobalWebSocketManager";
import { useAssetStore } from "../AssetStore";
import { getAssetUrl } from "../../utils/assetHelpers";
import {
  useScriptStore,
  effectiveVoice,
  type ScriptCaptionWord,
  type ScriptTake,
  type VoiceBinding
} from "./ScriptStore";
import { syncLineClipToTimeline } from "./timelineSync";

/** Speech-to-text default for word-level take timing (best-effort). */
export interface AsrConfig {
  provider: string;
  model: string;
}

export const DEFAULT_ASR_CONFIG: AsrConfig = {
  provider: "openai",
  model: "whisper-1"
};

// ── RPC helpers (mirror TimelineTranscriptStore's request/response pattern) ──

interface RpcResponse extends WebSocketMessage {
  type: "rpc_response";
  request_id: string;
  result?: Record<string, unknown>;
  error?: { code?: string; message?: string };
}

function randomRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function rpcRequest(
  command: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  await globalWebSocketManager.ensureConnection();
  const requestId = randomRequestId();
  return new Promise((resolve, reject) => {
    const unsubscribe = globalWebSocketManager.subscribe(requestId, (msg) => {
      if (msg.type !== "rpc_response") return;
      const response = msg as RpcResponse;
      if (response.request_id !== requestId) return;
      unsubscribe();
      if (response.error) {
        reject(new Error(response.error.message ?? "RPC failed"));
        return;
      }
      resolve(response.result ?? {});
    });
    globalWebSocketManager
      .send({ command, request_id: requestId, data })
      .catch((err) => {
        unsubscribe();
        reject(err instanceof Error ? err : new Error(String(err)));
      });
  });
}

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
    if (typeof entry !== "object" || entry === null) continue;
    const w = entry as Record<string, unknown>;
    if (
      typeof w.word === "string" &&
      typeof w.startMs === "number" &&
      typeof w.endMs === "number"
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
        typeof ttsResult.cost_credits === "number"
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

  const targets = script.sections
    .flatMap((s) => s.lines)
    .filter((line) => {
      if (!line.text.trim()) return false;
      if (!effectiveVoice(line, script.cast)) return false;
      const take = line.takes.find((t) => t.id === line.currentTakeId);
      // Re-voice drafts and stale lines; skip up-to-date ones.
      return (
        !take ||
        take.textSnapshot !== line.text ||
        JSON.stringify(take.voiceSnapshot) !==
          JSON.stringify(effectiveVoice(line, script.cast))
      );
    })
    .map((line) => line.id);

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
