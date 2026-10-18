import type * as React from 'react';
import { useState } from 'react';
import { Knob } from '../Knob';
import { EnvView } from '../displays/EnvView';
import { ModSourceChip } from '../ModSourceChip';
import { useStore } from '../../store';

interface EnvPage {
  id: string;
  label: string;
  modSource: number; // MOD_SOURCES index of this envelope
}

interface EnvPanelProps {
  id: string;
  title: string;
  gridArea: string;
  viewAccent: string;
  knobAccent: 'n' | 'f';
  modSource?: number; // MOD_SOURCES index, if this envelope can be dragged as a source
  pages?: EnvPage[]; // several envelopes sharing one panel, picked by tabs
}

export function EnvPanel({ pages, ...props }: EnvPanelProps) {
  const [page, setPage] = useState(0);
  if (!pages) return <EnvBody {...props} />;
  const cur = pages[page]!;
  const tabs = (
    <div className="filter-tabs env-tabs" role="tablist" aria-label={`${props.title} pages`}>
      {pages.map((p, i) => (
        <button key={p.id} type="button" role="tab" className="filter-tab" aria-selected={page === i}
          onClick={() => setPage(i)}>{p.label}</button>
      ))}
    </div>
  );
  return <EnvBody {...props} id={cur.id} modSource={cur.modSource} tabs={tabs} />;
}

function EnvBody({ id, title, gridArea, viewAccent, knobAccent, modSource, tabs }: Omit<EnvPanelProps, 'pages'> & { tabs?: React.ReactNode }) {
  const a = useStore((s) => s.params[`${id}.a`]);
  const d = useStore((s) => s.params[`${id}.d`]);
  const sus = useStore((s) => s.params[`${id}.s`]);
  const r = useStore((s) => s.params[`${id}.r`]);

  return (
    <section className="panel panel-env" style={{ gridArea }}>
      <div className="panel-head">{modSource && <ModSourceChip src={modSource} compact />}<h2>{title}</h2>{tabs}</div>
      <EnvView className="env-curve" a={a} d={d} s={sus} r={r} accent={viewAccent} />
      <div className="knob-row">
        <Knob paramId={`${id}.a`} size="sm" accent={knobAccent} />
        <Knob paramId={`${id}.d`} size="sm" accent={knobAccent} />
        <Knob paramId={`${id}.s`} size="sm" accent={knobAccent} />
        <Knob paramId={`${id}.r`} size="sm" accent={knobAccent} />
      </div>
    </section>
  );
}
