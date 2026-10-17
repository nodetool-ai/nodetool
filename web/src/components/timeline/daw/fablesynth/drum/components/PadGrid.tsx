import { useEffect, useState, type DragEvent, type KeyboardEvent } from 'react';
import { mixToMono, detectCycleLength, sliceToFrames } from '../../engine/usertables';
import { buildUserTable } from '../../engine/wavetables';
import { CHOKE_NAMES, OUT_NAMES, pad } from '../params';
import { useDrumStore } from '../store';

const PAD_ORDER = Array.from({ length: 4 }, (_, row) =>
  Array.from({ length: 4 }, (_, col) => (3 - row) * 4 + col),
).flat();

function fileTableName(file: File): string {
  return file.name.toUpperCase().slice(0, 14) || 'USER';
}

export function PadGrid() {
  const sel = useDrumStore((s) => s.sel);
  const padNames = useDrumStore((s) => s.padNames);
  const hitTick = useDrumStore((s) => s.hitTick);
  const params = useDrumStore((s) => s.params);
  const selectPad = useDrumStore((s) => s.selectPad);
  const setParam = useDrumStore((s) => s.setParam);
  const setPadName = useDrumStore((s) => s.setPadName);
  const importPadTable = useDrumStore((s) => s.importPadTable);
  const [now, setNow] = useState(() => performance.now());
  const [editing, setEditing] = useState<number | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draggingOver, setDraggingOver] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(performance.now()), 90);
    return () => window.clearInterval(timer);
  }, []);

  const beginRename = (i: number) => {
    setDraftName(padNames[i] ?? '');
    setEditing(i);
  };

  const commitRename = (i: number) => {
    setPadName(i, draftName);
    setEditing(null);
  };

  const renameKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    e.stopPropagation();
  };

  const dropFile = async (e: DragEvent<HTMLButtonElement>, i: number) => {
    e.preventDefault();
    setDraggingOver(null);
    const file = e.dataTransfer.files[0];
    if (!file) return;

    let context: AudioContext | null = null;
    try {
      const AudioContextCtor = window.AudioContext
        || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      context = new AudioContextCtor();
      const buffer = await context.decodeAudioData(await file.arrayBuffer());
      const mono = mixToMono(buffer);
      const cycleLength = detectCycleLength(mono, buffer.sampleRate);
      const frames = sliceToFrames(mono, cycleLength);
      const table = buildUserTable(fileTableName(file), frames);
      importPadTable(i, table);
    } catch {
      // A malformed or unsupported file should never take down the instrument.
    } finally {
      if (context) void context.close().catch(() => undefined);
    }
  };

  return (
    <section className="panel dr-pads-panel" data-accent="a">
      <div className="panel-head">
        <h2>PADS</h2>
        <span className="panel-hint">DROP WAV → WAVETABLE</span>
      </div>
      <div className="pad-grid">
        {PAD_ORDER.map((i) => {
          const choke = params[pad(i, 'choke')] | 0;
          const out = params[pad(i, 'out')] | 0;
          const tag = choke > 0 ? CHOKE_NAMES[choke] : OUT_NAMES[out];
          const lit = now - (hitTick[i] ?? -Infinity) < 180;
          return (
            <button
              key={i}
              type="button"
              className={`pad${i === sel ? ' sel' : ''}${draggingOver === i ? ' drag-over' : ''}`}
              onClick={() => selectPad(i)}
              onDragOver={(e) => { e.preventDefault(); setDraggingOver(i); }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDraggingOver(null);
              }}
              onDrop={(e) => void dropFile(e, i)}
            >
              <span className="pad-num">{String(i + 1).padStart(2, '0')}</span>
              <span className={`pad-led${lit ? ' lit' : ''}`} />
              <span className="pad-meta">
                {editing === i ? (
                  <input
                    className="pad-name-input"
                    value={draftName}
                    maxLength={14}
                    autoFocus
                    onChange={(e) => setDraftName(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onBlur={() => commitRename(i)}
                    onKeyDown={renameKeyDown}
                    aria-label={`Rename pad ${i + 1}`}
                  />
                ) : (
                  <span
                    className="pad-name"
                    onDoubleClick={(e) => { e.stopPropagation(); beginRename(i); }}
                  >
                    {padNames[i]}
                  </span>
                )}
                <span className="pad-tag">{tag}</span>
              </span>
            </button>
          );
        })}
      </div>
      <label className="dr-pad-output">
        <span>OUTPUT</span>
        <select className="mod-select" aria-label="Selected pad output" value={params[pad(sel, 'out')] | 0}
          onChange={(e) => setParam(pad(sel, 'out'), Number(e.target.value))}>
          {OUT_NAMES.map((name, index) => <option key={name} value={index}>{name}</option>)}
        </select>
      </label>
    </section>
  );
}
