// Focus-mode clip toolbar: name, bar selector (device editPattern = bar),
// bars stepper, edit-lock banner, and CREATE CLIP for empty targets.

import { useBassStore } from '../../bass/store';
import { useDrumStore } from '../../drum/store';
import { useStore as useWtStore } from '../../store';
import { useState } from 'react';
import { SequenceLengthControl } from '../../components/SequenceLengthControl';
import { patternsToClip } from '../hostBridge';
import { HOSTED_MAX_BARS, type MachineId } from '../protocol';
import { clipPattern, useSeqStore } from '../store';
import { factoryPatchNames, patchBaseIndex, stepFactoryPatchIndex } from '../devices';
import { ClipLibraryBrowser } from './ClipLibraryBrowser';
import { PresetBrowser } from '../../components/presetBrowser/PresetBrowser';
import { BassPatchBrowser } from '../../bass/components/BassPatchBrowser';
import { KitBrowser } from '../../drum/components/browser/KitBrowser';
import { useSessionPatchOps } from '../sessionPatchOps';
import { HostedDeviceTabs } from './HostedArpPanel';

const BAR_STORE = {
  DR1: {
    use: () => useDrumStore((s) => s.editPattern),
    set: (i: number) => useDrumStore.getState().setEditPattern(i),
    patterns: () => useDrumStore.getState().patterns,
  },
  BL1: {
    use: () => useBassStore((s) => s.editPattern),
    set: (i: number) => useBassStore.getState().setEditPattern(i),
    patterns: () => useBassStore.getState().patterns,
  },
  WT1: {
    use: () => useWtStore((s) => s.editPattern),
    set: (i: number) => useWtStore.getState().setEditPattern(i),
    patterns: () => useWtStore.getState().patterns,
  },
} as const;

export function HostedClipBar({ machine }: { machine: MachineId }) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const focus = useSeqStore((s) => s.focus)!;
  const clip = useSeqStore((s) => s.session.scenes[focus.scene]?.clips[focus.track]);
  const { createClip } = useSeqStore.getState();
  const drumFxOpen = useSeqStore((s) => s.drumFxOpen);
  const drumFxScope = useSeqStore((s) => s.drumFxScope);
  const trackFxOpen = useSeqStore((s) => s.trackFxOpen);
  const masterFxOpen = useSeqStore((s) => s.masterFxOpen);
  // DR-1 shares one open-drawer slot with its pad-patch browser.
  const [localBrowsing, setLocalBrowsing] = useState(false);
  const drumBrowsing = useDrumStore((s) => s.browser === 'kit');
  const browsing = machine === 'DR1' ? drumBrowsing : localBrowsing;
  const setBrowsing = (open: boolean) => machine === 'DR1'
    ? useDrumStore.getState().setBrowser(open ? 'kit' : null) : setLocalBrowsing(open);
  const patchSelect = <HostedPatchSelect machine={machine} browsing={browsing} onBrowse={() => setBrowsing(!browsing)} />;
  const browser = browsing && <TrackPresetBrowser machine={machine} onClose={() => setBrowsing(false)} />;
  const modeToggle = <HostedDeviceTabs machine={machine} />;
  const fxToggle = machine === 'DR1' ? <div className="sq-drum-fx-scope" role="group" aria-label="DR-1 FX scope"><button className={`sq-drum-fx-toggle${drumFxOpen && drumFxScope === 'pad' ? ' on' : ''}`} aria-pressed={drumFxOpen && drumFxScope === 'pad'} onClick={() => {
    const st = useSeqStore.getState();
    st.setDeviceMode('edit'); st.openDrumFx('pad');
  }}>PAD FX</button><button className={`sq-drum-fx-toggle${drumFxOpen && drumFxScope === 'group' ? ' on' : ''}`} aria-pressed={drumFxOpen && drumFxScope === 'group'} onClick={() => {
    const st = useSeqStore.getState();
    st.setDeviceMode('edit'); st.openDrumFx('group');
  }}>GROUP FX</button></div> : null;
  const instrumentFxToggle = machine !== 'DR1' ? <button className={`sq-drum-fx-toggle${trackFxOpen ? ' on' : ''}`} aria-pressed={trackFxOpen} onClick={() => {
    const st = useSeqStore.getState();
    if (!st.trackFxOpen) st.setDeviceMode('edit');
    st.toggleTrackFx();
  }}>TRACK FX</button> : null;
  // DR-1 has no MASTER FX tab: its FX tabs are PAD FX and GROUP FX.
  const masterFxToggle = machine === 'DR1' ? null : <button className={`sq-master-fx-toggle${masterFxOpen ? ' on' : ''}`} aria-pressed={masterFxOpen} onClick={() => {
    const st = useSeqStore.getState();
    if (!st.masterFxOpen) st.exitFocus();
    st.toggleMasterFx();
  }}>MASTER FX</button>;

  if (!clip) {
    return (
      <>
        <div className="sq-clipbar">
          {patchSelect}
          {browser}
          {modeToggle}
          {fxToggle}
          {instrumentFxToggle}
          {masterFxToggle}
          <button className="sq-clipbar-create" onClick={() => createClip(focus.scene, focus.track)}>＋ CREATE CLIP</button>
          <button className="sq-clipbar-library" onClick={() => setLibraryOpen(true)}>▦ CLIP LIBRARY</button>
          <span className="sq-clipbar-hint">EMPTY SLOT — LOAD A CLIP OR CREATE ONE</span>
        </div>
        {libraryOpen && <ClipLibraryBrowser machine={machine} onClose={() => setLibraryOpen(false)} />}
      </>
    );
  }

  if (clip.bars > HOSTED_MAX_BARS) {
    return (
      <>
        <div className="sq-clipbar">
          {patchSelect}
          {browser}
          {modeToggle}
          {fxToggle}
          {instrumentFxToggle}
          {masterFxToggle}
          <span className="sq-clipbar-name">{clip.name}</span>
          <button className="sq-clipbar-library" onClick={() => setLibraryOpen(true)}>▦ CLIP LIBRARY</button>
          <span className="sq-clipbar-lock">CLIP IS {clip.bars} BARS — EDITING CAPS AT {HOSTED_MAX_BARS} (PLAYBACK UNAFFECTED)</span>
        </div>
        {libraryOpen && <ClipLibraryBrowser machine={machine} onClose={() => setLibraryOpen(false)} />}
      </>
    );
  }

  return (
    <>
      <div className="sq-clipbar">
        {patchSelect}
        {browser}
        {modeToggle}
        {fxToggle}
        {instrumentFxToggle}
        {masterFxToggle}
        <span className="sq-clipbar-name">{clip.name}</span>
        <button className="sq-clipbar-library" onClick={() => setLibraryOpen(true)}>▦ CLIP LIBRARY</button>
      </div>
      {libraryOpen && <ClipLibraryBrowser machine={machine} onClose={() => setLibraryOpen(false)} />}
    </>
  );
}

// Bar selector + clip length. Lives in the hosted device's own sequencer
// panel head (passed down as `headerExtra`), where the standalone devices put
// the same control — not in the clip toolbar above it.
export function HostedLengthControl({ machine }: { machine: MachineId }) {
  const focus = useSeqStore((s) => s.focus)!;
  const clip = useSeqStore((s) => s.session.scenes[focus.scene]?.clips[focus.track]);
  const currentBar = useSeqStore((s) => (
    s.playing && s.owner[focus.track] === focus.scene ? s.pos[focus.track]?.bar ?? null : null
  ));
  const bars = BAR_STORE[machine];
  const editBar = bars.use();
  if (!clip || clip.bars > HOSTED_MAX_BARS) return null;

  const setBars = (n: number) => {
    const next = Math.max(1, Math.min(HOSTED_MAX_BARS, n));
    if (next === clip.bars) return;
    if (machine === 'DR1') {
      useDrumStore.getState().setSequenceLength(next);
      if (!useDrumStore.getState().sequenceError && editBar >= next) bars.set(next - 1);
      return;
    }
    const base = clipPattern(useSeqStore.getState().session, focus.scene, focus.track) ?? undefined;
    useSeqStore.getState().updateClipBytes(
      focus.scene, focus.track, patternsToClip(machine, bars.patterns(), next, base), next,
    );
    if (editBar >= next) bars.set(next - 1);
  };

  return (
    <SequenceLengthControl
      editBar={editBar}
      length={clip.bars}
      availableBars={machine === 'DR1' ? clip.bars : undefined}
      playingBar={currentBar}
      onEditBar={bars.set}
      onLengthChange={setBars}
    />
  );
}

// The focused track's preset browser; it edits the track's session patch.
function TrackPresetBrowser({ machine, onClose }: { machine: MachineId; onClose: () => void }) {
  const session = useSessionPatchOps();
  if (!session) return null;
  if (machine === 'DR1') return <KitBrowser session={session} onClose={onClose} />;
  if (machine === 'BL1') return <BassPatchBrowser session={session} onClose={onClose} />;
  return <PresetBrowser session={session} onClose={onClose} />;
}

function HostedPatchSelect({ machine, browsing, onBrowse }: { machine: MachineId; browsing: boolean; onBrowse: () => void }) {
  const focus = useSeqStore((s) => s.focus)!;
  const patch = useSeqStore((s) => s.session.tracks[focus.track].patch);
  const names = factoryPatchNames(machine);
  // The selector tracks the factory origin even after edits; a `*` marks the
  // patch as dirty rather than dropping the whole selection to CUSTOM.
  const current = patchBaseIndex(patch);
  const dirty = patch.kind === 'inline' && current >= 0;
  const load = (index: number) => useSeqStore.getState().loadTrackFactoryPatch(focus.track, index);
  const step = (delta: number) => load(stepFactoryPatchIndex(machine, current, delta));

  return (
    <div className="sq-device-patch" aria-label={`${machine} patch selection`}>
      <span>PATCH</span>
      <button type="button" onClick={() => step(-1)} aria-label="Previous factory patch">◂</button>
      <select value={current} onChange={(event) => load(Number(event.target.value))} aria-label="Factory patch">
        {current < 0 && <option value={-1}>CUSTOM</option>}
        {names.map((name, index) => <option key={`${index}:${name}`} value={index}>{name}</option>)}
      </select>
      {dirty && <span className="sq-device-patch-dirty" title="Patch has unsaved edits" aria-label="edited">*</span>}
      <button type="button" onClick={() => step(1)} aria-label="Next factory patch">▸</button>
      <button type="button" className="sq-device-browse" aria-expanded={browsing} onClick={onBrowse}>BROWSE</button>
    </div>
  );
}

