import { useBassStore } from '../store';
import { ArpPanel } from '../../components/panels/ArpPanel';

export function BassArpPanel() {
  const a = useBassStore(s => s.arp);
  const keys = useBassStore(s => s.arpKeys);
  const update = useBassStore(s => s.updateArp);
  const active = useBassStore(s => s.arpMode);
  const playing = useBassStore(s => s.playing);
  const current = useBassStore(s => s.curStep);
  const play = useBassStore(s => s.play);
  const stop = useBassStore(s => s.stop);
  const clear = useBassStore(s => s.clearArpKeys);
  const bpm = useBassStore(s => s.params['seq.bpm']);
  const swing = useBassStore(s => s.params['master.swing']);
  const setParam = useBassStore(s => s.setParam);
  const bars = useBassStore(s => s.chain.length);
  const setBars = useBassStore(s => s.setSequenceLength);
  return <ArpPanel bass mode="arp" active={active} {...{ a, keys, update, playing, current, play, stop, clear, bpm, swing, setParam, bars, setBars }} />;
}
