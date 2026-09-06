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

import type { ScriptSetup } from "@nodetool-ai/protocol/api-schemas/scripts.js";

import { randomRequestId, rpcRequest } from "../../lib/websocket/rpcRequest";
import { paceSpeed } from "../../hooks/script/scriptPace";
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
      // The pace the flow was set to, which until now reached nothing (F12).
      speed: paceSpeed(script.setup?.pace),
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

// ── The run record ──────────────────────────────────────────────────────────

/** Where a *Voice all* got to. Written on the document, under `setup.voicing`. */
export type VoicingStatus = "queued" | "running" | "completed";

export interface VoicingRun {
  status: VoicingStatus;
  /** Lines the run set out to voice. */
  total: number;
  /** Lines it voiced. */
  voiced: number;
  /** The lines it could not, and why. */
  failed: Array<{ lineId: string; error: string }>;
  /** When the record last moved, ISO. */
  updatedAt: string;
}

/** The `setup` key the run is written under. */
const VOICING_FIELD = "voicing";

/**
 * The setup patch that records where voicing got to (F8).
 *
 * The setup flow writes stage `done` and opens the editor before the takes
 * arrive, which PRD § 9.3 asks for — a tab closed mid-voicing must reopen on
 * the editor, not back in setup. What it must not do is lose the outcome:
 * `voiceAll` caught each line's failure, logged it to the console and returned
 * a count that said nothing about the lines that produced no audio. The record
 * says which lines those were, and survives the reload.
 */
export function voicingPatch(run: VoicingRun): Partial<ScriptSetup> {
  return { [VOICING_FIELD]: run };
}

/** The run recorded on a script's setup, or null. Read defensively. */
export function readVoicingRun(setup: unknown): VoicingRun | null {
  if (typeof setup !== "object" || setup === null) return null;
  const raw = (setup as Record<string, unknown>)[VOICING_FIELD];
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const status = record.status;
  if (status !== "queued" && status !== "running" && status !== "completed") {
    return null;
  }
  const failed = Array.isArray(record.failed)
    ? record.failed.flatMap((entry) =>
        isObjectLike(entry) && isString(entry.lineId)
          ? [
              {
                lineId: entry.lineId,
                error: isString(entry.error) ? entry.error : "Voicing failed"
              }
            ]
          : []
      )
    : [];
  return {
    status,
    total: isNumber(record.total) ? record.total : 0,
    voiced: isNumber(record.voiced) ? record.voiced : 0,
    failed,
    updatedAt: isString(record.updatedAt) ? record.updatedAt : ""
  };
}

const recordRun = (scriptId: string, run: VoicingRun): void => {
  const script = useScriptStore.getState().scripts[scriptId];
  // A script with no setup was never in the flow, and gains no field for it.
  if (!script?.setup) return;
  useScriptStore.getState().setSetup(scriptId, voicingPatch(run));
};

/** Drop the record — the creator has read it. */
export function dismissVoicingRun(scriptId: string): void {
  const script = useScriptStore.getState().scripts[scriptId];
  if (!script?.setup) return;
  useScriptStore.getState().setSetup(scriptId, { [VOICING_FIELD]: undefined });
}

/**
 * A provider's error message, with anything credential-shaped taken out before
 * it is written to the document. The reason a line failed is what the creator
 * needs, and a bearer token pasted into a 401 body is not part of it — the repo
 * rule is that secrets never appear in messages, and this one is stored, synced
 * and rendered.
 *
 * Redacting on the way in rather than on the way out means a token cannot reach
 * the document at all, so no later reader has to remember to strip it.
 */
export function redactSecrets(message: string): string {
  return message
    .replace(/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._\-+/=]+/gi, "$1 [redacted]")
    .replace(/\b(?:sk|pk|rk|hf|xai|gsk|fal)[-_][A-Za-z0-9._-]{8,}/g, "[redacted]")
    .replace(
      /\b(api[-_]?key|access[-_]?token|authorization|secret|password)(["']?\s*[:=]\s*["']?)[^\s"',&}]+/gi,
      "$1$2[redacted]"
    )
    // The catch-all: a token with no prefix and no label is still a long run of
    // token characters, and no message needs one to say what went wrong.
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted]")
    .trim();
}

/**
 * Voice the given lines, recording the run on the document as it goes (F8).
 *
 * The record is what the editor reads: the flow writes stage `done` and opens
 * the editor before the takes arrive (PRD § 9.3), so the outcome has to outlive
 * the flow. It moves to `running` before the first call, again after every line
 * so a reload mid-run shows real progress, and to `completed` at the end with
 * every line that failed and why.
 */
async function voiceLines(
  scriptId: string,
  lineIds: readonly string[],
  asr: AsrConfig,
  concurrency: number,
  /**
   * The run this one continues. A retry is part of the run that failed, not a
   * run of its own: without this, retrying one of two failures would report
   * "voiced 1 line" and drop the failure nobody retried.
   */
  base?: VoicingRun
): Promise<VoicingRun> {
  const retried = new Set(lineIds);
  const carried = (base?.failed ?? []).filter(
    (failure) => !retried.has(failure.lineId)
  );
  const failed: VoicingRun["failed"] = [];
  let voiced = 0;
  let cursor = 0;

  const snapshot = (status: VoicingStatus): VoicingRun => ({
    status,
    total: base?.total ?? lineIds.length,
    voiced: (base?.voiced ?? 0) + voiced,
    failed: [...carried, ...failed],
    updatedAt: new Date().toISOString()
  });

  recordRun(scriptId, snapshot("running"));
  const worker = async (): Promise<void> => {
    while (cursor < lineIds.length) {
      const lineId = lineIds[cursor++];
      try {
        await voiceLine(scriptId, lineId, asr);
        voiced += 1;
      } catch (error) {
        failed.push({
          lineId,
          error: redactSecrets(
            error instanceof Error ? error.message : String(error)
          )
        });
      }
      recordRun(scriptId, snapshot("running"));
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, lineIds.length) }, () =>
      worker()
    )
  );
  const run = snapshot("completed");
  recordRun(scriptId, run);
  return run;
}

/**
 * Voice every draft/stale line in the script, bounded concurrency, respecting
 * each line's effective voice. Lines already voiced (current take matches) and
 * lines with no text or no voice are skipped. Returns the count voiced, and
 * leaves the whole run — including the lines that failed — on the document.
 */
export async function voiceAll(
  scriptId: string,
  asr: AsrConfig = DEFAULT_ASR_CONFIG,
  concurrency = 3
): Promise<number> {
  const script = useScriptStore.getState().scripts[scriptId];
  if (!script) return 0;
  const targets = voiceTargets(script).map((target) => target.line.id);
  const run = await voiceLines(scriptId, targets, asr, concurrency);
  return run.voiced;
}

/**
 * Voice the lines a run could not, through the same path that voiced the rest.
 * The record is rewritten for this attempt, so a line that succeeds leaves the
 * failure list and one that fails again says why it did this time.
 */
export async function retryVoicing(
  scriptId: string,
  lineIds: readonly string[],
  asr: AsrConfig = DEFAULT_ASR_CONFIG,
  concurrency = 3
): Promise<VoicingRun> {
  const base = readVoicingRun(
    useScriptStore.getState().scripts[scriptId]?.setup
  );
  return voiceLines(scriptId, lineIds, asr, concurrency, base ?? undefined);
}
