import { AutomationEditor, type AutoSource } from '../seq/components/AutomationPanel';
import { engine, useStore } from '../store';

export function WtAutomation({ onReveal }: { onReveal?: () => void } = {}) {
  const lanes = useStore(s => s.automation);
  const bars = useStore(s => s.chain.length);
  const source: AutoSource = {
    id: 'wt1-sequence', unit: 'SEQUENCE', lanes, bars,
    current: () => useStore.getState().automation,
    write: (next, opts) => useStore.getState().setAutomation(next, opts),
    elapsed: () => {
      const st = useStore.getState();
      return st.seqPlaying ? engine.transportSteps(st.params['seq.bpm']) : null;
    },
  };
  return <AutomationEditor machine="WT1" source={source} onReveal={onReveal} />;
}
