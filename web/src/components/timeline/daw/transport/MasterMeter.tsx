/** @jsxImportSource @emotion/react */
/**
 * A compact peak meter on the master channel. Reads the audio graph's master
 * analyser on animation frames while playing and writes the bar straight to
 * the DOM, so a playing timeline does not re-render the transport.
 */

import React, { memo, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { useTimelinePlaybackStore } from "../../../../stores/timeline/TimelinePlaybackStore";
import { BORDER_RADIUS, SPACING } from "../../../ui_primitives";

/** The meter's floor: anything quieter reads as empty. */
const FLOOR_DB = -60;
/** dB per second the bar falls back when the signal drops. */
const RELEASE_DB_PER_SEC = 30;

/** Level, in dB full scale, mapped onto the bar's 0..1 fill. */
export function meterFill(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.min(1, Math.max(0, (db - FLOOR_DB) / -FLOOR_DB));
}

/** Peak of a block of samples, in dBFS. */
export function peakDb(samples: Float32Array): number {
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

const meterStyles = (theme: Theme) =>
  css({
    position: "relative",
    width: theme.spacing(SPACING.xxxl * 2),
    height: theme.spacing(SPACING.sm),
    flexShrink: 0,
    overflow: "hidden",
    borderRadius: BORDER_RADIUS.xs,
    backgroundColor: theme.vars.palette.action.selected,
    // The empty meter still reads as a meter against the strip.
    boxShadow: `inset 0 0 0 1px ${theme.vars.palette.divider}`,
    ".master-meter__fill": {
      position: "absolute",
      inset: 0,
      clipPath: "inset(0 100% 0 0)",
      // Green to the -12 dB mark, amber to -3 dB, red above.
      background: `linear-gradient(90deg, ${theme.vars.palette.success.main} 0%, ${theme.vars.palette.success.main} 80%, ${theme.vars.palette.warning.main} 80%, ${theme.vars.palette.warning.main} 95%, ${theme.vars.palette.error.main} 95%)`
    }
  });

export const MasterMeter: React.FC = memo(() => {
  const { t } = useTranslation();
  const theme = useTheme();
  const audioGraph = useTimelinePlaybackStore((s) => s.audioGraph);
  const isPlaying = useTimelinePlaybackStore((s) => s.isPlaying);
  const fillRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const levelRef = useRef(-Infinity);

  useEffect(() => {
    const fill = fillRef.current;
    if (!fill || !audioGraph) return;
    let frame: number | null = null;
    let last = performance.now();
    let samples: Float32Array<ArrayBuffer> | null = null;
    const tick = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      const analyser = audioGraph.getMasterAnalyser();
      let db = -Infinity;
      if (analyser && isPlaying) {
        if (!samples || samples.length !== analyser.fftSize) {
          samples = new Float32Array(analyser.fftSize);
        }
        analyser.getFloatTimeDomainData(samples);
        db = peakDb(samples);
      }
      const fallen = levelRef.current - RELEASE_DB_PER_SEC * dt;
      levelRef.current = Math.max(db, Number.isFinite(fallen) ? fallen : -Infinity);
      const level = levelRef.current;
      fill.style.clipPath = `inset(0 ${(1 - meterFill(level)) * 100}% 0 0)`;
      rootRef.current?.setAttribute(
        "aria-valuenow",
        String(Math.round(Number.isFinite(level) ? Math.max(FLOOR_DB, level) : FLOOR_DB))
      );
      // Keep running after a stop until the bar has fallen to the floor.
      if (isPlaying || meterFill(level) > 0) {
        frame = requestAnimationFrame(tick);
      } else {
        frame = null;
      }
    };
    frame = requestAnimationFrame(tick);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [audioGraph, isPlaying]);

  const meterCss = useMemo(() => meterStyles(theme), [theme]);
  return (
    <div
      ref={rootRef}
      css={meterCss}
      role="meter"
      aria-label={t("batch2_26.daw.transport.masterLevel")}
      aria-valuemin={FLOOR_DB}
      aria-valuemax={0}
      aria-valuenow={FLOOR_DB}
      data-testid="daw-master-meter"
    >
      <div ref={fillRef} className="master-meter__fill" />
    </div>
  );
});

MasterMeter.displayName = "MasterMeter";
