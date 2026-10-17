// DR-1 pattern browser: the shared shell with a pattern-library adapter. Roles
// are song sections (MAIN, INTRO, FILL …) and tags are genre families. A row
// loads its bars into the pattern slots without changing the kit or BPM;
// while the sequencer runs the new pattern plays in place, and when it is
// stopped selecting a row plays the first bar on the current kit.

import { useMemo } from 'react';
import { PresetBrowserShell, type BrowserSnapshot, type PresetBrowserAdapter } from '../../../components/presetBrowser/PresetBrowserShell';
import { PATTERN_FAMILIES, PATTERN_LIBRARY, PATTERN_USES, type PatternEntry } from '../../patternLibrary';
import { PAD_COUNT } from '../../params';
import { STEPS, patIdx } from '../../seq';
import { useDrumStore, type PatternSnapshot } from '../../store';
import { useDrumAudition } from './useDrumAudition';

// Glyph rows: kick/sub, backbeat (snare, clap, rim), hats and ride, the rest.
const ROWS = [[0, 1], [2, 3, 4], [5, 6, 7], [8, 9, 10, 11, 12, 13, 14, 15]];
const ROW_NAMES = ['KICK', 'BACKBEAT', 'HATS', 'TOMS · PERC'];

function PatternGlyph({ patterns, bars, color, className }: { patterns: Uint8Array; bars: number; color: string; className: string }) {
  const w = bars * STEPS, h = ROWS.length;
  return <svg className={className} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
    {Array.from({ length: bars }, (_, bar) => bar ? <rect key={`b${bar}`} x={bar * STEPS - 0.05} y={0} width={0.1} height={h} fill={color} opacity={0.35} /> : null)}
    {ROWS.flatMap((pads, r) => Array.from({ length: w }, (_, i) => {
      const bar = Math.floor(i / STEPS), s = i % STEPS;
      const v = Math.max(...pads.map(p => patterns[patIdx(bar, p, s)]));
      return v ? <rect key={`${r}-${i}`} x={i + 0.12} y={r + 0.15} width={0.76} height={0.7} fill={color} opacity={v === 2 ? 1 : 0.55} /> : null;
    }))}
  </svg>;
}

type Snap = PatternSnapshot & BrowserSnapshot;

export function PatternBrowser({ onClose }: { onClose: () => void }) {
  const powered = useDrumStore((s) => s.powered);
  const playing = useDrumStore((s) => s.playing);
  const hosted = useDrumStore((s) => s.hosted);
  const patternValue = useDrumStore((s) => s.patternValue);
  const patterns = useDrumStore((s) => s.patterns);
  const chain = useDrumStore((s) => s.chain);
  const { loadPatterns, captureSequence, restoreSequence } = useDrumStore.getState();
  const audition = useDrumAudition();
  const current = useMemo(() => PATTERN_LIBRARY.find((e) => e.value === patternValue) ?? null, [patternValue]);
  // A hosted clip owns the transport, so it always plays the loaded pattern in place.
  const inPlace = hosted || playing;

  const adapter: PresetBrowserAdapter<PatternEntry, Snap> = {
    title: 'DR-1 patterns',
    glyphLegend: 'kick · backbeat · hats · perc',
    favoritesKey: 'fablesynth.drumPatternFavorites',
    roles: PATTERN_USES,
    characters: PATTERN_FAMILIES,
    items: PATTERN_LIBRARY,
    value: patternValue,
    load: (e) => { loadPatterns(e.patterns, e.chain, e.value); },
    capture: () => captureSequence(),
    restore: (s) => restoreSequence(s),
    audition: (e) => e && audition.play((bpm) => {
      const step = 60 / bpm / 4 * 1000, hits: [number, number, number][] = [];
      for (let p = 0; p < PAD_COUNT; p++) for (let s = 0; s < STEPS; s++) {
        const v = e.patterns[patIdx(0, p, s)];
        if (v) hits.push([s * step, p, v === 2 ? 1 : 0.72]);
      }
      return hits;
    }, !inPlace),
    stopAudition: audition.stop,
    auditionHint: (on) => !powered ? 'Power on to hear patterns.'
      : inPlace ? 'The sequencer plays the selected pattern.'
      : on ? 'The first bar plays on select.' : 'Start the sequencer to hear patterns in place.',
    renderGlyph: (e, color) => <PatternGlyph className="pbr-glyph" patterns={e.patterns} bars={1} color={color} />,
    renderDetail: (color) => (
      <>
        <PatternGlyph className="pbr-big" patterns={patterns} bars={Math.max(1, chain.length)} color={color} />
        <div className="pbr-legend">{ROW_NAMES.map((n) => <span key={n}>{n}</span>)}</div>
        <dl className="pbr-kv">
          <dt>Genre</dt><dd>{current?.genre ?? '—'}</dd>
          <dt>Section</dt><dd>{current ? current.role.toUpperCase() : '—'}</dd>
          <dt>Bars</dt><dd>{chain.length}</dd>
          <dt>Typical tempo</dt><dd>{current ? `${current.bpm} BPM` : '—'}</dd>
          <dt>Written swing</dt><dd>{current ? `${Math.round(current.swing * 100)}%` : '—'}</dd>
          <dt>Arrangement</dt><dd>{current?.note ?? '—'}</dd>
        </dl>
      </>
    ),
  };
  return <PresetBrowserShell adapter={adapter} onClose={onClose} />;
}
