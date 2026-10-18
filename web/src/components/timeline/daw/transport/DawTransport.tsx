/** @jsxImportSource @emotion/react */
/**
 * The DAW-mode transport strip. It replaces the preview's control bar when the
 * preview is mounted audio-only: play, stop, return to start, loop, metronome,
 * the position in bars:beats:ticks and timecode, tempo and time signature, the
 * listener volume and a master level meter.
 *
 * Playback itself stays with `PreviewArea`, which owns the audio graph and
 * the clock and passes its handlers in. The loop and the metronome restart a
 * running playback through a seek, the same path a rate change takes.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { resolveTempo } from "@nodetool-ai/timeline";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import StopIcon from "@mui/icons-material/Stop";
import SkipPreviousIcon from "@mui/icons-material/SkipPrevious";
import RepeatIcon from "@mui/icons-material/Repeat";
import AvTimerOutlinedIcon from "@mui/icons-material/AvTimerOutlined";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import VolumeDownIcon from "@mui/icons-material/VolumeDown";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";

import {
  useTimelinePlaybackStore,
  useTimelinePlaybackStoreApi
} from "../../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineStore, useTimelineStoreApi } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStoreApi } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineLayoutStore } from "../../../../stores/timeline/TimelineLayoutStore";
import {
  NumberField,
  SelectField,
  Slider,
  SPACING,
  Text,
  ToolbarIconButton,
  TYPOGRAPHY
} from "../../../ui_primitives";
import { formatTimecode } from "../../Inspector/InspectorPrimitives.helpers";
import { defaultLoopRange, formatBarsBeatsTicks } from "./loopRange";
import { MasterMeter } from "./MasterMeter";

const MIN_BPM = 20;
const MAX_BPM = 300;

const TIME_SIGNATURES = ["2/4", "3/4", "4/4", "5/4", "6/8", "7/8", "9/8", "12/8"] as const;

export interface DawTransportProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onStop: () => void;
  fps: number;
  volume: number;
  isMuted: boolean;
  onVolumeChange: (event: Event, value: number | number[]) => void;
  onToggleMute: () => void;
  /** Tooltip suffix naming the play/pause key. */
  playPauseKey: string;
}

const stripStyles = (theme: Theme) =>
  css({
    flexShrink: 0,
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: theme.spacing(SPACING.lg),
    rowGap: theme.spacing(SPACING.xs),
    minHeight: theme.spacing(SPACING.xxxl + SPACING.md),
    padding: theme.spacing(SPACING.xs, SPACING.md),
    backgroundColor: theme.vars.palette.background.paper,
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    ".daw-transport__group": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(SPACING.micro),
      flexShrink: 0
    },
    ".daw-transport__position": {
      ...TYPOGRAPHY.mono.label,
      fontVariantNumeric: "tabular-nums",
      color: theme.vars.palette.text.primary,
      userSelect: "none",
      minWidth: theme.spacing(SPACING.xxxl * 2 + SPACING.lg)
    },
    ".daw-transport__timecode": {
      ...TYPOGRAPHY.mono.caption,
      fontVariantNumeric: "tabular-nums",
      color: theme.vars.palette.text.secondary,
      userSelect: "none"
    },
    ".daw-transport__bpm": {
      width: theme.spacing(SPACING.xxxl * 3)
    },
    ".daw-transport__signature": {
      width: theme.spacing(SPACING.xxxl * 2 + SPACING.lg)
    },
    ".daw-transport__volume": {
      width: theme.spacing(SPACING.xxxl * 2),
      paddingLeft: theme.spacing(SPACING.xs),
      paddingRight: theme.spacing(SPACING.xs),
      display: "flex",
      alignItems: "center"
    },
    // Output sits at the far end of the strip, the way a mixer's master
    // section does, with its label reading into the meter.
    ".daw-transport__output": {
      marginLeft: "auto",
      gap: theme.spacing(SPACING.sm)
    },
    ".daw-transport__master": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(SPACING.sm)
    },
    ".daw-transport__master-label": {
      ...TYPOGRAPHY.mono.caption,
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      userSelect: "none"
    },
    // A phone gets two rows: the timecode repeats the bar position and the
    // device volume does the slider's job, so both give up their width.
    [theme.breakpoints.down("sm")]: {
      columnGap: theme.spacing(SPACING.md),
      padding: theme.spacing(SPACING.xs, SPACING.sm),
      ".daw-transport__timecode, .daw-transport__volume": {
        display: "none"
      },
      ".daw-transport__position": {
        minWidth: 0
      },
      ".daw-transport__bpm": {
        width: theme.spacing(SPACING.xxxl * 2 + SPACING.xxl)
      }
    }
  });

export const DawTransport: React.FC<DawTransportProps> = memo(
  ({ isPlaying, onPlayPause, onStop, fps, volume, isMuted, onVolumeChange, onToggleMute, playPauseKey }) => {
    const theme = useTheme();
    const playbackApi = useTimelinePlaybackStoreApi();
    const timelineApi = useTimelineStoreApi();
    const uiApi = useTimelineUIStoreApi();
    const currentTimeMs = useTimelinePlaybackStore((s) => s.currentTimeMs);
    const subscribeTime = useTimelinePlaybackStore((s) => s.subscribeTime);
    const loopOn = useTimelineLayoutStore((s) => s.loopPlayback);
    const setLoopPlayback = useTimelineLayoutStore((s) => s.setLoopPlayback);
    const tempo = useTimelineStore((s) => resolveTempo(s));
    const setTempo = useTimelineStore((s) => s.setTempo);
    const metronomeOn = useTimelineLayoutStore((s) => s.metronomeEnabled);
    const toggleMetronome = useTimelineLayoutStore((s) => s.toggleMetronome);

    /** Re-align a running playback with a changed loop or metronome. */
    const restartIfPlaying = useCallback(() => {
      const playback = playbackApi.getState();
      if (playback.isPlaying) playback.seek(playback.getTimeMs());
    }, [playbackApi]);

    const returnToStart = useCallback(() => {
      const playback = playbackApi.getState();
      if (playback.isPlaying) playback.seek(0);
      else playback.setCurrentTimeMs(0);
    }, [playbackApi]);

    // Loop is the editor-wide loop toggle. Turning it on with no out point
    // marks the selection or the bars on screen; turning it off keeps the
    // marks, which then no longer bound playback.
    const toggleLoop = useCallback(() => {
      const playback = playbackApi.getState();
      if (!loopOn && playback.rangeOutMs === null) {
        const doc = timelineApi.getState();
        const ui = uiApi.getState();
        const selectedClips = doc.clips.filter((clip) => ui.selectedClipIds.has(clip.id));
        const viewStartMs = ui.scrollLeftPx * ui.msPerPx;
        const range = defaultLoopRange({
          selectedClips,
          viewStartMs,
          viewEndMs: viewStartMs + ui.lanesViewportWidthPx * ui.msPerPx,
          playheadMs: playback.getTimeMs(),
          tempo: resolveTempo(doc)
        });
        playback.clearRange();
        playback.setRangeIn(range.inMs);
        playback.setRangeOut(range.outMs);
      }
      setLoopPlayback(!loopOn);
      restartIfPlaying();
    }, [loopOn, playbackApi, timelineApi, uiApi, restartIfPlaying, setLoopPlayback]);

    const handleMetronome = useCallback(() => {
      toggleMetronome();
      restartIfPlaying();
    }, [toggleMetronome, restartIfPlaying]);

    // Position readouts: written to the DOM while playing, so playback does
    // not re-render the strip on every frame.
    const barsRef = useRef<HTMLElement>(null);
    const timecodeRef = useRef<HTMLElement>(null);
    useEffect(() => {
      if (!isPlaying) return;
      return subscribeTime((ms) => {
        if (barsRef.current) barsRef.current.textContent = formatBarsBeatsTicks(ms, tempo);
        if (timecodeRef.current) timecodeRef.current.textContent = formatTimecode(ms, fps);
      });
    }, [isPlaying, subscribeTime, tempo, fps]);

    const [bpmText, setBpmText] = useState(String(tempo.bpm));
    useEffect(() => setBpmText(String(tempo.bpm)), [tempo.bpm]);
    const commitBpm = useCallback(() => {
      const bpm = Number.parseFloat(bpmText);
      if (!Number.isFinite(bpm)) {
        setBpmText(String(tempo.bpm));
        return;
      }
      const next = Math.round(Math.min(MAX_BPM, Math.max(MIN_BPM, bpm)) * 100) / 100;
      setBpmText(String(next));
      if (next !== tempo.bpm) {
        setTempo({ ...tempo, bpm: next });
        restartIfPlaying();
      }
    }, [bpmText, restartIfPlaying, setTempo, tempo]);
    const handleBpmKeyDown = useCallback(
      (event: React.KeyboardEvent) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commitBpm();
        } else if (event.key === "Escape") {
          setBpmText(String(tempo.bpm));
        }
      },
      [commitBpm, tempo.bpm]
    );

    const signature = `${tempo.timeSignature.beatsPerBar}/${tempo.timeSignature.beatUnit}`;
    const signatureOptions = useMemo(() => {
      const values: string[] = [...TIME_SIGNATURES];
      if (!values.includes(signature)) values.push(signature);
      return values.map((value) => ({ value, label: value }));
    }, [signature]);
    const handleSignature = useCallback(
      (value: string) => {
        const [beatsPerBar, beatUnit] = value.split("/").map(Number);
        if (!beatsPerBar || !beatUnit) return;
        setTempo({ ...tempo, timeSignature: { beatsPerBar, beatUnit } });
        restartIfPlaying();
      },
      [restartIfPlaying, setTempo, tempo]
    );

    const isSilent = isMuted || volume === 0;
    const stripCss = useMemo(() => stripStyles(theme), [theme]);

    return (
      <div css={stripCss} role="toolbar" aria-label="Transport" data-testid="daw-transport">
        <div className="daw-transport__group">
          <ToolbarIconButton
            icon={<SkipPreviousIcon />}
            tooltip="Return to start"
            aria-label="Return to start"
            onClick={returnToStart}
            size="small"
          />
          <ToolbarIconButton
            icon={isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
            tooltip={`${isPlaying ? "Pause" : "Play"} (${playPauseKey})`}
            aria-label={isPlaying ? "Pause" : "Play"}
            onClick={onPlayPause}
            variant="primary"
            size="small"
          />
          <ToolbarIconButton
            icon={<StopIcon />}
            tooltip="Stop and return to start"
            aria-label="Stop"
            onClick={onStop}
            size="small"
          />
          <ToolbarIconButton
            icon={<RepeatIcon />}
            tooltip={loopOn ? "Loop on: plays the in to out range" : "Loop the selection or the bars on screen"}
            aria-label="Loop"
            aria-pressed={loopOn}
            active={loopOn}
            onClick={toggleLoop}
            size="small"
          />
          <ToolbarIconButton
            icon={<AvTimerOutlinedIcon />}
            tooltip={metronomeOn ? "Metronome on" : "Metronome off"}
            aria-label="Metronome"
            aria-pressed={metronomeOn}
            active={metronomeOn}
            onClick={handleMetronome}
            size="small"
          />
        </div>

        <div className="daw-transport__group" aria-label="Position">
          <Text ref={barsRef} component="span" className="daw-transport__position" aria-label="Bars, beats and ticks">
            {formatBarsBeatsTicks(currentTimeMs, tempo)}
          </Text>
          <Text ref={timecodeRef} component="span" className="daw-transport__timecode" aria-label="Timecode">
            {formatTimecode(currentTimeMs, fps)}
          </Text>
        </div>

        <div className="daw-transport__group">
          <NumberField
            className="daw-transport__bpm"
            ariaLabel="Tempo in BPM"
            value={bpmText}
            onValueChange={setBpmText}
            onBlur={commitBpm}
            onKeyDown={handleBpmKeyDown}
            min={MIN_BPM}
            max={MAX_BPM}
            step={1}
            unit="BPM"
          />
          <SelectField
            label="Time signature"
            hideLabel
            size="small"
            value={signature}
            options={signatureOptions}
            onChange={handleSignature}
            className="daw-transport__signature"
          />
        </div>

        <div className="daw-transport__group daw-transport__output">
          <ToolbarIconButton
            icon={isSilent ? <VolumeOffIcon /> : volume < 0.5 ? <VolumeDownIcon /> : <VolumeUpIcon />}
            tooltip={isSilent ? "Unmute" : "Mute"}
            aria-label={isSilent ? "Unmute" : "Mute"}
            aria-pressed={isSilent}
            onClick={onToggleMute}
            size="small"
          />
          <div className="daw-transport__volume">
            <Slider
              aria-label="Volume"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={onVolumeChange}
              getAriaValueText={(v) => `${Math.round(v * 100)}%`}
              density="compact"
            />
          </div>
          <div className="daw-transport__master">
            <Text component="span" className="daw-transport__master-label" aria-hidden>
              Master
            </Text>
            <MasterMeter />
          </div>
        </div>
      </div>
    );
  }
);

DawTransport.displayName = "DawTransport";
