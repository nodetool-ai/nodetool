// One scene row: the shared SceneCard followed by one clip cell per track.
// Cells preview the clip's real pattern bytes; live cells sweep at the clip's
// actual length.

import { useRef } from 'react';
import type * as React from 'react';
import { inRect, isDropTarget, selRect } from '../gridEdit';
import { isTrackAudible, previewSteps, STOP } from '../model';
import { barSeconds } from '../protocol';
import { clipPattern, useSeqStore } from '../store';
import { SceneCard } from './SceneCard';
import { compileClipArp } from '../clipArp';

const DRAG_THRESHOLD = 4; // px of pointer travel before a click becomes a drag

/** Modifier clicks select without launching; plain clicks anchor + launch. */
function selectOnClick(e: React.MouseEvent, s: number, t: number): boolean {
  const st = useSeqStore.getState();
  if (e.shiftKey && st.gridSel) {
    st.setGridSelection(st.gridSel.anchor, { s, t });
    return true;
  }
  st.setGridSelection({ s, t });
  return e.shiftKey || e.metaKey || e.ctrlKey;
}

function ClipCell({ s, t }: { s: number; t: number }) {
  const session = useSeqStore((st) => st.session);
  const live = useSeqStore((st) => st.owner[t] === s);
  const queuedPlay = useSeqStore((st) => st.queue[t] === s);
  const queuedStop = useSeqStore((st) => st.queue[t] === STOP && st.owner[t] === s);
  const muted = useSeqStore(
    (st) => st.owner[t] === s && !isTrackAudible(t, st.owner, st.trackMute, st.sceneMute, st.solo),
  );
  const selected = useSeqStore((st) => !!st.gridSel && inRect(selRect(st.gridSel), s, t));
  const dragging = useSeqStore(
    (st) => !!st.gridDrag && !!st.gridSel && inRect(selRect(st.gridSel), s, t)
      && inRect(selRect(st.gridSel), st.gridDrag.from.s, st.gridDrag.from.t),
  );
  const dropOk = useSeqStore((st) => isDropTarget(st.session, st.gridSel, st.gridDrag, s, t));
  const { launch, stopTrack } = useSeqStore.getState();

  // Pointer-drag state (NoteLengthHandle idiom): the origin cell captures the
  // pointer, a ~4px travel threshold separates drags from launches, and the
  // click that follows a drag-release is swallowed so it can't launch.
  const drag = useRef<{ x: number; y: number; started: boolean } | null>(null);
  const suppressClick = useRef(false);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[role="button"]')) return; // ✎ / 🗑 chips
    drag.current = { x: e.clientX, y: e.clientY, started: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const st = useSeqStore.getState();
    if (!d.started) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_THRESHOLD) return;
      d.started = true;
      // A grab outside the selection drags just this cell (re-anchor);
      // inside it, the whole selected block travels with the pointer.
      if (!(st.gridSel && inRect(selRect(st.gridSel), s, t))) st.setGridSelection({ s, t });
    } else if (!st.gridDrag) {
      return; // Esc cancelled this drag — ignore until release
    }
    const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-cell]');
    const to = cell instanceof HTMLElement
      ? { s: Number(cell.dataset.s), t: Number(cell.dataset.t) }
      : { s, t };
    useSeqStore.getState().setGridDrag({ from: { s, t }, to, copy: e.altKey });
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.started) return; // plain click — onClick takes it from here
    suppressClick.current = true;
    const st = useSeqStore.getState();
    const active = st.gridDrag;
    st.setGridDrag(null);
    if (active) st.moveClips(active.from, active.to, { copy: active.copy });
  };

  const tr = session.tracks[t];
  const clip = session.scenes[s]?.clips[t];
  const style = { '--tc': tr.color } as React.CSSProperties;
  const stateCls = `${selected ? ' sel' : ''}${dragging ? ' dragging' : ''}${dropOk ? ' drop-ok' : ''}`;

  // Ableton semantics: an empty cell is a stop button (fires on scene
  // launch too); right-click removes it — pass-through lets the previous
  // clip keep playing across the scene change.
  if (!clip) {
    const pass = !!session.scenes[s]?.pass?.includes(t);
    const { togglePassThrough, createClip } = useSeqStore.getState();
    return (
      <button
        className={`sq-cell sq-cell-empty${pass ? ' pass' : ''}${stateCls}`}
        style={style}
        data-cell=""
        data-s={s}
        data-t={t}
        onClick={(e) => {
          if (selectOnClick(e, s, t)) return;
          if (!pass) stopTrack(t);
        }}
        onContextMenu={(e) => { e.preventDefault(); togglePassThrough(s, t); }}
        title={pass
          ? 'Pass-through — previous clip rides through this scene · right-click to restore stop'
          : 'Stop button — stops this track on scene launch · right-click for pass-through'}
      >
        <span>{pass ? '◦' : '■'}</span>
        <span
          className="sq-cell-addbtn"
          role="button"
          tabIndex={0}
          title="Add a new clip here"
          onClick={(e) => { e.stopPropagation(); createClip(s, t); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              if (e.key === ' ') e.preventDefault();
              e.stopPropagation();
              createClip(s, t);
            }
          }}
        >
          ＋
        </span>
      </button>
    );
  }

  const bytes = clipPattern(session, s, t);
  const arp = compileClipArp(clip);
  const steps = arp ? arp.notes.slice(0, 16).map((n, i) => ({ on: n >= 0 && arp.hits[i], h: Math.max(4, Math.min(19, 5 + (n % 24) * .6)) })) : bytes ? previewSteps(tr.machine, bytes, clip.bars) : [];

  const cls = ['sq-cell'];
  if (live) cls.push('live');
  if (muted) cls.push('muted');
  return (
    <button
      className={cls.join(' ') + stateCls}
      style={style}
      data-cell=""
      data-s={s}
      data-t={t}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={(e) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return; // drag-release, not a launch
        }
        if (selectOnClick(e, s, t)) return;
        if (live) {
          if (!queuedStop) stopTrack(t);
        } else {
          launch(t, s);
        }
      }}
      title={queuedStop ? 'Clip stop queued' : live ? 'Stop clip' : 'Launch clip'}
    >
      <div className="sq-cell-body">
        <div className="sq-cell-head">
          {live ? (
            <span className="sq-eq">
              <i />
              <i />
              <i />
            </span>
          ) : (
            <span className="sq-cell-idle">▶</span>
          )}
          <span className="sq-cell-name">{clip.name}</span>
          <span className="sq-cell-len">{arp ? 'ARP' : `${clip.bars}B`}</span>
        </div>
        <div className="sq-steps">
          {steps.map((sp, i) => (
            <span key={i} className={sp.on ? 'on' : ''} style={{ height: `${sp.h}px` }} />
          ))}
        </div>
        <div className="sq-cell-progress">
          {live && (
            <div
              style={{
                animationDuration: `${arp ? 16 * arp.rate * 60 / session.bpm : clip.bars * barSeconds(session.bpm)}s`,
              }}
            />
          )}
        </div>
      </div>
      <span
        className="sq-cell-editbtn"
        role="button"
        tabIndex={0}
        title="Edit clip in its device"
        onClick={(e) => { e.stopPropagation(); useSeqStore.getState().enterFocus(t, s); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            if (e.key === ' ') e.preventDefault();
            e.stopPropagation();
            useSeqStore.getState().enterFocus(t, s);
          }
        }}
      >
        ✎
      </span>
      <span
        className="sq-cell-delbtn"
        role="button"
        tabIndex={0}
        title="Delete clip"
        onClick={(e) => { e.stopPropagation(); useSeqStore.getState().deleteClip(s, t); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            if (e.key === ' ') e.preventDefault();
            e.stopPropagation();
            useSeqStore.getState().deleteClip(s, t);
          }
        }}
      >
        🗑
      </span>
      {queuedPlay && <div className="sq-cell-queued" aria-hidden="true" />}
      {queuedStop && <div className="sq-cell-stopping" aria-hidden="true"><span>■ STOP</span></div>}
      {muted && <span className="sq-cell-mutedtag">MUTED</span>}
    </button>
  );
}

export function SceneRow({ s }: { s: number }) {
  const session = useSeqStore((st) => st.session);
  return (
    <div className="sq-grid">
      <SceneCard s={s} />
      {session.tracks.map((_, t) => (
        <ClipCell key={t} s={s} t={t} />
      ))}
    </div>
  );
}
