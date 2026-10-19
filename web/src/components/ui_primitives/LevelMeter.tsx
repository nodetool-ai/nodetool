/** @jsxImportSource @emotion/react */
/**
 * LevelMeter
 *
 * A vertical peak meter for one or more channels, with a peak-hold line per
 * channel and a latching clip light. It reads its levels on its own
 * animation frame loop and writes them straight to the DOM, so a playing
 * mixer does not re-render React sixty times a second.
 *
 * - `read` returns each channel's current peak as linear amplitude (1 is
 *   0 dBFS), or null when there is no source yet.
 * - `toPosition` maps decibels to the height, 0 to 1, so the meter can share
 *   a fader's scale. Default linear from `minDb` to `maxDb`.
 * - The loop runs only while `active` and on screen (IntersectionObserver),
 *   and stops while the page is hidden.
 * - The clip light latches at 0 dBFS; pressing it clears it.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { BORDER_RADIUS } from "./tokens";
import { SPACING } from "./spacing";

export interface LevelMeterProps {
  /** Each channel's current peak, linear. */
  read: () => ArrayLike<number> | null;
  /** Number of bars. Default 2. */
  channels?: number;
  /** Decibels → height 0..1. */
  toPosition?: (db: number) => number;
  /** Bottom of the default linear scale. Default -60. */
  minDb?: number;
  /** Top of the default linear scale. Default +6. */
  maxDb?: number;
  /** Run the loop. Default true. */
  active?: boolean;
  /** How long the peak line holds before it falls, ms. Default 1500. */
  holdMs?: number;
  /** Accessible name, e.g. "Bass level". */
  label: string;
  className?: string;
}

/** How fast the bar and a released peak line fall, dB per second. */
const FALL_DB_PER_SEC = 24;
const SILENT_DB = -120;
const BAR_WIDTH = 6;

export const linearToDb = (amplitude: number): number =>
  amplitude > 0 ? Math.max(SILENT_DB, 20 * Math.log10(amplitude)) : SILENT_DB;

const meterStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    height: "100%",
    minHeight: 0,
    gap: theme.spacing(SPACING.micro),
    ".level-meter__clip": {
      width: "100%",
      height: BAR_WIDTH,
      padding: 0,
      border: "none",
      borderRadius: BORDER_RADIUS.xs,
      backgroundColor: theme.vars.palette.action.selected,
      cursor: "pointer"
    },
    ".level-meter__clip[data-clipped='true']": {
      backgroundColor: theme.vars.palette.error.main
    },
    ".level-meter__clip:focus-visible": {
      outline: `2px solid ${theme.vars.palette.primary.main}`,
      outlineOffset: 1
    },
    ".level-meter__bars": {
      display: "flex",
      flexDirection: "row",
      flex: "1 1 auto",
      minHeight: 0,
      gap: theme.spacing(SPACING.micro)
    },
    ".level-meter__bar": {
      position: "relative",
      width: BAR_WIDTH,
      height: "100%",
      borderRadius: BORDER_RADIUS.xs,
      overflow: "hidden",
      backgroundColor: theme.vars.palette.action.selected
    },
    ".level-meter__fill": {
      position: "absolute",
      inset: 0,
      background: `linear-gradient(to top, ${theme.vars.palette.success.main} 0%, ${theme.vars.palette.success.main} 70%, ${theme.vars.palette.warning.main} 85%, ${theme.vars.palette.error.main} 100%)`,
      clipPath: "inset(100% 0 0 0)",
      willChange: "clip-path"
    },
    ".level-meter__peak": {
      position: "absolute",
      left: 0,
      right: 0,
      height: 2,
      bottom: 0,
      backgroundColor: theme.vars.palette.text.primary,
      opacity: 0,
      transform: "translateY(50%)"
    }
  });

export const LevelMeter = memo(function LevelMeter({
  read,
  channels = 2,
  toPosition,
  minDb = -60,
  maxDb = 6,
  active = true,
  holdMs = 1500,
  label,
  className
}: LevelMeterProps): React.JSX.Element {
  const theme = useTheme();
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const fills = useRef<(HTMLDivElement | null)[]>([]);
  const peaks = useRef<(HTMLDivElement | null)[]>([]);
  const clipRef = useRef<HTMLButtonElement>(null);
  const readRef = useRef(read);
  readRef.current = read;
  const toPosRef = useRef(toPosition);
  toPosRef.current = toPosition;

  const position = useCallback(
    (db: number): number => {
      const p = toPosRef.current
        ? toPosRef.current(db)
        : (db - minDb) / (maxDb - minDb || 1);
      return Math.min(1, Math.max(0, p));
    },
    [minDb, maxDb]
  );

  const clearClip = useCallback(() => {
    clipRef.current?.setAttribute("data-clipped", "false");
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!active || !root) return;
    const shown = new Array<number>(channels).fill(SILENT_DB);
    const held = new Array<number>(channels).fill(SILENT_DB);
    const heldAt = new Array<number>(channels).fill(0);
    let frame = 0;
    let last = performance.now();
    let visible = true;
    let running = false;

    const draw = (): void => {
      for (let c = 0; c < channels; c += 1) {
        const fill = fills.current[c];
        const peak = peaks.current[c];
        const p = position(shown[c]);
        if (fill) fill.style.clipPath = `inset(${((1 - p) * 100).toFixed(2)}% 0 0 0)`;
        if (peak) {
          const hp = position(held[c]);
          peak.style.bottom = `${(hp * 100).toFixed(2)}%`;
          peak.style.opacity = held[c] > SILENT_DB ? "1" : "0";
        }
      }
    };

    const tick = (now: number): void => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const levels = readRef.current();
      for (let c = 0; c < channels; c += 1) {
        const amplitude = levels ? levels[Math.min(c, levels.length - 1)] ?? 0 : 0;
        const db = linearToDb(amplitude);
        if (amplitude >= 1) clipRef.current?.setAttribute("data-clipped", "true");
        shown[c] = Math.max(db, shown[c] - FALL_DB_PER_SEC * dt);
        if (db >= held[c]) {
          held[c] = db;
          heldAt[c] = now;
        } else if (now - heldAt[c] > holdMs) {
          held[c] = Math.max(shown[c], held[c] - FALL_DB_PER_SEC * dt);
        }
      }
      draw();
    };

    const start = (): void => {
      if (running || !visible || document.visibilityState === "hidden") return;
      running = true;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };
    const stop = (): void => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(frame);
    };

    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVisibility);
    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver((entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
        if (visible) start();
        else stop();
      });
      observer.observe(root);
    }
    start();
    return () => {
      stop();
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      shown.fill(SILENT_DB);
      held.fill(SILENT_DB);
      draw();
    };
  }, [active, channels, holdMs, position]);

  const styles = useMemo(() => meterStyles(theme), [theme]);
  const bars = Array.from({ length: channels }, (_, c) => c);

  return (
    <div ref={rootRef} css={styles} className={className} role="group" aria-label={label}>
      <button
        ref={clipRef}
        type="button"
        className="level-meter__clip"
        data-clipped="false"
        aria-label={t("i18n-next91.levelMeter.clearClipIndicator", { label })}
        onClick={clearClip}
      />
      <div className="level-meter__bars" aria-hidden="true">
        {bars.map((c) => (
          <div key={c} className="level-meter__bar">
            <div
              className="level-meter__fill"
              ref={(el) => {
                fills.current[c] = el;
              }}
            />
            <div
              className="level-meter__peak"
              ref={(el) => {
                peaks.current[c] = el;
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
});
