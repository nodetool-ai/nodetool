import { useState } from 'react';
import { Knob } from '../Knob';
import { Stepper } from '../Stepper';
import { PowerButton } from '../PowerButton';
import { FilterView } from '../displays/FilterView';
import { ACCENTS } from '../../constants';
import { useStore } from '../../store';

function FilterBlock({ prefix, label, on }: { prefix: string; label: string; on: boolean }) {
  return (
    <div
      className={`filter-block${on ? '' : ' off'}`}
      id={`filter-panel-${label.toLowerCase()}`}
      role="tabpanel"
      aria-labelledby={`filter-tab-${label.toLowerCase()}`}
    >
      <div className="knob-row">
        <Knob paramId={`${prefix}.cutoff`} size="md" accent="f" />
        <Knob paramId={`${prefix}.res`} size="sm" accent="f" />
        <Knob paramId={`${prefix}.drive`} size="sm" accent="f" />
        <Knob paramId={`${prefix}.env`} size="sm" accent="f" />
        <Knob paramId={`${prefix}.key`} size="sm" accent="f" />
      </div>
    </div>
  );
}

export function FilterPanel() {
  const [activeFilter, setActiveFilter] = useState<0 | 1>(0);
  const t1 = useStore((s) => s.params['filter.type']);
  const c1 = useStore((s) => s.params['filter.cutoff']);
  const r1 = useStore((s) => s.params['filter.res']);
  const on1 = useStore((s) => s.params['filter.on']);
  const t2 = useStore((s) => s.params['filter2.type']);
  const c2 = useStore((s) => s.params['filter2.cutoff']);
  const r2 = useStore((s) => s.params['filter2.res']);
  const on2 = useStore((s) => s.params['filter2.on']);
  const route = useStore((s) => s.params['filter.route']);

  const filters = [
    { type: t1, cutoff: c1, res: r1, on: !!on1 },
    { type: t2, cutoff: c2, res: r2, on: !!on2 },
  ];
  const activePrefix = activeFilter === 0 ? 'filter' : 'filter2';
  const activeLabel = activeFilter === 0 ? 'F1' : 'F2';
  const activeOn = filters[activeFilter].on;

  return (
    <section className="panel panel-filter" data-accent="f" style={{ gridArea: 'filter' }}>
      <div className="panel-head">
        <h2>FILTERS</h2>
        <div className="filter-tabs" role="tablist" aria-label="Filter controls">
          {(['F1', 'F2'] as const).map((label, index) => (
            <button
              key={label}
              id={`filter-tab-${label.toLowerCase()}`}
              className="filter-tab"
              type="button"
              role="tab"
              aria-selected={activeFilter === index}
              aria-controls={`filter-panel-${label.toLowerCase()}`}
              tabIndex={activeFilter === index ? 0 : -1}
              onClick={() => setActiveFilter(index as 0 | 1)}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                const next = activeFilter === 0 ? 1 : 0;
                setActiveFilter(next);
                document.getElementById(`filter-tab-f${next + 1}`)?.focus();
              }}
            >
              <span className={`filter-tab-led${filters[index].on ? ' on' : ''}`} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        <span className="filter-active-power" aria-label={`${activeLabel} power`}>
          <PowerButton paramId={`${activePrefix}.on`} />
        </span>
        <span className="filter-type"><Stepper paramId={`${activePrefix}.type`} accent="f" /></span>
        <span className="ph-stepper"><Stepper paramId="filter.route" accent="f" /></span>
      </div>
      <FilterView className="filter-curve" filters={filters} route={route | 0} accent={ACCENTS.f} />
      {activeFilter === 0
        ? <FilterBlock prefix="filter" label="F1" on={activeOn} />
        : <FilterBlock prefix="filter2" label="F2" on={activeOn} />}
    </section>
  );
}
