import { SequencePoly } from '../../components/SequencePoly';
// The 16-step pitch sequencer: 12 note lanes per step (tap an empty cell = set note,
// click a note = select it), draggable note lengths, octave / accent / slide rows,
// bars 1–4 and sequence length. Shift-drag a cell to sweep a step ×
// note-lane rectangle (highlighted); drag inside the rect to move it
// (Alt = copy). Cmd-A/Esc/Cmd-C/X/V/D/Delete work the clipboard verbs
// from useBassKeys.

import { scaleCellClass, ScaleStrip, type ScaleBinding } from '../../components/ScaleStrip';
import { scaleStepMasks } from '../../scales';
import type { ReactNode } from 'react';
import { BassArpPanel } from './BassArpPanel';
import { SequenceLengthControl } from '../../components/SequenceLengthControl';
import { NoteLengthHandle } from '../../components/NoteLengthHandle';
import { PatternPresetSelect } from '../../components/PatternPresetSelect';
import { BASS_PATTERN_PRESETS } from '../patternPresets';
import { SeqSelectionMenu } from '../../components/SeqSelectionMenu';
import { useSeqGhostPaste } from '../../components/useSeqGhostPaste';
import { useSeqNoteDraw } from '../../components/useSeqNoteDraw';
import { useSeqNoteDrag } from '../../components/useSeqNoteDrag';
import { useSeqRectSelect } from '../../components/useSeqRectSelect';
import { copyRectChain, rectNorm } from '../../shared/seqEdit';
import { getStep, LAYOUT, NOTE_LANES, STEPS } from '../seq';
import { useBassStore } from '../store';

/** The playhead marker under one grid column.
 *
 * The engine reports a new step 8–12 times a second. With `curStep` read at
 * the panel level, every one of those ticks reconciled the whole grid. Each
 * column owns its cursor instead: the selector returns a boolean, so zustand
 * bails out when it does not change and a tick re-renders only the two
 * columns whose highlight actually moves. */
function StepCursor({ step, pattern }: { step: number; pattern: number }) {
  const current = useBassStore((s) => s.playing && s.curStep === step && s.curPat === pattern);
  return <div className={`bl-step-cursor${current ? ' cur' : ''}`} aria-hidden="true" />;
}

/** The bar / sequence-length control, with its own store subscriptions.
 *
 * `playingBar` follows the transport, so reading `curPat` here keeps the
 * per-bar pattern change out of the panel and off the grid. */
function SeqLength() {
  const playing = useBassStore((s) => s.playing);
  const curPat = useBassStore((s) => s.curPat);
  const editPattern = useBassStore((s) => s.editPattern);
  const chain = useBassStore((s) => s.chain);
  const setEditPattern = useBassStore((s) => s.setEditPattern);
  const setSequenceLength = useBassStore((s) => s.setSequenceLength);
  const movePattern = useBassStore((s) => s.movePattern);
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

interface PitchSeqProps {
  bars?: number; headerExtra?: ReactNode; clipKey?: string;
  /** Hosted-only: the clip's scale settings and its playhead in sixteenths; standalone uses the device arp. */
  scale?: ScaleBinding; scaleStep?: number;
}

/** Standalone scale strip: highlights the chord under the playhead. */
function StandaloneScaleStrip({ scale }: { scale: ScaleBinding }) {
  const step = useBassStore((s) => s.playing && s.curStep >= 0 ? Math.max(0, s.chain.indexOf(s.curPat)) * STEPS + s.curStep : -1);
  return <ScaleStrip scale={scale} step={step} />;
}

export function PitchSeq(props: PitchSeqProps = {}) {
  const arp = useBassStore(s => s.arpMode && !s.hosted);
  return arp ? <BassArpPanel /> : <PitchSeqGrid {...props} />;
}

export function PitchSeqGrid({ bars, headerExtra, clipKey, scale, scaleStep }: PitchSeqProps = {}) {
  const hosted = useBassStore((s) => s.hosted);
  const deviceArp = useBassStore((s) => s.arp);
  const updateArp = useBassStore((s) => s.updateArp);
  const setSequenceLength = useBassStore((s) => s.setSequenceLength);
  const sequenceRhythm = useBassStore(s => s.sequenceRhythm);
  const updateSequenceRhythm = useBassStore(s => s.updateSequenceRhythm);
  // No `curStep` / `curPat` here on purpose: StepCursor and SeqLength read
  // them, so the engine tick never reconciles the whole grid.
  const chain = useBassStore((s) => s.chain);
  const patterns = useBassStore((s) => s.patterns);
  const rectSel = useBassStore((s) => s.rectSel);
  const toggleCell = useBassStore((s) => s.toggleCell);
  const cycleStepOct = useBassStore((s) => s.cycleStepOct);
  const toggleStepAcc = useBassStore((s) => s.toggleStepAcc);
  const toggleStepSlide = useBassStore((s) => s.toggleStepSlide);
  const setStepDuration = useBassStore((s) => s.setStepDuration);
  const randomize = useBassStore((s) => s.randomize);
  const loadPatternPreset = useBassStore((s) => s.loadPatternPreset);
  const setRectSel = useBassStore((s) => s.setRectSel);
  const moveRectSel = useBassStore((s) => s.moveRectSel);
  const moveStepNote = useBassStore((s) => s.moveStepNote);
  const copySelection = useBassStore((s) => s.copySelection);
  const duplicateSelection = useBassStore((s) => s.duplicateSelection);
  const deleteSelection = useBassStore((s) => s.deleteSelection);
  const clearStepSelection = useBassStore((s) => s.clearStepSelection);

  // Grid note drag (docs/superpowers/specs/2026-07-19-seq-note-drag-selection-menu-design.md):
  // grab a lit cell and drop it on another step/lane of the same pattern.
  // A move leaves the selection alone: selecting the landing cell would pop
  // the selection menu open over the grid right after every drop.
  const { drag, startNoteDrag, consumeDragClick } = useSeqNoteDrag((from, to, note, copy, pattern) => {
    moveStepNote(from, to, note, { copy }, pattern);
  });

  const { drawing, startNoteDraw, consumeDrawClick } = useSeqNoteDraw(({ absoluteStep, note, duration }) => {
    const bar = Math.floor(absoluteStep / STEPS);
    const step = absoluteStep % STEPS;
    const state = useBassStore.getState();
    const pattern = hosted ? bar : state.chain[bar];
    state.drawNote(step, note, duration, pattern);
  });

  // Rectangle selection + in-rect block-move
  // (docs/superpowers/specs/2026-07-19-seq-rect-selection-design.md):
  // shift-drag a cell to sweep a step × note-lane rect; drag inside the
  // current rect to move (Alt-drag copies) it. Both gestures commit once, on
  // pointer release, so each costs a single undo entry.
  const { pending, startRectSelect, startRectMove, consumeRectClick } = useSeqRectSelect({
    onSelect: setRectSel,
    onMove: (dStep, dNote, copy) => moveRectSel(dStep, dNote, { copy }),
  });
  const rect = pending ?? rectSel;
  const inRect = (step: number, note: number): boolean => {
    if (!rect) return false;
    const { stepLo, stepHi, noteLo, noteHi } = rectNorm(rect);
    return step >= stepLo && step <= stepHi && note >= noteLo && note <= noteHi;
  };

  // Ghost paste: menu CUT/COPY picks the selection up — the menu closes, the
  // cells trail the cursor as ghosts, and the next click drops them (Escape
  // or clicking outside the grid cancels; a cancelled CUT changes nothing).
  const dropRect = useBassStore((s) => s.dropRect);
  const { ghost, beginGhost, ghostAt, isCutSrc } = useSeqGhostPaste({ onDrop: dropRect });
  const pickUpSelection = (cut: boolean) => {
    if (!rectSel) return;
    copySelection(); // keep the clipboard in sync so Cmd-V still pastes the same cells
    beginGhost(copyRectChain(patterns, LAYOUT, chain, rectSel), { cut, src: rectSel });
    clearStepSelection();
  };

  // Drag preview: the dragged note is painted at its landing spot with its
  // real length, and the note it left behind is dimmed. `grabStep - srcStep`
  // is the grab offset, so a note grabbed by its tail lands under the pointer.
  const dragDuration = drag ? getStep(patterns, drag.pattern, drag.srcStep).duration : 1;
  const dragDestStep = drag ? Math.max(0, drag.overStep - (drag.grabStep - drag.srcStep)) : -1;

  const barCount = Math.max(1, Math.min(4, bars ?? chain.length));
  const totalSteps = barCount * STEPS;
  const scaleBinding: ScaleBinding = scale ?? { a: deviceArp, update: updateArp, bars: chain.length, setBars: setSequenceLength };
  const masks = scaleStepMasks(scaleBinding.a, scaleBinding.bars, totalSteps);
  const steps = Array.from({ length: totalSteps }, (_, absoluteStep) => {
    const bar = Math.floor(absoluteStep / STEPS);
    const step = absoluteStep % STEPS;
    const pattern = chain[bar] ?? bar;
    return { absoluteStep, bar, step, pattern, value: getStep(patterns, pattern, step) };
  });

  return (
    <section className="panel bl-seq-section" data-accent="a">
      <div className="panel-head bl-seq-head">
        <h2>PITCH SEQ</h2>
        {!hosted && <SeqLength />}
        {headerExtra}
        <button className="bl-seq-btn" type="button" onClick={randomize}>RAND</button>
        {!hosted && <PatternPresetSelect names={BASS_PATTERN_PRESETS.map((p) => p.name)} onLoad={loadPatternPreset} />}
        <span className="bl-seq-hint">DRAG EMPTY = DRAW · DRAG NOTE = MOVE · EDGE = LENGTH</span>
      </div>

      <SequencePoly rhythm={sequenceRhythm} clipKey={clipKey} onChange={updateSequenceRhythm}
        onUndo={useBassStore.getState().undo}
        onRedo={useBassStore.getState().redo} />

      {scale ? <ScaleStrip scale={scale} step={scaleStep} /> : !hosted && <StandaloneScaleStrip scale={scaleBinding} />}

      <div className="bl-seq-body">
        <div className="bl-seq-legend">
          <div className="bl-legend-lanes"><span>B</span><span>NOTE</span><span>C</span></div>
          <div className="bl-legend-oct">OCT</div>
          <div className="bl-legend-acc">ACC</div>
          <div className="bl-legend-sld">SLD</div>
        </div>

        <div className="bl-seq-grid-scroll">
        <div className="bl-seq-grid" style={{ minWidth: `${totalSteps * 32}px` }}>
          <div className="bl-seq-cols">
            {steps.map(({ absoluteStep, bar, step, pattern, value: s }) => {
              return (
                <div
                  className={`bl-seq-col${sequenceRhythm.enabled && (pattern !== 0 || step >= sequenceRhythm.steps) ? ' sequence-poly-outside' : ''}${step === 0 && bar > 0 ? ' bar-start' : ''}`}
                  key={absoluteStep}
                >
                  <div className="bl-seq-lanes">
                    {Array.from({ length: NOTE_LANES }, (_, r) => {
                      const note = NOTE_LANES - 1 - r;
                      const active = s.on && s.note === note;
                      const dragSrc = !!drag?.active && drag.pattern === pattern && drag.srcStep === step && drag.srcNote === note;
                      const dragPreview = !!drag?.active && drag.pattern === pattern && drag.overNote === note && dragDestStep === step;
                      const previewLen = Math.max(1, Math.min(dragDuration, totalSteps - absoluteStep));
                      // Step of the note that owns this cell: the cell itself
                      // when lit, else the origin of a longer note whose
                      // painted body covers it. -1 = empty cell.
                      const noteHead = (): number => {
                        if (active) return step;
                        for (let c = step - 1; c >= 0; c--) {
                          const cand = getStep(patterns, pattern, c);
                          if (cand.on && cand.note === note && c + cand.duration > step) return c;
                        }
                        return -1;
                      };
                      return (
                        <div className="bl-cell-wrap" key={r}>
                          <button
                            type="button"
                            data-seq-cell
                            data-step={step}
                            data-abs-step={absoluteStep}
                            data-note={note}
                            data-pattern={pattern}
                            className={'bl-cell' + (note === 0 ? ' root' : '') + scaleCellClass(masks?.[absoluteStep], note) + (active ? ' on' : '') + (dragSrc ? ' drag-src' : '') + (ghost ? (ghostAt(absoluteStep, note) ? ' ghost' : isCutSrc(absoluteStep, note) ? ' drag-src' : '') : '')}
                            aria-label={`bar ${bar + 1}, step ${step + 1}, note ${note}`}
                            aria-pressed={active}
                            onPointerDown={(event) => {
                              if (event.button !== 0 || ghost) return;
                              // Grab a lit cell — or the painted body of a longer
                              // note covering this cell — to move it (Alt = copy,
                              // Esc cancels). Shift-drag sweeps a selection rect;
                              // a plain drag inside the current rect moves it.
                              // Selection is timeline-wide: shift-drag sweeps
                              // across bars, and both gestures use absolute
                              // steps. Rect selection also works hosted (SQ-4
                              // focus) — verbs flow back via _setPatterns.
                              if (event.shiftKey) { startRectSelect(event, absoluteStep, note); return; }
                              if (rectSel && inRect(absoluteStep, note) && !pending) { startRectMove(event, absoluteStep, note); return; }
                              const srcStep = noteHead();
                              if (srcStep < 0) { startNoteDraw(event, absoluteStep, note, totalSteps); return; }
                              event.preventDefault();
                              startNoteDrag(event, srcStep, note, pattern, step);
                            }}
                            onClick={() => {
                              if (consumeDrawClick() || consumeRectClick() || consumeDragClick()) return;
                              // A click on a note selects it — head cell or
                              // painted body alike. Only an empty cell makes a
                              // new note. DELETE in the selection menu (or the
                              // Delete key) removes the selected note.
                              const head = noteHead();
                              if (head >= 0) {
                                const absHead = bar * STEPS + head;
                                setRectSel({ stepFrom: absHead, stepTo: absHead, noteFrom: note, noteTo: note });
                                return;
                              }
                              toggleCell(step, note, pattern);
                            }}
                          />
                          {active && (
                            <NoteLengthHandle
                              prefix="bl"
                              absoluteStep={absoluteStep}
                              totalSteps={totalSteps}
                              duration={s.duration}
                              muted={dragSrc}
                              onChange={(duration) => setStepDuration(step, duration, pattern)}
                            />
                          )}
                          {drawing?.absoluteStep === absoluteStep && drawing.note === note && (
                            <span className="bl-note-preview" aria-hidden="true"
                              style={{ width: `calc(${drawing.duration * 100}% + ${(drawing.duration - 1) * 5}px)` }} />
                          )}
                          {drag && dragPreview && (
                            <span
                              className={`bl-note-preview${drag.copy ? ' copy' : ''}`}
                              aria-hidden="true"
                              style={{ width: `calc(${previewLen * 100}% + ${(previewLen - 1) * 5}px)` }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className={`bl-oct-btn${s.oct !== 0 ? ' set' : ''}`}
                    aria-label={`bar ${bar + 1}, step ${step + 1} octave`}
                    onClick={() => cycleStepOct(step, pattern)}
                  >
                    {s.oct === 0 ? '0' : s.oct > 0 ? '+1' : '−1'}
                  </button>
                  <button
                    type="button"
                    className={`bl-acc-btn${s.on && s.acc ? ' on' : ''}`}
                    aria-label={`bar ${bar + 1}, step ${step + 1} accent`}
                    aria-pressed={s.on && s.acc}
                    onClick={() => toggleStepAcc(step, pattern)}
                  />
                  <button
                    type="button"
                    className={`bl-sld-btn${s.on && s.slide ? ' on' : ''}`}
                    aria-label={`bar ${bar + 1}, step ${step + 1} slide`}
                    aria-pressed={s.on && s.slide}
                    onClick={() => toggleStepSlide(step, pattern)}
                  />
                  <span className="bl-step-num">
                    {step === 0 ? `BAR ${bar + 1}` : step + 1}
                  </span>
                  <StepCursor step={step} pattern={pattern} />
                </div>
              );
            })}
          </div>
          {rect && (() => {
            // One translucent, bordered rectangle over the selection —
            // geometry mirrors the flex columns (5px gaps) and the fixed
            // 12 × 11px (+1px gap) lane stack.
            const { stepLo, stepHi, noteLo, noteHi } = rectNorm(rect);
            const gaps = (totalSteps - 1) * 5;
            const span = stepHi - stepLo + 1;
            return (
              <div
                className="bl-sel-rect"
                aria-hidden="true"
                style={{
                  left: `calc((100% - ${gaps}px) / ${totalSteps} * ${stepLo} + ${stepLo * 5}px)`,
                  width: `calc((100% - ${gaps}px) / ${totalSteps} * ${span} + ${(span - 1) * 5}px)`,
                  top: `${(NOTE_LANES - 1 - noteHi) * 12}px`,
                  height: `${(noteHi - noteLo + 1) * 12 - 1}px`,
                }}
              />
            );
          })()}
          {rectSel && (() => {
            const { stepLo, stepHi } = rectNorm(rectSel);
            return (
              <SeqSelectionMenu
                visibleLo={stepLo}
                visibleHi={stepHi}
                totalSteps={totalSteps}
                onCut={() => pickUpSelection(true)}
                onCopy={() => pickUpSelection(false)}
                onDuplicate={duplicateSelection}
                onDelete={deleteSelection}
                onDismiss={clearStepSelection}
              />
            );
          })()}
        </div>
        </div>
      </div>
    </section>
  );
}
