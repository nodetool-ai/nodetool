/**
 * TimelineTranscriptStore — Studio's transcript-driven editing layer.
 *
 * Owns the line↔clip bindings and the operations the Transcript panel calls.
 * The document state (the transcript lines themselves) lives in `TimelineStore`
 * so it persists and undoes with the rest of the sequence; this store is the
 * orchestration layer on top:
 *
 *   - Synchronous edits (add / edit / delete / reorder / reword) are pure
 *     `transcriptOps` transforms committed atomically via
 *     `TimelineStore.setTranscriptAndClips`.
 *   - Beat generation is a fixed, deterministic per-line pipeline:
 *       line text → text-to-audio (voiceover) → probe duration → transcribe
 *       (word-level captions) → re-flow.
 *     It reuses the unified WebSocket runner's `generate_media` RPC for the
 *     voiceover and the `transcribe_audio` RPC for caption timing — no inline
 *     graphs, no bespoke generation engine.
 */

import { create } from "zustand";
import {
  createTimeOrderedUuid,
  makeClip,
  makeClipVersion
} from "@nodetool-ai/timeline";
import type { CaptionWord, TimelineTrack } from "@nodetool-ai/timeline";

import { useTimelineStore } from "./TimelineStore";
import * as ops from "./transcriptOps";
import {
  globalWebSocketManager,
  type WebSocketMessage
} from "../../lib/websocket/GlobalWebSocketManager";
import { useAssetStore } from "../AssetStore";
import { getAssetUrl } from "../../utils/assetHelpers";

// ── Generation config ────────────────────────────────────────────────────────

export interface TranscriptGenerationConfig {
  /** Text-to-speech provider/model/voice for the voiceover. */
  ttsProvider: string;
  ttsModel: string;
  ttsVoice: string;
  /** Speech-to-text provider/model for word-level caption timing. */
  asrProvider: string;
  asrModel: string;
}

const DEFAULT_CONFIG: TranscriptGenerationConfig = {
  ttsProvider: "openai",
  ttsModel: "tts-1",
  ttsVoice: "alloy",
  asrProvider: "openai",
  // whisper-1 returns word-level timestamps (verbose_json + word granularity).
  asrModel: "whisper-1"
};

export type LineGenerationStatus = "idle" | "generating" | "failed";

// ── RPC helpers (mirror useTimelineDirectGenJob's request/response pattern) ──

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

/** Send an RPC command and resolve with its single `rpc_response` result. */
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

/** Decode an audio asset's duration (ms) from its metadata. */
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

function parseCaptionWords(result: Record<string, unknown>): CaptionWord[] {
  const raw = Array.isArray(result.words) ? result.words : [];
  const words: CaptionWord[] = [];
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

// ── Track helpers ────────────────────────────────────────────────────────────

/** Find-or-create the voiceover (audio) and caption (subtitle) tracks. */
function ensureStudioTracks(): { audioTrackId: string; captionTrackId: string } {
  const store = useTimelineStore.getState();
  const findTrack = (type: TimelineTrack["type"]): TimelineTrack | undefined =>
    useTimelineStore.getState().tracks.find((t) => t.type === type);

  if (!findTrack("audio")) store.addTrack("audio", "Voiceover");
  if (!findTrack("subtitle")) store.addTrack("subtitle", "Captions");

  const audioTrack = findTrack("audio");
  const captionTrack = findTrack("subtitle");
  if (!audioTrack || !captionTrack) {
    throw new Error("Failed to create Studio tracks");
  }
  return { audioTrackId: audioTrack.id, captionTrackId: captionTrack.id };
}

// ── Store ────────────────────────────────────────────────────────────────────

interface TimelineTranscriptStoreState {
  config: TranscriptGenerationConfig;
  /** lineId → generation status, for per-line spinners in the panel. */
  lineStatus: Record<string, LineGenerationStatus>;

  setConfig: (patch: Partial<TranscriptGenerationConfig>) => void;

  /** Append a new line. Returns the new line id. */
  addLine: (text: string) => string;
  /** Edit a line's text, marking its bound generated clips stale. */
  editLineText: (lineId: string, text: string) => void;
  /** Delete a line, its bound clips, and re-flow the remaining beats. */
  deleteLine: (lineId: string) => void;
  /** Reorder lines to match `orderedIds`; clips follow via re-flow. */
  reorderLines: (orderedIds: string[]) => void;

  /**
   * Generate (or regenerate) a line's beat: voiceover audio, real duration,
   * and word-level captions, then re-flow. Idempotent w.r.t. the clips it
   * creates — a second call reuses the existing voiceover/caption clips.
   */
  generateBeat: (lineId: string) => Promise<void>;
}

export const useTimelineTranscriptStore = create<TimelineTranscriptStoreState>(
  (set, get) => {
    const setLineStatus = (lineId: string, status: LineGenerationStatus) =>
      set((state) => ({
        lineStatus: { ...state.lineStatus, [lineId]: status }
      }));

    /** Ensure a line has its voiceover + caption clips; returns their ids. */
    const ensureBeatClips = (
      lineId: string
    ): { voiceClipId: string; captionClipId: string } => {
      const store = useTimelineStore.getState();
      const line = store.transcript.find((l) => l.id === lineId);
      if (!line) throw new Error(`Transcript line ${lineId} not found`);

      const existingVoice = ops.beatAudioClip(line, store.clips);
      const existingCaption = ops.beatCaptionClip(line, store.clips);
      if (existingVoice && existingCaption) {
        return {
          voiceClipId: existingVoice.id,
          captionClipId: existingCaption.id
        };
      }

      const { audioTrackId, captionTrackId } = ensureStudioTracks();
      const { ttsProvider, ttsModel, ttsVoice } = get().config;

      const voiceClipId =
        existingVoice?.id ??
        useTimelineStore.getState().addDirectGenClip({
          bindingKind: "text-to-audio",
          mediaType: "audio",
          trackId: audioTrackId,
          startMs: line.beatStartMs,
          durationMs: ops.PLACEHOLDER_BEAT_MS,
          prompt: line.text,
          provider: ttsProvider,
          model: ttsModel,
          voice: ttsVoice,
          name: `Beat: ${line.text.slice(0, 30)}`
        });

      let captionClipId = existingCaption?.id;
      if (!captionClipId) {
        const captionClip = makeClip({
          id: createTimeOrderedUuid(),
          name: "Caption",
          trackId: captionTrackId,
          startMs: line.beatStartMs,
          durationMs: ops.PLACEHOLDER_BEAT_MS,
          mediaType: "overlay",
          sourceType: "generated",
          status: "generated",
          caption: { words: [] }
        });
        useTimelineStore.getState().addClip(captionClip);
        captionClipId = captionClip.id;
      }

      // Bind both clips to the line and re-flow.
      const after = useTimelineStore.getState();
      const nextTranscript = after.transcript.map((l) =>
        l.id === lineId
          ? { ...l, clipIds: [voiceClipId, captionClipId as string] }
          : l
      );
      after.setTranscriptAndClips(
        ops.reflowBeats(nextTranscript, after.clips)
      );

      return { voiceClipId, captionClipId };
    };

    return {
      config: DEFAULT_CONFIG,
      lineStatus: {},

      setConfig: (patch) =>
        set((state) => ({ config: { ...state.config, ...patch } })),

      addLine: (text) => {
        const store = useTimelineStore.getState();
        const { transcript, line } = ops.addLine(store.transcript, text);
        store.setTranscriptAndClips(ops.reflowBeats(transcript, store.clips));
        return line.id;
      },

      editLineText: (lineId, text) => {
        const store = useTimelineStore.getState();
        const next = ops.rewordLine(store.transcript, store.clips, lineId, text);
        store.setTranscriptAndClips(next);
      },

      deleteLine: (lineId) => {
        const store = useTimelineStore.getState();
        store.setTranscriptAndClips(
          ops.removeLine(store.transcript, store.clips, lineId)
        );
        set((state) => {
          const { [lineId]: _removed, ...rest } = state.lineStatus;
          return { lineStatus: rest };
        });
      },

      reorderLines: (orderedIds) => {
        const store = useTimelineStore.getState();
        store.setTranscriptAndClips(
          ops.reorderLines(store.transcript, store.clips, orderedIds)
        );
      },

      generateBeat: async (lineId) => {
        const { config } = get();
        setLineStatus(lineId, "generating");
        try {
          const { voiceClipId, captionClipId } = ensureBeatClips(lineId);

          // 1. Voiceover via the unified runner's generate_media RPC.
          const line = useTimelineStore
            .getState()
            .transcript.find((l) => l.id === lineId);
          if (!line) throw new Error(`Transcript line ${lineId} not found`);

          const ttsResult = await rpcRequest("generate_media", {
            mode: "audio",
            provider: config.ttsProvider,
            model: config.ttsModel,
            voice: config.ttsVoice,
            prompt: line.text
          });
          const assetIds = Array.isArray(ttsResult.asset_ids)
            ? (ttsResult.asset_ids as unknown[]).filter(
                (v): v is string => typeof v === "string"
              )
            : [];
          const audioAssetId = assetIds[0];
          if (!audioAssetId) throw new Error("No audio asset produced");

          const patchClip = useTimelineStore.getState().patchClip;
          patchClip(voiceClipId, {
            status: "generated",
            currentAssetId: audioAssetId,
            versions: [
              ...(useTimelineStore
                .getState()
                .clips.find((c) => c.id === voiceClipId)?.versions ?? []),
              makeClipVersion({
                assetId: audioAssetId,
                paramOverridesSnapshot: { prompt: line.text }
              })
            ]
          });

          // 2. Probe the real audio duration → beat length.
          const url = await resolveAssetUrl(audioAssetId);
          if (url) {
            const durationMs = await probeAudioDurationMs(url);
            if (durationMs && durationMs > 0) {
              patchClip(voiceClipId, { durationMs });
            }
          }

          // 3. Word-level captions via the transcribe_audio RPC.
          let words: CaptionWord[] = [];
          try {
            const asrResult = await rpcRequest("transcribe_audio", {
              provider: config.asrProvider,
              model: config.asrModel,
              asset_id: audioAssetId
            });
            words = parseCaptionWords(asrResult);
          } catch {
            // Captions are best-effort; a failed transcription still leaves a
            // playable voiceover beat.
            words = [];
          }
          patchClip(captionClipId, { caption: { words } });

          // 4. Re-flow so the real durations lay the beats out end-to-end.
          const after = useTimelineStore.getState();
          after.setTranscriptAndClips(
            ops.reflowBeats(after.transcript, after.clips)
          );

          setLineStatus(lineId, "idle");
        } catch (err) {
          setLineStatus(lineId, "failed");
          throw err instanceof Error ? err : new Error(String(err));
        }
      }
    };
  }
);
