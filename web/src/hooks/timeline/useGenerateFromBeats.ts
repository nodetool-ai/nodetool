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
  CompiledProductionCandidate,
  TimelineBeat,
  TimelineClip,
  TimelineTrack
} from "@nodetool-ai/timeline";
import {
  compileProductionCandidates,
  sourceRate
} from "@nodetool-ai/timeline";

import {
  useTimelineStoreApi,
  type TimelineStoreApi
} from "../../stores/timeline/TimelineStore";
import { getRememberedModel } from "../../stores/lastModelStore";
import { aspectOf } from "../../components/storyboard/aspectOptions";
import { deterministicFingerprint } from "../storyboard/productionContext";
import { useTimelineDirectGenJob } from "./useTimelineDirectGenJob";
import { persistTimelineDocument } from "./useTimelineSave";

/** How long a beat runs when its plan row has no usable length. */
const FALLBACK_BEAT_MS = 4000;

/** The default dissolve length when a beat asks for a transition. */
const TRANSITION_MS = 500;

const VOICEOVER_TRACK = "Voiceover";
const MUSIC_TRACK = "Music";

export interface GenerateFromBeatsOptions {
  /** Stops local preparation or submission when the setup action is canceled. */
  signal?: AbortSignal;
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
  startJob?: (
    clipId: string,
    production?: CompiledProductionCandidate,
    preparedRequestId?: string
  ) => Promise<string | null>;
  /** Acknowledges the prepared destinations before any paid request starts. */
  persistPreparedBatch?: () => Promise<void>;
  /** Stable batch id, injectable for recovery and regression tests. */
  productionBatchId?: string;
}

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw new DOMException("Video generation canceled.", "AbortError");
  }
};

export interface GenerateFromBeatsResult {
  videoClipIds: string[];
  voiceoverClipIds: string[];
  musicClipId: string | null;
  /** Clips whose generation was actually enqueued. */
  startedClipIds: string[];
}

type PreparedGenerationStatus = "unsubmitted" | "prepared" | "submitted";
interface PreparedGenerationRequest {
  clip_id: string;
  request_id: string;
  kind: "video" | "voiceover" | "music";
  beat_id?: string;
  variation_index?: number;
}
interface PreparedGeneration {
  batch_id: string;
  fingerprint: string;
  status: PreparedGenerationStatus;
  requests: PreparedGenerationRequest[];
}

interface PreparedQueueEntry {
  clipId: string;
  requestId: string;
  kind: PreparedGenerationRequest["kind"];
  beatId?: string;
  variationIndex?: number;
  production?: CompiledProductionCandidate;
}

interface DraftGenerationSettings {
  video?: { provider: string; model: string };
  voice?: { provider: string; model: string; voice: string };
}

const isModelChoice = (
  value: unknown
): value is { provider: string; model: string } =>
  typeof value === "object" &&
  value !== null &&
  "provider" in value &&
  typeof value.provider === "string" &&
  "model" in value &&
  typeof value.model === "string";

const isDraftGenerationSettings = (
  value: unknown
): value is DraftGenerationSettings =>
  typeof value === "object" &&
  value !== null &&
  (!("video" in value) ||
    value.video === undefined ||
    isModelChoice(value.video)) &&
  (!("voice" in value) ||
    value.voice === undefined ||
    (isModelChoice(value.voice) &&
      "voice" in value.voice &&
      typeof value.voice.voice === "string"));

const isPreparedGenerationRequest = (
  value: unknown
): value is PreparedGenerationRequest =>
  typeof value === "object" &&
  value !== null &&
  "clip_id" in value &&
  typeof value.clip_id === "string" &&
  "request_id" in value &&
  typeof value.request_id === "string" &&
  "kind" in value &&
  (value.kind === "video" ||
    value.kind === "voiceover" ||
    value.kind === "music");

const isPreparedGeneration = (value: unknown): value is PreparedGeneration =>
  typeof value === "object" &&
  value !== null &&
  "batch_id" in value &&
  typeof value.batch_id === "string" &&
  "fingerprint" in value &&
  typeof value.fingerprint === "string" &&
  "status" in value &&
  (value.status === "unsubmitted" ||
    value.status === "prepared" ||
    value.status === "submitted") &&
  "requests" in value &&
  Array.isArray(value.requests) &&
  value.requests.every(isPreparedGenerationRequest);

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
  return store
    .getState()
    .insertTrack(type, store.getState().tracks.length, name);
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

const generationPreparationFingerprint = (input: {
  beats: readonly TimelineBeat[];
  width: number;
  height: number;
  creativeContext: unknown;
  provider?: string;
  model?: string;
  voiceover: boolean;
  voice?: string;
  voiceProvider?: string;
  voiceModel?: string;
  music: boolean;
  musicProvider?: string;
  musicModel?: string;
}): string =>
  deterministicFingerprint({
    kind: "video-generation-preparation",
    ...input,
    beats: input.beats.map((beat) => ({
      id: beat.id,
      prompt: beat.prompt,
      duration_ms: beat.duration_ms,
      transition: beat.transition,
      voiceover: beat.voiceover,
      music: beat.music,
      source_clip_id: beat.source_clip_id,
      production: beat.production
    }))
  });

export async function generateFromBeats(
  store: TimelineStoreApi,
  options: GenerateFromBeatsOptions = {}
): Promise<GenerateFromBeatsResult> {
  throwIfAborted(options.signal);
  const setup = store.getState().setup;
  const beats = setup?.beats ?? [];
  if (beats.length === 0) {
    throw new Error("Plan the beats before generating the video.");
  }
  const rememberedVideo = getRememberedModel("video");
  const rememberedAudio = getRememberedModel("audio");
  const draftSettingsValue = setup?.generation_settings;
  const draftSettings = isDraftGenerationSettings(draftSettingsValue)
    ? draftSettingsValue
    : undefined;
  const provider =
    options.provider ??
    draftSettings?.video?.provider ??
    (draftSettings === undefined ? rememberedVideo?.provider : undefined);
  const model =
    options.model ??
    draftSettings?.video?.model ??
    (draftSettings === undefined ? rememberedVideo?.model : undefined);
  const voice =
    options.voice ??
    draftSettings?.voice?.voice ??
    (draftSettings === undefined ? rememberedAudio?.voice : undefined);
  const voiceProvider =
    options.voiceProvider ??
    draftSettings?.voice?.provider ??
    (draftSettings === undefined ? rememberedAudio?.provider : undefined);
  const voiceModel =
    options.voiceModel ??
    draftSettings?.voice?.model ??
    (draftSettings === undefined ? rememberedAudio?.model : undefined);
  const wantsVoiceover = options.voiceover !== false;
  const wantsMusic = options.music ?? beats.some((beat) => beat.music === true);
  const preparationFingerprint = generationPreparationFingerprint({
    beats,
    width: store.getState().width,
    height: store.getState().height,
    creativeContext: setup?.creative_context,
    provider,
    model,
    voiceover: wantsVoiceover,
    voice,
    voiceProvider,
    voiceModel,
    music: wantsMusic,
    musicProvider: options.musicProvider,
    musicModel: options.musicModel
  });
  const reusableBatchValue = setup?.prepared_generation;
  const reusableBatch = isPreparedGeneration(reusableBatchValue)
    ? reusableBatchValue
    : undefined;
  const canReuseBatch =
    reusableBatch !== undefined &&
    reusableBatch.status === "unsubmitted" &&
    reusableBatch.fingerprint === preparationFingerprint &&
    reusableBatch.requests.length > 0 &&
    reusableBatch.requests.every((request) =>
      store.getState().clips.some((clip) => clip.id === request.clip_id)
    );
  const productionBatchId =
    options.productionBatchId ??
    (canReuseBatch ? reusableBatch.batch_id : crypto.randomUUID());

  const compileBeat = (
    beat: TimelineBeat,
    destinationId: string
  ): CompiledProductionCandidate[] =>
    compileProductionCandidates({
      batchId: productionBatchId,
      destinationId,
      destinationKind: "timeline_clip",
      operation: "initial_generation",
      prompt: beat.prompt,
      requirement: beat.production,
      referenceAssetIds: setup?.creative_context?.reference_bindings?.map(
        (binding) => binding.asset_id
      ),
      referenceBindings: setup?.creative_context?.reference_bindings,
      provider,
      model,
      requestedDurationMs: beatDurationMs(beat),
      routeSupport: {
        referenceToVideo: true,
        audioDrivenPerformance: false
      }
    });

  // Reject unsupported reviewed requirements before creating slots or sending
  // any paid request. The real destination ids are compiled after slot creation.
  for (const beat of beats) {
    if (!beat.source_clip_id) {
      compileBeat(beat, beat.id);
    }
  }

  if (reusableBatch?.status === "unsubmitted" && !canReuseBatch) {
    for (const clipId of new Set(
      reusableBatch.requests.map((request) => request.clip_id)
    )) {
      store.getState().deleteClip(clipId);
    }
  }

  const videoClipIds: string[] = [];
  const voiceoverClipIds: string[] = [];
  const beatClipIds = new Map<string, string>();
  let queued: PreparedQueueEntry[] = [];
  let musicClipId: string | null = null;
  let preparedRequests: PreparedGenerationRequest[];

  if (canReuseBatch && reusableBatch) {
    preparedRequests = [...reusableBatch.requests];
    const candidates = new Map<string, CompiledProductionCandidate>();
    for (const beat of beats) {
      if (!beat.clip_id) {
        continue;
      }
      beatClipIds.set(beat.id, beat.clip_id);
      for (const candidate of compileBeat(beat, beat.clip_id)) {
        candidates.set(candidate.identity.requestId, candidate);
      }
    }
    for (const request of preparedRequests) {
      const production = candidates.get(request.request_id);
      if (request.kind === "video" && !production) {
        throw new Error(
          "The prepared video no longer matches the reviewed plan. Prepare it again before submitting."
        );
      }
      if (request.kind === "video") {
        videoClipIds.push(request.clip_id);
      } else if (request.kind === "voiceover") {
        voiceoverClipIds.push(request.clip_id);
      } else {
        musicClipId = request.clip_id;
      }
      queued.push({
        clipId: request.clip_id,
        requestId: request.request_id,
        kind: request.kind,
        ...(request.beat_id && { beatId: request.beat_id }),
        ...(request.variation_index && {
          variationIndex: request.variation_index
        }),
        ...(production && { production })
      });
    }
  } else {
    const voiced = beats.filter(
      (beat) => (beat.voiceover ?? "").trim().length > 0
    );
    const videoTrack = videoTrackId(store);
    const voiceTrack =
      wantsVoiceover && voice && voiced.length > 0
        ? trackByName(store, VOICEOVER_TRACK, "audio")
        : null;
    const musicTrack = wantsMusic
      ? trackByName(store, MUSIC_TRACK, "audio")
      : null;
    const aspectRatio = aspectOf(
      store.getState().width,
      store.getState().height
    );
    let startMs = 0;

    for (const [index, beat] of beats.entries()) {
      const durationMs = beatDurationMs(beat);
      const sourceClip = beat.source_clip_id
        ? store.getState().clips.find((clip) => clip.id === beat.source_clip_id)
        : undefined;
      if (beat.source_clip_id && !sourceClip) {
        throw new Error(
          `The imported source for beat ${index + 1} is no longer on the timeline.`
        );
      }
      const clipId =
        sourceClip?.id ??
        store.getState().addDirectGenClip({
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
      const patch: Partial<TimelineClip> = sourceClip
        ? {
            beatId: beat.id,
            startMs,
            durationMs,
            inPointMs: sourceClip.inPointMs ?? 0,
            outPointMs:
              (sourceClip.inPointMs ?? 0) +
              durationMs * sourceRate(sourceClip)
          }
        : { beatId: beat.id };
      if (transition) {
        patch.transitionIn = transition;
      }
      store.getState().patchClip(clipId, patch);
      if (sourceClip?.linkId) {
        for (const linkedClip of store
          .getState()
          .clips.filter(
            (clip) =>
              clip.id !== sourceClip.id && clip.linkId === sourceClip.linkId
          )) {
          const inPointMs = linkedClip.inPointMs ?? 0;
          store.getState().patchClip(linkedClip.id, {
            startMs,
            durationMs,
            inPointMs,
            outPointMs: inPointMs + durationMs * sourceRate(linkedClip)
          });
        }
      }
      videoClipIds.push(clipId);
      beatClipIds.set(beat.id, clipId);
      if (!sourceClip) {
        queued.push(
          ...compileBeat(beat, clipId).map((production) => ({
            clipId,
            requestId: production.identity.requestId,
            kind: "video" as const,
            beatId: beat.id,
            variationIndex: production.identity.variationIndex,
            production
          }))
        );
      }

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
        queued.push({
          clipId: voiceClipId,
          requestId: crypto.randomUUID(),
          kind: "voiceover",
          beatId: beat.id
        });
      }
      startMs += durationMs;
    }

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
      queued.push({
        clipId: musicClipId,
        requestId: crypto.randomUUID(),
        kind: "music"
      });
    }
    preparedRequests = queued.map((request) => ({
      clip_id: request.clipId,
      request_id: request.requestId,
      kind: request.kind,
      ...(request.beatId && { beat_id: request.beatId }),
      ...(request.variationIndex && {
        variation_index: request.variationIndex
      })
    }));
  }

  const preparedGeneration: PreparedGeneration = {
    batch_id: productionBatchId,
    fingerprint: preparationFingerprint,
    status: "unsubmitted",
    requests: preparedRequests
  };
  const linkedBeats = beats.map((beat) => {
    const clipId = beatClipIds.get(beat.id);
    return clipId ? { ...beat, clip_id: clipId } : beat;
  });
  store.getState().setSetup({
    stage: "look",
    beats: linkedBeats,
    prepared_generation: preparedGeneration
  });

  const startJob = options.startJob;
  const startedClipIds: string[] = [];
  if (startJob) {
    try {
      await options.persistPreparedBatch?.();
    } catch (cause) {
      store.getState().setSetup({
        stage: "look",
        prepared_generation: {
          ...preparedGeneration,
          status: "unsubmitted"
        }
      });
      throw new Error(
        "Could not save the prepared video. No generation requests were submitted.",
        { cause }
      );
    }
    throwIfAborted(options.signal);
    store.getState().setSetup({
      stage: "done",
      prepared_generation: preparedGeneration
    });
    // A clip that cannot start records the reason on itself, so one refusal
    // must not stop the rest of the batch.
    const outcomes = await Promise.all(
      queued.map(({ clipId, production, requestId }) =>
        startJob(clipId, production, requestId)
          .then((requestId) => (requestId === null ? null : clipId))
          .catch(() => null)
      )
    );
    startedClipIds.push(
      ...new Set(outcomes.filter((id): id is string => id !== null))
    );
  }

  store.getState().setSetup({
    stage: "done",
    prepared_generation: {
      ...preparedGeneration,
      status: "submitted"
    }
  });

  return { videoClipIds, voiceoverClipIds, musicClipId, startedClipIds };
}

/** React binding: `generateFromBeats` against the active store and job runner. */
export function useGenerateFromBeats() {
  const store = useTimelineStoreApi();
  const { start } = useTimelineDirectGenJob();
  return useCallback(
    (options: GenerateFromBeatsOptions = {}) =>
      generateFromBeats(store, {
        startJob: start,
        persistPreparedBatch: () => persistTimelineDocument(store),
        ...options
      }),
    [start, store]
  );
}

export default useGenerateFromBeats;
