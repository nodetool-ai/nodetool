/**
 * useDetectClipBeats
 *
 * "Detect beats" on an audio or video clip: decode the clip's audio in the
 * browser, measure onsets and tempo with the detector `detect_audio_events`
 * uses (`analyzeOnsets` in `@nodetool-ai/timeline`), then set the document
 * tempo and drop a marker on every bar inside the clip. The ruler switches to
 * bars so the new grid is visible and clips snap to it.
 */

import { useCallback } from "react";
import {
  analyzeOnsets,
  isTempoReliable,
  planClipBeats,
  resolveTempo,
  sourceRate,
  type TimelineClip
} from "@nodetool-ai/timeline";

import { useNotificationStore } from "../../stores/NotificationStore";
import {
  useTimelineStoreApi,
  type TimelineStoreApi
} from "../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../stores/timeline/TimelineUIStore";
import { findClipById } from "../../stores/timeline/clipLookup";
import { resolveMediaUri } from "../../utils/resolveMediaUri";

/** Sample rate the clip is decoded at. Onsets need no more than this. */
const ANALYSIS_SAMPLE_RATE = 22050;
/** Longest stretch of a clip analyzed, matching `detect_audio_events`. */
const MAX_ANALYSIS_MS = 600_000;

/** Mono samples of an asset, decoded at {@link ANALYSIS_SAMPLE_RATE}. */
export type DecodeClipAudio = (
  assetId: string
) => Promise<{ samples: Float32Array; sampleRate: number }>;

const decodeAssetAudio: DecodeClipAudio = async (assetId) => {
  const url = await resolveMediaUri(`asset://${assetId}`);
  if (!url) throw new Error("The clip's media could not be found.");
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`The clip's media could not be loaded (${response.status}).`);
  }
  const context = new OfflineAudioContext(1, 1, ANALYSIS_SAMPLE_RATE);
  const audio = await context.decodeAudioData(await response.arrayBuffer());
  const samples = new Float32Array(audio.length);
  for (let channel = 0; channel < audio.numberOfChannels; channel++) {
    const data = audio.getChannelData(channel);
    for (let i = 0; i < samples.length; i++) {
      samples[i] += data[i] / audio.numberOfChannels;
    }
  }
  return { samples, sampleRate: audio.sampleRate };
};

export type DetectClipBeatsResult =
  | { ok: true; bpm: number; bars: number }
  | { ok: false; reason: string };

/** Whether "Detect beats" can run on this clip. */
export function canDetectClipBeats(clip: TimelineClip | undefined): boolean {
  return (
    clip !== undefined &&
    (clip.mediaType === "audio" || clip.mediaType === "video") &&
    Boolean(clip.currentAssetId) &&
    !clip.timeRemap
  );
}

/** Measure one clip and write its tempo and bar markers. */
export async function detectClipBeats(
  timeline: TimelineStoreApi,
  clipId: string,
  decode: DecodeClipAudio = decodeAssetAudio
): Promise<DetectClipBeatsResult> {
  const clip = findClipById(timeline.getState().clips, clipId);
  if (!clip || !canDetectClipBeats(clip) || !clip.currentAssetId) {
    return {
      ok: false,
      reason: "Detect beats needs an audio or video clip without a time remap."
    };
  }
  const { samples, sampleRate } = await decode(clip.currentAssetId);
  const rate = sourceRate(clip);
  const fromMs = clip.inPointMs ?? 0;
  const spanMs = Math.min(MAX_ANALYSIS_MS, clip.durationMs * rate);
  const window = samples.subarray(
    Math.round((fromMs / 1000) * sampleRate),
    Math.round(((fromMs + spanMs) / 1000) * sampleRate)
  );
  const analysis = analyzeOnsets(window, sampleRate);
  if (!analysis.tempo || !isTempoReliable(analysis.tempo, analysis.onsetsMs.length)) {
    return { ok: false, reason: "No steady beat was found in this clip." };
  }

  // The clip may have moved or changed while its audio decoded.
  const current = findClipById(timeline.getState().clips, clipId);
  if (!current || current.startMs !== clip.startMs || current.currentAssetId !== clip.currentAssetId) {
    return { ok: false, reason: "The clip changed while its beats were detected. Try again." };
  }
  const previous = resolveTempo(timeline.getState());
  const plan = planClipBeats(
    { startMs: clip.startMs, durationMs: clip.durationMs, rate },
    analysis.onsetsMs,
    analysis.tempo.bpm,
    previous.timeSignature.beatsPerBar
  );
  if (!plan) {
    return { ok: false, reason: "No steady beat was found in this clip." };
  }
  timeline.getState().applyDetectedBeats(
    { ...previous, bpm: plan.bpm, offsetMs: plan.offsetMs },
    plan.barTimesMs
  );
  return { ok: true, bpm: plan.bpm, bars: plan.barTimesMs.length };
}

export function useDetectClipBeats(): (clipId: string) => Promise<void> {
  const timeline = useTimelineStoreApi();
  const setRulerMode = useTimelineUIStore((s) => s.setRulerMode);
  return useCallback(
    async (clipId: string) => {
      const notify = useNotificationStore.getState().addNotification;
      const key = `timeline-detect-beats-${clipId}`;
      notify({ type: "info", content: "Detecting beats…", dedupeKey: key });
      try {
        const result = await detectClipBeats(timeline, clipId);
        if (!result.ok) {
          notify({
            type: "warning",
            content: result.reason,
            dedupeKey: key,
            replaceExisting: true
          });
          return;
        }
        setRulerMode("bars");
        notify({
          type: "success",
          content: `Tempo set to ${Math.round(result.bpm)} BPM with ${result.bars} bar marker${result.bars === 1 ? "" : "s"}.`,
          dedupeKey: key,
          replaceExisting: true
        });
      } catch (error) {
        notify({
          type: "error",
          content:
            error instanceof Error
              ? `Detect beats failed: ${error.message}`
              : "Detect beats failed.",
          dedupeKey: key,
          replaceExisting: true
        });
      }
    },
    [setRulerMode, timeline]
  );
}
