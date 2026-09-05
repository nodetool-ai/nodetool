/** The clip and track shapes an op result reports. */

import type { TimelineClip, TimelineTrack } from "../types.js";
import type { TimelineOpState } from "./types.js";

export function serializeTrack(state: TimelineOpState, t: TimelineTrack) {
  return {
    id: t.id,
    name: t.name,
    type: t.type,
    index: t.index,
    visible: t.visible,
    locked: t.locked,
    muted: t.muted ?? false,
    solo: t.solo ?? false,
    clipCount: state.clips.filter((c) => c.trackId === t.id).length
  };
}

export function serializeClip(state: TimelineOpState, c: TimelineClip) {
  const track = state.tracks.find((t) => t.id === c.trackId);
  return {
    id: c.id,
    name: c.name,
    trackId: c.trackId,
    trackName: track?.name ?? null,
    mediaType: c.mediaType,
    sourceType: c.sourceType,
    startMs: c.startMs,
    durationMs: c.durationMs,
    endMs: c.startMs + c.durationMs,
    inPointMs: c.inPointMs,
    outPointMs: c.outPointMs,
    status: c.status,
    prompt: c.prompt,
    provider: c.provider,
    model: c.model,
    voice: c.voice,
    animations: (c.animations ?? []).map((a) => ({
      role: a.role,
      preset: a.preset
    })),
    hidden: c.hidden ?? false,
    muted: c.muted ?? false,
    locked: c.locked,
    opacity: c.opacity,
    textStyle: c.textStyle,
    shapeStyle: c.shapeStyle,
    captionStyle: c.caption?.style,
    transitionIn: c.transitionIn,
    mask: c.mask,
    matte: c.matte,
    timeRemap: c.timeRemap,
    effects: c.effects,
    parentId: c.parentId
  };
}
