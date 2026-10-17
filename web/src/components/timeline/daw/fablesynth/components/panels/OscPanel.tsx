import { Knob } from '../Knob';
import { Stepper } from '../Stepper';
import { PowerButton } from '../PowerButton';
import { VSlider } from '../VSlider';
import { WavetableView } from '../displays/WavetableView';
import { ACCENTS } from '../../constants';
import { useStore } from '../../store';

interface OscPanelProps {
  prefix: 'oscA' | 'oscB';
  accentKey: 'a' | 'b';
  title: string;
  gridArea: string;
}

export function OscPanel({ prefix, accentKey, title, gridArea }: OscPanelProps) {
  const on = useStore((s) => s.params[`${prefix}.on`]);
  const tableIndex = useStore((s) => s.params[`${prefix}.table`]);
  const pos = useStore((s) => s.params[`${prefix}.pos`]);
  const modPos = useStore((s) => (prefix === 'oscA' ? s.modPosA : s.modPosB));
  const table = useStore((s) => s.tables[tableIndex | 0] ?? null);
  const openEditor = useStore((s) => s.openEditor);

  return (
    <section className={`panel panel-osc${on ? '' : ' off'}`} data-accent={accentKey} style={{ gridArea }}>
      <div className="panel-head">
        <span className="ph-power"><PowerButton paramId={`${prefix}.on`} /></span>
        <h2>{title}</h2>
        <span className="ph-stepper">
          <button className="wt-edit" aria-label="edit wavetable" title="import / draw wavetable" onClick={() => openEditor(prefix)}>✎</button>
          <Stepper paramId={`${prefix}.table`} />
        </span>
      </div>
      <div className="osc-body">
        <WavetableView className="wt3d" table={table} pos={pos} modPos={modPos} accent={ACCENTS[accentKey]} />
        <div className="pos-holder">
          <VSlider paramId={`${prefix}.pos`} accent={accentKey} ghost={modPos} />
        </div>
        <div className="osc-knobs">
          <Knob paramId={`${prefix}.oct`} size="sm" accent={accentKey} />
          <Knob paramId={`${prefix}.semi`} size="sm" accent={accentKey} />
          <Knob paramId={`${prefix}.fine`} size="sm" accent={accentKey} />
          <Stepper paramId={`${prefix}.unison`} label="UNI" accent={accentKey} />
          <Knob paramId={`${prefix}.detune`} size="sm" accent={accentKey} />
          <Knob paramId={`${prefix}.spread`} size="sm" accent={accentKey} />
          <Knob paramId={`${prefix}.blend`} size="sm" accent={accentKey} />
          <Knob paramId={`${prefix}.level`} size="md" accent={accentKey} />
          <Knob paramId={`${prefix}.pan`} size="sm" accent={accentKey} />
        </div>
      </div>
    </section>
  );
}
