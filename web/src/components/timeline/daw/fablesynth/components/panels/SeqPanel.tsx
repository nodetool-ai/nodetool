import { SequencePoly } from '../SequencePoly';
import { scaleCellClass, ScaleStrip, type ScaleBinding } from '../ScaleStrip';
import { scaleStepMasks } from '../../scales';
// The WT-1 note sequencer: 12 note lanes per step (tap an empty cell = set
// note, click a note = select it), draggable note lengths, octave / accent
// rows, bars 1–4 + sequence length, RAND, transport and ROOT controls.

import type { ReactNode } from 'react';
import { ArpPanel } from './WtArpPanel';
import { getStep, NOTE_LANES, STEPS, WT1_LAYOUT, type SeqStep } from '../../noteseq';
import { copyRectChain, rectNorm, type RectCells, type RectSel } from '../../shared/seqEdit';
import { useStore } from '../../store';
import { NoteLengthHandle } from '../NoteLengthHandle';
import { PatternPresetSelect } from '../PatternPresetSelect';
import { NOTE_PATTERN_PRESETS } from '../../patternPresets';
import { SeqSelectionMenu } from '../SeqSelectionMenu';
import { SequenceLengthControl } from '../SequenceLengthControl';
import { Stepper } from '../Stepper';
import { useSeqGhostPaste } from '../useSeqGhostPaste';
import { useSeqNoteDraw } from '../useSeqNoteDraw';
import { useSeqNoteDrag } from '../useSeqNoteDrag';
import { useSeqRectSelect } from '../useSeqRectSelect';

// Piano-style shading for the 12 chromatic lanes (lane 0 = root/tonic), so
// the grid reads at a glance the way a keyboard does: natural-degree lanes
// sit slightly lighter than sharp-degree lanes.
const SHARP_LANE = [false, true, false, true, false, false, true, false, true, false, true, false];

/** The playhead marker under one grid column.
 *
 * The engine reports a new step 8–12 times a second. With `curStep` read at
 * the panel level, every one of those ticks reconciled all ~770 grid buttons.
 * Each column owns its cursor instead: the selector returns a boolean, so
 * zustand bails out when it does not change and a tick re-renders only the
 * two columns whose highlight actually moves. */
function StepCursor({ step, pattern }: { step: number; pattern: number }) {
  const current = useStore((s) => s.seqPlaying && s.curStep === step && s.curPat === pattern);
  return <div className={`ns-step-cursor${current ? ' cur' : ''}`} aria-hidden="true" />;
}

/** The bar / sequence-length control, with its own store subscriptions.
 *
 * `playingBar` follows the transport, so reading `curPat` here keeps the
 * per-bar pattern change out of the panel and off the grid. */
function SeqLength() {
  const seqPlaying = useStore((s) => s.seqPlaying);
  const curPat = useStore((s) => s.curPat);
  const editPattern = useStore((s) => s.editPattern);
  const chain = useStore((s) => s.chain);
  const setEditPattern = useStore((s) => s.setEditPattern);
  const setSequenceLength = useStore((s) => s.setSequenceLength);
  const movePattern = useStore((s) => s.movePattern);
  return (
    <SequenceLengthControl
      editBar={editPattern}
      length={chain.length}
      playingBar={seqPlaying ? curPat : null}
      onEditBar={setEditPattern}
      onLengthChange={setSequenceLength}
      onMovePattern={movePattern}
    />
  );
}

/** Rect-selection verbs. Standalone defaults to the store's chain-aware
 * verbs; hosted SQ-4 passes poly-aware implementations over the clip bytes
 * (src/seq/wtClipRect.ts) so chords survive cut/copy/move. */
export interface SeqRectOps {
  copyData: (rect: RectSel) => RectCells;
  drop: (data: RectCells, atStep: number, dNote: number, clearSrc: RectSel | null) => void;
  move: (dStep: number, dNote: number, copy: boolean) => void;
  dup: () => void;
  del: () => void;
}

interface SeqPanelProps {
  clipKey?: string;
  /** Hosted SQ-4 clips have up to eight WT voices per step; standalone patterns do not. */
  polySteps?: SeqStep[][];
  bars?: number;
  onToggleChordNote?: (step: number, note: number, duration?: number) => void;
  onSetChordDuration?: (step: number, note: number, duration: number) => void;
  /** Hosted-only: enables rect selection with these verb implementations. */
  rectOps?: SeqRectOps;
  /** Hosted-only: move (Alt-copy) one chord voice; enables grid note drag. */
  onMoveChordNote?: (from: number, to: number, note: number, srcNote: number, copy: boolean, pattern: number) => void;
  /** Hosted-only: extra control rendered in the panel head (bar/length). */
  headerExtra?: ReactNode;
  /** Hosted-only: the clip's scale settings and its playhead in sixteenths; standalone uses the device arp. */
  scale?: ScaleBinding;
  scaleStep?: number;
}

/** Standalone scale strip: highlights the chord under the playhead. */
function StandaloneScaleStrip({ scale }: { scale: ScaleBinding }) {
  const step = useStore((s) => s.seqPlaying && s.curStep >= 0 ? Math.max(0, s.chain.indexOf(s.curPat)) * STEPS + s.curStep : -1);
  return <ScaleStrip scale={scale} step={step} />;
}

export function SeqPanel(props: SeqPanelProps = {}) {
  const arp = useStore(s => s.arpMode && !s.hosted);
  const chords = useStore(s => s.arp.style === 'comp');
  return arp ? <ArpPanel mode={chords ? 'chords' : 'arp'} /> : <NoteSeqPanel {...props} />;
}

export function NoteSeqPanel({ polySteps, bars, onToggleChordNote, onSetChordDuration, rectOps, onMoveChordNote, headerExtra, clipKey, scale, scaleStep }: SeqPanelProps = {}) {
  const hosted = useStore((s) => s.hosted);
  const deviceArp = useStore((s) => s.arp);
  const updateArp = useStore((s) => s.updateArp);
  const setSequenceLength = useStore((s) => s.setSequenceLength);
  const root = useStore((s) => s.params['seq.root'] ?? 48);
  const sequenceRhythm = useStore(s => s.sequenceRhythm);
  const updateSequenceRhythm = useStore(s => s.updateSequenceRhythm);
  // No `curStep` / `curPat` here on purpose: StepCursor and SeqLength read
  // them, so the engine tick never reconciles the whole grid.
  const chain = useStore((s) => s.chain);
  const patterns = useStore((s) => s.patterns);
  const toggleCell = useStore((s) => s.toggleCell);
  const cycleStepOct = useStore((s) => s.cycleStepOct);
  const toggleStepAcc = useStore((s) => s.toggleStepAcc);
  const setStepDuration = useStore((s) => s.setStepDuration);
  const randomizeSeq = useStore((s) => s.randomizeSeq);
  const loadPatternPreset = useStore((s) => s.loadPatternPreset);
  const rectSel = useStore((s) => s.rectSel);
  const setRectSel = useStore((s) => s.setRectSel);
  const moveRectSel = useStore((s) => s.moveRectSel);
  const moveStepNote = useStore((s) => s.moveStepNote);
  const copySteps = useStore((s) => s.copySteps);
  const duplicateSteps = useStore((s) => s.duplicateSteps);
  const deleteSteps = useStore((s) => s.deleteSteps);
  const dropRect = useStore((s) => s.dropRect);
  const clearStepSel = useStore((s) => s.clearStepSel);

  // Grid note drag (docs/superpowers/specs/2026-07-19-seq-note-drag-selection-menu-design.md):
  // grab a lit cell and drop it on another step/lane of the same pattern.
  // Standalone-only, like the step-range selection below.
  // A move leaves the selection alone: selecting the landing cell would pop
  // the selection menu open over the grid right after every drop.
  const { drag, startNoteDrag, consumeDragClick } = useSeqNoteDrag((from, to, note, copy, pattern, srcNote) => {
    if (onMoveChordNote) onMoveChordNote(from, to, note, srcNote, copy, pattern);
    else moveStepNote(from, to, note, { copy }, pattern);
  });

  const { drawing, startNoteDraw, consumeDrawClick } = useSeqNoteDraw(({ absoluteStep, note, duration }) => {
    const bar = Math.floor(absoluteStep / STEPS);
    const step = absoluteStep % STEPS;
    if (onToggleChordNote) { onToggleChordNote(absoluteStep, note, duration); return; }
    const state = useStore.getState();
    const pattern = hosted ? bar : state.chain[bar];
    state.drawNote(step, note, duration, pattern);
  });

  // Rectangle selection + in-rect block-move
  // (docs/superpowers/specs/2026-07-19-seq-rect-selection-design.md):
  // shift-drag a cell to sweep a step × note-lane rect; drag inside the
  // current rect to move (Alt-drag copies) it. Both gestures commit once, on
  // pointer release, so each costs a single undo entry. Standalone-only.
  // Rect selection works standalone and (with rectOps) hosted in SQ-4.
  const selectable = !hosted || !!rectOps;
  const ops: SeqRectOps = rectOps ?? {
    copyData: (r) => copyRectChain(patterns, WT1_LAYOUT, chain, r),
    drop: dropRect,
    move: (dStep, dNote, copy) => moveRectSel(dStep, dNote, { copy }),
    dup: duplicateSteps,
    del: deleteSteps,
  };
  const { pending, startRectSelect, startRectMove, consumeRectClick } = useSeqRectSelect({
    onSelect: setRectSel,
    onMove: (dStep, dNote, copy) => ops.move(dStep, dNote, copy),
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
  const { ghost, beginGhost, ghostAt, isCutSrc } = useSeqGhostPaste({ onDrop: ops.drop });
  const pickUpSelection = (cut: boolean) => {
    if (!rectSel) return;
    if (!rectOps) copySteps(); // keep the Cmd-V clipboard in sync (standalone only)
    beginGhost(ops.copyData(rectSel), { cut, src: rectSel });
    clearStepSel();
  };

  // Drag preview: the dragged note is painted at its landing spot with its
  // real length, and the note it left behind is dimmed. `grabStep - srcStep`
  // is the grab offset, so a note grabbed by its tail lands under the pointer.
  const dragBar = drag ? Math.max(0, chain.indexOf(drag.pattern)) : 0;
  const dragDuration = drag
    ? (hosted
        ? polySteps?.[dragBar * STEPS + drag.srcStep]?.find((v) => v.on && v.note === drag.srcNote)?.duration
        : getStep(patterns, drag.pattern, drag.srcStep).duration) ?? 1
    : 1;
  const dragDestStep = drag ? Math.max(0, drag.overStep - (drag.grabStep - drag.srcStep)) : -1;

  const barCount = Math.max(1, Math.min(4, bars ?? (polySteps ? Math.ceil(polySteps.length / STEPS) : chain.length)));
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
    <section className="panel ns-section" style={{ gridArea: 'seq' }} data-accent="a">
      <div className="panel-head ns-head">
        <h2>NOTE SEQ</h2>
        {!hosted && <SeqLength />}
        {headerExtra}
        <button className="ns-btn" type="button" onClick={randomizeSeq}>RAND</button>
        {!hosted && <PatternPresetSelect names={NOTE_PATTERN_PRESETS.map((p) => p.name)} onLoad={loadPatternPreset} />}
        <span className="ns-hint">DRAG EMPTY = DRAW · CLICK NOTE = SELECT · SHIFT-DRAG = RECT</span>
      </div>

      <SequencePoly rhythm={sequenceRhythm} clipKey={clipKey} onChange={updateSequenceRhythm}
        onUndo={useStore.getState().undoSeq}
        onRedo={useStore.getState().redoSeq} />

      {scale ? <ScaleStrip scale={scale} step={scaleStep} /> : !hosted && <StandaloneScaleStrip scale={scaleBinding} />}

      <div className="ns-body">
        <div className="ns-legend">
          <div className="ns-legend-lanes"><span>B</span><span>NOTE</span><span>C</span></div>
          <div className="ns-legend-oct">OCT</div>
          <div className="ns-legend-acc">ACC</div>
        </div>

        <div className="ns-grid-scroll">
          <div className="ns-grid" style={{ minWidth: `${totalSteps * 32}px` }}>
          <div className="ns-cols">
            {steps.map(({ absoluteStep, bar, step, pattern, value: s }) => {
              const voices = polySteps?.[absoluteStep]?.length ? polySteps[absoluteStep] : [s];
              return (
                <div className={`ns-col${sequenceRhythm.enabled && (pattern !== 0 || step >= sequenceRhythm.steps) ? ' sequence-poly-outside' : ''}${step === 0 && bar > 0 ? ' bar-start' : ''}`} key={absoluteStep}>
                  <div className="ns-lanes">
                    {Array.from({ length: NOTE_LANES }, (_, r) => {
                      const note = NOTE_LANES - 1 - r;
                      const voice = voices.find((candidate) => candidate.on && candidate.note === note);
                      const active = !!voice;
                      const dragSrc = !!drag?.active && drag.pattern === pattern && drag.srcStep === step && drag.srcNote === note;
                      const dragPreview = !!drag?.active && drag.pattern === pattern && drag.overNote === note && dragDestStep === step;
                      const previewLen = Math.max(1, Math.min(dragDuration, totalSteps - absoluteStep));
                      // Step of the note that owns this cell: the cell itself
                      // when lit, else the origin of a longer note whose
                      // painted body covers it (poly clip hosted, mono store
                      // patterns standalone). -1 = empty cell.
                      const noteHead = (): number => {
                        if (active) return step;
                        for (let c = step - 1; c >= 0; c--) {
                          const cand = hosted
                            ? polySteps?.[bar * STEPS + c]?.find((v) => v.on && v.note === note && c + v.duration > step)
                            : (() => { const g = getStep(patterns, pattern, c); return g.on && g.note === note && c + g.duration > step ? g : undefined; })();
                          if (cand) return c;
                        }
                        return -1;
                      };
                      return (
                        <div className="ns-cell-wrap" key={r}>
                          <button
                            type="button"
                            data-seq-cell
                            data-step={step}
                            data-abs-step={absoluteStep}
                            data-note={note}
                            data-pattern={pattern}
                            className={'ns-cell' + (note === 0 ? ' root' : (SHARP_LANE[note] ? ' sharp' : ' natural')) + scaleCellClass(masks?.[absoluteStep], root + note) + (active ? ' on' : '') + (dragSrc ? ' drag-src' : '') + (ghost ? (ghostAt(absoluteStep, note) ? ' ghost' : isCutSrc(absoluteStep, note) ? ' drag-src' : '') : '')}
                            aria-label={`bar ${bar + 1}, step ${step + 1}, note ${note}`}
                            aria-pressed={active}
                            onPointerDown={(event) => {
                              if (event.button !== 0 || ghost) return;
                              // Grab a lit cell — or the painted body of a longer
                              // note covering this cell — to move it; standalone
                              // mono grid only (hosted poly keeps chord callbacks).
                              // Selection is timeline-wide: shift-drag sweeps
                              // across bars, and both gestures use absolute steps.
                              if (selectable && event.shiftKey) { startRectSelect(event, absoluteStep, note); return; }
                              if (selectable && rectSel && inRect(absoluteStep, note) && !pending) { startRectMove(event, absoluteStep, note); return; }
                              if (hosted && !onMoveChordNote) return;
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
                              if (selectable && head >= 0) {
                                const absHead = bar * STEPS + head;
                                setRectSel({ stepFrom: absHead, stepTo: absHead, noteFrom: note, noteTo: note });
                                return;
                              }
                              if (head >= 0 && head !== step) return; // body of a note: never paint over it
                              if (onToggleChordNote) { onToggleChordNote(absoluteStep, note); return; }
                              toggleCell(step, note, pattern);
                            }}
                          />
                          {active && voice && (
                            <NoteLengthHandle
                              prefix="ns"
                              absoluteStep={absoluteStep}
                              totalSteps={totalSteps}
                              duration={voice.duration}
                              muted={dragSrc}
                              onChange={(duration) => onSetChordDuration
                                ? onSetChordDuration(absoluteStep, note, duration)
                                : setStepDuration(step, duration, pattern)}
                            />
                          )}
                          {drawing?.absoluteStep === absoluteStep && drawing.note === note && (
                            <span className="ns-note-preview" aria-hidden="true"
                              style={{ width: `calc(${drawing.duration * 100}% + ${(drawing.duration - 1) * 5}px)` }} />
                          )}
                          {drag && dragPreview && (
                            <span
                              className={`ns-note-preview${drag.copy ? ' copy' : ''}`}
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
                    className={`ns-oct-btn${s.oct !== 0 ? ' set' : ''}`}
                    aria-label={`bar ${bar + 1}, step ${step + 1} octave`}
                    onClick={() => cycleStepOct(step, pattern)}
                  >
                    {s.oct === 0 ? '0' : s.oct > 0 ? '+1' : '−1'}
                  </button>
                  <button
                    type="button"
                    className={`ns-acc-btn${s.on && s.acc ? ' on' : ''}`}
                    aria-label={`bar ${bar + 1}, step ${step + 1} accent`}
                    aria-pressed={s.on && s.acc}
                    onClick={() => toggleStepAcc(step, pattern)}
                  />
                  <button type="button" className="ns-step-num" aria-label={`bar ${bar + 1}, step ${step + 1}`}>
                    {step === 0 ? `BAR ${bar + 1}` : step + 1}
                  </button>
                  <StepCursor step={step} pattern={pattern} />
                </div>
              );
            })}
          </div>
          {selectable && rect && (() => {
            // One translucent, bordered rectangle over the selection —
            // geometry mirrors the flex columns (5px gaps) and the fixed
            // 12 × 11px (+1px gap) lane stack.
            const { stepLo, stepHi, noteLo, noteHi } = rectNorm(rect);
            const gaps = (totalSteps - 1) * 5;
            const span = stepHi - stepLo + 1;
            return (
              <div
                className="ns-sel-rect"
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
          {selectable && rectSel && (() => {
            const { stepLo, stepHi } = rectNorm(rectSel);
            return (
              <SeqSelectionMenu
                visibleLo={stepLo}
                visibleHi={stepHi}
                totalSteps={totalSteps}
                onCut={() => pickUpSelection(true)}
                onCopy={() => pickUpSelection(false)}
                onDuplicate={ops.dup}
                onDelete={ops.del}
                onDismiss={clearStepSel}
              />
            );
          })()}
          </div>
        </div>

        <div className="ns-clock">
          <Stepper paramId="seq.root" label="ROOT" accent="a" />
        </div>
      </div>
    </section>
  );
}
