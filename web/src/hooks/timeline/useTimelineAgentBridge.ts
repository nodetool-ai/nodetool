/**
 * useTimelineAgentBridge
 *
 * Registers a {@link TimelineAgentHandler} for the surrounding timeline editor
 * instance under its sequence id, so the `ui_timeline_*` agent tools can target
 * this sequence by name. Mirrors the handler the 3D editor registers on the
 * `model3DToolBridge`, but built against the timeline's per-instance stores
 * (document, UI, playback) plus the direct-generation job runner.
 *
 * Registration is not focus-gated: with several timeline tabs open, every one
 * stays addressable by id. The handler is cleared on unmount.
 */

import { isShortResourceId } from "@nodetool-ai/protocol";
import type {
  ClipAnimation,
  ClipModel3DStylePatch,
  MidiInstrument,
  QuantizeOptions,
  TimelineBeat,
  TimelineClip,
  TimelineMarker,
  TimelineSetup,
  TimelineTempo,
  TimelineTrack
} from "@nodetool-ai/timeline";
import {
  createTimeOrderedUuid,
  presetIdForInstrument,
  resolveTempo,
  validateNotes
} from "@nodetool-ai/timeline";
import {
  applyTimelineOp,
  type TimelineOp,
  type TimelineOpAsset,
  type TimelineOpContext,
  type TimelineOpResult,
  type TimelineOpState
} from "@nodetool-ai/timeline/ops";
import { parseSvgPath } from "@nodetool-ai/timeline/scene";
import { useEffect, useMemo } from "react";
import { videoFormatById } from "../../components/setup/video/formats";
import { DEFAULT_TIMELINE_INSTRUMENT } from "../../stores/timeline/instrumentPresets";
import { generateFromBeats } from "./useGenerateFromBeats";
import { planBeats } from "./usePlanBeats";

import { renderRasterClipFrames } from "../../components/timeline/preview/rasterClipFrames";
import {
  getTimelineAgentHandler,
  hasTimelineAgentHandler,
  setTimelineAgentHandler,
  type MidiNoteInput,
  type TimelineAddMediaClipOptions,
  type TimelineAddMidiClipOptions,
  type TimelineAddShapeClipOptions,
  type TimelineAddTextClipOptions,
  type TimelineAgentHandler,
  type TimelineAnimationNode,
  type TimelineClipFrameNode,
  type TimelineClipNode,
  type TimelineGenerateKind,
  type TimelineMarkerNode,
  type TimelineSnapshot,
  type TimelineTrackNode
} from "../../components/timeline/timelineAgentBridge";
import { extractVideoFrames } from "../../components/timeline/Tracks/clipThumbnails";
import { useAssetStore } from "../../stores/AssetStore";
import {
  getRememberedModel,
  modelKindForBinding,
  useLastModelStore,
  getRememberedModelForTask,
  type ModelKind
} from "../../stores/lastModelStore";
import { useTimelinePlaybackStoreApi } from "../../stores/timeline/TimelinePlaybackStore";
import { useTimelineStoreApi } from "../../stores/timeline/TimelineStore";
import { useTimelineUIStoreApi } from "../../stores/timeline/TimelineUIStore";
import { trpcClient } from "../../trpc/client";
import { getAssetUrl } from "../../utils/assetHelpers";
import { persistAdaptedTimeline } from "./useCreateFormatAdaptation";
import { useModel3DBake } from "./useModel3DBake";
import { useTimelineDirectGenJob } from "./useTimelineDirectGenJob";

const KIND_TO_MODEL_KIND = {
  "text-to-video": "video",
  "text-to-image": "image",
  "text-to-audio": "audio"
} satisfies Record<TimelineGenerateKind, ModelKind>;

const KIND_TO_MEDIA_TYPE = {
  "text-to-video": "video",
  "text-to-image": "image",
  "text-to-audio": "audio"
} satisfies Record<
  TimelineGenerateKind,
  "image" | "video" | "audio" | "overlay"
>;

/** Velocity a note gets when the agent names none — mirrors
 *  `DEFAULT_MIDI_VELOCITY` in `@nodetool-ai/timeline`, which `createMidiNote`
 *  applies when the store mints the note. */
const DEFAULT_AGENT_NOTE_VELOCITY = 100;

const DEFAULT_FRAME_COUNT = 3;
const MAX_FRAME_COUNT = 8;
const DEFAULT_FRAME_WIDTH = 512;
const MAX_FRAME_WIDTH = 1024;

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sampleClipTimelineTimes(clip: TimelineClip, count: number): number[] {
  const n = clampNumber(Math.round(count), 1, MAX_FRAME_COUNT);
  const start = clip.startMs;
  const end = Math.max(start, start + clip.durationMs - 1);
  if (n === 1 || end <= start) {
    return [start];
  }
  return Array.from({ length: n }, (_, i) =>
    Math.round(start + (i / (n - 1)) * (end - start))
  );
}

/**
 * Resolve a caller's frame time to a timeline time.
 *
 * `timesMs` is documented as timeline time, but a caller inspecting one clip
 * thinks in that clip's own time — "show me 200ms in" — and a clip that starts
 * at 15552ms then rejected every number a reasonable caller passed. Both
 * readings are accepted: a time inside the clip's timeline span is timeline
 * time, and otherwise a time inside `0…durationMs` is clip-relative. The two
 * only overlap on a clip that starts at 0, where they mean the same frame.
 */
function timelineTimeForFrameRequest(
  clip: TimelineClip,
  requestedMs: number
): number {
  const clipStart = clip.startMs;
  const clipEnd = clip.startMs + clip.durationMs;
  if (requestedMs >= clipStart && requestedMs <= clipEnd) {
    return Math.min(requestedMs, Math.max(clipStart, clipEnd - 1));
  }
  if (requestedMs >= 0 && requestedMs <= clip.durationMs) {
    return Math.min(clipStart + requestedMs, Math.max(clipStart, clipEnd - 1));
  }
  throw new Error(
    `Frame time ${requestedMs}ms is outside clip "${clip.name}": pass a timeline time in ${clipStart}–${clipEnd}ms, or a clip-relative time in 0–${clip.durationMs}ms.`
  );
}

function sourceTimeForTimelineTime(
  clip: TimelineClip,
  timelineTimeMs: number
): number {
  const clipStart = clip.startMs;
  const clipEnd = clip.startMs + clip.durationMs;
  if (timelineTimeMs < clipStart || timelineTimeMs > clipEnd) {
    throw new Error(
      `Frame time ${timelineTimeMs}ms is outside clip "${clip.name}" (${clipStart}–${clipEnd}ms).`
    );
  }
  const speed = clip.speedMultiplier ?? 1;
  const inPointMs = clip.inPointMs ?? 0;
  return Math.max(0, inPointMs + (timelineTimeMs - clipStart) * speed);
}

/** Serialize a clip to the agent-facing shape. */
function toClipNode(
  clip: TimelineClip,
  trackById: Map<string, TimelineTrack>
): TimelineClipNode {
  return {
    id: clip.id,
    name: clip.name,
    trackId: clip.trackId,
    trackName: trackById.get(clip.trackId)?.name ?? null,
    mediaType: clip.mediaType,
    sourceType: clip.sourceType,
    bindingKind: clip.bindingKind,
    startMs: clip.startMs,
    durationMs: clip.durationMs,
    endMs: clip.startMs + clip.durationMs,
    inPointMs: clip.inPointMs,
    outPointMs: clip.outPointMs,
    status: clip.status,
    hasRender: !!clip.currentAssetId,
    activeTakeId: clip.activeTakeId,
    prompt: clip.prompt,
    provider: clip.provider,
    model: clip.model,
    voice: clip.voice,
    workflowId: clip.workflowId,
    width: clip.width,
    height: clip.height,
    aspectRatio: clip.aspectRatio,
    resolution: clip.resolution,
    speedMultiplier: clip.speedMultiplier,
    opacity: clip.opacity,
    volumeDb: clip.volumeDb,
    fadeInMs: clip.fadeInMs,
    fadeOutMs: clip.fadeOutMs,
    hidden: !!clip.hidden,
    muted: !!clip.muted,
    locked: clip.locked,
    animations: clip.animations?.map(toAnimationNode),
    textStyle: clip.textStyle,
    shapeStyle: clip.shapeStyle,
    parentId: clip.parentId,
    reframe: clip.reframe
      ? {
          mode: clip.reframe.mode,
          trackId: clip.reframe.trackId,
          safeMargin: clip.reframe.safeMargin,
          smoothing: clip.reframe.smoothing,
          sampleCount: clip.reframe.samples?.length ?? 0,
          keyframeCount: clip.reframe.keyframes?.length ?? 0
        }
      : undefined,
    noteCount: clip.mediaType === "midi" ? (clip.notes?.length ?? 0) : undefined
  };
}

function toAnimationNode(anim: ClipAnimation): TimelineAnimationNode {
  return {
    id: anim.id,
    role: anim.role,
    preset: anim.preset,
    durationMs: anim.durationMs,
    delayMs: anim.delayMs,
    easing: anim.easing,
    enabled: anim.enabled,
    params: anim.params
  };
}

function toMarkerNode(marker: TimelineMarker): TimelineMarkerNode {
  const node: TimelineMarkerNode = {
    id: marker.id,
    timeMs: marker.timeMs,
    label: marker.label
  };
  if (marker.color !== undefined) {
    node.color = marker.color;
  }
  if (marker.note !== undefined) {
    node.note = marker.note;
  }
  return node;
}

function toTrackNode(
  track: TimelineTrack,
  clipCount: number
): TimelineTrackNode {
  return {
    id: track.id,
    name: track.name,
    type: track.type,
    index: track.index,
    visible: track.visible,
    locked: track.locked,
    muted: !!track.muted,
    solo: !!track.solo,
    clipCount,
    instrument: track.type === "midi" ? track.instrument : undefined,
    presetId:
      track.type === "midi" && track.instrument
        ? presetIdForInstrument(track.instrument)
        : undefined
  };
}

export const useTimelineAgentBridge = (
  sequenceId: string | null,
  opContextOverrides?: Partial<TimelineOpContext>
): void => {
  const doc = useTimelineStoreApi();
  const ui = useTimelineUIStoreApi();
  const playback = useTimelinePlaybackStoreApi();
  const { start: startDirectGen, startEdit } = useTimelineDirectGenJob();
  const { bakeClip } = useModel3DBake();

  const handler = useMemo<TimelineAgentHandler>(() => {
    const stateOf = (): TimelineOpState => {
      const state = doc.getState();
      return {
        fps: state.fps,
        width: state.width,
        height: state.height,
        tracks: state.tracks,
        trackFolders: state.trackFolders,
        clips: state.clips,
        markers: state.markers,
        mediaTracks: state.mediaTracks,
        tempo: state.tempo,
        setup: state.setup,
        transcript: state.transcript,
        scriptEnabled: state.scriptEnabled,
        camera2d: state.camera2d,
        storyboardMaterializations: state.storyboardMaterializations,
        playheadMs: Math.round(playback.getState().getTimeMs()),
        selectedClipIds: [...ui.getState().selectedClipIds]
      };
    };
    let pending: Promise<unknown> = Promise.resolve();
    const editOp = (op: TimelineOp): Promise<TimelineOpResult> => {
      const task = pending.then(async () => {
        const assets = new Map<string, TimelineOpAsset | null>();
        const ids = new Map<string, string[]>();
        let positions = new Map<string, number>();
        const context: TimelineOpContext = {
          newId: (kind) => {
            const index = positions.get(kind) ?? 0;
            positions.set(kind, index + 1);
            const minted = ids.get(kind) ?? [];
            minted[index] ??= createTimeOrderedUuid();
            ids.set(kind, minted);
            return minted[index];
          },
          defaultMidiInstrument: DEFAULT_TIMELINE_INSTRUMENT,
          followLinks: doc.getState().linkedSelection,
          parseSvgPath,
          allowUnknownMediaDuration: true,
          resolveAsset: async (ref) => {
            if (assets.has(ref)) {
              return assets.get(ref) ?? null;
            }
            const id = ref
              .replace(/^asset:\/\//, "")
              .replace(/\.[A-Za-z0-9]{1,8}$/, "");
            const asset = await useAssetStore.getState().get(id);
            const resolved = asset
              ? {
                  id: asset.id,
                  name: asset.name,
                  contentType: asset.content_type ?? "",
                  durationMs:
                    asset.duration == null ? undefined : asset.duration * 1000,
                  thumbnailAssetId:
                    Array.isArray(asset.metadata?.thumbnails) &&
                    typeof asset.metadata.thumbnails[0] === "string"
                      ? asset.metadata.thumbnails[0]
                      : undefined
                }
              : null;
            assets.set(ref, resolved);
            return resolved;
          },
          ...opContextOverrides
        };
        if (
          op.op === "retarget_format" &&
          !opContextOverrides?.retargetFormat
        ) {
          if (!sequenceId) {
            throw new Error("No timeline sequence is open.");
          }
          const source = await trpcClient.timeline.get.query({
            id: sequenceId
          });
          context.sequence = {
            id: source.id,
            name: source.name,
            projectId: source.projectId
          };
          context.retargetFormat = async (sequence) => ({
            sequenceId: await persistAdaptedTimeline(sequence, source.id),
            name: sequence.name
          });
        }
        let before = doc.getState();
        let outcome = await applyTimelineOp(stateOf(), op, context);
        while (doc.getState() !== before && op.op !== "retarget_format") {
          before = doc.getState();
          positions = new Map();
          outcome = await applyTimelineOp(stateOf(), op, context);
        }
        if (outcome.error) {
          throw new Error(outcome.error);
        }
        if (
          op.op !== "get_state" &&
          op.op !== "list_animation_presets" &&
          op.op !== "list_tracks" &&
          op.op !== "list_takes" &&
          op.op !== "retarget_format" &&
          op.op !== "select_clip" &&
          op.op !== "seek"
        ) {
          doc.getState().applyAgentEdit(
            {
              ...outcome.state,
              mediaTracks: outcome.state.mediaTracks ?? []
            },
            { preserveTiming: true }
          );
          ui.getState().setSelection(outcome.state.selectedClipIds);
          if (
            (op.op === "set_clip_binding" || op.op === "generate_clip") &&
            op.provider &&
            op.model
          ) {
            const clip = outcome.state.clips.find(
              (clip) => clip.id === resultClipId(outcome.result)
            );
            const kind = modelKindForBinding(clip?.bindingKind);
            if (kind) {
              useLastModelStore.getState().remember(kind, {
                provider: op.provider,
                model: op.model,
                voice: op.voice ?? clip?.voice
              });
            }
          }
        }
        if (op.op === "select_clip") {
          ui.getState().setSelection(outcome.state.selectedClipIds);
        }
        if (op.op === "seek") {
          playback.getState().seek(outcome.state.playheadMs);
        }
        return outcome.result;
      });
      pending = task.catch(() => undefined);
      return task;
    };
    const resultClipId = (result: TimelineOpResult): string => {
      const clip = result.clip;
      if (
        !clip ||
        typeof clip !== "object" ||
        !("id" in clip) ||
        typeof clip.id !== "string"
      ) {
        throw new Error("Timeline edit returned no clip.");
      }
      return clip.id;
    };
    const resultMarkerId = (result: TimelineOpResult): string => {
      const marker = result.marker;
      if (
        !marker ||
        typeof marker !== "object" ||
        !("id" in marker) ||
        typeof marker.id !== "string"
      ) {
        throw new Error("Timeline edit returned no marker.");
      }
      return marker.id;
    };

    const trackNodes = (): TimelineTrackNode[] => {
      const store = doc.getState();
      const clipCount = new Map<string, number>();
      for (const clip of store.clips) {
        clipCount.set(clip.trackId, (clipCount.get(clip.trackId) ?? 0) + 1);
      }
      return store.tracks.map((track) =>
        toTrackNode(track, clipCount.get(track.id) ?? 0)
      );
    };

    const trackMap = (): Map<string, TimelineTrack> =>
      new Map(doc.getState().tracks.map((t) => [t.id, t]));

    /** Resolve a clip by id, case-insensitive name, or the "selected" keyword. */
    const requireClip = (target: string): TimelineClip => {
      const { clips } = doc.getState();
      if (target === "selected") {
        const selected = [...ui.getState().selectedClipIds];
        if (selected.length !== 1) {
          throw new Error(
            `"selected" requires exactly one selected clip (found ${selected.length}).`
          );
        }
        const clip = clips.find((c) => c.id === selected[0]);
        if (!clip) {
          throw new Error("Selected clip no longer exists.");
        }
        return clip;
      }
      const byId = clips.find((c) => c.id === target);
      if (byId) {
        return byId;
      }
      if (isShortResourceId(target)) {
        const prefixMatches = clips.filter((c) => c.id.startsWith(target));
        if (prefixMatches.length === 1) {
          return prefixMatches[0];
        }
        if (prefixMatches.length > 1) {
          throw new Error(
            `Short clip id "${target}" matches more than one clip; use the full id or name.`
          );
        }
      }
      const lower = target.toLowerCase();
      const byName = clips.find((c) => c.name.toLowerCase() === lower);
      if (byName) {
        return byName;
      }
      throw new Error(`Clip not found on the timeline: ${target}`);
    };

    /**
     * An item by exact id, or by an exact unique 12-character prefix of one
     * (the form CodeAct shortens ids to). More than one prefix match is an
     * ambiguity error, never a guess.
     */
    const findByIdOrShortId = <T extends { id: string }>(
      items: readonly T[],
      target: string,
      noun: string
    ): T | undefined => {
      const exact = items.find((item) => item.id === target);
      if (exact) {
        return exact;
      }
      if (!isShortResourceId(target)) {
        return undefined;
      }
      const matches = items.filter((item) => item.id.startsWith(target));
      if (matches.length > 1) {
        throw new Error(
          `Short ${noun} id "${target}" matches more than one ${noun}; use the full id.`
        );
      }
      return matches[0];
    };

    /** Resolve a marker by id, or by case-insensitive label. */
    const requireMarker = (target: string): TimelineMarker => {
      const { markers } = doc.getState();
      const byId = findByIdOrShortId(markers, target, "marker");
      if (byId) {
        return byId;
      }
      const lower = target.toLowerCase();
      const byLabel = markers.find((m) => m.label.toLowerCase() === lower);
      if (byLabel) {
        return byLabel;
      }
      const known = markers
        .map((m) => `${m.id} ("${m.label}") at ${m.timeMs}ms`)
        .join(", ");
      throw new Error(
        `No marker matches "${target}". Use a marker id or its label. ` +
          (known.length > 0
            ? `Markers: ${known}.`
            : "This sequence has no markers yet.")
      );
    };

    /**
     * The flow's state on this sequence. A tool that reads it before anything
     * wrote one starts the flow rather than failing: writing a brief onto a
     * finished timeline is the agent asking for the flow.
     */
    const requireSetup = (): TimelineSetup => {
      const setup = doc.getState().setup;
      if (setup) {
        return setup;
      }
      doc.getState().setSetup({});
      const started = doc.getState().setup;
      if (!started) {
        throw new Error("This sequence has no guided setup.");
      }
      return started;
    };

    /** Resolve a beat by id, or by its 1-based position in the plan. */
    const requireBeat = (target: string): TimelineBeat => {
      const beats = doc.getState().setup?.beats ?? [];
      const byId = beats.find((beat) => beat.id === target);
      if (byId) {
        return byId;
      }
      const position = Number.parseInt(target, 10);
      const byPosition = beats[position - 1];
      if (Number.isFinite(position) && byPosition) {
        return byPosition;
      }
      throw new Error(
        `No beat matches "${target}". Use a beat id or its 1-based position. ` +
          (beats.length > 0
            ? `This plan has ${beats.length} beats.`
            : "This sequence has no beat plan yet; run ui_timeline_plan_beats first.")
      );
    };

    const requireTrack = (target: string): TimelineTrack => {
      const { tracks } = doc.getState();
      const byId = tracks.find((t) => t.id === target);
      if (byId) {
        return byId;
      }
      if (isShortResourceId(target)) {
        const matches = tracks.filter((track) => track.id.startsWith(target));
        if (matches.length === 1) {
          return matches[0];
        }
        if (matches.length > 1) {
          throw new Error(
            `Short track id "${target}" matches more than one track. Use the full id or name.`
          );
        }
      }
      const lower = target.toLowerCase();
      const byName = tracks.find((t) => t.name.toLowerCase() === lower);
      if (byName) {
        return byName;
      }
      throw new Error(`Track not found on the timeline: ${target}`);
    };

    const clipNode = (clip: TimelineClip): TimelineClipNode =>
      toClipNode(clip, trackMap());

    const reReadClip = (id: string): TimelineClip => {
      const clip = doc.getState().clips.find((c) => c.id === id);
      if (!clip) {
        throw new Error(`Clip ${id} disappeared after the edit.`);
      }
      return clip;
    };

    /**
     * The notes, with every problem reported at once. `validateNotes` reads a
     * complete note, so ids and velocities are filled in first — the agent
     * sends neither and would otherwise be told its own defaults are wrong.
     */
    const requireValidNotes = (notes: MidiNoteInput[]): MidiNoteInput[] => {
      const complete = notes.map((note, index) => ({
        id: note.id ?? `pending-${index}`,
        velocity: note.velocity ?? DEFAULT_AGENT_NOTE_VELOCITY,
        pitch: note.pitch,
        startTick: note.startTick,
        durationTick: note.durationTick
      }));
      const problems = validateNotes(complete);
      if (problems.length > 0) {
        throw new Error(
          `These notes cannot be stored: ${problems
            .map((p) =>
              p.index !== undefined
                ? `note ${p.index}: ${p.message}`
                : p.message
            )
            .join(" ")}`
        );
      }
      return notes;
    };

    /** The clip `target` names, refusing anything that carries no notes. */
    const requireMidiClip = (target: string): TimelineClip => {
      const clip = requireClip(target);
      if (clip.mediaType !== "midi") {
        throw new Error(
          `"${clip.name}" is a ${clip.mediaType} clip; only a midi clip carries notes.`
        );
      }
      return clip;
    };

    /** End of the last clip on a track, or 0 when the track is empty. */
    const trackEndMs = (trackId: string): number =>
      doc
        .getState()
        .clips.filter((c) => c.trackId === trackId)
        .reduce((end, c) => Math.max(end, c.startMs + c.durationMs), 0);

    const handlerImpl: TimelineAgentHandler = {
      applyOp: editOp,
      getSnapshot(): TimelineSnapshot {
        const state = doc.getState();
        const tracks = state.tracks;
        const map = trackMap();
        const clipCountByTrack = new Map<string, number>();
        for (const c of state.clips) {
          clipCountByTrack.set(
            c.trackId,
            (clipCountByTrack.get(c.trackId) ?? 0) + 1
          );
        }
        return {
          sequenceId: state.sequenceId,
          fps: state.fps,
          width: state.width,
          height: state.height,
          durationMs: state.durationMs,
          playheadMs: Math.round(playback.getState().getTimeMs()),
          selectedClipIds: [...ui.getState().selectedClipIds],
          tracks: tracks.map((t) =>
            toTrackNode(t, clipCountByTrack.get(t.id) ?? 0)
          ),
          clips: state.clips.map((c) => toClipNode(c, map)),
          markers: state.markers.map(toMarkerNode),
          mediaTracks: state.mediaTracks.map((track) => ({
            id: track.id,
            clipId: track.clipId,
            name: track.name,
            kind: track.kind,
            status: track.status
          })),
          tempo: resolveTempo(state)
        };
      },

      async retargetFormat(options) {
        const result = await editOp({
          op: "retarget_format",
          aspect_ratio: options.aspectRatio,
          strategy: options.strategy,
          safe_margin: options.safeMargin ?? 0.1,
          track_ids: options.trackIds
        });
        if (
          typeof result.sequenceId !== "string" ||
          typeof result.name !== "string"
        ) {
          throw new Error("Could not create format adaptation.");
        }
        return { sequenceId: result.sequenceId, name: result.name };
      },

      async setReframeSubject(target, trackId, options) {
        await editOp({
          op: "set_reframe_subject",
          clip_id: target,
          track_id: trackId,
          safe_margin: options?.safeMargin,
          smoothing: options?.smoothing
        });
        return clipNode(requireClip(target));
      },

      async addReframeKeyframe(target, keyframe) {
        await editOp({
          op: "add_reframe_keyframe",
          clip_id: target,
          source_ms: keyframe.sourceMs,
          x: keyframe.x,
          y: keyframe.y,
          zoom: keyframe.zoom
        });
        return clipNode(requireClip(target));
      },

      async clearReframe(target) {
        await editOp({ op: "clear_reframe", clip_id: target });
        return clipNode(requireClip(target));
      },

      async addTrack(type, name) {
        await editOp({
          op: "add_track",
          type,
          name: name ?? `${type} ${doc.getState().tracks.length + 1}`
        });
        const track = doc.getState().tracks.at(-1);
        if (!track) {
          throw new Error("Track was not added.");
        }
        return toTrackNode(track, 0);
      },

      async moveTrack(target, destination) {
        await editOp({ op: "move_track", target, ...destination });
        return trackNodes();
      },

      async deleteTrack(target, deleteClips) {
        const track = requireTrack(target);
        const removed = doc
          .getState()
          .clips.filter((clip) => clip.trackId === track.id);
        const deleted = toTrackNode(track, removed.length);
        await editOp({ op: "delete_track", target, deleteClips });
        return {
          deleted,
          deletedClipIds: removed.map((clip) => clip.id),
          tracks: trackNodes()
        };
      },

      async generateClip(opts) {
        const kind = opts.kind;
        const store = doc.getState();

        // Resolve provider/model: explicit args, else the last-used model.
        const remembered = getRememberedModel(KIND_TO_MODEL_KIND[kind]);
        const provider = opts.provider ?? remembered?.provider;
        const model = opts.model ?? remembered?.model;
        const voice =
          kind === "text-to-audio"
            ? (opts.voice ?? remembered?.voice)
            : opts.voice;

        const created = await editOp({
          op: "generate_clip",
          ...opts,
          provider,
          model,
          voice,
          autoGenerate: false
        });
        const clipId = resultClipId(created);

        const canGenerate =
          !!provider &&
          !!model &&
          opts.prompt.trim().length > 0 &&
          (kind !== "text-to-audio" || !!voice);

        let generationStarted = false;
        let note: string | undefined;
        if (opts.autoGenerate === false) {
          note = "Clip created as a draft (autoGenerate was false).";
        } else if (!canGenerate) {
          note =
            kind === "text-to-audio" && !voice
              ? "Clip created as a draft — set a provider, model and voice, then regenerate."
              : "Clip created as a draft — no model resolved. Set a provider and model, then regenerate.";
        } else {
          const requestId = await startDirectGen(clipId);
          generationStarted = requestId !== null;
          if (!generationStarted) {
            note = "Generation could not be started; the clip is a draft.";
          }
        }

        return { clip: clipNode(reReadClip(clipId)), generationStarted, note };
      },

      async generativelyEditClip(opts) {
        // This operation intentionally accepts only a document id. Other
        // timeline tools accept names for convenience, but an edit request has
        // a durable destination and must never bind to a later name match.
        const clip = findByIdOrShortId(
          doc.getState().clips,
          opts.clipId,
          "clip"
        );
        if (!clip) {
          throw new Error(
            `No clip with id "${opts.clipId}" exists on this timeline. Call ui_timeline_get_state and pass the clip id.`
          );
        }
        if ((opts.provider === undefined) !== (opts.model === undefined)) {
          throw new Error(
            "Pass provider and model together for an AI video edit, or select a video-edit model in the editor first."
          );
        }
        // A clip's remembered/generic video model may only support
        // text-to-video. An edit needs one known video-to-video pair, so never
        // combine partial values from different defaults.
        const remembered = getRememberedModelForTask("video", "video_to_video");
        const provider = opts.provider ?? remembered?.provider;
        const model = opts.model ?? remembered?.model;
        if (!provider || !model) {
          throw new Error(
            `No video-edit model is available for clip "${clip.name}". Pass provider and model, or select a video-edit model in the editor first.`
          );
        }

        const requestId = await startEdit({
          clipId: clip.id,
          instruction: opts.instruction,
          provider,
          model
        });
        if (!requestId) {
          throw new Error(
            `Could not start an AI edit for "${clip.name}". The clip may already have an edit in progress or its active source is not eligible.`
          );
        }
        const current = reReadClip(clip.id);
        return {
          requestId,
          generationId: requestId,
          activeTakeId: current.activeTakeId ?? null,
          candidate: {
            // The landing path uses the request id as the immutable take id,
            // so the agent can pass this value directly to apply_take once it
            // has completed.
            id: requestId,
            status: "pending" as const,
            source: "video_to_video" as const
          },
          clip: clipNode(current)
        };
      },

      applyTake(clipId, takeId) {
        const clip = findByIdOrShortId(doc.getState().clips, clipId, "clip");
        if (!clip) {
          throw new Error(
            `No clip with id "${clipId}" exists on this timeline. Call ui_timeline_get_state and pass the clip id.`
          );
        }
        const take = (clip.versions ?? []).find(
          (candidate) => candidate.id === takeId
        );
        if (!take?.mediaEdit) {
          throw new Error(
            `Take "${takeId}" is not an AI edit candidate for "${clip.name}". Apply only the candidate returned by ui_timeline_generatively_edit_clip.`
          );
        }
        const error = doc.getState().applyTake(clip.id, takeId);
        if (error) {
          throw new Error(error);
        }
        return clipNode(reReadClip(clip.id));
      },

      async addMediaClip(opts: TimelineAddMediaClipOptions) {
        const result = await editOp({ op: "add_media_clip", ...opts });
        return clipNode(reReadClip(resultClipId(result)));
      },

      async addTextClip(opts: TimelineAddTextClipOptions) {
        const result = await editOp({
          op: "add_text_clip",
          ...opts,
          name: opts.text.trim().slice(0, 40) || "Text",
          startMs:
            opts.startMs === undefined ? undefined : Math.max(0, opts.startMs),
          durationMs: Math.max(1, opts.durationMs ?? 3000)
        });
        return clipNode(reReadClip(resultClipId(result)));
      },

      async addShapeClip(opts: TimelineAddShapeClipOptions) {
        const result = await editOp({
          op: "add_shape_clip",
          ...opts,
          name: opts.shape.kind
        });
        return clipNode(reReadClip(resultClipId(result)));
      },

      async addModel3DClip(opts) {
        const result = await editOp({ op: "add_model3d_clip", ...opts });
        return clipNode(reReadClip(resultClipId(result)));
      },

      async setModel3DStyle(target, patch: ClipModel3DStylePatch) {
        await editOp({ op: "set_model3d_style", target, patch: { ...patch } });
        return clipNode(requireClip(target));
      },

      async bakeModel3DClip(target) {
        const clip = requireClip(target);
        // Every refusal a bake has — not a 3D clip, no style, no asset, a
        // transparent background — is `bakeClip`'s, so it is the one place
        // the browser and the server can be compared against each other.
        await bakeClip(clip.id);
        return clipNode(reReadClip(clip.id));
      },

      async splitClip(target, atMs) {
        const result = await editOp({ op: "split_clip", target, atMs });
        if (!Array.isArray(result.clips)) {
          throw new Error("Split returned no clips.");
        }
        return result.clips.map((clip) =>
          clipNode(reReadClip(resultClipId({ clip })))
        );
      },

      async trimClip(target, patch) {
        await editOp({ op: "trim_clip", target, ...patch });
        return clipNode(requireClip(target));
      },

      async moveClip(target, patch) {
        await editOp({ op: "move_clip", target, ...patch });
        return clipNode(requireClip(target));
      },

      async deleteClip(target) {
        const node = clipNode(requireClip(target));
        await editOp({ op: "delete_clip", target });
        return node;
      },

      async duplicateClip(target, gapMs) {
        const result = await editOp({ op: "duplicate_clip", target, gapMs });
        return clipNode(reReadClip(resultClipId(result)));
      },

      async setClipParams(target, patch) {
        const result = await editOp({
          op: "set_clip_params",
          target,
          patch: { ...patch }
        });
        return clipNode(reReadClip(resultClipId(result)));
      },

      async setClipBinding(target, patch) {
        await editOp({
          op: "set_clip_binding",
          target,
          ...patch,
          regenerate: false
        });
        const clip = requireClip(target);
        if (patch.regenerate && (await startDirectGen(clip.id)) === null) {
          throw new Error(
            `The binding on "${clip.name}" was updated, but regeneration did not start. Check its status and model, then try again.`
          );
        }
        return clipNode(reReadClip(clip.id));
      },

      async setClipAnimations(target, animations, mode) {
        await editOp({ op: "animate_clip", target, animations, mode });
        return clipNode(requireClip(target));
      },

      async clearClipAnimations(target, role) {
        await editOp({ op: "clear_animations", target, role });
        return clipNode(requireClip(target));
      },

      async staggerAnimations(clipIds, offsetMs) {
        await editOp({
          op: "stagger_animations",
          clip_ids: clipIds,
          offset_ms: offsetMs
        });
        return clipIds.map((id) => clipNode(requireClip(id)));
      },

      async getClipFrames(target, opts) {
        const clip = requireClip(target);
        const timelineTimes =
          opts.timesMs && opts.timesMs.length > 0
            ? opts.timesMs
                .slice(0, MAX_FRAME_COUNT)
                .map((time) =>
                  timelineTimeForFrameRequest(clip, Math.round(time))
                )
            : sampleClipTimelineTimes(clip, opts.count ?? DEFAULT_FRAME_COUNT);
        const width = clampNumber(
          Math.round(opts.width ?? DEFAULT_FRAME_WIDTH),
          1,
          MAX_FRAME_WIDTH
        );

        if (
          clip.mediaType === "text" ||
          clip.mediaType === "shape" ||
          clip.mediaType === "model3d"
        ) {
          const state = doc.getState();
          const frames = await renderRasterClipFrames(
            clip,
            timelineTimes,
            width,
            state.width,
            state.height,
            {
              clips: state.clips,
              mediaTracks: state.mediaTracks,
              tempo: state.tempo,
              camera2d: state.camera2d
            }
          );
          return {
            clip: clipNode(clip),
            frames: frames.map((frame, index) => ({
              clipId: clip.id,
              clipName: clip.name,
              timelineTimeMs: timelineTimes[index],
              sourceTimeMs: timelineTimes[index] - clip.startMs,
              ...frame
            }))
          };
        }

        if (clip.mediaType !== "video" && clip.mediaType !== "overlay") {
          throw new Error(
            `Clip "${clip.name}" is ${clip.mediaType}; frame inspection requires a video clip.`
          );
        }
        if (!clip.currentAssetId) {
          throw new Error(`Clip "${clip.name}" has no rendered video asset.`);
        }

        const asset = await useAssetStore.getState().get(clip.currentAssetId);
        const url = getAssetUrl(asset);
        if (!url) {
          throw new Error(
            `Could not resolve video URL for clip "${clip.name}".`
          );
        }

        const sourceTimes = timelineTimes.map((time) =>
          sourceTimeForTimelineTime(clip, time)
        );
        const frames = await extractVideoFrames(
          url,
          sourceTimes.map((time) => time / 1000),
          width
        );
        const frameNodes: TimelineClipFrameNode[] = frames.map((frame, i) => ({
          clipId: clip.id,
          clipName: clip.name,
          timelineTimeMs: timelineTimes[i],
          sourceTimeMs: Math.round(frame.time * 1000),
          width: frame.width,
          height: frame.height,
          dataUrl: frame.dataUrl
        }));
        return { clip: clipNode(clip), frames: frameNodes };
      },

      async addGroup({ name, startMs, durationMs, trackId, children }) {
        const result = await editOp({
          op: "add_group",
          name,
          startMs,
          durationMs,
          trackId,
          children
        });
        return {
          clip: clipNode(reReadClip(resultClipId(result))),
          children: result.children as string[]
        };
      },

      async setParent(target, parentId) {
        await editOp({ op: "set_parent", target, parentId });
        return clipNode(requireClip(target));
      },

      async setTransition(target, transition) {
        await editOp({ op: "set_transition", target, transition });
        return clipNode(requireClip(target));
      },

      async setMask(target, mask) {
        await editOp({ op: "set_mask", target, mask });
        return clipNode(requireClip(target));
      },

      async setMatte(target, matte) {
        await editOp({ op: "set_matte", target, matte });
        return clipNode(requireClip(target));
      },

      async setTimeRemap(target, timeRemap) {
        await editOp({ op: "set_time_remap", target, timeRemap });
        return clipNode(requireClip(target));
      },

      async setEffects(target, effects) {
        await editOp({ op: "set_effects", target, effects });
        return clipNode(requireClip(target));
      },

      selectClip(target) {
        if (!target) {
          ui.getState().clearSelection();
          return null;
        }
        const clip = requireClip(target);
        ui.getState().selectClip(clip.id);
        return clipNode(clip);
      },

      seek(timeMs) {
        playback.getState().seek(Math.max(0, timeMs));
        return Math.round(playback.getState().getTimeMs());
      },

      async addMarker(opts) {
        const result = await editOp({ op: "add_marker", ...opts });
        const marker = doc
          .getState()
          .markers.find((marker) => marker.id === resultMarkerId(result));
        if (!marker) {
          throw new Error("Marker was not added.");
        }
        return toMarkerNode(marker);
      },

      async deleteMarker(target) {
        const marker = requireMarker(target);
        await editOp({ op: "delete_marker", target });
        return toMarkerNode(marker);
      },

      async addMidiClip(opts: TimelineAddMidiClipOptions) {
        const result = await editOp({
          op: "add_midi_clip",
          track: opts.trackId,
          start_ms: opts.startMs,
          duration_ms: opts.durationMs,
          name: opts.name,
          notes: opts.notes?.map((note) => ({
            id: note.id,
            pitch: note.pitch,
            start_tick: note.startTick,
            duration_tick: note.durationTick,
            velocity: note.velocity
          }))
        });
        return clipNode(reReadClip(resultClipId(result)));
      },

      async setNotes(target, notes) {
        await editOp({
          op: "set_notes",
          clip: target,
          notes: notes.map((note) => ({
            id: note.id,
            pitch: note.pitch,
            start_tick: note.startTick,
            duration_tick: note.durationTick,
            velocity: note.velocity
          }))
        });
        return clipNode(requireClip(target));
      },

      async setTempo(tempo: TimelineTempo) {
        await editOp({
          op: "set_tempo",
          bpm: tempo.bpm,
          beats_per_bar: tempo.timeSignature.beatsPerBar,
          beat_unit: tempo.timeSignature.beatUnit,
          offset_ms: tempo.offsetMs
        });
        return handlerImpl.getSnapshot();
      },

      async transposeClip(target, semitones: number) {
        await editOp({ op: "transpose_clip", clip: target, semitones });
        return clipNode(requireClip(target));
      },

      async quantizeClip(target, options: QuantizeOptions) {
        await editOp({ op: "quantize_notes", clip: target, ...options });
        return clipNode(requireClip(target));
      },

      async scaleClipVelocity(target, factor: number) {
        await editOp({ op: "scale_velocity", clip: target, factor });
        return clipNode(requireClip(target));
      },

      async setTrackInstrument(target, instrument: MidiInstrument) {
        await editOp({ op: "set_track_instrument", track: target, instrument });
        const track = requireTrack(target);
        return toTrackNode(
          track,
          doc.getState().clips.filter((clip) => clip.trackId === track.id)
            .length
        );
      },

      // ── Guided video flow (PRD § 8.6) ───────────────────────────────────

      async setSetup(patch) {
        await editOp({ op: "set_setup", ...patch });
        return requireSetup();
      },

      async planBeats(opts) {
        const setup = requireSetup();
        // The written form takes the plan verbatim; the drafted form asks the
        // Director. Both write text and nothing else (D4, criterion 3).
        if (opts.beats?.length) {
          await editOp({
            op: "plan_beats",
            beats: opts.beats.map((beat) => ({ ...beat }))
          });
          return doc.getState().setup?.beats ?? [];
        }
        const format = videoFormatById(setup.format);
        if (!format) {
          throw new Error(
            "This sequence has no format yet. Set one with ui_timeline_set_setup, or pass `beats` to write the plan yourself."
          );
        }
        const beats = await planBeats({
          brief: setup.brief,
          format,
          previous: opts.replan ? setup.beats : undefined
        });
        await editOp({
          op: "plan_beats",
          beats: beats.map((beat) => ({
            prompt: beat.prompt,
            durationMs: beat.duration_ms,
            transition: beat.transition,
            voiceover: beat.voiceover,
            music: beat.music
          }))
        });
        return doc.getState().setup?.beats ?? [];
      },

      async updateBeat(target, patch) {
        await editOp({ op: "update_beat", beat: target, ...patch });
        return requireBeat(target);
      },

      async removeBeat(target) {
        const beat = requireBeat(target);
        await editOp({ op: "remove_beat", beat: target });
        return beat;
      },

      generateFromBeats(opts) {
        return generateFromBeats(doc, { ...opts, startJob: startDirectGen });
      }
    };
    return handlerImpl;
  }, [
    doc,
    ui,
    playback,
    startDirectGen,
    startEdit,
    bakeClip,
    sequenceId,
    opContextOverrides
  ]);

  useEffect(() => {
    if (!sequenceId) {
      return;
    }
    let installed = false;
    const register = (): void => {
      if (doc.getState().sequenceId === sequenceId) {
        if (!installed) {
          setTimelineAgentHandler(sequenceId, handler);
          installed = true;
        }
      } else if (installed) {
        if (
          hasTimelineAgentHandler(sequenceId) &&
          getTimelineAgentHandler(sequenceId) === handler
        ) {
          setTimelineAgentHandler(sequenceId, null);
        }
        installed = false;
      }
    };
    register();
    const unsubscribe = doc.subscribe(register);
    return () => {
      unsubscribe();
      if (
        hasTimelineAgentHandler(sequenceId) &&
        getTimelineAgentHandler(sequenceId) === handler
      ) {
        setTimelineAgentHandler(sequenceId, null);
      }
    };
  }, [sequenceId, handler, doc]);
};
