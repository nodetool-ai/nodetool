/**
 * Store-free FableSynth controls for the FX device views: the WT-1 rotary
 * knob (same SVG and classes as `fablesynth/components/Knob.tsx`, without the
 * mod-matrix rings), the power LED and the enum stepper. Each reads and
 * writes through callbacks, and reports gesture start and end so a drag is
 * one undo entry.
 */

import type * as React from "react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { normToValue, valueToNorm, type ParamDef } from "../fablesynth/params";

const A0 = -135;
const A1 = 135;

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  const end = Math.abs(to - from) < 0.01 ? from + 0.01 : to;
  const [x0, y0] = polar(cx, cy, r, from);
  const [x1, y1] = polar(cx, cy, r, end);
  const large = Math.abs(end - from) > 180 ? 1 : 0;
  const sweep = end > from ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} ${sweep} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** Value writes plus the gesture they belong to. */
export interface FxControlBinding {
  value: number;
  /** A continuous change (drag, wheel, key repeat). */
  onChange: (value: number) => void;
  /** A one-shot change (click, double-click reset). */
  onSet: (value: number) => void;
  onGestureEnd: () => void;
}

interface FxKnobProps extends FxControlBinding {
  def: ParamDef;
  size?: "lg" | "md" | "sm" | "xs";
  accent?: string;
  label?: string;
}

export function FxKnob({
  def,
  value,
  onChange,
  onSet,
  onGestureEnd,
  size = "sm",
  accent,
  label
}: FxKnobProps): React.ReactElement {
  const norm = clamp01(valueToNorm(def, value));
  const elRef = useRef<HTMLDivElement>(null);
  const normRef = useRef(norm);
  const draggingRef = useRef(false);
  const lastYRef = useRef(0);
  const wheelTimer = useRef<number | null>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const endRef = useRef(onGestureEnd);
  endRef.current = onGestureEnd;

  useEffect(() => {
    if (!draggingRef.current) normRef.current = norm;
  }, [norm]);

  const nudge = (deltaNorm: number): void => {
    normRef.current = clamp01(normRef.current + deltaNorm);
    changeRef.current(normToValue(def, normRef.current));
  };
  const nudgeRef = useRef(nudge);
  nudgeRef.current = nudge;

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      nudgeRef.current((e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 0.005 : 0.03));
      if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current);
      wheelTimer.current = window.setTimeout(() => {
        wheelTimer.current = null;
        endRef.current();
      }, 250);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent): void => {
    if (e.button !== 0) return;
    draggingRef.current = true;
    lastYRef.current = e.clientY;
    elRef.current?.setPointerCapture(e.pointerId);
    elRef.current?.classList.add("dragging");
    e.preventDefault();
  };
  const onPointerMove = (e: React.PointerEvent): void => {
    if (!draggingRef.current) return;
    const dy = lastYRef.current - e.clientY;
    lastYRef.current = e.clientY;
    nudge(dy * (e.shiftKey ? 0.0008 : 0.005));
  };
  const onPointerEnd = (e: React.PointerEvent): void => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    elRef.current?.classList.remove("dragging");
    try {
      elRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    onGestureEnd();
  };
  const onKeyDown = (e: React.KeyboardEvent): void => {
    const step = e.shiftKey ? 0.005 : 0.02;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      nudge(step);
      e.preventDefault();
    } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      nudge(-step);
      e.preventDefault();
    }
  };

  const min = def.min ?? 0;
  const deg = A0 + (A1 - A0) * norm;
  const arcD =
    min < 0
      ? arcPath(40, 40, 33, A0 + (A1 - A0) * valueToNorm(def, 0), deg)
      : arcPath(40, 40, 33, A0, deg);
  const valueText = def.fmt ? def.fmt(value) : value.toFixed(2);
  const labelText = label ?? def.label ?? "";

  return (
    <div
      ref={elRef}
      className={`knob knob-${size}`}
      data-accent={accent}
      tabIndex={0}
      role="slider"
      aria-label={labelText || def.id}
      aria-valuemin={def.min}
      aria-valuemax={def.max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyUp={onGestureEnd}
      onBlur={onGestureEnd}
      onDoubleClick={() => onSet(def.def)}
      onKeyDown={onKeyDown}
    >
      <svg viewBox="0 0 80 80">
        <circle className="k-body" cx="40" cy="40" r="26" />
        <path className="k-track" d={arcPath(40, 40, 33, A0, A1)} />
        <path className="k-arc" d={arcD} />
        <line className="k-ptr" x1="40" y1="40" x2="40" y2="17" transform={`rotate(${deg} 40 40)`} />
      </svg>
      <div className="k-label">{labelText}</div>
      <div className="k-value">{valueText}</div>
    </div>
  );
}

export function FxPower({
  on,
  label,
  onToggle
}: {
  on: boolean;
  label: string;
  onToggle: () => void;
}): React.ReactElement {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={`power-btn fx-power${on ? " on" : ""}`}
      aria-label={t("i18n-next77.fxControls.power", { label })}
      aria-pressed={on}
      onClick={onToggle}
    />
  );
}

export function FxStepper({
  def,
  value,
  accent,
  onSet
}: {
  def: ParamDef;
  value: number;
  accent?: string;
  onSet: (value: number) => void;
}): React.ReactElement {
  const { t } = useTranslation();
  const options = def.options ?? [];
  const count = Math.max(1, options.length);
  const index = Math.min(count - 1, Math.max(0, Math.round(value)));
  const step = (d: number): void => onSet((index + d + count) % count);
  return (
    <div className="stepper" data-accent={accent}>
      <button type="button" className="st-btn st-prev" aria-label={t("i18n-next77.fxControls.previous")} onClick={() => step(-1)}>
        ◂
      </button>
      <span className="st-value">{options[index] ?? String(index)}</span>
      <button type="button" className="st-btn st-next" aria-label={t("i18n-next77.fxControls.next")} onClick={() => step(1)}>
        ▸
      </button>
    </div>
  );
}
