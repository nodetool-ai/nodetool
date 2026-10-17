import type { ReactNode } from 'react';
import { modeStyle, type ArpState, type SeqMode } from '../../arp';
import { DeviceTabs, type DeviceTab } from '../../components/DeviceTabs';
import { ArpPanel } from '../../components/panels/ArpPanel';
import type { ScaleBinding } from '../../components/ScaleStrip';
import { clipChordBars, clipSeqMode, linkedClipTracks, newClipArp } from '../clipArp';
import type { MachineId } from '../protocol';
import { useSeqStore } from '../store';

type Page = 'edit' | SeqMode;

/** Focus-mode page tabs: EDIT plus one tab per sequencer mode. The
 *  SEQUENCER, ARP, and CHORDS LEDs pick the one mode the focused clip plays. */
export function HostedDeviceTabs({ machine }: { machine: MachineId }) {
  const focus = useSeqStore(s => s.focus);
  const clip = useSeqStore(s => focus ? s.session.scenes[focus.scene]?.clips[focus.track] : null);
  const deviceMode = useSeqStore(s => s.deviceMode);
  const seqPage = useSeqStore(s => s.seqPage);
  const { setDeviceMode, setSeqPage, updateClipArp } = useSeqStore.getState();
  const page: Page = deviceMode === 'edit' ? 'edit' : machine === 'DR1' ? 'seq' : seqPage;
  const mode = clipSeqMode(clip);
  const enable = (next: SeqMode) => {
    if (!focus || !clip) return;
    const settings = (clip.arp ?? newClipArp(machine)).settings;
    updateClipArp(focus.scene, focus.track, next === 'seq' ? { enabled: false }
      : { enabled: true, settings: { ...settings, style: modeStyle(next) } });
  };
  // An LED switches its mode on; switching ARP or CHORDS off returns to SEQUENCER.
  const led = (m: SeqMode, label: string) => clip
    ? { on: mode === m, label: `${label} on/off`, toggle: () => enable(mode === m ? 'seq' : m) } : undefined;
  const tabs: DeviceTab<Page>[] = [
    { id: 'edit', label: 'EDIT', width: 58 },
    { id: 'seq', label: 'SEQUENCER', width: machine === 'DR1' ? 104 : 114, led: machine === 'DR1' ? undefined : led('seq', 'Sequencer') },
    ...(machine === 'DR1' ? [] : [{ id: 'arp' as const, label: 'ARP', width: 72, led: led('arp', 'Arpeggiator') }]),
    // Comping is a WT-1 feature: BL-1 is monophonic.
    ...(machine === 'WT1' ? [{ id: 'chords' as const, label: 'CHORDS', width: 90, led: led('chords', 'Chord comping') }] : []),
  ];
  const select = (p: Page) => {
    if (p === 'edit') return setDeviceMode('edit');
    setDeviceMode('seq');
    setSeqPage(p);
  };
  return <DeviceTabs className="sq-device-tabs" tabs={tabs} page={page} onSelect={select} label="Device pages" />;
}

/** The ARP and CHORDS tabs replace the note editor with the clip's arp
 *  settings. They stay editable while another mode plays. */
export function HostedArpEditor({ machine, children }: { machine: MachineId; children: ReactNode }) {
  const focus = useSeqStore(s => s.focus);
  const clip = useSeqStore(s => focus ? s.session.scenes[focus.scene]?.clips[focus.track] : null);
  const seqPage = useSeqStore(s => s.seqPage);
  const playing = useSeqStore(s => !!focus && s.playing && s.owner[focus.track] === focus.scene);
  const queued = useSeqStore(s => !!focus && s.queue[focus.track] === focus.scene);
  const current = useSeqStore(s => playing && focus ? s.pos[focus.track]?.step ?? -1 : -1);
  const bpm = useSeqStore(s => s.session.bpm);
  const swing = useSeqStore(s => s.swing);
  const peers = useSeqStore(s => focus ? linkedClipTracks(s.session, focus.scene, focus.track).length : 0);
  const { launch, stopTrack, updateClipArp, setSwing } = useSeqStore.getState();
  const mode = seqPage === 'chords' && machine === 'BL1' ? 'arp' : seqPage;
  if (!focus || !clip || mode === 'seq') return <>{children}</>;
  const a = (clip.arp ?? newClipArp(machine)).settings;
  // Fresh settings per edit: one gesture can send several edits (a progression sets chords, then bars).
  const edit = (patch: Partial<ArpState>) => {
    const now = useSeqStore.getState().session.scenes[focus.scene]?.clips[focus.track]?.arp?.settings ?? a;
    updateClipArp(focus.scene, focus.track, { settings: { ...now, ...patch, input: patch.input === 'keys' ? 'stored' : patch.input ?? now.input, latch: false } });
  };
  return <ArpPanel key={`${focus.scene}:${focus.track}:${mode}`} hosted bass={machine === 'BL1'} mode={mode} active={clipSeqMode(clip) === mode}
    a={a} keys={[]} playing={playing} queued={queued} current={current}
    bpm={bpm} swing={swing} setParam={(_, value) => setSwing(value)}
    play={() => launch(focus.track, focus.scene)} stop={() => stopTrack(focus.track)} clear={() => {}}
    bars={clipChordBars(a)} setBars={chordBars => edit({ chordBars })}
    chordLink={{ on: !!a.chordLink, peers, toggle: () => edit({ chordLink: !a.chordLink }) }}
    update={edit} />;
}

/** The focused clip's scale settings for its note sequencer, and its playhead in sixteenths. */
export function useHostedScale(machine: MachineId): { scale?: ScaleBinding; scaleStep?: number } {
  const focus = useSeqStore(s => s.focus);
  const clip = useSeqStore(s => focus ? s.session.scenes[focus.scene]?.clips[focus.track] : null);
  const step = useSeqStore(s => focus && s.playing && s.owner[focus.track] === focus.scene && s.pos[focus.track]
    ? s.pos[focus.track]!.bar * 16 + s.pos[focus.track]!.step : -1);
  const peers = useSeqStore(s => focus ? linkedClipTracks(s.session, focus.scene, focus.track).length : 0);
  if (!focus || !clip || machine === 'DR1') return {};
  const a = (clip.arp ?? newClipArp(machine)).settings;
  const update = (patch: Partial<ArpState>) => {
    const now = useSeqStore.getState().session.scenes[focus.scene]?.clips[focus.track]?.arp?.settings ?? a;
    useSeqStore.getState().updateClipArp(focus.scene, focus.track, { settings: { ...now, ...patch } });
  };
  return { scale: { a, update, bars: clipChordBars(a), setBars: chordBars => update({ chordBars }),
    link: { on: !!a.chordLink, peers, toggle: () => update({ chordLink: !a.chordLink }) } }, scaleStep: step };
}
