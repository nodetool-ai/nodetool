// Pure SQ-4 launcher rules and display helpers. Session data lives in the
// session document (protocol.ts); this module keeps the pieces with no
// audio or document dependencies.

export const QUANTS = ['1 BAR', '1/4', 'OFF'] as const;
export type Quant = (typeof QUANTS)[number];

/** Queue value meaning "stop the track" (instead of a scene index). */
export const STOP = -1;

/** owner[track] = scene index currently playing on that track. */
export type OwnerMap = Record<number, number>;
/** queue[track] = scene index (or STOP) waiting for its quantize boundary. */
export type QueueMap = Record<number, number>;

/**
 * Is a track audible right now? Muted by its own mute button, by another
 * track's solo, or by a scene-mute on the scene that owns it.
 */
export function isTrackAudible(
  t: number,
  owner: OwnerMap,
  trackMute: Record<number, boolean>,
  sceneMute: Record<number, boolean>,
  solo: Record<number, boolean>,
): boolean {
  const o = owner[t];
  if (o == null) return false;
  if (trackMute[t]) return false;
  const anySolo = Object.values(solo).some(Boolean);
  if (anySolo && !solo[t]) return false;
  return !sceneMute[o];
}

/**
 * Mute/solo gate independent of clip ownership — drives the track GainNode,
 * which must duck even while a track is between clips.
 */
export function isTrackOpen(
  t: number,
  owner: OwnerMap,
  trackMute: Record<number, boolean>,
  sceneMute: Record<number, boolean>,
  solo: Record<number, boolean>,
): boolean {
  if (trackMute[t]) return false;
  const anySolo = Object.values(solo).some(Boolean);
  if (anySolo && !solo[t]) return false;
  const o = owner[t];
  return !(o != null && sceneMute[o]);
}

export interface StepBar {
  h: number; // bar height in px (of a 20px lane)
  on: boolean;
}

import { dr1Idx, type MachineId, noteIdx, WT_POLY_LANES, wtNoteIdx } from './protocol';

/** 16-step cell preview derived from the clip's first bar of real pattern data. */
export function previewSteps(machine: MachineId, bytes: Uint8Array, _bars: number): StepBar[] {
  const out: StepBar[] = [];
  for (let s = 0; s < 16; s++) {
    if (machine === 'DR1') {
      let count = 0;
      let acc = false;
      for (let pad = 0; pad < 16; pad++) {
        const v = bytes[dr1Idx(0, pad, s)];
        if (v) { count++; if (v === 2) acc = true; }
      }
      out.push({ h: count ? Math.min(19, 5 + count * 3 + (acc ? 2 : 0)) : 3, on: count > 0 });
    } else {
      const offsets = machine === 'WT1'
        ? Array.from({ length: WT_POLY_LANES }, (_, lane) => wtNoteIdx(0, s, lane))
        : [noteIdx(0, s)];
      const active = offsets.filter((o) => (bytes[o] & 1) !== 0);
      const on = active.length > 0;
      const semi = active.length ? Math.max(...active.map((o) => Math.min(11, bytes[o + 1] & 0x7f) + 12 * ((bytes[o + 2] | 0) - 1))) : -12;
      out.push({ h: on ? Math.round(5 + ((semi + 12) / 35) * 14) : 3, on });
    }
  }
  return out;
}

export const pad2 = (n: number) => String(n).padStart(2, '0');
