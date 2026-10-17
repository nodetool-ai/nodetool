import { copySequenceRhythm, type SequenceRhythm } from '../../shared/sequenceRhythm';
import { cloneDrumRhythm, type DrumRhythm } from '../../drum/rhythm';
// Hosted device view (focus mode): attaches the focused track's running
// engine to that machine's standalone store, keeps the target clip and the
// track patch in sync with the session doc, and renders the device panels.

import { useEffect, useMemo, useRef, type ComponentProps } from 'react';
import type * as React from 'react';
import { EnvPanel as BassEnvPanel } from '../../bass/components/EnvPanel';
import { BassFxRack } from '../../bass/components/BassFxRack';
import { FilterSection as BassFilterSection } from '../../bass/components/FilterSection';
import { KeysPanel } from '../../bass/components/KeysPanel';
import { AccentPanel, LfoPanel as BassLfoPanel } from '../../bass/components/LfoPanel';
import { OscSection as BassOscSection, SubSection } from '../../bass/components/OscSection';
import { PitchSeq } from '../../bass/components/PitchSeq';
import { makeEmptyPatterns as bassEmpty } from '../../bass/seq';
import { useBassStore } from '../../bass/store';
import { AmpEnvPanel } from '../../drum/components/AmpEnvPanel';
import { FilterSection } from '../../drum/components/FilterSection';
import { FxRack } from '../../drum/components/FxRack';
import { PadEditTabs } from '../../drum/components/PadEditTabs';
import { ModPanel } from '../../drum/components/ModPanel';
import { NoiseSection } from '../../drum/components/NoiseSection';
import { OscSection } from '../../drum/components/OscSection';
import { PadGrid } from '../../drum/components/PadGrid';
import { PadStrip } from '../../drum/components/PadStrip';
import { PitchEnvPanel } from '../../drum/components/PitchEnvPanel';
import { SampleSection } from '../../drum/components/SampleSection';
import { SelBar } from '../../drum/components/SelBar';
import { StepSeq } from '../../drum/components/StepSeq';
import { makeEmptyPatterns as drumEmpty } from '../../drum/seq';
import { useDrumStore } from '../../drum/store';
import { makeEmptyPatterns as wtEmpty } from '../../noteseq';
import { EnvPanel } from '../../components/panels/EnvPanel';
import { FilterPanel } from '../../components/panels/FilterPanel';
import { LabPanel } from '../../components/panels/LabPanel';
import { FxPanel } from '../../components/panels/FxPanel';
import { EqPanel } from '../../components/panels/EqPanel';
import { DynamicsPanel } from '../../components/panels/DynamicsPanel';
import { TapeEchoPanel } from '../../components/panels/TapeEchoPanel';
import { ReverbPanel } from '../../components/panels/ReverbPanel';
import { KeyboardBar } from '../../components/panels/KeyboardBar';
import { LfoPanel } from '../../components/panels/LfoPanel';
import { MatrixPanel } from '../../components/panels/MatrixPanel';
import { OscPanel } from '../../components/panels/OscPanel';
import { SeqPanel, type SeqRectOps } from '../../components/panels/SeqPanel';
import { rectNorm, type RectSel } from '../../shared/seqEdit';
import { clearRectWt, copyRectWt, moveRectWt, pasteRectWt } from '../wtClipRect';
import type { SeqStep } from '../../noteseq';
import { UtilPanel } from '../../components/panels/UtilPanel';
import { useStore as useWtStore } from '../../store';
import { clipToPatterns, patternsToClip } from '../hostBridge';
import { b64ToBytes, HOSTED_MAX_BARS, type MachineId, wtNoteIdx } from '../protocol';
import { clipPattern, useSeqStore } from '../store';
import { HostedClipBar, HostedLengthControl } from './HostedClipBar';
import { AutomationPanel } from './AutomationPanel';
import { HostedArpEditor, useHostedScale } from './HostedArpPanel';

// One uniform handle per machine over the three (differently-typed) stores.
interface HostedStore {
  attach: (engine: unknown) => void;
  getPatterns: () => Uint8Array;
  setPatterns: (p: Uint8Array, bars: number, rhythm?: DrumRhythm, sequenceRhythm?: SequenceRhythm) => void;
  getSequenceRhythm?: () => SequenceRhythm;
  getParams: () => Record<string, number>;
  setPos: (step: number, bar: number, playing: boolean) => void;
  subscribe: (fn: () => void) => () => void;
  empty: () => Uint8Array;
}

const HOSTS: Record<MachineId, HostedStore> = {
  DR1: {
    attach: (e) => useDrumStore.getState().attachHosted(e as never),
    getPatterns: () => useDrumStore.getState().patterns,
    // setPatterns swaps ANOTHER clip's patterns into the device store, so the
    // step selection and the undo history (which snapshot the previous clip)
    // must not survive the swap — a later undo would restore one clip's
    // patterns into a different clip.
    setPatterns: (p, bars, rhythm) => {
      useDrumStore.getState()._clearHistory();
      useDrumStore.setState({ patterns: p, chain: Array.from({ length: bars }, (_, i) => i), drumRhythm: cloneDrumRhythm(rhythm, bars), lanePositions: Array(16).fill(-1), editPattern: 0, rectSel: null });
    },
    getParams: () => useDrumStore.getState().params,
    setPos: (step, bar, playing) => useDrumStore.setState({ curStep: step, curPat: bar, playing }),
    subscribe: (fn) => useDrumStore.subscribe(fn),
    empty: drumEmpty,
  },
  BL1: {
    attach: (e) => useBassStore.getState().attachHosted(e as never),
    getPatterns: () => useBassStore.getState().patterns,
    // chain mirrors the clip's bars as the identity [0..bars-1] so the
    // absolute-timeline rect verbs map bar b onto pattern b (hosted stores
    // are bar-major; _setPatterns skips persistence while hosted).
    setPatterns: (p, bars, _rhythm, sequenceRhythm) => {
      useBassStore.getState()._clearHistory();
      useBassStore.setState({ sequenceRhythm: copySequenceRhythm(sequenceRhythm), patterns: p, editPattern: 0, rectSel: null, chain: Array.from({ length: bars }, (_, i) => i) });
    },
    getParams: () => useBassStore.getState().params,
    setPos: (step, bar, playing) => useBassStore.setState({ curStep: step, curPat: bar, playing }),
    subscribe: (fn) => useBassStore.subscribe(fn),
    getSequenceRhythm: () => useBassStore.getState().sequenceRhythm,
    empty: bassEmpty,
  },
  WT1: {
    attach: (e) => useWtStore.getState().attachHosted(e as never),
    getPatterns: () => useWtStore.getState().patterns,
    setPatterns: (p, bars, _rhythm, sequenceRhythm) => {
      useWtStore.getState()._clearSeqHistory();
      useWtStore.setState({ sequenceRhythm: copySequenceRhythm(sequenceRhythm), patterns: p, editPattern: 0, rectSel: null, chain: Array.from({ length: bars }, (_, i) => i) });
    },
    getParams: () => useWtStore.getState().params,
    setPos: (step, bar, playing) => useWtStore.setState({ curStep: step, curPat: bar, seqPlaying: playing }),
    subscribe: (fn) => useWtStore.subscribe(fn),
    getSequenceRhythm: () => useWtStore.getState().sequenceRhythm,
    empty: wtEmpty,
  },
};

export function DeviceView() {
  const focus = useSeqStore((s) => s.focus);
  const session = useSeqStore((s) => s.session);
  const rig = useSeqStore((s) => s.rig);
  const clipLoadRevision = useSeqStore((s) => s.clipLoadRevision);

  const track = focus ? session.tracks[focus.track] : null;
  const clip = focus ? session.scenes[focus.scene]?.clips[focus.track] : null;
  const machine = track?.machine ?? null;
  const host = machine ? HOSTS[machine] : null;
  const editable = !!clip && clip.bars <= HOSTED_MAX_BARS;

  // Guards the pattern-subscription against echoing our own writes.
  const syncing = useRef(false);
  const patchSyncing = useRef(false);

  // 1. Attach the rig engine whenever the focused track changes.
  useEffect(() => {
    if (!focus || !rig || !host) return;
    const engine = rig.devices[focus.track].engine;
    if (engine) {
      patchSyncing.current = true;
      host.attach(engine);
      queueMicrotask(() => { patchSyncing.current = false; });
    }
  }, [focus?.track, track?.patch, rig, host]);

  // 2. Load the target clip's bytes into the device store on target change.
  useEffect(() => {
    if (!focus || !host || !machine) return;
    syncing.current = true;
    const bytes = clipPattern(session, focus.scene, focus.track);
    const bars = Math.max(1, Math.min(HOSTED_MAX_BARS, clip?.bars ?? 1));
    host.setPatterns(bytes ? clipToPatterns(machine, bytes, host.empty()) : host.empty(), bars, editable ? clip?.drumRhythm : undefined, editable ? clip?.sequenceRhythm : undefined);
    syncing.current = false;
    // Intentionally NOT keyed on the pattern string: our own write-backs must
    // not reload (they'd reset editPattern); createClip flips `!!clip`.
  }, [focus?.scene, focus?.track, !!clip, host, machine, clipLoadRevision]);

  // 3. Write pattern edits back: device store → session doc (+ live hot-swap).
  useEffect(() => {
    if (!focus || !host || !machine || !editable) return;
    let prev = host.getPatterns();
    let prevSequenceRhythm = host.getSequenceRhythm?.();
    let prevRhythm = useDrumStore.getState().drumRhythm;
    let prevChain = useDrumStore.getState().chain;
    return host.subscribe(() => {
      const next = host.getPatterns();
      const drum = useDrumStore.getState();
      const sequenceRhythm = host.getSequenceRhythm?.();
      const changed = sequenceRhythm !== prevSequenceRhythm || next !== prev || (machine === 'DR1' && (drum.drumRhythm !== prevRhythm || drum.chain !== prevChain));
      prevSequenceRhythm = sequenceRhythm;
      prev = next; prevRhythm = drum.drumRhythm; prevChain = drum.chain;
      if (!changed || syncing.current) return;
      const st = useSeqStore.getState();
      const cur = st.session.scenes[focus.scene]?.clips[focus.track];
      if (!cur) return;
      const base = clipPattern(st.session, focus.scene, focus.track) ?? undefined;
      if (machine === 'DR1') {
        st.updateDrumClipSequence(focus.scene, focus.track, patternsToClip(machine, next, drum.chain.length, base), drum.chain.length, drum.drumRhythm ?? null);
      } else st.updateClipBytes(focus.scene, focus.track, patternsToClip(machine, next, cur.bars, base), cur.bars, sequenceRhythm);
    });
  }, [focus?.scene, focus?.track, host, machine, editable]);

  // 4. Snapshot patch edits (debounced) into the track's inline patch doc.
  //    Cleanup flushes a pending timer rather than discarding it, so tweaks
  //    made <400ms before Esc/track-switch aren't lost.
  useEffect(() => {
    if (!focus || !host) return;
    let prev = host.getParams();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const write = () => {
      const cur = useSeqStore.getState().session.tracks[focus.track].patch;
      // Remember the factory origin: from a clean factory patch it's the
      // current index; once inline, carry the existing base forward.
      const base = cur.kind === 'factory' ? cur.index : cur.base;
      useSeqStore.getState().setTrackPatch(focus.track, {
        kind: 'inline',
        data: { params: { ...host.getParams() } },
        base,
      });
    };
    const unsub = host.subscribe(() => {
      const next = host.getParams();
      if (next === prev) return;
      // Always advance the baseline first: a programmatic param replacement
      // (engine attach / factory-patch load) must not later read as a user
      // edit and get snapshotted back over the patch we just loaded.
      prev = next;
      if (patchSyncing.current) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        write();
      }, 400);
    });
    return () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        write();
      }
      unsub();
    };
  }, [focus?.track, host]);

  // 5. Mirror the conductor's per-track playhead into the device step LEDs —
  //    only while the focused clip is the one actually sounding. The playhead
  //    is read through a transient subscription, never a render-time selector:
  //    `pos[track]` is a fresh object on every 16th note, so a selector here
  //    would re-render the whole hosted device UI on every tick.
  useEffect(() => {
    if (!focus || !host) return;
    const { scene, track } = focus;
    const engine = rig?.devices[track].engine;
    if (machine === 'DR1' && engine) (engine as import('../../drum/engine/drum-synth').DrumEngine).onlanepos = lanePositions => {
      const s = useSeqStore.getState();
      if (s.owner[track] === scene && s.playing) useDrumStore.setState({ lanePositions });
    };
    let last = '';
    const apply = () => {
      const s = useSeqStore.getState();
      const pos = s.pos[track];
      const live = s.owner[track] === scene && s.playing;
      const on = live && !!pos;
      const step = on ? pos!.step : -1;
      const bar = on ? pos!.bar : 0;
      const key = `${step}:${bar}:${on}`;
      if (key === last) return;
      last = key;
      host.setPos(step, bar, on);
    };
    apply();
    const unsub = useSeqStore.subscribe(apply);
    return () => { unsub(); if (machine === 'DR1' && engine) (engine as import('../../drum/engine/drum-synth').DrumEngine).onlanepos = null; };
  }, [focus?.scene, focus?.track, host, rig, machine]);

  if (!focus || !track || !machine) return null;

  return (
    <section className="sq-device" style={{ '--tc': track.color } as React.CSSProperties}>
      <HostedClipBar machine={machine} />
      <div className="sq-device-body">
        {machine === 'DR1' && <DrumPanels sequenceEditable={editable} />}
        {machine === 'BL1' && <BassPanels bars={clip?.bars} />}
        {machine === 'WT1' && <WtPanels clip={clip} />}
        {editable && machine !== 'WT1' && <AutomationPanel machine={machine} />}
      </div>
    </section>
  );
}

function DrumPanels({ sequenceEditable }: { sequenceEditable: boolean }) {
  const mode = useSeqStore((s) => s.deviceMode);
  const drumFxOpen = useSeqStore((s) => s.drumFxOpen);
  const groupFx = useSeqStore((s) => s.drumFxOpen && s.drumFxScope === 'group');
  // EDIT and PAD FX show the pads; GROUP FX and SEQ take the full width.
  const pads = mode === 'edit' && !groupFx;
  return (
    <div id="drum-rack" className="sq-hosted-rack" data-mode={mode}>
      <div className={`dr-main${pads ? '' : ' no-pads'}`}>
        {pads && <div className="dr-left">
          <div id="dr-pads"><PadGrid /></div>
          <div id="dr-padstrip"><PadStrip /></div>
        </div>}
        <div className="dr-right">
          <div id="dr-selbar"><SelBar /></div>
          {mode === 'edit' && <PadEditTabs />}
          {mode === 'edit' && !drumFxOpen && <div id="dr-oscrow">
            <OscSection osc="oscA" />
            <SampleSection />
            <NoiseSection />
          </div>}
          {mode === 'edit' && drumFxOpen && <div id="dr-fxrack"><FxRack /></div>}
          {mode === 'edit' && !drumFxOpen && (
            <div id="dr-editrow">
              <PitchEnvPanel />
              <AmpEnvPanel />
              <FilterSection />
              <ModPanel />
            </div>
          )}
        </div>
      </div>
      {mode === 'seq' && sequenceEditable && <div id="dr-stepseq"><StepSeq headerExtra={<HostedLengthControl machine="DR1" />} /></div>}
    </div>
  );
}

function BassPanels({ bars }: { bars?: number }) {
  const clipKey = useSeqStore((s) => s.focus ? `${s.focus.scene}:${s.focus.track}` : undefined);
  const mode = useSeqStore((s) => s.deviceMode);
  const trackFxOpen = useSeqStore((s) => s.trackFxOpen);
  return (
    <div id="bass-rack" className="sq-hosted-rack" data-mode={mode}>
      {mode === 'edit' && <div id="bl-editrow">
        <BassOscSection />
        <SubSection />
        <BassFilterSection />
        <BassEnvPanel />
      </div>}
      {mode === 'edit' && (
        <div id="bl-modrow">
          <BassLfoPanel />
          <AccentPanel />
        </div>
      )}
      {mode === 'seq' && <div id="bl-seq"><HostedArpEditor machine="BL1"><ScaledPitchSeq clipKey={clipKey} bars={bars} headerExtra={<HostedLengthControl machine="BL1" />} /></HostedArpEditor></div>}
      {mode === 'edit' && trackFxOpen && <div id="bl-fxrack"><BassFxRack /></div>}
      {/* Keyboard last, where a synth's keys belong. */}
      {mode === 'seq' && <div id="bl-keysrow"><KeysPanel /></div>}
    </div>
  );
}

function WtPanels({ clip }: { clip: { bars: number; pattern: string } | null }) {
  const clipKey = useSeqStore((s) => s.focus ? `${s.focus.scene}:${s.focus.track}` : undefined);
  const focus = useSeqStore((s) => s.focus);
  const mode = useSeqStore((s) => s.deviceMode);
  const trackFxOpen = useSeqStore((s) => s.trackFxOpen);
  const polySteps = useMemo<SeqStep[][] | undefined>(() => {
    if (!clip) return undefined;
    const bytes = b64ToBytes(clip.pattern);
    return Array.from({ length: clip.bars * 16 }, (_, absoluteStep) => Array.from({ length: 8 }, (_, lane) => {
      const bar = Math.floor(absoluteStep / 16), step = absoluteStep % 16;
      const o = wtNoteIdx(bar, step, lane), flags = bytes[o] ?? 0;
      return { on: !!(flags & 1), acc: !!(flags & 2), duration: Math.max(1, Math.min(63, (flags >> 2) & 0x3f)), note: Math.min(11, bytes[o + 1] ?? 0), oct: Math.max(-1, Math.min(1, (bytes[o + 2] ?? 1) - 1)) };
    }));
  }, [clip?.pattern, clip?.bars]);
  const toggleChordNote = (absoluteStep: number, note: number, duration = 1) => {
    if (!focus || !clip) return;
    const bytes = b64ToBytes(clip.pattern);
    const bar = Math.floor(absoluteStep / 16), step = absoluteStep % 16;
    const lanes = Array.from({ length: 8 }, (_, lane) => lane);
    const active = lanes.find((lane) => {
      const o = wtNoteIdx(bar, step, lane);
      return !!(bytes[o] & 1) && bytes[o + 1] === note;
    });
    if (active !== undefined) {
      const o = wtNoteIdx(bar, step, active);
      bytes[o] = 0; bytes[o + 1] = 0; bytes[o + 2] = 1;
    } else {
      const lane = lanes.find((candidate) => !(bytes[wtNoteIdx(bar, step, candidate)] & 1));
      if (lane === undefined) return;
      const o = wtNoteIdx(bar, step, lane);
      bytes[o] = 1 | (Math.min(63, clip.bars * 16 - absoluteStep, Math.max(1, duration)) << 2); bytes[o + 1] = note; bytes[o + 2] = 1;
    }
    useSeqStore.getState().updateClipBytes(focus.scene, focus.track, bytes, clip.bars);
  };
  // Poly-aware rect verbs over the clip bytes (all 8 voice lanes), so the
  // hosted grid gets the same selection UX as standalone and chords survive
  // cut/copy/move. Selection state lives in the hosted WT store (rectSel);
  // every write goes through updateClipBytes like the chord callbacks.
  const rectOps = useMemo<SeqRectOps | undefined>(() => {
    if (!focus || !clip || clip.bars > HOSTED_MAX_BARS) return undefined;
    const { scene, track } = focus;
    const bars = clip.bars;
    const write = (bytes: Uint8Array) => useSeqStore.getState().updateClipBytes(scene, track, bytes, bars);
    const readRect = () => useWtStore.getState().rectSel;
    const setSel = (sel: RectSel | null) => useWtStore.getState().setRectSel(sel);
    return {
      copyData: (rect) => copyRectWt(b64ToBytes(clip.pattern), rect),
      drop: (data, atStep, dNote, clearSrc) => {
        if (!data.cells.length) return;
        let bytes = b64ToBytes(clip.pattern);
        if (clearSrc) bytes = clearRectWt(bytes, clearSrc);
        write(pasteRectWt(bytes, bars, atStep, dNote, data));
        setSel({ stepFrom: atStep, stepTo: atStep + data.wSteps - 1, noteFrom: data.noteLo + dNote, noteTo: data.noteHi + dNote });
      },
      move: (dStep, dNote, copy) => {
        const rect = readRect();
        if (!rect) return;
        const { stepLo, stepHi, noteLo, noteHi } = rectNorm(rect);
        const ds = Math.min(bars * 16 - 1 - stepHi, Math.max(-stepLo, dStep | 0));
        const dn = Math.min(11 - noteHi, Math.max(-noteLo, dNote | 0));
        if (ds === 0 && dn === 0) return;
        write(moveRectWt(b64ToBytes(clip.pattern), bars, rect, ds, dn, { copy }));
        setSel({ stepFrom: stepLo + ds, stepTo: stepHi + ds, noteFrom: noteLo + dn, noteTo: noteHi + dn });
      },
      dup: () => {
        const rect = readRect();
        if (!rect) return;
        const { stepLo, stepHi, noteLo, noteHi } = rectNorm(rect);
        const at = stepHi + 1;
        if (at >= bars * 16) return; // nothing past the clip end — no-op
        const bytes = b64ToBytes(clip.pattern);
        write(pasteRectWt(bytes, bars, at, 0, copyRectWt(bytes, rect)));
        setSel({ stepFrom: at, stepTo: at + (stepHi - stepLo), noteFrom: noteLo, noteTo: noteHi });
      },
      del: () => {
        const rect = readRect();
        if (!rect) return;
        write(clearRectWt(b64ToBytes(clip.pattern), rect));
      },
    };
  }, [focus?.scene, focus?.track, clip?.pattern, clip?.bars]);

  // Grid note drag, poly-aware: move (Alt = copy) one chord voice to another
  // step/lane of the same bar, carrying its flags/duration/octave. Steps here
  // are bar-local (the drag gesture is same-bar only); `pattern` is the bar.
  const moveChordNote = (from: number, to: number, note: number, srcNote: number, copy: boolean, pattern: number) => {
    if (!focus || !clip) return;
    if (from === to && note === srcNote) return;
    const bytes = b64ToBytes(clip.pattern);
    const lanes = Array.from({ length: 8 }, (_, lane) => lane);
    const src = lanes.find((lane) => {
      const o = wtNoteIdx(pattern, from, lane);
      return !!(bytes[o] & 1) && (bytes[o + 1] & 0x7f) === srcNote;
    });
    if (src === undefined) return;
    const so = wtNoteIdx(pattern, from, src);
    const voice = bytes.slice(so, so + 3);
    // Target already sounds this note: a move just clears the source (merge);
    // a copy is a no-op. Otherwise the voice needs a free slot to land in.
    const dup = lanes.some((lane) => {
      const o = wtNoteIdx(pattern, to, lane);
      return !!(bytes[o] & 1) && (bytes[o + 1] & 0x7f) === note && !(to === from && lane === src);
    });
    let free: number | undefined;
    if (!dup) {
      const isSrc = (lane: number) => to === from && lane === src;
      free = lanes.find((lane) => isSrc(lane) || !(bytes[wtNoteIdx(pattern, to, lane)] & 1));
      if (free === undefined) return; // chord full at the target — drop the gesture
    }
    if (!copy) { bytes[so] = 0; bytes[so + 1] = 0; bytes[so + 2] = 1; }
    if (!dup && free !== undefined) {
      const o = wtNoteIdx(pattern, to, free);
      bytes.set(voice, o);
      bytes[o + 1] = note;
    }
    useSeqStore.getState().updateClipBytes(focus.scene, focus.track, bytes, clip.bars);
  };

  const setChordDuration = (absoluteStep: number, note: number, duration: number) => {
    if (!focus || !clip) return;
    const bytes = b64ToBytes(clip.pattern);
    const bar = Math.floor(absoluteStep / 16), step = absoluteStep % 16;
    const lane = Array.from({ length: 8 }, (_, candidate) => candidate).find((candidate) => {
      const o = wtNoteIdx(bar, step, candidate);
      return !!(bytes[o] & 1) && bytes[o + 1] === note;
    });
    if (lane === undefined) return;
    const o = wtNoteIdx(bar, step, lane);
    bytes[o] = (bytes[o] & 3) | (Math.min(63, clip.bars * 16 - absoluteStep, Math.max(1, duration)) << 2);
    useSeqStore.getState().updateClipBytes(focus.scene, focus.track, bytes, clip.bars);
  };
  return (
    <div id="rack" className="sq-hosted-rack" data-mode={mode}>
      <div className="panels">
        {mode === 'edit' && (
          <>
            <OscPanel prefix="oscA" accentKey="a" title="OSC A" gridArea="oscA" />
            <OscPanel prefix="oscB" accentKey="b" title="OSC B" gridArea="oscB" />
            <UtilPanel />
            <FilterPanel />
            <EnvPanel id="env1" title="AMP ENV" gridArea="env1" viewAccent="#e8edf7" knobAccent="n" />
            <EnvPanel id="env2" title="MOD ENV" gridArea="env2" viewAccent="#b18cff" knobAccent="f" modSource={3} />
            <LfoPanel />
            <MatrixPanel />
            {trackFxOpen && <>
              <EqPanel />
              <DynamicsPanel kind="ott" />
              <DynamicsPanel kind="comp" />
              <TapeEchoPanel />
              <ReverbPanel />
              <FxPanel />
              <LabPanel />
            </>}
          </>
        )}
        {mode === 'seq' && (
          <HostedArpEditor machine="WT1"><ScaledSeqPanel clipKey={clipKey} bars={clip?.bars} polySteps={polySteps} onToggleChordNote={toggleChordNote} onSetChordDuration={setChordDuration} rectOps={rectOps} onMoveChordNote={moveChordNote} headerExtra={<HostedLengthControl machine="WT1" />} /></HostedArpEditor>
        )}
      </div>
      {clip && clip.bars <= HOSTED_MAX_BARS && <AutomationPanel machine="WT1" />}
      {mode === 'seq' && <KeyboardBar />}
    </div>
  );
}

/** The hosted note sequencers with the focused clip's scale mode. */
function ScaledPitchSeq(props: ComponentProps<typeof PitchSeq>) {
  return <PitchSeq {...props} {...useHostedScale('BL1')} />;
}
function ScaledSeqPanel(props: ComponentProps<typeof SeqPanel>) {
  return <SeqPanel {...props} {...useHostedScale('WT1')} />;
}
