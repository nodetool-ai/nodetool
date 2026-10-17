import { FilterView, type FilterDef } from '../../components/displays/FilterView';
import { pad } from '../params';
import { useDrumStore } from '../store';
import { DrumKnob } from './DrumKnob';
import { DrumStepper } from './DrumStepper';

export function FilterSection() {
  const sel = useDrumStore((s) => s.sel);
  const onId = pad(sel, 'flt.on');
  const typeId = pad(sel, 'flt.type');
  const cutoffId = pad(sel, 'flt.cut');
  const resId = pad(sel, 'flt.res');
  const driveId = pad(sel, 'flt.drive');
  const on = useDrumStore((s) => s.params[onId]);
  const type = useDrumStore((s) => s.params[typeId]);
  const cutoff = useDrumStore((s) => s.params[cutoffId]);
  const res = useDrumStore((s) => s.params[resId]);
  const setParam = useDrumStore((s) => s.setParam);
  const filters: FilterDef[] = [
    { type, cutoff, res, on: !!on },
    { type: 0, cutoff: 1000, res: 0, on: false },
  ];

  return (
    <section className={`panel dr-edit-panel dr-filter${on === 1 ? '' : ' off'}`} data-accent="f">
      <div className="panel-head">
        <span className="dr-led dr-led-f" aria-hidden="true" />
        <h2>FILTER</h2>
        <button
          className={`power-btn${on === 1 ? ' on' : ''}`}
          type="button"
          aria-label="Filter power"
          aria-pressed={on === 1}
          onClick={() => setParam(onId, on === 1 ? 0 : 1)}
        />
        {on !== 1 && <span className="dr-filter-off-tag">OFF</span>}
        <div className="dr-filter-stepper">
          <DrumStepper paramId={typeId} accent="f" />
        </div>
      </div>
      <FilterView className="dr-filter-view" filters={filters} route={0} accent="#b18cff" />
      <div className="knob-row dr-filter-knobs">
        <DrumKnob paramId={cutoffId} size="md" accent="f" />
        <DrumKnob paramId={resId} size="sm" accent="f" />
        <DrumKnob paramId={driveId} size="sm" accent="f" />
      </div>
    </section>
  );
}
