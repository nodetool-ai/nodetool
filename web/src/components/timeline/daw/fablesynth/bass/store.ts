// Source: fablesynth src/bass/store.ts, rebuilt for the timeline. One store per
// BL-1 editor, bound to one midi track. The track's instrument is the truth:
// `params` is its full BL-1 record, every edit writes the instrument back
// through the timeline store (undoable), and the live device follows the
// track through the AudioGraph. The upstream pattern sequencer and arp are
// gone: the timeline's clips play the device.

import { createStore, type StoreApi } from 'zustand/vanilla';
import type { BassMidiInstrument, TimelineTrack } from '@nodetool-ai/timeline';
import type { TimelineStoreApi } from '../../../../../stores/timeline/TimelineStore';
import type { TimelinePlaybackStoreApi } from '../../../../../stores/timeline/TimelinePlaybackStore';
import type { ParamValues } from '../params';
import { Bl1Device, type Bl1Viz } from '../../devices/bl1Device';
import { bl1InstrumentFromParams, bl1ParamRecord, clampBl1Param } from '../../devices/bl1Params';
import { FACTORY_PATCHES, loadUserPatches, patchOptions, patchToState, saveUserPatch, stateToPatch, type BassPatch } from './patches';

/** Everything a patch load replaces, for the patch browser's KEEP / REVERT / A-B. */
export interface BassSoundSnapshot {
  patchValue: string;
  dirty: boolean;
  params: ParamValues;
}

/** How long the editor's context stays awake after the last key is released. */
const KEYS_IDLE_MS = 2500;

export interface BassStore {
  trackId: string;
  params: ParamValues;
  /** The track is locked or gone: knobs show the sound but do not write. */
  readOnly: boolean;
  bpm: number;
  playing: boolean;
  /** The live device has started and plays the keys. */
  powered: boolean;
  device: Bl1Device | null;
  patchValue: string;
  userPatches: BassPatch[];
  dirty: boolean;
  heldPitches: number[];
  vizPos: number;
  vizEnv: number;
  vizFenv: number;
  vizCut: number;
  vizGate: boolean;
  /** The sounding pitch the device reports, -1 when idle. */
  vizPitch: number;

  setParam: (id: string, value: number) => void;
  /** Replace the whole record (patch load, variation, revert). */
  setParams: (params: ParamValues) => void;
  noteOn: (pitch: number, velocity: number) => void;
  noteOff: (pitch: number) => void;
  allNotesOff: () => void;
  connectDevice: () => Promise<Bl1Device | null>;
  /** Follow the track, the tempo and the editor's audio graph. Returns the stop function. */
  start: () => () => void;
  savePatch: (name: string) => void;
  loadPatchByValue: (value: string) => void;
  captureSound: () => BassSoundSnapshot;
  restoreSound: (snap: BassSoundSnapshot) => void;
  applyVariant: (params: ParamValues) => void;
  stepPatch: (delta: number) => void;
}

export interface BassStoreBinding {
  trackId: string;
  doc: TimelineStoreApi;
  playback: TimelinePlaybackStoreApi;
}

export type BassStoreApi = StoreApi<BassStore>;

function bassTrack(doc: TimelineStoreApi, trackId: string): (TimelineTrack & { instrument: BassMidiInstrument }) | null {
  const track = doc.getState().tracks.find((t) => t.id === trackId);
  return track?.instrument?.type === 'bass' ? (track as TimelineTrack & { instrument: BassMidiInstrument }) : null;
}

function patchValueFor(params: ParamValues, userPatches: BassPatch[]): string | null {
  const matches = (patch: BassPatch) => {
    const record = patchToState(patch).params;
    return Object.keys(record).every((id) => id === 'seq.bpm' || id === 'master.swing' || Math.abs(record[id] - (params[id] ?? NaN)) < 1e-6);
  };
  const f = FACTORY_PATCHES.findIndex(matches);
  if (f >= 0) return `f${f}`;
  const u = userPatches.findIndex(matches);
  return u >= 0 ? `u${u}` : null;
}

export function createBassStore(binding: BassStoreBinding): BassStoreApi {
  const { trackId, doc, playback } = binding;
  let unsubscribeViz: (() => void) | null = null;
  let active = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const readTrack = () => {
    const track = bassTrack(doc, trackId);
    return {
      params: track ? bl1ParamRecord(track.instrument) : bl1ParamRecord(defaultInstrument()),
      readOnly: !track || track.locked === true,
    };
  };

  const initial = readTrack();
  const userPatches = loadUserPatches();

  const store = createStore<BassStore>((set, get) => {
    const write = (params: ParamValues) => {
      const track = bassTrack(doc, trackId);
      if (!track || track.locked) return;
      doc.getState().setTrackInstrument(trackId, bl1InstrumentFromParams(track.instrument, params));
    };

    const onViz = (viz: Bl1Viz) => set({
      vizPos: viz.pos, vizEnv: viz.env, vizFenv: viz.fenv, vizCut: viz.cut, vizGate: viz.gate, vizPitch: viz.pitch,
    });

    const attach = (device: Bl1Device | null) => {
      if (device === get().device) return;
      unsubscribeViz?.();
      unsubscribeViz = device ? device.subscribeViz(onViz) : null;
      device?.setTempo(get().bpm);
      set({ device, powered: device !== null });
    };

    return {
      trackId,
      params: initial.params,
      readOnly: initial.readOnly,
      bpm: doc.getState().tempo?.bpm ?? 120,
      playing: playback.getState().isPlaying,
      powered: false,
      device: null,
      patchValue: patchValueFor(initial.params, userPatches) ?? '',
      userPatches,
      dirty: false,
      heldPitches: [],
      vizPos: -1,
      vizEnv: 0,
      vizFenv: 0,
      vizCut: -1,
      vizGate: false,
      vizPitch: -1,

      setParam: (id, value) => {
        if (get().readOnly) return;
        const v = clampBl1Param(id, value);
        if (get().params[id] === v) return;
        const params = { ...get().params, [id]: v };
        set({ params, dirty: true });
        write(params);
      },

      setParams: (params) => {
        if (get().readOnly) return;
        set({ params: { ...params } });
        write(params);
      },

      connectDevice: async () => {
        const graph = playback.getState().audioGraph;
        const track = bassTrack(doc, trackId);
        if (!graph || !track) {
          attach(null);
          return null;
        }
        const device = await graph.ensureTrackDevice(track);
        const bl1 = device instanceof Bl1Device ? device : null;
        if (!active) return bl1;
        attach(bl1);
        return bl1;
      },

      noteOn: (pitch, velocity) => {
        if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
        set({ heldPitches: [...get().heldPitches.filter((p) => p !== pitch), pitch] });
        playback.getState().audioGraph?.resume();
        const play = (device: Bl1Device | null) => {
          // The key may already be up by the time a first device starts.
          if (device && get().heldPitches.includes(pitch)) device.noteOn(pitch, velocity);
        };
        const live = get().device;
        const current = playback.getState().audioGraph?.getTrackDevice(trackId);
        if (live && current === live) play(live);
        else void get().connectDevice().then(play);
      },

      noteOff: (pitch) => {
        const heldPitches = get().heldPitches.filter((p) => p !== pitch);
        set({ heldPitches });
        get().device?.noteOff(pitch);
        if (heldPitches.length === 0 && !playback.getState().isPlaying) {
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            idleTimer = null;
            if (!playback.getState().isPlaying && get().heldPitches.length === 0) {
              playback.getState().audioGraph?.suspend();
            }
          }, KEYS_IDLE_MS);
        }
      },

      allNotesOff: () => {
        const { device, heldPitches } = get();
        heldPitches.forEach((p) => device?.noteOff(p));
        set({ heldPitches: [] });
      },

      savePatch: (name) => {
        const patch = stateToPatch(name, get().params);
        const saved = saveUserPatch(name, patch);
        const index = saved.findIndex((entry) => entry.name === name);
        set({ userPatches: saved, patchValue: index >= 0 ? `u${index}` : get().patchValue, dirty: false });
      },

      loadPatchByValue: (value) => {
        const patch = value[0] === 'f'
          ? FACTORY_PATCHES[Number(value.slice(1))]
          : get().userPatches[Number(value.slice(1))];
        if (!patch) return;
        get().setParams(patchToState(patch).params);
        set({ patchValue: value, dirty: false });
      },

      captureSound: () => {
        const { patchValue, dirty, params } = get();
        return { patchValue, dirty, params: { ...params } };
      },

      restoreSound: (snap) => {
        get().setParams(snap.params);
        set({ patchValue: snap.patchValue, dirty: snap.dirty });
      },

      applyVariant: (params) => {
        get().setParams(params);
        set({ dirty: true });
      },

      stepPatch: (delta) => {
        const options = patchOptions(get().userPatches);
        if (!options.length) return;
        let index = options.findIndex((option) => option.value === get().patchValue);
        if (index < 0) index = delta > 0 ? 0 : options.length - 1;
        else index = (index + delta + options.length) % options.length;
        get().loadPatchByValue(options[index].value);
      },

      start: () => {
        // The track's instrument is the truth: undo, redo and edits elsewhere land here.
        let lastTrack: unknown = doc.getState().tracks.find((t) => t.id === trackId);
        let lastTempo = doc.getState().tempo;
        active = true;
        set({ ...readTrack(), bpm: lastTempo?.bpm ?? 120, playing: playback.getState().isPlaying });
        const unsubscribeDoc = doc.subscribe((state) => {
          const track = state.tracks.find((t) => t.id === trackId);
          if (track !== lastTrack) {
            lastTrack = track;
            set(readTrack());
            if (track?.instrument?.type !== 'bass') attach(null);
          }
          if (state.tempo !== lastTempo) {
            lastTempo = state.tempo;
            const bpm = state.tempo?.bpm ?? 120;
            set({ bpm });
            get().device?.setTempo(bpm);
          }
        });
        let lastGraph = playback.getState().audioGraph;
        const unsubscribePlayback = playback.subscribe((state) => {
          if (state.isPlaying !== get().playing) set({ playing: state.isPlaying });
          if (state.audioGraph !== lastGraph) {
            lastGraph = state.audioGraph;
            void get().connectDevice();
          }
        });
        void get().connectDevice();
        return () => {
          active = false;
          get().allNotesOff();
          unsubscribeDoc();
          unsubscribePlayback();
          attach(null);
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = null;
        };
      },
    };
  });

  return store;
}

function defaultInstrument(): BassMidiInstrument {
  return {
    type: 'bass', table: 'prime', position: 0.3, semitones: 0, subShape: 'sine', subOctave: -1, subLevel: 0.55,
    filterType: 'lp24', cutoffHz: 340, resonance: 0.62, drive: 0.45, filterEnvAmount: 2.8, keyTrack: 0.3,
    filterAttackMs: 1, filterDecayMs: 180, ampEnv: { attackMs: 1, decayMs: 300, sustain: 0.5, releaseMs: 80 },
    accentAmount: 0.7, accentVelocity: 100, slideMs: 60, gainDb: -6,
  };
}
