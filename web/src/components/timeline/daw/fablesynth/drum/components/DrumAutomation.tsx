import { AutomationEditor, type AutoSource } from '../../seq/components/AutomationPanel';
import { drumEngine, useDrumStore } from '../store';

// Standalone DR-1: the lanes belong to the current sequence and play on the
// DR-1 transport. They follow the chain length like a clip.
export function DrumAutomation() {
  const lanes = useDrumStore((s) => s.automation);
  const bars = useDrumStore((s) => s.chain.length);
  const rhythm = useDrumStore((s) => s.drumRhythm);
  const source: AutoSource = {
    id: 'dr1-sequence',
    unit: 'SEQUENCE',
    lanes,
    bars,
    rhythm,
    current: () => useDrumStore.getState().automation,
    write: (next, opts) => useDrumStore.getState().setAutomation(next, opts),
    elapsed: () => {
      const st = useDrumStore.getState();
      return st.playing ? drumEngine.transportSteps(st.params['seq.bpm']) : null;
    },
  };
  return <AutomationEditor machine="DR1" source={source} />;
}
