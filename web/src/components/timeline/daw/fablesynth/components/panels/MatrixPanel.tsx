// Modulation overview. Serum-style assignment happens by dragging the source
// chips below onto any knob or the POS slider, but every route — including the
// global pitch/amp/pan targets that have no dedicated control — is also listed
// and fully editable here.

import type * as React from 'react';
import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MOD_SOURCES, MOD_DESTS, SOURCE_COLORS, MACRO_COUNT, fmtBi, routeBipolar, polarityFor, macroSource } from '../../params';
import { useStore } from '../../store';
import { MOD_MATRIX_SIZE } from '../../store/slotHelpers';
import { ModSourceChip } from '../ModSourceChip';
import { Knob } from '../Knob';

// Header chips for every source without its own panel chip. Macros carry
// their chip in the macro strip; LFOs and envelopes in their panels too.
const RAIL_SOURCES = [1, 2, 6, 7, 3, 8, 4, 5, 13, 14, 15];
const AUX_OPTIONS = ['NO AUX', ...MOD_SOURCES.slice(1)];

const A0 = -135, A1 = 135;
const clampAmt = (n: number) => Math.min(1, Math.max(-1, n));

function polar(r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [16 + r * Math.cos(a), 16 + r * Math.sin(a)];
}
function arc(from: number, to: number): string {
  if (Math.abs(to - from) < 0.01) to = from + 0.01;
  const [x0, y0] = polar(11, from);
  const [x1, y1] = polar(11, to);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  const sweep = to > from ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A 11 11 0 ${large} ${sweep} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

// Compact bipolar amount knob (sweeps from 12 o'clock), driven by value/onChange
// rather than a param id.
function AmtKnob({ amt, color, label, onChange }: { amt: number; color: string; label: string; onChange: (a: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; amt: number } | null>(null);
  const deg = A0 + (A1 - A0) * (amt + 1) / 2;
  const mid = (A0 + A1) / 2;

  return (
    <div
      ref={ref}
      className="mx-amt"
      tabIndex={0}
      role="slider"
      aria-label={label}
      aria-valuemin={-1}
      aria-valuemax={1}
      aria-valuenow={amt}
      aria-valuetext={fmtBi(amt)}
      title={fmtBi(amt)}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        drag.current = { y: e.clientY, amt };
        ref.current?.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const dy = drag.current.y - e.clientY;
        onChange(clampAmt(drag.current.amt + dy * (e.shiftKey ? 0.001 : 0.005)));
      }}
      onPointerUp={(e) => { drag.current = null; try { ref.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ } }}
      onDoubleClick={() => onChange(0)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 0.01 : 0.05;
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
          e.preventDefault();
          onChange(clampAmt(amt + step));
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
          e.preventDefault();
          onChange(clampAmt(amt - step));
        } else if (e.key === 'Home') {
          e.preventDefault();
          onChange(-1);
        } else if (e.key === 'End') {
          e.preventDefault();
          onChange(1);
        }
      }}
    >
      <svg viewBox="0 0 32 32">
        <circle className="k-body" cx="16" cy="16" r="10" />
        <path className="k-track" d={arc(A0, A1)} />
        <path className="k-arc" d={arc(mid, deg)} style={{ stroke: color }} />
        <line className="k-ptr" x1="16" y1="16" x2="16" y2="6" transform={`rotate(${deg} 16 16)`} />
      </svg>
    </div>
  );
}

function ModSelect({ value, options, label, onChange }: { value: number; options: string[]; label: string; onChange: (v: number) => void }) {
  return (
    <select className="mx-select" aria-label={label} value={value} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange(parseInt(e.target.value, 10))}>
      {options.map((o, i) => (
        <option key={i} value={i}>{o}</option>
      ))}
    </select>
  );
}

export function MatrixPanel() {
  const { t } = useTranslation();
  const params = useStore((s) => s.params);
  const addRoute = useStore((s) => s.addRoute);
  const updateSlot = useStore((s) => s.updateSlot);
  const clearSlot = useStore((s) => s.clearSlot);

  // Rows are a view over the 16 fixed slots: show one for every slot that has a
  // source OR a destination set (rowVisible), keyed by its absolute slot number
  // so editing one slot never disturbs another's React state.
  const rows = useMemo(() => {
    const out: { slot: number; src: number; dst: number; amt: number; bi: boolean; aux: number }[] = [];
    for (let s = 1; s <= MOD_MATRIX_SIZE; s++) {
      const src = params[`mat${s}.src`] | 0;
      const dst = params[`mat${s}.dst`] | 0;
      if (src !== 0 || dst !== 0) {
        out.push({ slot: s, src, dst, amt: params[`mat${s}.amt`] || 0, bi: routeBipolar(src, params[`mat${s}.pol`] | 0), aux: params[`mat${s}.aux`] | 0 });
      }
    }
    return out;
  }, [params]);

  return (
    <section className="panel panel-matrix" style={{ gridArea: 'matrix' }}>
      <div className="mx-rail">
        <div className="panel-head"><h2>{t('i18n-next45-fablesynth-effects.matrix.title')}</h2></div>
        <div className="mx-sources" aria-label={t('i18n-next45-fablesynth-effects.matrix.sources')}>
          {RAIL_SOURCES.map((s) => <ModSourceChip key={s} src={s} />)}
        </div>
        <button className="mx-add" onClick={() => addRoute(1, 0)}>+ {t('i18n-next45-fablesynth-effects.matrix.addRoute')}</button>
      </div>

      <div className="mx-macros" aria-label={t('i18n-next45-fablesynth-effects.matrix.macros')}>
        {Array.from({ length: MACRO_COUNT }, (_, i) => (
          <div className="mx-macro" key={i}>
            <ModSourceChip src={macroSource(i + 1)} compact />
            <Knob paramId={`macro${i + 1}`} size="sm" accent="n" />
          </div>
        ))}
        <div className="mx-macro">
          <ModSourceChip src={13} compact />
          <Knob paramId="perf.modwheel" size="sm" accent="n" />
        </div>
      </div>

      <div className="matrix-rows" aria-label={t('i18n-next45-fablesynth-effects.matrix.routes')}>
        {rows.map((r) => (
          <div className="mx-row" key={r.slot}>
            <AmtKnob amt={r.amt} color={SOURCE_COLORS[r.src]} label={t('i18n-next45-fablesynth-effects.matrix.routeAmount', { route: r.slot })} onChange={(a) => updateSlot(r.slot, { amt: a })} />
            <ModSelect value={r.src} options={MOD_SOURCES} label={t('i18n-next45-fablesynth-effects.matrix.routeSource', { route: r.slot })} onChange={(v) => updateSlot(r.slot, { src: v })} />
            <span className="mx-arrow">▸</span>
            <ModSelect value={r.dst} options={MOD_DESTS} label={t('i18n-next45-fablesynth-effects.matrix.routeDestination', { route: r.slot })} onChange={(v) => updateSlot(r.slot, { dst: v })} />
            <span className="mx-arrow" aria-hidden="true">×</span>
            <ModSelect value={r.aux} options={AUX_OPTIONS} label={t('i18n-next45-fablesynth-effects.matrix.routeAuxSource', { route: r.slot })} onChange={(v) => updateSlot(r.slot, { aux: v })} />
            <button className={`mx-pol${r.bi ? ' on' : ''}`} aria-pressed={r.bi}
              aria-label={t('i18n-next45-fablesynth-effects.matrix.routePolarity', { route: r.slot })} title={t('i18n-next45-fablesynth-effects.matrix.polarityTitle')}
              onClick={() => updateSlot(r.slot, { pol: polarityFor(r.src, !r.bi) })}>{r.bi ? 'BI' : 'UNI'}</button>
            <button className="mx-del" aria-label={t('i18n-next45-fablesynth-effects.matrix.removeRoute', { route: r.slot })} title={t('i18n-next45-fablesynth-effects.common.remove')} onClick={() => clearSlot(r.slot)}>×</button>
          </div>
        ))}
        {!rows.length && <p className="mx-empty">{t('i18n-next45-fablesynth-effects.matrix.empty')}</p>}
      </div>
    </section>
  );
}
