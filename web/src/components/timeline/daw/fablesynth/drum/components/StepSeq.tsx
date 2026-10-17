import { drumFitSteps, drumLaneBadge } from '../rhythm';
import { SequenceNumberInput } from './SequenceNumberInput';
import { LaneCursor, PolyLanePanel } from './PolyLanePanel';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { SequenceLengthControl } from '../../components/SequenceLengthControl';
import { SeqSelectionMenu } from '../../components/SeqSelectionMenu';
import { useSeqRectSelect } from '../../components/useSeqRectSelect';
import { padRectNorm, type RectSel } from '../../shared/seqEdit';
import { STEPS, patIdx } from '../seq';
import { PAD_COUNT } from '../params';
import { useDrumStore } from '../store';
import { PATTERN_PRESETS } from '../kits';
import { PATTERN_LIBRARY } from '../patternLibrary';
import { PatternBrowser } from './browser/PatternBrowser';
import { useDrumGhostPaste } from './useDrumGhostPaste';

/** The bar / sequence-length control, with its own store subscriptions.
 *
 * `playingBar` follows the transport, so reading `curPat` here keeps the
 * per-bar pattern change out of the panel and off the grid. */
function SeqLength() {
  const playing = useDrumStore((s) => s.playing);
  const curPat = useDrumStore((s) => s.curPat);
  const editPattern = useDrumStore((s) => s.editPattern);
  const chain = useDrumStore((s) => s.chain);
  const setEditPattern = useDrumStore((s) => s.setEditPattern);
  const setSequenceLength = useDrumStore((s) => s.setSequenceLength);
  const movePattern = useDrumStore((s) => s.movePattern);
  return (
    <SequenceLengthControl
      editBar={editPattern}
      length={chain.length}
      playingBar={playing ? curPat : null}
      onEditBar={setEditPattern}
      onLengthChange={setSequenceLength}
      onMovePattern={movePattern}
    />
  );
}

export function StepSeq({ headerExtra }: { headerExtra?: ReactNode }) {
  const [timingStep, setTimingStep] = useState(0);
  const [patternPreset, setPatternPreset] = useState('');
  const setMicroDelay = useDrumStore(s => s.setMicroDelay);
  const sequenceContext = useDrumStore(s => s.sequenceContext);
  const rhythm = useDrumStore(s => s.drumRhythm);
  const sequenceError = useDrumStore(s => s.sequenceError);
  const hosted = useDrumStore((s) => s.hosted);
  // No `curStep` / `curPat` here on purpose: StepCursor and SeqLength read
  // them, so the engine tick never reconciles the whole grid.
  const editPattern = useDrumStore((s) => s.editPattern);
  const patterns = useDrumStore((s) => s.patterns);
  const sel = useDrumStore((s) => s.sel);
  const padNames = useDrumStore((s) => s.padNames);
  const padName = padNames[sel];
  const rectSel = useDrumStore((s) => s.rectSel);
  const toggleStep = useDrumStore((s) => s.toggleStep);
  const setRectSel = useDrumStore((s) => s.setRectSel);
  const moveRectSel = useDrumStore((s) => s.moveRectSel);
  const dropRect = useDrumStore((s) => s.dropRect);
  const copySelection = useDrumStore((s) => s.copySelection);
  const duplicateSelection = useDrumStore((s) => s.duplicateSelection);
  const deleteSelection = useDrumStore((s) => s.deleteSelection);
  const clearStepSel = useDrumStore((s) => s.clearStepSel);
  const randomizePad = useDrumStore((s) => s.randomizePad);
  const loadPatternPreset = useDrumStore((s) => s.loadPatternPreset);
  const browsing = useDrumStore((s) => s.browser === 'pattern');
  const setBrowser = useDrumStore((s) => s.setBrowser);
  const selectPad = useDrumStore((s) => s.selectLane);

  useEffect(() => setPatternPreset(''), [sequenceContext]);

  // Shift-drag rectangle selection + in-rect block move over the step × pad
  // grid — the shared WT-1/BL-1 pointer hook, with the note axis reused as the
  // pad-lane index (data-note = pad). Both gestures commit once on release, so
  // each costs one undo entry; Escape cancels mid-gesture. Works hosted too:
  // SQ-4 picks the edits up through the DR1 host bridge, exactly as BL-1 does.
  const { pending, startRectSelect, startRectMove, consumeRectClick } = useSeqRectSelect({
    onSelect: (r: RectSel) => setRectSel({ stepFrom: r.stepFrom, stepTo: r.stepTo, padFrom: r.noteFrom, padTo: r.noteTo }),
    onMove: (dStep, dPad, copy) => moveRectSel(dStep, dPad, { copy }),
  });
  // While sweeping, `pending` (a note-axis RectSel) mirrors the live rect; fall
  // back to the committed pad rect otherwise.
  const rect = pending
    ? { stepLo: Math.min(pending.stepFrom, pending.stepTo), stepHi: Math.max(pending.stepFrom, pending.stepTo),
        padLo: Math.min(pending.noteFrom, pending.noteTo), padHi: Math.max(pending.noteFrom, pending.noteTo) }
    : rectSel ? padRectNorm(rectSel) : null;
  const inRect = (step: number, padI: number): boolean =>
    !!rect && step >= rect.stepLo && step <= rect.stepHi && padI >= rect.padLo && padI <= rect.padHi;

  // Ghost paste: menu CUT/COPY picks the selection up — the menu closes, the
  // cells trail the cursor, and the next click drops them (Escape or an
  // outside-grid click cancels; a cancelled CUT changes nothing).
  const { ghost, beginGhost, ghostAt, isCutSrc } = useDrumGhostPaste({ onDrop: dropRect });
  const pickUpSelection = (cut: boolean) => {
    if (!rectSel) return;
    copySelection(); // keep the Cmd-V clipboard in sync
    const clip = useDrumStore.getState().clipboard;
    if (clip?.kind !== 'rect') return;
    beginGhost(clip.data, { cut, src: rectSel });
    clearStepSel();
  };

  const onStepPointerDown = (e: ReactPointerEvent<HTMLButtonElement>, padI: number, step: number) => {
    if (e.shiftKey) { startRectSelect(e, step, padI); return; }
    if (rectSel && inRect(step, padI) && !pending) { startRectMove(e, step, padI); return; }
    // Plain press retargets editing to that lane's pad so the click toggles the
    // row under the pointer regardless of selection order.
    if (padI !== sel) selectPad(padI);
  };

  const onStepClick = (padI: number, step: number) => {
    if (consumeRectClick()) return;
    setTimingStep(step);
    toggleStep(step, padI);
  };

  // Keep the full kit visible in the sequencer in standalone and hosted views.
  // Lanes run high pad to low, matching the pad grid's bottom-left origin.
  const lanes = Array.from({ length: PAD_COUNT }, (_, i) => PAD_COUNT - 1 - i);

  // Geometry for the single selection rectangle. WT-1 and BL-1 derive theirs
  // from calc() over fixed column widths, but DR-1's lanes sit behind a name
  // column and don't span the full wrap, so the cell pitch isn't recoverable
  // from CSS constants — measure the corner cells instead and follow resizes.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [selBox, setSelBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const stepLo = rect?.stepLo, stepHi = rect?.stepHi, padLo = rect?.padLo, padHi = rect?.padHi;
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || stepLo === undefined || ghost) { setSelBox(null); return; }
    // Source ranges can wrap visually after FIT rotation. Mark their actual
    // cells individually instead of drawing a misleading contiguous rectangle.
    if (lanes.some(p => p >= padLo! && p <= padHi! && drumFitSteps(rhythm?.lanes[p], editPattern))) {
      setSelBox(null); return;
    }
    const measure = () => {
      const w = wrapRef.current;
      if (!w) return;
      const cell = (step: number, padI: number) =>
        w.querySelector(`.step[data-abs-step="${step}"][data-note="${padI}"]`);
      // Top-left is the highest pad (lanes run high to low); bottom-right the lowest.
      const tl = cell(stepLo, padHi!), br = cell(stepHi!, padLo!);
      if (!tl || !br) { setSelBox(null); return; } // pad not rendered in the single-lane view
      const wr = w.getBoundingClientRect();
      const a = tl.getBoundingClientRect(), b = br.getBoundingClientRect();
      setSelBox({ left: a.left - wr.left, top: a.top - wr.top, width: b.right - a.left, height: b.bottom - a.top });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [stepLo, stepHi, padLo, padHi, ghost, rhythm, editPattern]);

  const renderStep = (padI: number, step: number, fit?: { phase: number; beat: number; cycleBeats: number }) => {
    const value = patterns[patIdx(editPattern, padI, step)];
    const lane = rhythm?.lanes[padI];
    const outsideLoop = lane?.enabled && (lane.sourceBar !== editPattern || step >= lane.steps);
    const isGhost = ghost ? ghostAt(step, padI) : false;
    const cutSrc = ghost ? isCutSrc(step, padI) : false;
    return (
      <button
        className={`step${outsideLoop ? ` poly-outside${lane.timing.mode === 'grid' ? ' poly-grid' : ''}` : ''}${fit ? ' fit-step' : ''}${inRect(step, padI) ? ' selected' : ''}${lane?.enabled && lane.timing.mode === 'fit' && lane.sourceBar === editPattern && step < lane.steps ? ' poly-source' : ''}${padI === sel && step === timingStep ? ' timing-selected' : ''}${value >= 1 ? ' on' : ''}${value === 2 ? ' accented' : ''}${isGhost ? ' ghost' : ''}${cutSrc ? ' cut-src' : ''}`}
        type="button"
        style={fit ? {
          left: `${fit.phase * 100}%`,
          width: `min(calc(${100 / lane!.steps}% - 2px), max(24px, calc(${100 / (fit.cycleBeats * 4)}% - 2px)))`,
        } : undefined}
        title={`Step ${step + 1}: ${lane?.stepDelayMs?.[editPattern * 16 + step] ?? 0} ms (plus lane ${lane?.delayMs ?? 0} ms)`}
        data-seq-cell
        data-abs-step={step}
        data-note={padI}
        aria-label={`${padNames[padI]} step ${step + 1}: ${value === 2 ? 'accent' : value === 1 ? 'on' : 'off'}${outsideLoop ? ', outside loop' : ''}`}
        aria-pressed={value >= 1}
        key={step}
        onClick={() => onStepClick(padI, step)}
        onPointerDown={(e) => onStepPointerDown(e, padI, step)}
      >
        <span className="step-accent" aria-hidden="true" />
        <span className="step-fill" aria-hidden="true" />
        <span className="step-num" aria-hidden="true">{step + 1}</span>
        {!!lane?.stepDelayMs?.[editPattern * 16 + step] && <span className="dr-micro-mark" aria-hidden="true">{lane.stepDelayMs[editPattern * 16 + step] > 0 ? '+' : '−'}</span>}
        <LaneCursor pad={padI} step={step} pattern={editPattern} />
      </button>
    );
  };

  return (
    <section className="panel dr-stepseq" data-accent="a">
      <div className="panel-head dr-stepseq-head">
        <h2>STEP SEQ</h2>
        <span className="dr-stepseq-target">{padName}</span>
        {!hosted && (
          <>
            <SeqLength />
            <button className="dr-seq-btn" type="button" onClick={randomizePad}>RAND</button>
          </>
        )}
        {headerExtra}
        <select
          className="mod-select dr-pattern-preset"
          aria-label="Load drum pattern preset"
          title="Load drum pattern preset without changing kit or BPM"
          value={patternPreset}
          onChange={(e) => {
            const value = e.target.value;
            if (value && loadPatternPreset(Number(value))) setPatternPreset(value);
          }}
        >
          <option value="">PATTERN PRESET</option>
          {PATTERN_PRESETS.map((p, index) => <option key={p.name} value={index}>{p.name}</option>)}
        </select>
        <button className={`dr-seq-btn dr-pattern-browse${browsing ? ' on' : ''}`} type="button" aria-pressed={browsing}
          title={`Browse ${PATTERN_LIBRARY.length} patterns by genre and song section`}
          onClick={() => setBrowser(browsing ? null : 'pattern')}>PATTERNS</button>
        {browsing && <PatternBrowser onClose={() => setBrowser(null)} />}
        <div className="dr-step-editing">
          <span>TAP STEP · ON → ACCENT → OFF · SHIFT-DRAG TO SELECT</span>
        </div>
      </div>
      <div className="dr-lanes-wrap" ref={wrapRef}>
        <div className="dr-lanes">
          {lanes.map((padI) => (
            <div className="dr-lane" key={padI}>
              <button
                className={`dr-lane-name${padI === sel ? ' sel' : ''}`}
                type="button"
                aria-pressed={padI === sel}
                onClick={() => selectPad(padI)}
              >
                <span className="dr-lane-num">{String(padI + 1).padStart(2, '0')}</span>
                {padNames[padI]}
                {drumLaneBadge(rhythm?.lanes[padI]) && <span className="dr-poly-badge">{drumLaneBadge(rhythm?.lanes[padI])}</span>}
              </button>
              {(() => {
                const fit = drumFitSteps(rhythm?.lanes[padI], editPattern);
                const beats = fit?.[0].cycleBeats;
                return <div className={`step-row${fit ? ' fit-row' : ''}`}
                  style={beats ? { '--fit-beats': beats } as CSSProperties : undefined}
                  aria-label={beats ? `${padNames[padI]} FIT cycle, ${beats / 4} ${beats === 4 ? 'bar' : 'bars'}` : undefined}>
                  {fit ? <>
                    <span className="fit-bar-label" aria-hidden="true">1</span>
                    {beats === 8 && <span className="fit-bar-label second" aria-hidden="true">2</span>}
                    {fit.map(position => renderStep(padI, position.sourceStep, position))}
                  </> : Array.from({ length: STEPS }, (_, step) => renderStep(padI, step))}
                </div>;
              })()}
            </div>
          ))}
        </div>
        {/* One rectangle over the whole selection rather than a tint per cell
            (mirrors WT-1's .ns-sel-rect and BL-1's .bl-sel-rect). */}
        {selBox && <div className="dr-sel-rect" aria-hidden="true" style={selBox} />}
        {rectSel && !ghost && (() => {
          const { stepLo, stepHi } = padRectNorm(rectSel);
          return (
            <SeqSelectionMenu
              visibleLo={stepLo}
              visibleHi={stepHi}
              totalSteps={STEPS}
              onCut={() => pickUpSelection(true)}
              onCopy={() => pickUpSelection(false)}
              onDuplicate={duplicateSelection}
              onDelete={deleteSelection}
              onDismiss={clearStepSel}
            />
          );
        })()}
      </div>
      <div className="dr-inspector-grid">
      {(() => {
        const laneMs = rhythm?.lanes[sel]?.delayMs ?? 0;
        const stepMs = rhythm?.lanes[sel]?.stepDelayMs?.[editPattern * 16 + timingStep] ?? 0;
        const total = laneMs + stepMs;
        return <div className="dr-timing-panel" id="dr-timing-panel" data-sequence-controls onKeyDown={e => e.stopPropagation()}>
          <div className="dr-timing-context"><strong>MICRO TIMING</strong><span>{String(sel + 1).padStart(2, '0')} {padName}</span></div>
          <div className="dr-timing-control"><SequenceNumberInput key={`lane-delay-${sel}`} label="LANE OFFSET" min={-50} max={50} value={laneMs} onChange={v => setMicroDelay(sel, v)} /></div>
          <div className="dr-timing-control"><SequenceNumberInput key={`step-delay-${sel}-${editPattern}-${timingStep}`} label={`STEP ${String(timingStep + 1).padStart(2, '0')}`} min={-50} max={50} value={stepMs} onChange={v => setMicroDelay(sel, v, timingStep)} /></div>
          <div className="dr-timing-result"><span>COMBINED OFFSET</span><strong>{total > 0 ? '+' : ''}{total} ms</strong></div>
          <p className="dr-timing-hint">CLICK STEP TO SELECT <span>− EARLY&nbsp; / &nbsp;+ LATE</span></p>
        </div>;
      })()}
      {sequenceError && <p className="dr-poly-error" role="alert">{sequenceError}</p>}
      <div className="dr-poly-slot">
        <PolyLanePanel key={sequenceContext} />
      </div>
      </div>
    </section>
  );
}
