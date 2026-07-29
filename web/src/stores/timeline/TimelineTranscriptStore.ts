/**
 * TimelineTranscriptStore — Studio's transcript-driven editing layer.
 *
 * The transcript is a *projection* of the timeline's clips (see
 * `transcriptOps.buildTranscriptDoc`): clips are the single source of truth and
 * the words ride on the voiceover/imported clip they index. This store is the
 * orchestration on top of that model:
 *
 *   - Authoring edits (add / edit / delete / reorder a beat) are pure
 *     `transcriptOps` transforms over the clips, committed atomically via
 *     `TimelineStore.setTranscriptAndClips` (one undo entry each).
 *   - Voicing a beat is a fixed, deterministic pipeline:
 *       beat text → text-to-audio (voiceover) → probe duration → transcribe
 *       (word-level captions written onto the clip) → re-flow.
 *     It reuses the unified WebSocket runner's `generate_media` RPC for the
 *     voiceover and the `transcribe_audio` RPC for caption timing — no inline
 *     graphs, no bespoke generation engine.
 *
 * The document state lives in `TimelineStore` so it persists and undoes with
 * the rest of the sequence; this store holds only generation config and the
 * transient per-clip generation status that drives panel spinners.
 */

import { create } from "zustand";
import { makeClip, makeClipVersion, createTimeOrderedUuid } from "@nodetool-ai/timeline";
import type { CaptionWord, TimelineClip } from "@nodetool-ai/timeline";

import { useTimelineStore } from "./TimelineStore";
import type { TimelineStoreState } from "./TimelineStore";
import { useTimelinePlaybackStore } from "./TimelinePlaybackStore";
import * as ops from "./transcriptOps";
import type { TokenRef } from "./transcriptOps";
import {
  globalWebSocketManager,
  type WebSocketMessage
} from "../../lib/websocket/GlobalWebSocketManager";
import { useAssetStore } from "../AssetStore";
import type { Asset } from "../ApiTypes";
import { getAssetUrl } from "../../utils/assetHelpers";
import {
  assetToClip,
  assetMediaType
} from "../../components/timeline/dnd/assetToClipAdapter";

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

// ── Active-instance pinning ──────────────────────────────────────────────────

interface PinnedTimelineStore {
  getState: () => TimelineStoreState;
  release: () => void;
}

/**
 * Pin the *currently active* timeline instance's document store for the
 * duration of an async flow. `useTimelineStore.getState()` re-resolves the
 * active instance on every call, so a flow that awaits in between would write
 * into whichever timeline gained focus meanwhile. The pin captures the
 * instance once (via `subscribe`, which binds at call time) and serves
 * consistent reads/writes until released.
 */
function pinActiveTimelineStore(): PinnedTimelineStore {
  let latest = useTimelineStore.getState();
  const release = useTimelineStore.subscribe((state: TimelineStoreState) => {
    latest = state;
  });
  return { getState: () => latest, release };
}

// ── Track helpers ────────────────────────────────────────────────────────────

/** Find-or-create the voiceover (audio) track and return its id. */
function ensureVoiceoverTrack(): string {
  const store = useTimelineStore.getState();
  let track = store.tracks.find((t) => t.type === "audio");
  if (!track) {
    store.addTrack("audio", "Voiceover");
    track = useTimelineStore.getState().tracks.find((t) => t.type === "audio");
  }
  if (!track) throw new Error("Failed to create the voiceover track");
  return track.id;
}

/** Find-or-create a video track for imported video and return its id. */
function ensureVideoTrack(): string {
  const store = useTimelineStore.getState();
  let track = store.tracks.find((t) => t.type === "video");
  if (!track) {
    store.addTrack("video", "Video");
    track = useTimelineStore.getState().tracks.find((t) => t.type === "video");
  }
  if (!track) throw new Error("Failed to create the video track");
  return track.id;
}

/** End of the last clip on the timeline — where the next beat is appended. */
function timelineEndMs(): number {
  return useTimelineStore
    .getState()
    .clips.reduce((max, c) => Math.max(max, c.startMs + c.durationMs), 0);
}

// ── Store ────────────────────────────────────────────────────────────────────

interface TimelineTranscriptStoreState {
  config: TranscriptGenerationConfig;
  /** clipId → generation status, for per-beat spinners in the panel. */
  clipStatus: Record<string, LineGenerationStatus>;
  /** Clips cut from the transcript, awaiting paste (the move clipboard). */
  clipboard: TimelineClip[] | null;

  setConfig: (patch: Partial<TranscriptGenerationConfig>) => void;

  /** Append a new voiceover beat (a draft text-to-audio clip). Returns its id. */
  addBeat: (text?: string) => string;
  /** Edit a draft beat's text (its TTS prompt). */
  setBeatText: (clipId: string, text: string) => void;
  /** Ripple-delete a whole paragraph (its clips) and close the gap. */
  deleteParagraph: (clipIds: string[]) => void;
  /**
   * Ripple-delete the word range between two selection endpoints: the bound
   * clip(s) are split at the word boundaries, the span is removed, and the rest
   * of the timeline shifts left. The playhead lands at the cut.
   */
  deleteWords: (anchor: TokenRef, focus: TokenRef) => void;
  /** Correct a word's text without touching the audio (relabel, no regen). */
  relabelWord: (clipId: string, wordIndex: number, text: string) => void;
  /** Ripple-cut every filler word ("um", "uh", …) from the transcript. */
  removeFillers: () => void;
  /** Set (or clear, when empty) the speaker label on a paragraph's clips. */
  setSpeaker: (clipIds: string[], speaker: string) => void;
  /** Cut a word range to the clipboard (ripple-removed; paste reinserts it). */
  cutWords: (anchor: TokenRef, focus: TokenRef) => void;
  /** Paste the clipboard's clips at an absolute timeline position. */
  pasteAt: (targetMs: number) => void;
  /** Reorder beats to match `orderedClipIds`; re-flows so clips follow. */
  reorderBeats: (orderedClipIds: string[]) => void;

  /**
   * Voice (or re-voice) a beat: generate voiceover audio, probe its real
   * duration, transcribe word-level captions onto the clip, then re-flow.
   */
  generateBeat: (clipId: string) => Promise<void>;

  /**
   * Import an audio/video asset as a recorded transcript clip and transcribe
   * it: the clip lands on its track, joins the unified document, and every word
   * operation (seek, ripple-delete, filler removal, relabel) applies to it just
   * like a generated beat. Returns the new clip id.
   */
  importMedia: (asset: Asset) => Promise<string>;
}

export const useTimelineTranscriptStore = create<TimelineTranscriptStoreState>(
  (set, get) => {
    const setClipStatus = (clipId: string, status: LineGenerationStatus) =>
      set((state) => ({
        clipStatus: { ...state.clipStatus, [clipId]: status }
      }));

    return {
      config: DEFAULT_CONFIG,
      clipStatus: {},
      clipboard: null,

      setConfig: (patch) =>
        set((state) => ({ config: { ...state.config, ...patch } })),

      addBeat: (text = "") => {
        const audioTrackId = ensureVoiceoverTrack();
        const { ttsProvider, ttsModel, ttsVoice } = get().config;
        // A fresh paragraphId (= the clip id) keeps this beat its own paragraph,
        // while `splitClip` later shares it across an interior cut's halves.
        const id = createTimeOrderedUuid();
        const clip = makeClip({
          id,
          paragraphId: id,
          name: text.slice(0, 30).trim() || "Voiceover",
          trackId: audioTrackId,
          startMs: timelineEndMs(),
          durationMs: ops.PLACEHOLDER_BEAT_MS,
          mediaType: "audio",
          sourceType: "generated",
          bindingKind: "text-to-audio",
          prompt: text,
          provider: ttsProvider,
          model: ttsModel,
          voice: ttsVoice,
          status: "draft"
        });
        // Insert and reflow in a single `set` so the whole beat-add commits as
        // one undo entry — `addClip` then a separate `setTranscriptAndClips`
        // would push two history checkpoints for what the user sees as one
        // action.
        const store = useTimelineStore.getState();
        store.setTranscriptAndClips(
          ops.reflowGenerated([...store.clips, clip])
        );
        return id;
      },

      setBeatText: (clipId, text) => {
        useTimelineStore.getState().setClipPrompt(clipId, text);
      },

      deleteParagraph: (clipIds) => {
        const store = useTimelineStore.getState();
        const ids = new Set(clipIds);
        const members = store.clips.filter((c) => ids.has(c.id));
        if (members.length === 0) return;
        const startMs = Math.min(...members.map((c) => c.startMs));
        const endMs = Math.max(...members.map((c) => c.startMs + c.durationMs));
        store.setTranscriptAndClips(
          ops.rippleDeleteRange(store.clips, startMs, endMs)
        );
        set((state) => {
          const next = { ...state.clipStatus };
          for (const id of clipIds) delete next[id];
          return { clipStatus: next };
        });
      },

      deleteWords: (anchor, focus) => {
        const store = useTimelineStore.getState();
        const doc = ops.buildTranscriptDoc(store.clips);
        const range = ops.resolveSelectionRange(doc, anchor, focus);
        if (!range) return;
        store.setTranscriptAndClips(
          ops.rippleDeleteRange(store.clips, range.startMs, range.endMs)
        );
        useTimelinePlaybackStore.getState().seek(range.startMs);
      },

      relabelWord: (clipId, wordIndex, text) => {
        const store = useTimelineStore.getState();
        store.setTranscriptAndClips({
          clips: ops.relabelWord(store.clips, clipId, wordIndex, text)
        });
      },

      removeFillers: () => {
        const store = useTimelineStore.getState();
        store.setTranscriptAndClips(ops.removeFillers(store.clips));
      },

      setSpeaker: (clipIds, speaker) => {
        const store = useTimelineStore.getState();
        const ids = new Set(clipIds);
        const value = speaker.trim() || undefined;
        // Skip the rewrite when every target already holds this speaker — only
        // rewrite the affected clips, leaving the rest object-identical.
        const hasChange = store.clips.some(
          (c) => ids.has(c.id) && c.speaker !== value
        );
        if (!hasChange) return;
        store.setTranscriptAndClips({
          clips: store.clips.map((c) =>
            ids.has(c.id) && c.speaker !== value ? { ...c, speaker: value } : c
          )
        });
      },

      cutWords: (anchor, focus) => {
        const store = useTimelineStore.getState();
        const doc = ops.buildTranscriptDoc(store.clips);
        const range = ops.resolveSelectionRange(doc, anchor, focus);
        if (!range) return;
        const { clips, durationMs, extracted } = ops.cutWordRange(
          store.clips,
          range.startMs,
          range.endMs
        );
        store.setTranscriptAndClips({ clips, durationMs });
        set({ clipboard: extracted });
        useTimelinePlaybackStore.getState().seek(range.startMs);
      },

      pasteAt: (targetMs) => {
        const { clipboard } = get();
        if (!clipboard || clipboard.length === 0) return;
        const store = useTimelineStore.getState();
        store.setTranscriptAndClips(
          ops.pasteClipsAt(store.clips, targetMs, clipboard)
        );
        useTimelinePlaybackStore.getState().seek(targetMs);
      },

      reorderBeats: (orderedClipIds) => {
        const store = useTimelineStore.getState();
        store.setTranscriptAndClips(
          ops.reflowGenerated(store.clips, orderedClipIds)
        );
      },

      generateBeat: async (clipId) => {
        const { config } = get();
        // Pin the instance whose beat is being voiced: every read/write in
        // this multi-await flow must target the same timeline document even
        // if another instance becomes active mid-generation.
        const timeline = pinActiveTimelineStore();
        setClipStatus(clipId, "generating");
        try {
          const clip = timeline
            .getState()
            .clips.find((c) => c.id === clipId);
          if (!clip) throw new Error(`Transcript beat ${clipId} not found`);
          const prompt = (clip.prompt ?? "").trim();
          if (!prompt) throw new Error("Nothing to voice — the beat is empty");

          // 1. Voiceover via the unified runner's generate_media RPC.
          const ttsResult = await rpcRequest("generate_media", {
            mode: "audio",
            provider: config.ttsProvider,
            model: config.ttsModel,
            voice: config.ttsVoice,
            prompt
          });
          const assetIds = Array.isArray(ttsResult.asset_ids)
            ? (ttsResult.asset_ids as unknown[]).filter(
                (v): v is string => typeof v === "string"
              )
            : [];
          const audioAssetId = assetIds[0];
          if (!audioAssetId) throw new Error("No audio asset produced");

          const patchClip = timeline.getState().patchClip;
          const existing = timeline
            .getState()
            .clips.find((c) => c.id === clipId);
          patchClip(clipId, {
            status: "generated",
            currentAssetId: audioAssetId,
            versions: [
              ...(existing?.versions ?? []),
              makeClipVersion({
                assetId: audioAssetId,
                paramOverridesSnapshot: { prompt }
              })
            ]
          });

          // 2. Probe the real audio duration → beat length.
          const url = await resolveAssetUrl(audioAssetId);
          if (url) {
            const durationMs = await probeAudioDurationMs(url);
            if (durationMs && durationMs > 0) {
              patchClip(clipId, { durationMs });
            }
          }

          // 3. Word-level captions via the transcribe_audio RPC — written
          //    directly onto the voiceover clip (its words are clip-local).
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
          patchClip(clipId, { caption: { words } });

          // 4. Re-flow so the real durations lay the beats out end-to-end.
          //    Bail if the clip was deleted while generation was in flight —
          //    re-flowing then would reshuffle unrelated clips for nothing.
          const after = timeline.getState();
          if (!after.clips.some((c) => c.id === clipId)) {
            setClipStatus(clipId, "idle");
            return;
          }
          after.setTranscriptAndClips(ops.reflowGenerated(after.clips));

          setClipStatus(clipId, "idle");
        } catch (err) {
          setClipStatus(clipId, "failed");
          throw err instanceof Error ? err : new Error(String(err));
        } finally {
          timeline.release();
        }
      },

      importMedia: async (asset) => {
        const mediaType = assetMediaType(asset.content_type);
        if (mediaType !== "audio" && mediaType !== "video") {
          throw new Error("Only audio or video can be transcribed");
        }
        // Pin the instance receiving the import so the post-transcription
        // caption write can't land in another timeline that gained focus
        // while the RPC was in flight.
        const timeline = pinActiveTimelineStore();
        try {
          const trackId =
            mediaType === "audio" ? ensureVoiceoverTrack() : ensureVideoTrack();

          // An empty caption marks the clip as a (recorded) transcript clip up
          // front, so it shows a "transcribing…" paragraph before words arrive.
          const base = assetToClip(asset, trackId, timelineEndMs());
          const clip = {
            ...base,
            paragraphId: base.id,
            caption: { words: [] as CaptionWord[] }
          };
          timeline.getState().addClip(clip);

          setClipStatus(clip.id, "generating");
          try {
            const { config } = get();
            const asrResult = await rpcRequest("transcribe_audio", {
              provider: config.asrProvider,
              model: config.asrModel,
              asset_id: asset.id
            });
            const words = parseCaptionWords(asrResult);
            timeline.getState().patchClip(clip.id, { caption: { words } });
            setClipStatus(clip.id, "idle");
          } catch (err) {
            setClipStatus(clip.id, "failed");
            throw err instanceof Error ? err : new Error(String(err));
          }
          return clip.id;
        } finally {
          timeline.release();
        }
      }
    };
  }
);
