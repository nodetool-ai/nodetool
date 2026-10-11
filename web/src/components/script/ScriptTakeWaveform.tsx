/** @jsxImportSource @emotion/react */
import { memo, useMemo } from "react";
import {
  Box,
  FlexRow,
  Caption,
  BORDER_RADIUS,
  CONTROL,
  MOTION,
  SPACING
} from "../ui_primitives";
import type { ScriptTake } from "../../stores/script/ScriptStore";
import { useAssetUrl } from "../timeline/Tracks/useAssetUrl";
import { useAudioPeaks } from "../timeline/Tracks/useAudioPeaks";
import { samplePeaksWindow } from "../timeline/Tracks/audioPeaks";

/** Bars drawn across the strip. */
export const WAVEFORM_BARS = 48;

/** Shortest bar, as a fraction of the strip height, so silence still reads. */
const FLOOR = 0.12;

/**
 * Bar heights from the take's word timings: a swell over each spoken word,
 * the floor in the gaps between them. Used until the server peaks land, or
 * when they never do (an asset the peaks route cannot read).
 */
export const wordEnvelope = (take: ScriptTake, bars: number): number[] => {
  const out = new Array<number>(bars).fill(FLOOR);
  if (take.durationMs <= 0) {
    return out;
  }
  const msPerBar = take.durationMs / bars;
  for (const word of take.words) {
    const span = Math.max(1, word.endMs - word.startMs);
    for (let i = 0; i < bars; i += 1) {
      const mid = (i + 0.5) * msPerBar;
      if (mid < word.startMs || mid > word.endMs) continue;
      const swell = Math.sin(((mid - word.startMs) / span) * Math.PI);
      out[i] = Math.max(out[i], FLOOR + (1 - FLOOR) * swell);
    }
  }
  return out;
};

/** Normalises peaks so the loudest bar fills the strip. */
const normalise = (peaks: Float32Array): number[] => {
  let max = 0;
  for (const v of peaks) {
    if (v > max) max = v;
  }
  return Array.from(peaks, (v) =>
    max > 0 ? Math.max(FLOOR, v / max) : FLOOR
  );
};

interface ScriptTakeWaveformProps {
  take: ScriptTake | undefined;
  /** The speaker's colour; the strip is tinted with it. */
  color: string;
  /** The take no longer matches the line's text or voice. */
  stale: boolean;
  /** Plays the take; the strip is a button when set. */
  onPlay?: () => void;
}

/**
 * The current take as a strip of bars in the speaker's colour, the way the
 * script reads at a glance: which lines have audio, how long each runs, and
 * which takes are out of date. An unvoiced line gets an empty dashed strip.
 */
const ScriptTakeWaveform = ({
  take,
  color,
  stale,
  onPlay
}: ScriptTakeWaveformProps) => {
  const url = useAssetUrl(take?.assetId);
  const { peaks, durationMs } = useAudioPeaks(take?.assetId, url);

  const bars = useMemo(() => {
    if (!take) {
      return [];
    }
    if (peaks && peaks.length > 0 && durationMs) {
      return normalise(
        samplePeaksWindow(peaks, durationMs, 0, durationMs, WAVEFORM_BARS)
      );
    }
    return wordEnvelope(take, WAVEFORM_BARS);
  }, [take, peaks, durationMs]);

  if (!take) {
    return (
      <FlexRow
        align="center"
        justify="center"
        fullWidth
        sx={{
          height: CONTROL.height.xl,
          borderRadius: BORDER_RADIUS.sm,
          border: "1px dashed",
          borderColor: "divider"
        }}
      >
        <Caption color="secondary">Not voiced yet</Caption>
      </FlexRow>
    );
  }

  const interactive = !!onPlay;

  return (
    <Box
      component={interactive ? "button" : "div"}
      type={interactive ? "button" : undefined}
      onClick={onPlay}
      aria-label={interactive ? "Play take" : undefined}
      data-testid="script-take-waveform"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: SPACING.micro,
        width: "100%",
        height: CONTROL.height.xl,
        paddingX: SPACING.lg,
        paddingY: SPACING.none,
        font: "inherit",
        borderRadius: BORDER_RADIUS.sm,
        border: "1px solid",
        borderColor: stale
          ? "rgba(var(--palette-warning-mainChannel) / 0.45)"
          : `color-mix(in srgb, ${color} 28%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 9%, transparent)`,
        cursor: interactive ? "pointer" : "default",
        transition: MOTION.background,
        "&:hover": interactive
          ? { backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }
          : undefined,
        "&:focus-visible": {
          outline: "2px solid",
          outlineColor: "primary.main",
          outlineOffset: "2px"
        }
      }}
    >
      {bars.map((v, i) => (
        <Box
          key={i}
          component="span"
          sx={{
            flex: 1,
            height: `${Math.round(v * 70)}%`,
            borderRadius: BORDER_RADIUS.xs,
            backgroundColor: color,
            opacity: stale ? 0.3 : 0.75
          }}
        />
      ))}
    </Box>
  );
};

export default memo(ScriptTakeWaveform);
