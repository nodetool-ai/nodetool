// Guided-tour coach marks: a spotlight ring over the real control plus a
// card explaining the gesture. Steps live in onboarding.ts; the active step
// index lives in the store (auto-opens on first power-on, HELP replays it).
// The spotlight is pointer-transparent so the highlighted control stays
// clickable while the tour is up.

import type * as React from 'react';
import { useEffect, useLayoutEffect, useState } from 'react';
import { TOUR_STEPS } from '../onboarding';
import { useSeqStore } from '../store';

interface SpotRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 7; // spotlight breathing room around the target
const CARD_W = 316;

export function Onboarding() {
  const step = useSeqStore((s) => s.tour);
  const focused = useSeqStore((s) => s.focus != null);
  const { advanceTour, endTour } = useSeqStore.getState();
  const [rect, setRect] = useState<SpotRect | null>(null);

  // Measure the target on step change and keep tracking it through resizes,
  // scrolling and late layout (fonts, live cells growing).
  useLayoutEffect(() => {
    if (step == null) {
      setRect(null);
      return;
    }
    const sel = TOUR_STEPS[step].target;
    let raf = 0;
    const measure = () => {
      raf = requestAnimationFrame(measure);
      const el = document.querySelector(sel);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect((cur) =>
        cur && cur.top === r.top && cur.left === r.left && cur.width === r.width && cur.height === r.height
          ? cur
          : { top: r.top, left: r.left, width: r.width, height: r.height },
      );
    };
    document.querySelector(sel)?.scrollIntoView({ block: 'nearest' });
    measure();
    return () => cancelAnimationFrame(raf);
  }, [step]);

  // Keyboard: → / Enter next, ← back, Esc closes. Suspended while a device is
  // focused so Esc reaches the focus-mode handler instead of closing the tour.
  useEffect(() => {
    if (step == null || focused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        endTour();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') advanceTour(1);
      else if (e.key === 'ArrowLeft') advanceTour(-1);
    };
    // Capture phase so Esc closes the tour before the focus-mode handler.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [step, focused, advanceTour, endTour]);

  if (step == null || focused || !rect) return null;

  const info = TOUR_STEPS[step];
  const last = step === TOUR_STEPS.length - 1;

  const spot: React.CSSProperties = {
    top: rect.top - PAD,
    left: rect.left - PAD,
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2,
  };

  // Card below the spotlight when there's room, else above; clamped to the
  // viewport horizontally.
  const below = rect.top + rect.height + 190 < window.innerHeight;
  const card: React.CSSProperties = {
    width: CARD_W,
    left: Math.max(10, Math.min(rect.left, window.innerWidth - CARD_W - 10)),
    ...(info.side === 'bottom' && below
      ? { top: rect.top + rect.height + PAD + 14 }
      : { bottom: window.innerHeight - rect.top + PAD + 14 }),
  };

  return (
    <div className="sq-tour" role="dialog" aria-label="SQ-4 quick tour">
      <div className="sq-tour-spot" style={spot} />
      <div className="sq-tour-card" style={card}>
        <div className="sq-tour-head">
          <span className="sq-tour-step">
            {step + 1}/{TOUR_STEPS.length}
          </span>
          <span className="sq-tour-title">{info.title}</span>
          <button className="sq-tour-x" onClick={endTour} title="Close tour" aria-label="Close tour">
            ✕
          </button>
        </div>
        <p className="sq-tour-body">{info.body}</p>
        <div className="sq-tour-nav">
          <span className="sq-tour-dots">
            {TOUR_STEPS.map((st, i) => (
              <i key={st.id} className={i === step ? 'on' : ''} />
            ))}
          </span>
          <button className="sq-tour-btn" onClick={endTour}>
            SKIP
          </button>
          {step > 0 && (
            <button className="sq-tour-btn" onClick={() => advanceTour(-1)}>
              ◂ BACK
            </button>
          )}
          <button className="sq-tour-btn primary" onClick={() => advanceTour(1)}>
            {last ? 'DONE' : 'NEXT ▸'}
          </button>
        </div>
      </div>
    </div>
  );
}
