/**
 * Comp pattern library browser, from FableSynth
 * src/components/panels/CompBrowser.tsx, over a clip's `harmony`.
 */

import React, { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  COMP_FAMILIES,
  COMP_LIBRARY,
  COMP_ROWS,
  COMP_VARIATIONS,
  compLibraryIndex
} from "@nodetool-ai/timeline";
import type { ClipHarmony, CompLibraryEntry, ResolvedClipHarmony } from "@nodetool-ai/timeline";

export const RATE_NAMES: Record<string, string> = {
  1: "1/4", 0.75: "1/8 DOT", 0.5: "1/8", [1 / 3]: "1/8 TRI", 0.375: "1/16 DOT", 0.25: "1/16", [1 / 6]: "1/16 TRI", 0.125: "1/32"
};
export const VOICING_NAMES = { close: "CLOSE", drop2: "DROP 2", drop24: "DROP 2+4", open: "OPEN" } as const;
export const STRUM_NAMES = { up: "↑ UP", down: "↓ DOWN", alt: "↕ ALT" } as const;

/** The harmony fields a library entry sets: rhythm, rate and playing feel. */
export const loadCompEntry = (e: CompLibraryEntry): Partial<ClipHarmony> => ({
  style: "comp",
  comp: [...e.comp],
  ties: [...e.ties],
  accents: [...e.accents],
  rate: e.rate,
  gate: e.gate,
  strumMs: e.strum,
  strumDirection: e.strumDir,
  voicing: e.voicing
});

/** 16 steps x 4 voice rows: dots strike, bars hold through ties. */
export function CompGrid({ comp, ties, accents }: Pick<CompLibraryEntry, "comp" | "ties" | "accents">): React.JSX.Element {
  let held = 0;
  const cells: ReactElement[] = [];
  comp.forEach((m, i) => {
    held = ties[i] ? held : m;
    COMP_ROWS.forEach(([, bit], row) => {
      if (!(held & bit)) return;
      cells.push(
        ties[i] ? (
          <rect key={`${i}-${row}`} x={i * 20 - 10} y={row * 6.5 + 2.25} width={20} height={2} className="hold" />
        ) : (
          <rect key={`${i}-${row}`} x={i * 20 + 3} y={row * 6.5 + 0.75} width={14} height={5} rx={1.5} className={accents[i] ? "hit accent" : "hit"} />
        )
      );
    });
  });
  return (
    <svg className="comp-grid" viewBox="0 0 320 26" aria-hidden="true">
      {[0, 1, 2, 3].map((b) => (
        <rect key={b} x={b * 80} y={0} width={1} height={26} className="beat" />
      ))}
      {cells}
    </svg>
  );
}

export interface CompBrowserProps {
  harmony: ResolvedClipHarmony;
  update: (patch: Partial<ClipHarmony>) => void;
  onClose: () => void;
}

export function CompBrowser({ harmony, update, onClose }: CompBrowserProps): React.JSX.Element {
  const [family, setFamily] = useState("ALL");
  const [variation, setVariation] = useState("ALL");
  const [query, setQuery] = useState("");
  const current = harmony.style === "comp" ? compLibraryIndex(harmony) : -1;
  const list = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => {
    const q = query.trim().toUpperCase();
    return COMP_LIBRARY.map((e, i) => ({ e, i })).filter(
      ({ e }) =>
        (family === "ALL" || e.family === family) &&
        (variation === "ALL" || e.variation === variation) &&
        (!q || `${e.name} ${e.family}`.includes(q))
    );
  }, [family, variation, query]);
  const load = (i: number): void => update(loadCompEntry(COMP_LIBRARY[i]));
  useEffect(() => {
    list.current?.querySelector("[aria-selected=true]")?.scrollIntoView?.({ block: "nearest" });
  }, [current, shown]);
  const step = (d: number): void => {
    if (!shown.length) return;
    const at = shown.findIndex((s) => s.i === current);
    load(shown[at < 0 ? 0 : (at + d + shown.length) % shown.length].i);
  };
  const counts = useMemo(
    () => Object.fromEntries(COMP_FAMILIES.map((f) => [f.name, COMP_LIBRARY.filter((e) => e.family === f.name).length])),
    []
  );
  return (
    <div
      className="comp-browser"
      role="dialog"
      aria-label="Comp pattern browser"
      onKeyDown={(e) => {
        if (e.key === "Escape" || e.key === "Enter") {
          e.preventDefault();
          onClose();
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          step(e.key === "ArrowDown" ? 1 : -1);
        }
      }}
    >
      <div className="comp-browser-head">
        <h3>
          COMP PATTERNS <span>{shown.length} / {COMP_LIBRARY.length}</span>
        </h3>
        <input autoFocus type="search" aria-label="Search comp patterns" placeholder="SEARCH STYLE OR NAME" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="button" className="ns-btn" onClick={() => shown.length && load(shown[Math.floor(Math.random() * shown.length)].i)}>
          RANDOM
        </button>
        <button type="button" className="ns-btn nav-btn" onClick={onClose}>DONE</button>
      </div>
      <div className="comp-browser-variations" aria-label="Variation filter">
        {["ALL", ...COMP_VARIATIONS.map((v) => v.name)].map((v) => (
          <button key={v} type="button" aria-pressed={variation === v} onClick={() => setVariation(v)}>{v}</button>
        ))}
      </div>
      <div className="comp-browser-body">
        <div className="comp-browser-families" aria-label="Style family">
          {["ALL", ...COMP_FAMILIES.map((f) => f.name)].map((f) => (
            <button key={f} type="button" aria-pressed={family === f} onClick={() => setFamily(f)}>
              {f}
              <span>{f === "ALL" ? COMP_LIBRARY.length : counts[f]}</span>
            </button>
          ))}
        </div>
        <div className="comp-browser-list" ref={list} role="listbox" aria-label="Comp patterns">
          {shown.map(({ e, i }) => (
            <button key={i} type="button" role="option" aria-selected={i === current} onClick={() => load(i)} onDoubleClick={onClose}>
              <span className="comp-name">
                {e.groove}
                {e.variation !== "ORIGINAL" && <em>{e.variation}</em>}
              </span>
              <span className="comp-family">{e.family}</span>
              <CompGrid {...e} />
              <span className="comp-meta">
                {RATE_NAMES[e.rate]} · {VOICING_NAMES[e.voicing]}
                {e.strum ? ` · ${e.strum}MS ${STRUM_NAMES[e.strumDir].slice(0, 1)}` : ""}
              </span>
            </button>
          ))}
          {!shown.length && <span className="arp-empty">No pattern matches.</span>}
        </div>
      </div>
      <div className="comp-browser-foot">CLICK TO LOAD · ↑ ↓ STEP THROUGH THE LIST · ENTER / ESC CLOSES</div>
    </div>
  );
}
