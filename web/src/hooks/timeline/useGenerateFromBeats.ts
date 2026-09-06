/**
 * generateFromBeats — the video flow's last step (PRD § 8.3, criterion 5).
 *
 * Turns the reviewed plan into a cut: one `text-to-video` clip per beat on the
 * video track, one `text-to-audio` clip per beat that carries a voiceover, at
 * most one music clip, and each beat's transition on its own clip. Every clip
 * carries the beat id it came from, so a finished timeline can be read back as
 * the plan that produced it (PRD § 8.5).
 *
 * Order matters and is deliberate. The clips, the beats' `clip_id` back-links
 * and the terminal stage are all written before the first job is enqueued (D3),
 * so a creator who closes the tab while the batch is still going reopens on the
 * timeline with placeholders — not back inside the flow with a half-built
 * document behind it.
 *
 * Exported as a standalone function taking the store api, like
 * {@link importVideoWithAudio}, so the counts in criterion 5 are testable
 * without a React tree.
 */

import { useCallback } from "react";
import { buildTransition } from "@nodetool-ai/protocol/api-schemas/timeline-tool-params.js";
import { KNOWN_TRANSITION_TYPE_LIST } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import type {
  TimelineBeat,
  TimelineClip,
  TimelineTrack
} from "@nodetool-ai/timeline";

import {
  useTimelineStoreApi,
  type TimelineStoreApi
} from "../../stores/timeline/TimelineStore";
import { getRememberedModel } from "../../stores/lastModelStore";
import { aspectOf } from "../../components/storyboard/aspectOptions";
import { useTimelineDirectGenJob } from "./useTimelineDirectGenJob";

/** How long a beat runs when its plan row has no usable length. */
const FALLBACK_BEAT_MS = 4000;

/** The default dissolve length when a beat asks for a transition. */
const TRANSITION_MS = 500;

const VOICEOVER_TRACK = "Voiceover";
const MUSIC_TRACK = "Music";

export interface GenerateFromBeatsOptions {
  /** Video model for the beat clips. */
  provider?: string;
  model?: string;
  /**
   * Make voiceover clips at all. Off is the look step's Voiceover switch: the
   * lines stay in the plan, nothing reads them. Defaults to on, since a beat
   * that carries a line normally wants it read.
   */
  voiceover?: boolean;
  /** Voice for the voiceover clips. Without one no voiceover clip is made. */
  voice?: string;
  voiceProvider?: string;
  voiceModel?: string;
  /** Add the music bed. Defaults to whether any beat asks for one. */
  music?: boolean;
  musicProvider?: string;
  musicModel?: string;
  /** Starts each clip's generation. Injected so the counts are testable. */
  startJob?: (clipId: string) => Promise<string | null>;
}

export interface GenerateFromBeatsResult {
  videoClipIds: string[];
  voiceoverClipIds: string[];
  musicClipId: string | null;
  /** Clips whose generation was actually enqueued. */
  startedClipIds: string[];
}

/** A track by name, created at the end of the stack when it is not there. */
function trackByName(
  store: TimelineStoreApi,
  name: string,
  type: TimelineTrack["type"]
): string {
  const existing = store
    .getState()
    .tracks.find((track) => track.type === type && track.name === name);
  if (existing) {
    return existing.id;
  }
  return store.getState().insertTrack(type, store.getState().tracks.length, name);
}

/** The video lane: the format's own, or the first video track, or a new one. */
function videoTrackId(store: TimelineStoreApi): string {
  const video = store.getState().tracks.find((track) => track.type === "video");
  return video ? video.id : trackByName(store, "Video", "video");
}

const beatDurationMs = (beat: TimelineBeat): number =>
  beat.duration_ms > 0 ? Math.round(beat.duration_ms) : FALLBACK_BEAT_MS;

const isKnownTransition = (
  value: string
): value is (typeof KNOWN_TRANSITION_TYPE_LIST)[number] =>
  (KNOWN_TRANSITION_TYPE_LIST as readonly string[]).includes(value);

/** The music the plan asks for, in one line the model can render. */
const musicPrompt = (brief: string): string =>
  `Instrumental score under: ${brief.trim()}`;

export async function generateFromBeats(
  store: TimelineStoreApi,
  options: GenerateFromBeatsOptions = {}
): Promise<GenerateFromBeatsResult> {
  const setup = store.getState().setup;
  const beats = setup?.beats ?? [];
  if (beats.length === 0) {
    throw new Error("Plan the beats before generating the video.");
  }
  const rememberedVideo = getRememberedModel("video");
  const rememberedAudio = getRememberedModel("audio");
  const provider = options.provider ?? rememberedVideo?.provider;
  const model = options.model ?? rememberedVideo?.model;
  const voice = options.voice ?? rememberedAudio?.voice;
  const voiceProvider = options.voiceProvider ?? rememberedAudio?.provider;
  const voiceModel = options.voiceModel ?? rememberedAudio?.model;

  const voiced = beats.filter((beat) => (beat.voiceover ?? "").trim().length > 0);
  const wantsMusic =
    options.music ?? beats.some((beat) => beat.music === true);

  const videoTrack = videoTrackId(store);
  const voiceTrack =
    options.voiceover !== false && voice && voiced.length > 0
      ? trackByName(store, VOICEOVER_TRACK, "audio")
      : null;
  const musicTrack = wantsMusic ? trackByName(store, MUSIC_TRACK, "audio") : null;

  // The ratio the sequence is actually cut at, not the one the format started
  // from: the look step's picker writes the sequence dimensions, so a creator
  // who chose a 16:9 format and then switched to 9:16 has a portrait timeline.
  // The cost estimate already reads it this way; stamping the format here sent
  // every paid request at the ratio the creator had moved off.
  const aspectRatio = aspectOf(
    store.getState().width,
    store.getState().height
  );

  const videoClipIds: string[] = [];
  const voiceoverClipIds: string[] = [];
  const beatClipIds = new Map<string, string>();
  let startMs = 0;

  for (const [index, beat] of beats.entries()) {
    const durationMs = beatDurationMs(beat);
    const clipId = store.getState().addDirectGenClip({
      trackId: videoTrack,
      startMs,
      durationMs,
      mediaType: "video",
      bindingKind: "text-to-video",
      prompt: beat.prompt,
      provider,
      model,
      aspectRatio,
      name: `Beat ${index + 1}`
    });
    const transition =
      beat.transition && isKnownTransition(beat.transition)
        ? buildTransition({
            type: beat.transition,
            durationMs: TRANSITION_MS
          })
        : undefined;
    const patch: Partial<TimelineClip> = { beatId: beat.id };
    if (transition) {
      patch.transitionIn = transition;
    }
    store.getState().patchClip(clipId, patch);
    videoClipIds.push(clipId);
    beatClipIds.set(beat.id, clipId);

    const line = (beat.voiceover ?? "").trim();
    if (voiceTrack && line.length > 0) {
      const voiceClipId = store.getState().addDirectGenClip({
        trackId: voiceTrack,
        startMs,
        durationMs,
        mediaType: "audio",
        bindingKind: "text-to-audio",
        prompt: line,
        provider: voiceProvider,
        model: voiceModel,
        voice,
        name: `Beat ${index + 1} voiceover`
      });
      store.getState().patchClip(voiceClipId, { beatId: beat.id });
      voiceoverClipIds.push(voiceClipId);
    }

    startMs += durationMs;
  }

  // One bed under the whole cut, never one per beat: several overlapping music
  // clips would play at once.
  //
  // And only when there is a model to render it with. A bed created without
  // one was excluded from the queue below, so the cut finished carrying a
  // silent placeholder nothing would ever fill. No model, no clip.
  let musicClipId: string | null = null;
  if (musicTrack && options.musicModel) {
    musicClipId = store.getState().addDirectGenClip({
      trackId: musicTrack,
      startMs: 0,
      durationMs: startMs,
      mediaType: "audio",
      bindingKind: "text-to-audio",
      prompt: musicPrompt(setup?.brief ?? ""),
      provider: options.musicProvider,
      model: options.musicModel,
      name: "Music"
    });
  }

  // The plan keeps the link to what it produced, and the flow is over: both
  // land before the first job goes out.
  store.getState().setSetup({
    stage: "done",
    beats: beats.map((beat) => {
      const clipId = beatClipIds.get(beat.id);
      return clipId ? { ...beat, clip_id: clipId } : beat;
    })
  });

  const startJob = options.startJob;
  const startedClipIds: string[] = [];
  if (startJob) {
    const queued = [...videoClipIds, ...voiceoverClipIds];
    if (musicClipId) {
      queued.push(musicClipId);
    }
    // A clip that cannot start records the reason on itself, so one refusal
    // must not stop the rest of the batch.
    const outcomes = await Promise.all(
      queued.map((clipId) =>
        startJob(clipId)
          .then((requestId) => (requestId === null ? null : clipId))
          .catch(() => null)
      )
    );
    startedClipIds.push(...outcomes.filter((id): id is string => id !== null));
  }

  return { videoClipIds, voiceoverClipIds, musicClipId, startedClipIds };
}

/** React binding: `generateFromBeats` against the active store and job runner. */
export function useGenerateFromBeats() {
  const store = useTimelineStoreApi();
  const { start } = useTimelineDirectGenJob();
  return useCallback(
    (options: GenerateFromBeatsOptions = {}) =>
      generateFromBeats(store, { startJob: start, ...options }),
    [start, store]
  );
}

export default useGenerateFromBeats;
