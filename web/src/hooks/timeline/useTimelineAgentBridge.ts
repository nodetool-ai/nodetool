/**
 * useTimelineAgentBridge
 *
 * Registers a {@link TimelineAgentHandler} for the surrounding timeline editor
 * instance while it is the active surface, so the `ui_timeline_*` agent tools
 * operate on this sequence. Mirrors the handler the 3D editor registers on the
 * `model3DToolBridge`, but built against the timeline's per-instance stores
 * (document, UI, playback) plus the direct-generation job runner.
 *
 * Only the active editor registers, so with several timeline tabs open the
 * tools always target the focused one. The handler is cleared on blur/unmount.
 */

import { useEffect, useMemo } from "react";
import { makeClip } from "@nodetool-ai/timeline";
import type {
  ClipAnimation,
  TimelineClip,
  TimelineTrack
} from "@nodetool-ai/timeline";
import { buildClipAnimation } from "./buildClipAnimation";
import {
  shapeStyleWithDefaults,
  textStyleWithDefaults
} from "./authoredClipStyles";

import { useTimelineStoreApi } from "../../stores/timeline/TimelineStore";
import { useTimelineUIStoreApi } from "../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStoreApi } from "../../stores/timeline/TimelinePlaybackStore";
import {
  getRememberedModel,
  type ModelKind
} from "../../stores/lastModelStore";
import { useAssetStore } from "../../stores/AssetStore";
import { getAssetUrl } from "../../utils/assetHelpers";
import { useTimelineDirectGenJob } from "./useTimelineDirectGenJob";
import {
  getTimelineAgentHandler,
  hasTimelineAgentHandler,
  setTimelineAgentHandler,
  type TimelineAgentHandler,
  type TimelineAnimationNode,
  type TimelineClipNode,
  type TimelineClipFrameNode,
  type TimelineAddTextClipOptions,
  type TimelineAddShapeClipOptions,
  type TimelineGenerateKind,
  type TimelineSnapshot,
  type TimelineTrackNode
} from "../../components/timeline/timelineAgentBridge";
import { extractVideoFrames } from "../../components/timeline/Tracks/clipThumbnails";
import { renderRasterClipFrames } from "../../components/timeline/preview/rasterClipFrames";

const KIND_TO_MODEL_KIND: Record<TimelineGenerateKind, ModelKind> = {
  "text-to-video": "video",
  "text-to-image": "image",
  "text-to-audio": "audio"
};

const KIND_TO_MEDIA_TYPE: Record<
  TimelineGenerateKind,
  "image" | "video" | "audio" | "overlay"
> = {
  "text-to-video": "video",
  "text-to-image": "image",
  "text-to-audio": "audio"
};

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
  if (n === 1 || end <= start) return [start];
  return Array.from({ length: n }, (_, i) =>
    Math.round(start + (i / (n - 1)) * (end - start))
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
    shapeStyle: clip.shapeStyle
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
    clipCount
  };
}

export const useTimelineAgentBridge = (active: boolean): void => {
  const doc = useTimelineStoreApi();
  const ui = useTimelineUIStoreApi();
  const playback = useTimelinePlaybackStoreApi();
  const { start: startDirectGen } = useTimelineDirectGenJob();

  const handler = useMemo<TimelineAgentHandler>(() => {
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
        if (!clip) throw new Error("Selected clip no longer exists.");
        return clip;
      }
      const byId = clips.find((c) => c.id === target);
      if (byId) return byId;
      const lower = target.toLowerCase();
      const byName = clips.find((c) => c.name.toLowerCase() === lower);
      if (byName) return byName;
      throw new Error(`Clip not found on the timeline: ${target}`);
    };

    const requireTrack = (target: string): TimelineTrack => {
      const { tracks } = doc.getState();
      const byId = tracks.find((t) => t.id === target);
      if (byId) return byId;
      const lower = target.toLowerCase();
      const byName = tracks.find((t) => t.name.toLowerCase() === lower);
      if (byName) return byName;
      throw new Error(`Track not found on the timeline: ${target}`);
    };

    const clipNode = (clip: TimelineClip): TimelineClipNode =>
      toClipNode(clip, trackMap());

    const reReadClip = (id: string): TimelineClip => {
      const clip = doc.getState().clips.find((c) => c.id === id);
      if (!clip) throw new Error(`Clip ${id} disappeared after the edit.`);
      return clip;
    };

    /** End of the last clip on a track, or 0 when the track is empty. */
    const trackEndMs = (trackId: string): number =>
      doc
        .getState()
        .clips.filter((c) => c.trackId === trackId)
        .reduce((end, c) => Math.max(end, c.startMs + c.durationMs), 0);

    return {
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
          clips: state.clips.map((c) => toClipNode(c, map))
        };
      },

      addTrack(type, name) {
        doc.getState().addTrack(type, name);
        const tracks = doc.getState().tracks;
        // A freshly added track has no clips yet.
        return toTrackNode(tracks[tracks.length - 1], 0);
      },

      async generateClip(opts) {
        const kind = opts.kind;
        const store = doc.getState();

        // Resolve the target track for the media kind. Resolve a passed
        // id/name to the real track id — keeping the raw string would forward
        // a track *name* into addDirectGenClip/trackEndMs and orphan the clip.
        let trackId: string;
        if (opts.trackId) {
          trackId = requireTrack(opts.trackId).id;
        } else if (kind === "text-to-audio") {
          trackId = store.getOrCreateAudioTrack();
        } else {
          const video = store.tracks.find((t) => t.type === "video");
          if (video) {
            trackId = video.id;
          } else {
            store.addTrack("video");
            const tracks = doc.getState().tracks;
            trackId = tracks[tracks.length - 1].id;
          }
        }

        // Clamp start to >= 0 so an agent-supplied negative can't create a
        // clip with invalid timing.
        const startMs = Math.max(0, opts.startMs ?? trackEndMs(trackId));

        // Resolve provider/model: explicit args, else the last-used model.
        const remembered = getRememberedModel(KIND_TO_MODEL_KIND[kind]);
        const provider = opts.provider ?? remembered?.provider;
        const model = opts.model ?? remembered?.model;
        const voice =
          kind === "text-to-audio"
            ? (opts.voice ?? remembered?.voice)
            : opts.voice;

        const clipId = doc.getState().addDirectGenClip({
          trackId,
          startMs,
          // Clamp to a positive duration; addDirectGenClip only falls back to
          // its default when durationMs is undefined, so a negative/zero from
          // an agent would otherwise create an invalid clip.
          durationMs:
            opts.durationMs === undefined
              ? undefined
              : Math.max(1, opts.durationMs),
          mediaType: KIND_TO_MEDIA_TYPE[kind],
          bindingKind: kind,
          prompt: opts.prompt,
          provider,
          model,
          voice,
          width: opts.width,
          height: opts.height,
          aspectRatio: opts.aspectRatio,
          resolution: opts.resolution
        });

        ui.getState().selectClip(clipId);

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

      addTextClip(opts: TimelineAddTextClipOptions) {
        const store = doc.getState();
        let trackId: string;
        if (opts.trackId) {
          const track = requireTrack(opts.trackId);
          if (track.type !== "video" && track.type !== "overlay") {
            throw new Error(
              `Text clips require a video or overlay track; "${track.name}" is ${track.type}.`
            );
          }
          trackId = track.id;
        } else {
          const overlay = store.tracks.find(
            (track) => track.type === "overlay"
          );
          if (overlay) {
            trackId = overlay.id;
          } else {
            store.addTrack("overlay", "Text");
            const created = doc.getState().tracks.at(-1);
            if (!created) {
              throw new Error("Could not create an overlay track for text.");
            }
            trackId = created.id;
          }
        }
        const textStyle = textStyleWithDefaults(opts);
        const clip = makeClip({
          trackId,
          name: opts.text.trim().slice(0, 40) || "Text",
          startMs: Math.max(0, opts.startMs ?? trackEndMs(trackId)),
          durationMs: Math.max(1, opts.durationMs ?? 3000),
          mediaType: "text",
          sourceType: "imported",
          status: "generated",
          textStyle
        });
        store.addClip(clip);
        ui.getState().selectClip(clip.id);
        return clipNode(reReadClip(clip.id));
      },

      addShapeClip(opts: TimelineAddShapeClipOptions) {
        const store = doc.getState();
        const overlay = opts.trackId
          ? requireTrack(opts.trackId)
          : store.tracks.find((track) => track.type === "overlay");
        if (overlay && overlay.type !== "video" && overlay.type !== "overlay") {
          throw new Error(
            `Shape clips require a video or overlay track; "${overlay.name}" is ${overlay.type}.`
          );
        }
        if (!overlay) {
          store.addTrack("overlay", "Shapes");
        }
        const track = overlay ?? doc.getState().tracks.at(-1);
        if (!track) {
          throw new Error("Could not create an overlay track for a shape.");
        }
        const shapeStyle = shapeStyleWithDefaults(opts.shape);
        const clip = makeClip({
          trackId: track.id,
          name: opts.shape.kind,
          startMs: Math.max(0, opts.startMs ?? trackEndMs(track.id)),
          durationMs: Math.max(1, opts.durationMs ?? 3000),
          mediaType: "shape",
          sourceType: "imported",
          status: "generated",
          shapeStyle
        });
        store.addClip(clip);
        ui.getState().selectClip(clip.id);
        return clipNode(reReadClip(clip.id));
      },

      splitClip(target, atMs) {
        const clip = requireClip(target);
        const at = atMs ?? Math.round(playback.getState().getTimeMs());
        if (at <= clip.startMs || at >= clip.startMs + clip.durationMs) {
          throw new Error(
            `Split time ${at}ms is outside clip "${clip.name}" (${clip.startMs}–${
              clip.startMs + clip.durationMs
            }ms).`
          );
        }
        const before = new Set(doc.getState().clips.map((c) => c.id));
        doc.getState().splitClipAtTime(clip.id, at);
        const map = trackMap();
        return doc
          .getState()
          .clips.filter((c) => !before.has(c.id))
          .map((c) => toClipNode(c, map));
      },

      trimClip(target, patch) {
        const clip = requireClip(target);
        const next: Partial<TimelineClip> = {};
        if (patch.durationMs !== undefined) {
          next.durationMs = Math.max(1, patch.durationMs);
        }
        if (patch.inPointMs !== undefined) next.inPointMs = patch.inPointMs;
        if (patch.outPointMs !== undefined) next.outPointMs = patch.outPointMs;
        doc.getState().patchClip(clip.id, next);
        return clipNode(reReadClip(clip.id));
      },

      moveClip(target, patch) {
        const clip = requireClip(target);
        const next: Partial<TimelineClip> = {};
        if (patch.startMs !== undefined) {
          next.startMs = Math.max(0, patch.startMs);
        }
        if (patch.trackId !== undefined) {
          next.trackId = requireTrack(patch.trackId).id;
        }
        doc.getState().patchClip(clip.id, next);
        return clipNode(reReadClip(clip.id));
      },

      deleteClip(target) {
        const clip = requireClip(target);
        const node = clipNode(clip);
        doc.getState().deleteClip(clip.id);
        ui.getState().removeFromSelection(clip.id);
        return node;
      },

      async duplicateClip(target, gapMs) {
        const clip = requireClip(target);
        const newId = await doc.getState().duplicateClip(clip.id, gapMs ?? 0);
        return clipNode(reReadClip(newId));
      },

      setClipParams(target, patch) {
        const clip = requireClip(target);
        const next: Partial<TimelineClip> = {};
        if (patch.name !== undefined) next.name = patch.name;
        if (patch.opacity !== undefined) next.opacity = patch.opacity;
        if (patch.speedMultiplier !== undefined) {
          next.speedMultiplier = patch.speedMultiplier;
        }
        if (patch.volumeDb !== undefined) next.volumeDb = patch.volumeDb;
        if (patch.fadeInMs !== undefined) next.fadeInMs = patch.fadeInMs;
        if (patch.fadeOutMs !== undefined) next.fadeOutMs = patch.fadeOutMs;
        if (patch.blendMode !== undefined) {
          next.blendMode = patch.blendMode as TimelineClip["blendMode"];
        }
        if (patch.borderRadius !== undefined) {
          next.borderRadius = patch.borderRadius;
        }
        if (patch.hidden !== undefined) next.hidden = patch.hidden;
        if (patch.muted !== undefined) next.muted = patch.muted;
        if (patch.locked !== undefined) next.locked = patch.locked;
        if (patch.textStyle !== undefined) next.textStyle = patch.textStyle;
        if (patch.shapeStyle !== undefined) {
          next.shapeStyle = shapeStyleWithDefaults(patch.shapeStyle);
        }
        doc.getState().patchClip(clip.id, next);
        return clipNode(reReadClip(clip.id));
      },

      async setClipBinding(target, patch) {
        const clip = requireClip(target);
        if (clip.sourceType !== "generated") {
          throw new Error(
            `Clip "${clip.name}" is imported and has no generation binding.`
          );
        }
        // aspectRatio / resolution aren't part of patchClipBinding's fields.
        const direct: Partial<TimelineClip> = {};
        if (patch.aspectRatio !== undefined)
          direct.aspectRatio = patch.aspectRatio;
        if (patch.resolution !== undefined)
          direct.resolution = patch.resolution;
        if (Object.keys(direct).length > 0) {
          doc.getState().patchClip(clip.id, direct);
        }
        // Only forward defined fields — patchClipBinding spreads the patch, so
        // an undefined value would wipe the clip's existing prompt/model/etc.
        const binding: Partial<
          Pick<
            TimelineClip,
            | "prompt"
            | "negativePrompt"
            | "provider"
            | "model"
            | "voice"
            | "width"
            | "height"
            | "strength"
            | "numInferenceSteps"
          >
        > = {};
        if (patch.prompt !== undefined) binding.prompt = patch.prompt;
        if (patch.negativePrompt !== undefined) {
          binding.negativePrompt = patch.negativePrompt;
        }
        if (patch.provider !== undefined) binding.provider = patch.provider;
        if (patch.model !== undefined) binding.model = patch.model;
        if (patch.voice !== undefined) binding.voice = patch.voice;
        if (patch.width !== undefined) binding.width = patch.width;
        if (patch.height !== undefined) binding.height = patch.height;
        if (patch.strength !== undefined) binding.strength = patch.strength;
        if (patch.numInferenceSteps !== undefined) {
          binding.numInferenceSteps = patch.numInferenceSteps;
        }
        doc.getState().patchClipBinding(clip.id, binding);
        if (patch.regenerate) {
          await startDirectGen(clip.id);
        }
        return clipNode(reReadClip(clip.id));
      },

      setClipAnimations(target, animations, mode) {
        const clip = requireClip(target);
        if (
          clip.mediaType !== "text" &&
          animations.some((a) => a.stagger !== undefined)
        ) {
          throw new Error(
            `Stagger applies only to text clips; "${clip.name}" is a ${clip.mediaType} clip. Omit stagger or target a text clip.`
          );
        }
        const built = animations.map(buildClipAnimation);
        const next =
          mode === "add" ? [...(clip.animations ?? []), ...built] : built;
        doc.getState().setClipAnimations(clip.id, next);
        return clipNode(reReadClip(clip.id));
      },

      clearClipAnimations(target, role) {
        const clip = requireClip(target);
        const current = clip.animations ?? [];
        const next = role ? current.filter((a) => a.role !== role) : [];
        doc.getState().setClipAnimations(clip.id, next);
        return clipNode(reReadClip(clip.id));
      },

      async getClipFrames(target, opts) {
        const clip = requireClip(target);
        const timelineTimes =
          opts.timesMs && opts.timesMs.length > 0
            ? opts.timesMs
                .slice(0, MAX_FRAME_COUNT)
                .map((time) => Math.round(time))
            : sampleClipTimelineTimes(clip, opts.count ?? DEFAULT_FRAME_COUNT);
        timelineTimes.forEach((time) => sourceTimeForTimelineTime(clip, time));
        const width = clampNumber(
          Math.round(opts.width ?? DEFAULT_FRAME_WIDTH),
          1,
          MAX_FRAME_WIDTH
        );

        if (clip.mediaType === "text" || clip.mediaType === "shape") {
          const state = doc.getState();
          const frames = await renderRasterClipFrames(
            clip,
            timelineTimes,
            width,
            state.width,
            state.height
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
      }
    };
  }, [doc, ui, playback, startDirectGen]);

  useEffect(() => {
    if (!active) return;
    setTimelineAgentHandler(handler);
    return () => {
      // Only clear if we're still the registered handler — a newly-focused
      // editor may have already replaced us.
      if (hasTimelineAgentHandler() && getTimelineAgentHandler() === handler) {
        setTimelineAgentHandler(null);
      }
    };
  }, [active, handler]);
};
