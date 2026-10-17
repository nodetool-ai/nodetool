// Preset browsing inside SQ-4 focus mode. A track's sound is its session patch
// (a factory index, or inline params with a `base` index), so the browser loads,
// snapshots, and varies that patch instead of the device store. DeviceView
// re-attaches the device store whenever the track patch changes.

import { patchBaseIndex } from './devices';
import type { PatchDoc } from './protocol';
import { useSeqStore } from './store';

export interface SessionSnapshot {
  value: string; // 'f<base>' or '' when the patch has no factory base
  dirty: boolean; // inline params = edited
  patch: PatchDoc;
}

export interface SessionPatchOps {
  value: string;
  load: (value: string) => void;
  capture: () => SessionSnapshot;
  restore: (snap: SessionSnapshot) => void;
  /** Writes `params` as an inline patch on the current factory base. */
  applyParams: (params: Record<string, number>) => void;
  /** Auditions only while the SQ-4 transport is stopped. */
  canAudition: () => boolean;
}

const valueOf = (patch: PatchDoc) => {
  const base = patchBaseIndex(patch);
  return base >= 0 ? 'f' + base : '';
};

function writePatch(track: number, patch: PatchDoc) {
  const st = useSeqStore.getState();
  st.rig?.devices[track].applyPatch(patch);
  st.setTrackPatch(track, patch);
}

export function sessionPatchOps(track: number, patch: PatchDoc): SessionPatchOps {
  return {
    value: valueOf(patch),
    load: (value) => {
      if (value[0] === 'f') useSeqStore.getState().loadTrackFactoryPatch(track, Number(value.slice(1)));
    },
    capture: () => {
      const now = useSeqStore.getState().session.tracks[track].patch;
      return { value: valueOf(now), dirty: now.kind === 'inline', patch: structuredClone(now) };
    },
    restore: (snap) => writePatch(track, structuredClone(snap.patch)),
    applyParams: (params) => {
      const base = patchBaseIndex(useSeqStore.getState().session.tracks[track].patch);
      writePatch(track, { kind: 'inline', data: { params: { ...params } }, ...(base >= 0 ? { base } : {}) });
    },
    canAudition: () => !useSeqStore.getState().playing,
  };
}

/** Ops for the focused track, or null outside focus mode. */
export function useSessionPatchOps(): SessionPatchOps | null {
  const track = useSeqStore((s) => s.focus?.track ?? null);
  const patch = useSeqStore((s) => (s.focus ? s.session.tracks[s.focus.track]?.patch : null));
  return track === null || !patch ? null : sessionPatchOps(track, patch);
}
