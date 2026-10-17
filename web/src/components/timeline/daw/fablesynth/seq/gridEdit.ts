// Pure SQ-4 clip-grid editing helpers (docs: editing-concept — SQ-4 section).
// Selection rectangles, clipboard payloads and cell-write plans are computed
// here with no store or audio dependencies; the store applies the writes
// (cache sync, hot-swap, persistence) in one place.

import type { ClipDoc, MachineId, SessionDoc } from './protocol';

export interface GridPos {
  s: number;
  t: number;
}

/** Anchor/head selection — the UI derives the covered rectangle. */
export interface GridSel {
  anchor: GridPos;
  head: GridPos;
}

export interface GridRect {
  s0: number;
  s1: number;
  t0: number;
  t1: number;
}

/**
 * Clipboard payload: a rectangle of cells (scene-major) plus the machine of
 * each source column — paste refuses cells whose target machine differs
 * (pattern bytes are machine-specific, validateSession would reject them).
 */
export interface GridClipboard {
  cells: (ClipDoc | null)[][];
  machines: MachineId[];
}

/** One planned cell mutation; `clip: null` clears the slot. */
export interface CellWrite {
  s: number;
  t: number;
  clip: ClipDoc | null;
}

export function selRect(sel: GridSel): GridRect {
  return {
    s0: Math.min(sel.anchor.s, sel.head.s),
    s1: Math.max(sel.anchor.s, sel.head.s),
    t0: Math.min(sel.anchor.t, sel.head.t),
    t1: Math.max(sel.anchor.t, sel.head.t),
  };
}

export const inRect = (r: GridRect, s: number, t: number): boolean =>
  s >= r.s0 && s <= r.s1 && t >= r.t0 && t <= r.t1;

/** Snapshot a rectangle of cells with per-column machine tags. */
export function copyRect(session: SessionDoc, rect: GridRect): GridClipboard {
  const cells: (ClipDoc | null)[][] = [];
  for (let s = rect.s0; s <= rect.s1; s++) {
    const row: (ClipDoc | null)[] = [];
    for (let t = rect.t0; t <= rect.t1; t++) row.push(session.scenes[s]?.clips[t] ?? null);
    cells.push(row);
  }
  return { cells, machines: session.tracks.slice(rect.t0, rect.t1 + 1).map((tr) => tr.machine) };
}

export interface WritePlan {
  writes: CellWrite[];
  /** Cells dropped for machine mismatch (clamped-off-grid cells don't count). */
  skipped: number;
}

/**
 * Plan a paste with the payload's top-left at `at`. Machine-mismatched cells
 * are skipped (no partial pattern corruption); cells past the grid edge are
 * clamped away silently.
 */
export function pasteWrites(session: SessionDoc, clipboard: GridClipboard, at: GridPos): WritePlan {
  const writes: CellWrite[] = [];
  let skipped = 0;
  clipboard.cells.forEach((row, ds) => {
    const s = at.s + ds;
    if (s < 0 || s >= session.scenes.length) return;
    row.forEach((clip, dt) => {
      const t = at.t + dt;
      if (t < 0 || t >= session.tracks.length) return;
      if (session.tracks[t].machine !== clipboard.machines[dt]) {
        skipped++;
        return;
      }
      writes.push({ s, t, clip });
    });
  });
  return { writes, skipped };
}

/**
 * Plan a block move (or Alt-copy) of the cells in `rect`, displaced by the
 * grab→drop vector `from`→`to`. Sources whose target is off-grid or lands on
 * a machine-mismatched track are skipped (the source stays put). Source
 * clears come first so target writes within an overlapping rect win.
 */
export function moveWrites(
  session: SessionDoc,
  rect: GridRect,
  from: GridPos,
  to: GridPos,
  copy: boolean,
): WritePlan {
  const ds = to.s - from.s;
  const dt = to.t - from.t;
  if (ds === 0 && dt === 0) return { writes: [], skipped: 0 };
  const moved: CellWrite[] = [];
  const sources: GridPos[] = [];
  let skipped = 0;
  for (let s = rect.s0; s <= rect.s1; s++) {
    for (let t = rect.t0; t <= rect.t1; t++) {
      const clip = session.scenes[s]?.clips[t] ?? null;
      if (!clip) continue;
      const ns = s + ds;
      const nt = t + dt;
      const offGrid = ns < 0 || ns >= session.scenes.length || nt < 0 || nt >= session.tracks.length;
      if (offGrid || session.tracks[nt].machine !== session.tracks[t].machine) {
        skipped++;
        continue; // source keeps its clip
      }
      sources.push({ s, t });
      moved.push({ s: ns, t: nt, clip });
    }
  }
  // Source clears first, target writes last — an overlapping move keeps the
  // clip in cells that are both a vacated source and someone's landing spot.
  const byKey = new Map<string, CellWrite>();
  if (!copy) {
    for (const p of sources) byKey.set(`${p.s}:${p.t}`, { s: p.s, t: p.t, clip: null });
  }
  for (const w of moved) byKey.set(`${w.s}:${w.t}`, w);
  return { writes: [...byKey.values()], skipped };
}

/**
 * Is cell (s, t) a landing spot of the active drag? Drives the drop-target
 * highlight — machine-incompatible / off-grid cells produce no highlight.
 */
export function isDropTarget(
  session: SessionDoc,
  sel: GridSel | null,
  drag: { from: GridPos; to: GridPos } | null,
  s: number,
  t: number,
): boolean {
  if (!drag) return false;
  const rect = sel && inRect(selRect(sel), drag.from.s, drag.from.t)
    ? selRect(sel)
    : { s0: drag.from.s, s1: drag.from.s, t0: drag.from.t, t1: drag.from.t };
  // copy=true plans only the target writes, which is all the highlight needs
  const { writes } = moveWrites(session, rect, drag.from, drag.to, true);
  return writes.some((w) => w.clip != null && w.s === s && w.t === t);
}

/** Apply a write plan immutably — only the touched scenes are recreated. */
export function applyWrites(session: SessionDoc, writes: CellWrite[]): SessionDoc {
  if (!writes.length) return session;
  const scenes = session.scenes.slice();
  for (const w of writes) {
    const sc = scenes[w.s];
    if (!sc) continue;
    const clips = sc.clips.slice();
    clips[w.t] = w.clip;
    scenes[w.s] = { ...sc, clips };
  }
  return { ...session, scenes };
}
