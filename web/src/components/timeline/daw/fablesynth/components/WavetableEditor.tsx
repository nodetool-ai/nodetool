// User-wavetable editor — a modal with two creation modes:
//   AUDIO: load a file, slice into 2048-sample frames (single-cycle, auto-detect
//          pitch, or a fixed cycle length) and band-limit each frame.
//   DRAW:  sketch one cycle on a canvas; it is band-limited on commit.
// Both produce a UserTable that is added to the registry (store + localStorage)
// and assigned to the osc that opened the editor.

import { useEffect, useRef, useState } from 'react';
import { useStore, engine, factoryTables } from '../store';
import { setupCanvas } from './displays/canvas';
import {
  makeUserTable, mixToMono, detectCycleLength, sliceToFrames, singleCycleFrame,
  framesFromGenerated, MAX_FRAMES, type UserTable,
} from '../engine/usertables';
import { ACCENTS } from '../constants';
import { TABLE_NAMES } from '../params';
import { TableLibrary } from './wavetable/TableLibrary';
import { DRAW_N, seedShape, snapValue, smoothAround, type Seed, type Brush } from './wavetable/drawmodel';
import { framePoints, duplicateAt, deleteAt, moveFrame, framesFromWave } from './wavetable/frames';
import { FrameStrip } from './wavetable/FrameStrip';
import { StackPreview } from './wavetable/StackPreview';
import { frameFromDrawing } from '../engine/usertables';

type Tab = 'audio' | 'draw';
type AudioMode = 'single' | 'auto' | 'fixed';

function decodeFile(file: File): Promise<AudioBuffer> {
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = engine.ctx || new Ctor();
  return file.arrayBuffer().then((buf) => ctx.decodeAudioData(buf));
}

export function WavetableEditor() {
  const editorOsc = useStore((s) => s.editorOsc);
  const userTables = useStore((s) => s.userTables);
  const addUserTable = useStore((s) => s.addUserTable);
  const deleteUserTable = useStore((s) => s.deleteUserTable);
  const closeEditor = useStore((s) => s.closeEditor);
  const renameUserTable = useStore((s) => s.renameUserTable);
  const updateUserTable = useStore((s) => s.updateUserTable);
  const duplicateUserTable = useStore((s) => s.duplicateUserTable);
  const duplicateFactoryTable = useStore((s) => s.duplicateFactoryTable);
  const setParam = useStore((s) => s.setParam);

  const [tab, setTab] = useState<Tab>('draw');
  const [name, setName] = useState('');
  const [mode, setMode] = useState<AudioMode>('single');
  const [fixedLen, setFixedLen] = useState(2048);
  const [audio, setAudio] = useState<{ samples: Float32Array; sr: number; label: string } | null>(null);
  const [status, setStatus] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [brush, setBrush] = useState<Brush>('pen');
  const [snap, setSnap] = useState(false);
  const [readOnly, setReadOnly] = useState(false); // factory only

  const drawRef = useRef<HTMLCanvasElement>(null);
  // The frame list at canonical SIZE. The pad edits the current frame; untouched
  // frames keep their exact samples (lossless select / reorder / assign).
  const framesRef = useRef<Float32Array[]>([new Float32Array(2048)]);
  const pointsRef = useRef<number[]>(new Array(DRAW_N).fill(0)); // current frame in pad space
  const [current, setCurrent] = useState(0);
  const drawingRef = useRef(false);
  const lastIdxRef = useRef(-1);
  const [drawVersion, setDrawVersion] = useState(0); // repaint pad
  const [, setFrameVersion] = useState(0); // bump to re-render the strip + stack from framesRef

  const accentColor = ACCENTS[editorOsc === 'oscB' ? 'b' : 'a'];

  // Reset transient state each time the editor opens.
  useEffect(() => {
    if (editorOsc) {
      setTab('draw'); setName(''); setMode('single'); setAudio(null); setStatus('');
      setSelectedId(null); setReadOnly(false); setBrush('pen'); setSnap(false);
      framesRef.current = [new Float32Array(2048)];
      setCurrent(0);
      pointsRef.current = new Array(DRAW_N).fill(0);
      setDrawVersion((v) => v + 1); setFrameVersion((v) => v + 1);
    }
  }, [editorOsc]);

  // Repaint the draw canvas whenever its tab is shown or the curve changes.
  useEffect(() => {
    if (tab !== 'draw') return;
    const canvas = drawRef.current;
    if (!canvas) return;
    const { ctx, w, h } = setupCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    const pts = pointsRef.current;
    ctx.beginPath();
    for (let i = 0; i < DRAW_N; i++) {
      const x = (i / (DRAW_N - 1)) * w;
      const y = h / 2 - pts[i] * (h / 2 - 4);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = editorOsc ? ACCENTS[editorOsc === 'oscA' ? 'a' : 'b'] : ACCENTS.a;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = ctx.strokeStyle as string;
    ctx.shadowBlur = 6;
    ctx.stroke();
  }, [tab, drawVersion, editorOsc]);

  if (!editorOsc) return null;

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setStatus('decoding…');
    try {
      const buf = await decodeFile(file);
      const samples = mixToMono(buf);
      setAudio({ samples, sr: buf.sampleRate, label: file.name });
      if (!name) setName(file.name.replace(/\.[^.]+$/, '').slice(0, 14).toUpperCase());
      setStatus(`${(buf.duration).toFixed(2)} s · ${buf.sampleRate | 0} Hz · ${samples.length} samples`);
    } catch (err) {
      setStatus('decode failed: ' + (err as Error).message);
    }
  };

  const finalName = (name.trim().toUpperCase() || 'USER').slice(0, 14);

  const commit = (u: UserTable) => { addUserTable(u); closeEditor(); };

  const createFromAudio = () => {
    if (!audio) return;
    let frames: Float32Array[];
    if (mode === 'single') frames = singleCycleFrame(audio.samples);
    else if (mode === 'auto') frames = sliceToFrames(audio.samples, detectCycleLength(audio.samples, audio.sr));
    else frames = sliceToFrames(audio.samples, Math.max(2, fixedLen | 0));
    // Land the sliced frames in the editor (uncommitted) so they can be tweaked
    // in the strip before CREATE. New table (not editing an existing one).
    setSelectedId(null); setReadOnly(false);
    loadFrames(frames.slice(0, MAX_FRAMES));
    setTab('draw');
  };

  const createFromDraw = () => {
    if (readOnly) return;
    const u = makeUserTable(finalName, framesRef.current);
    if (selectedId && selectedId[0] === 'u') {
      const idx = +selectedId.slice(1);
      updateUserTable(idx, u);
      assign(TABLE_NAMES.length + idx);
    } else {
      commit(u);
    }
  };

  const assign = (combinedIndex: number) => {
    if (editorOsc) setParam(`${editorOsc}.table`, combinedIndex);
  };

  // Load the whole frame list, show frame 0 in the pad.
  const loadFrames = (frames: Float32Array[]) => {
    framesRef.current = frames.length ? frames : [new Float32Array(2048)];
    setCurrent(0);
    pointsRef.current = framePoints(framesRef.current[0]);
    setDrawVersion((v) => v + 1);
    setFrameVersion((v) => v + 1);
  };

  // Switch which frame the pad edits (no write-back — untouched frames stay exact).
  const gotoFrame = (i: number) => {
    const f = Math.max(0, Math.min(framesRef.current.length - 1, i));
    setCurrent(f);
    pointsRef.current = framePoints(framesRef.current[f]);
    setDrawVersion((v) => v + 1);
  };

  // Write the pad's current curve back into the current frame (called on edit).
  const syncCurrentFrame = () => {
    framesRef.current = framesRef.current.map((fr, i) => (i === current ? frameFromDrawing(pointsRef.current) : fr));
    setFrameVersion((v) => v + 1);
  };

  const selectFactory = (i: number) => {
    const ft = factoryTables()[i];
    setSelectedId('f' + i);
    setName(ft.name);
    setReadOnly(true);
    setTab('draw');
    loadFrames(framesFromGenerated(ft)); // all frames, read-only
    assign(i);
  };

  const selectUser = (i: number) => {
    const ut = userTables[i];
    setSelectedId('u' + i);
    setName(ut.name);
    setReadOnly(false);
    setTab('draw');
    loadFrames(framesFromWave(ut.wave, ut.frames)); // all frames, editable
    assign(TABLE_NAMES.length + i);
  };

  // ----- draw canvas pointer handling -----
  const paint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly) return;
    const canvas = drawRef.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const idx = Math.max(0, Math.min(DRAW_N - 1, Math.round(((e.clientX - r.left) / r.width) * (DRAW_N - 1))));
    let val = Math.max(-1, Math.min(1, 1 - 2 * ((e.clientY - r.top) / r.height)));
    val = snapValue(val, snap);
    const pts = pointsRef.current;
    const last = lastIdxRef.current;
    if (last >= 0 && last !== idx) {
      const lo = Math.min(last, idx), hi = Math.max(last, idx);
      const v0 = pts[last];
      for (let i = lo; i <= hi; i++) {
        const t = hi === lo ? 1 : (i - last) / (idx - last);
        pts[i] = v0 + (val - v0) * t;
      }
    } else {
      pts[idx] = val;
    }
    if (brush === 'smooth') smoothAround(pts, idx);
    lastIdxRef.current = idx;
    setDrawVersion((v) => v + 1); // live pad repaint; strip/stack sync on stroke end
  };

  const applySeed = (kind: Seed) => {
    if (readOnly) return;
    pointsRef.current = seedShape(kind);
    syncCurrentFrame();
    setDrawVersion((v) => v + 1);
  };

  const newTable = () => {
    const frames = [frameFromDrawing(seedShape('sine'))];
    const u = makeUserTable('USER', frames);
    const idx = userTables.length;
    addUserTable(u);
    setSelectedId('u' + idx);
    setName('USER');
    setReadOnly(false);
    setTab('draw');
    loadFrames(frames);
  };

  const addFrame = () => {
    if (readOnly) return;
    const next = duplicateAt(framesRef.current, current);
    if (next === framesRef.current) { setStatus(`max ${MAX_FRAMES} frames`); return; }
    framesRef.current = next;
    gotoFrame(current + 1);
    setFrameVersion((v) => v + 1);
  };

  const removeFrame = (i: number) => {
    if (readOnly) return;
    const next = deleteAt(framesRef.current, i);
    if (next === framesRef.current) return;
    framesRef.current = next;
    gotoFrame(Math.min(i, next.length - 1));
    setFrameVersion((v) => v + 1);
  };

  const reorderFrame = (from: number, to: number) => {
    if (readOnly) return;
    framesRef.current = moveFrame(framesRef.current, from, to);
    setCurrent(Math.max(0, Math.min(framesRef.current.length - 1, to)));
    setFrameVersion((v) => v + 1);
  };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = true; lastIdxRef.current = -1;
    e.currentTarget.setPointerCapture(e.pointerId);
    paint(e);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => { if (drawingRef.current) paint(e); };
  // Sync the edited frame into the list once, at stroke end — avoids resampling
  // + remounting the strip/stack on every pointer move.
  const onUp = () => {
    // Pointer leave can occur without a stroke. Only resample a frame after a
    // real draw, otherwise merely hovering over the pad corrupts its samples.
    const drew = drawingRef.current;
    drawingRef.current = false;
    lastIdxRef.current = -1;
    if (drew && !readOnly) syncCurrentFrame();
  };

  return (
    <div className="wte-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) closeEditor(); }}>
      <div className="wte" data-accent={editorOsc === 'oscA' ? 'a' : 'b'}>
        <div className="wte-scan" />
        <div className="wte-head">
          <h2>WAVETABLE → {editorOsc === 'oscA' ? 'OSC A' : 'OSC B'}</h2>
          <button className="wte-x" aria-label="close" onClick={closeEditor}>✕</button>
        </div>
        <div className="wte-cols">
          <TableLibrary
            userTables={userTables}
            selectedId={selectedId}
            accent={accentColor}
            onSelectFactory={selectFactory}
            onSelectUser={selectUser}
            onNew={newTable}
            onRename={renameUserTable}
            onDuplicateUser={duplicateUserTable}
            onDuplicateFactory={duplicateFactoryTable}
            onDelete={deleteUserTable}
          />
          <section className="wte-editor">
            <div className="wte-tabs">
              <button className={tab === 'draw' ? 'on' : ''} onClick={() => setTab('draw')}>DRAW</button>
              <button className={tab === 'audio' ? 'on' : ''} onClick={() => setTab('audio')}>IMPORT AUDIO</button>
            </div>
            <label className="wte-row">
              <span>NAME</span>
              <input value={name} maxLength={14} placeholder={finalName} onChange={(e) => setName(e.target.value)} />
            </label>

            {tab === 'draw' ? (
              <div className="wte-body">
                <div className="wte-edit-row">
                  <canvas ref={drawRef} className={'wte-draw' + (readOnly ? ' ro' : '')}
                    onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} />
                  <StackPreview frames={framesRef.current} current={current} accent={accentColor} />
                </div>
                <FrameStrip
                  frames={framesRef.current} current={current} accent={accentColor} readOnly={readOnly}
                  onSelect={gotoFrame} onAdd={addFrame} onDelete={removeFrame} onReorder={reorderFrame}
                />
                <p className="wte-hint">
                  {readOnly
                    ? 'Read-only (factory). Duplicate to edit.'
                    : 'Drag to draw the selected frame. POS morphs through frames on play.'}
                </p>
                <div className="wte-tools">
                  <span className="wte-tools-label">SEED</span>
                  <button onClick={() => applySeed('sine')}>SINE</button>
                  <button onClick={() => applySeed('saw')}>SAW</button>
                  <button onClick={() => applySeed('square')}>SQUARE</button>
                  <button onClick={() => applySeed('tri')}>TRI</button>
                  <span className="wte-sep" />
                  <button className={brush === 'pen' ? 'on' : ''} onClick={() => setBrush('pen')}>PEN</button>
                  <button className={brush === 'smooth' ? 'on' : ''} onClick={() => setBrush('smooth')}>SMOOTH</button>
                  <button className={snap ? 'on' : ''} onClick={() => setSnap((s) => !s)}>SNAP</button>
                  <button className="wte-clear" onClick={() => { pointsRef.current = new Array(DRAW_N).fill(0); syncCurrentFrame(); setDrawVersion((v) => v + 1); }}>CLEAR</button>
                  <button className="wte-create" disabled={readOnly} onClick={createFromDraw}>
                    {selectedId && selectedId[0] === 'u' ? 'UPDATE TABLE' : 'CREATE TABLE'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="wte-body">
                <label className="wte-row">
                  <span>FILE</span>
                  <input type="file" accept="audio/*" onChange={onFile} />
                </label>
                <div className="wte-modes">
                  <button className={mode === 'single' ? 'on' : ''} onClick={() => setMode('single')}>SINGLE CYCLE</button>
                  <button className={mode === 'auto' ? 'on' : ''} onClick={() => setMode('auto')}>AUTO-DETECT</button>
                  <button className={mode === 'fixed' ? 'on' : ''} onClick={() => setMode('fixed')}>FIXED LEN</button>
                </div>
                {mode === 'fixed' ? (
                  <label className="wte-row">
                    <span>CYCLE</span>
                    <input type="number" min={2} step={1} value={fixedLen} onChange={(e) => setFixedLen(+e.target.value)} />
                    <small>samples / frame</small>
                  </label>
                ) : null}
                <div className="wte-status">{status || 'load an audio file to begin'}</div>
                <p className="wte-hint">
                  SINGLE CYCLE: whole clip = 1 frame. AUTO-DETECT: estimate pitch, slice per cycle.
                  FIXED LEN: slice every N samples. Up to {MAX_FRAMES} frames.
                </p>
                <button className="wte-create" disabled={!audio} onClick={createFromAudio}>LOAD FRAMES →</button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
