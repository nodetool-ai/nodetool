/** The clip and track shapes an op result reports. */

import { activeTakeIdOf } from "../takes.js";
import { activeLoopMs, expandMidiLoop, loopRepeatCount } from "../clipLoop.js";
import { formatBarsBeats } from "../midi/grid.js";
import { resolveTempo } from "../midi/tempo.js";
import { visibleNotes } from "../midi/notes.js";
import { presetIdForInstrument } from "../midi/presets.js";
import { harmonySummary } from "../harmony/summary.js";
import { keyLabel, signatureLabel, trackChordChart } from "./chords.js";
import type { MediaTrack, TimelineClip, TimelineTrack } from "../types.js";
import type { TimelineOpState } from "./types.js";

export function serializeTrack(
  state: TimelineOpState,
  t: TimelineTrack,
  clipCount?: number
) {
  return {
    id: t.id,
    name: t.name,
    type: t.type,
    index: t.index,
    visible: t.visible,
    locked: t.locked,
    muted: t.muted ?? false,
    solo: t.solo ?? false,
    clipCount:
      clipCount ?? state.clips.filter((c) => c.trackId === t.id).length,
    instrument: t.instrument,
    presetId: t.instrument ? presetIdForInstrument(t.instrument) : undefined,
    ...(t.type === "chord" ? chordTrackFields(state, t) : {})
  };
}

/** What get_state shows of a chord track: the chart from bar 1, the key and the signature. */
function chordTrackFields(state: TimelineOpState, t: TimelineTrack) {
  const tempo = resolveTempo(state);
  return {
    chordCount: t.chords?.length ?? 0,
    chordChart: trackChordChart(tempo, t.chords ?? []),
    key: keyLabel(tempo) ?? null,
    signature: signatureLabel(tempo)
  };
}

export function serializeClip(state: TimelineOpState, c: TimelineClip) {
  const track = state.tracks.find((t) => t.id === c.trackId);
  const reframe = c.reframe
    ? {
        mode: c.reframe.mode,
        trackId: c.reframe.trackId,
        safeMargin: c.reframe.safeMargin,
        smoothing: c.reframe.smoothing,
        sampleCount: c.reframe.samples?.length ?? 0,
        keyframeCount: c.reframe.keyframes?.length ?? 0
      }
    : undefined;
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
    loopLengthMs: c.loopLengthMs,
    loopRepeats:
      c.loopLengthMs !== undefined && activeLoopMs(c) !== undefined
        ? loopRepeatCount(c)
        : undefined,
    status: c.status,
    currentAssetId: c.currentAssetId,
    activeTakeId: activeTakeIdOf(c),
    takeCount: c.versions?.length ?? 0,
    noteCount: c.notes?.length,
    audibleNoteCount:
      c.mediaType === "midi"
        ? visibleNotes(
            expandMidiLoop(c, resolveTempo(state).bpm),
            resolveTempo(state).bpm
          ).length
        : undefined,
    startBarsBeats:
      c.mediaType === "midi"
        ? formatBarsBeats(c.startMs, resolveTempo(state))
        : undefined,
    harmony: harmonySummary(c.harmony),
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
    labelColor: c.labelColor,
    opacity: c.opacity,
    transform: c.transform,
    textStyle: c.textStyle,
    shapeStyle: c.shapeStyle,
    captionStyle: c.caption?.style,
    transitionIn: c.transitionIn,
    mask: c.mask,
    matte: c.matte,
    timeRemap: c.timeRemap,
    effects: c.effects,
    parentId: c.parentId,
    reframe
  };
}

/** Compact source-analysis summary for get_state; sample arrays stay lazy. */
export function serializeMediaTrack(track: MediaTrack) {
  return {
    id: track.id,
    clipId: track.clipId,
    sourceAssetId: track.sourceAssetId,
    name: track.name,
    kind: track.kind,
    sourceStartMs: track.sourceStartMs,
    sourceEndMs: track.sourceEndMs,
    sampleCount: track.samples.length,
    confidence: track.confidence,
    status: track.status,
    provenance: track.provenance
  };
}
