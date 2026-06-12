/** @jsxImportSource @emotion/react */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useShallow } from "zustand/react/shallow";

import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import StopIcon from "@mui/icons-material/Stop";
import SkipPreviousIcon from "@mui/icons-material/SkipPrevious";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";

import {
  FlexRow,
  Text,
  Caption,
  NodeSlider,
  ToolbarIconButton
} from "../../ui_primitives";

import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useAssetStore } from "../../../stores/AssetStore";
import { PlaybackClock } from "./PlaybackClock";
import { AudioGraph } from "./AudioGraph";
import { PreviewCompositor } from "./PreviewCompositor";
import { getAssetUrl } from "../../../utils/assetHelpers";
import { useCombo } from "../../../stores/KeyPressedStore";

function formatTimecode(timeMs: number, fps: number): string {
  // Integer frame math: fractional rates (29.97, 23.976) would otherwise
  // leak fractions into the frame field. Non-drop-frame timecode.
  const fpsInt = Math.max(1, Math.round(fps));
  const totalFrames = Math.floor((timeMs / 1000) * fps);
  const framePart = totalFrames % fpsInt;
  const totalSeconds = Math.floor(totalFrames / fpsInt);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  const pad2 = (n: number) => String(n).padStart(2, "0");
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}:${pad2(framePart)}`;
}

function frameDeltaMs(fps: number): number {
  return 1000 / Math.max(1, fps);
}

const containerStyles = (theme: Theme) =>
  css({
    position: "relative",
    width: "100%",
    height: "100%",
    backgroundColor: theme.vars.palette.background.default,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    outline: "none"
  });

const viewportStyles = css({
  flex: "1 1 auto",
  position: "relative",
  overflow: "hidden",
  minHeight: 0
});

const controlBarStyles = (theme: Theme) =>
  css({
    flexShrink: 0,
    minHeight: 36,
    backgroundColor: theme.vars.palette.background.paper,
    borderTop: `1px solid ${theme.vars.palette.divider}`,
    paddingLeft: theme.spacing(0.5),
    paddingRight: theme.spacing(0.5),
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(0.5),
    overflow: "hidden",
    containerType: "inline-size",
    containerName: "timelinePreviewControls",
    ".toolbar-icon-button": {
      flexShrink: 0
    },
    "@container timelinePreviewControls (max-width: 560px)": {
      ".timeline-preview__secondary-control, .timeline-preview__fps": {
        display: "none"
      }
    },
    "@container timelinePreviewControls (max-width: 420px)": {
      ".timeline-preview__duration, .timeline-preview__fullscreen": {
        display: "none"
      }
    }
  });

const timecodeStyles = (theme: Theme) =>
  css({
    fontFamily: "monospace",
    fontSize: 12,
    color: theme.vars.palette.text.primary,
    letterSpacing: "0.05em",
    minWidth: 78,
    textAlign: "center",
    userSelect: "none"
  });

const fpsStyles = (theme: Theme) =>
  css({
    fontSize: 10,
    color: theme.vars.palette.text.disabled,
    minWidth: 36,
    textAlign: "right",
    userSelect: "none"
  });

const scrubberStyles = css({
  flex: "1 1 auto",
  minWidth: 56,
  paddingLeft: 6,
  paddingRight: 6,
  display: "flex",
  alignItems: "center"
});

const durationStyles = (theme: Theme) =>
  css({
    fontFamily: "monospace",
    fontSize: 11,
    color: theme.vars.palette.text.secondary,
    minWidth: 82,
    textAlign: "center",
    userSelect: "none"
  });

const dividerStyles = (theme: Theme) =>
  css({
    width: 1,
    height: 18,
    backgroundColor: theme.vars.palette.divider,
    flexShrink: 0,
    margin: `0 ${theme.spacing(0.5)}`
  });

export interface PreviewAreaProps {
  /** Sequence fps — read from the parent so no extra query is needed here. */
  fps?: number;
  /** Sequence pixel width (pass-through to compositor). */
  sequenceWidth?: number;
  /** Sequence pixel height (pass-through to compositor). */
  sequenceHeight?: number;
}

export const PreviewArea: React.FC<PreviewAreaProps> = memo(
  ({ fps = 30, sequenceWidth = 1920, sequenceHeight = 1080 }) => {
    const theme = useTheme();

    const {
      currentTimeMs,
      isPlaying,
      play,
      pause,
      stop,
      setCurrentTimeMs,
      seek,
      seekNonce
    } = useTimelinePlaybackStore(
      useShallow((s) => ({
        currentTimeMs: s.currentTimeMs,
        isPlaying: s.isPlaying,
        play: s.play,
        pause: s.pause,
        stop: s.stop,
        setCurrentTimeMs: s.setCurrentTimeMs,
        seek: s.seek,
        seekNonce: s.seekNonce
      }))
    );

    const { clips, tracks, durationMs } = useTimelineStore(
      useShallow((s) => ({
        clips: s.clips,
        tracks: s.tracks,
        durationMs: s.durationMs
      }))
    );

    const getAsset = useAssetStore((s) => s.get);

    const clockRef = useRef<PlaybackClock>(new PlaybackClock());
    const graphRef = useRef<AudioGraph>(new AudioGraph());
    /** Bumped by every play/pause/stop/seek gesture. Async continuations in
     *  handlePlay compare against their captured value and bail when a later
     *  gesture has superseded them, so stale audio is never scheduled. */
    const playGenRef = useRef(0);

    useEffect(() => {
      const clock = clockRef.current;
      const graph = graphRef.current;
      return () => {
        clock.stop();
        graph.dispose();
      };
    }, []);

    // Live-apply track gain/solo/mute and DSP chain changes so effect tweaks
    // are audible immediately without waiting for the next play/seek cycle.
    useEffect(() => {
      const graph = graphRef.current;
      if (!graph.context) return;
      graph.updateTracks(tracks);
    }, [tracks]);

    const handlePlay = useCallback(async () => {
      const generation = ++playGenRef.current;
      const isStale = () => playGenRef.current !== generation;

      const graph = graphRef.current;
      const clock = clockRef.current;

      // Read fresh to avoid stale closure when the user scrubs before pressing play.
      let startMs = useTimelinePlaybackStore.getState().currentTimeMs;
      // Pressing Play while parked at the end restarts from the top.
      if (durationMs > 0 && startMs >= durationMs - frameDeltaMs(fps)) {
        startMs = 0;
        setCurrentTimeMs(0);
      }

      play();

      const ctx = graph.getContext();
      await ctx.resume();
      if (isStale()) return;

      const activeAudioClips = clips.filter(
        (c) =>
          c.mediaType === "audio" &&
          !c.muted &&
          c.currentAssetId &&
          (c.status === "generated" ||
            c.status === "stale" ||
            c.status === "locked") &&
          c.startMs + c.durationMs > startMs
      );

      const scheduledClips = await Promise.all(
        activeAudioClips.map(async (clip) => {
          try {
            const asset = await getAsset(clip.currentAssetId!);
            const url = getAssetUrl(asset);
            if (!url) {
              return null;
            }
            return { clip, assetUrl: url };
          } catch {
            return null;
          }
        })
      );

      const validClips = scheduledClips.filter(
        (c): c is NonNullable<typeof c> => c !== null
      );
      if (isStale()) return;

      // Clear any sources an older gesture registered, right before
      // scheduling the new ones — so the latest gesture always wins.
      graph.stopAll();
      await graph.scheduleClips(validClips, tracks, startMs, isStale);
      if (isStale()) return;

      clock.start(
        startMs,
        1,
        validClips.length > 0 ? ctx : null,
        durationMs || Infinity
      );
    }, [play, clips, tracks, durationMs, fps, getAsset, setCurrentTimeMs]);

    const handlePause = useCallback(() => {
      playGenRef.current++;
      pause();
      clockRef.current.stop();
      graphRef.current.stopAll();
      graphRef.current.suspend();
    }, [pause]);

    const handleStop = useCallback(() => {
      playGenRef.current++;
      stop();
      clockRef.current.stop();
      graphRef.current.stopAll();
      graphRef.current.suspend();
    }, [stop]);

    // The clock auto-pauses via the store when it hits the timeline end —
    // a path that bypasses handlePause. Mirror its teardown here so audio
    // sources are released and the AudioContext suspends.
    useEffect(() => {
      if (isPlaying) return;
      playGenRef.current++;
      clockRef.current.stop();
      graphRef.current.stopAll();
      graphRef.current.suspend();
    }, [isPlaying]);

    // On external seek while playing, restart audio scheduling + clock at the
    // new position so audio re-aligns with the playhead. We key on seekNonce
    // (bumped only by store.seek()) so frame-by-frame clock updates don't
    // trigger a restart.
    useEffect(() => {
      if (seekNonce === 0 || !isPlaying) {
        return;
      }
      graphRef.current.stopAll();
      void handlePlay();
      // handlePlay reads the latest currentTimeMs from the store.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [seekNonce]);

    const handlePlayPauseToggle = useCallback(() => {
      if (isPlaying) {
        handlePause();
      } else {
        void handlePlay();
      }
    }, [isPlaying, handlePlay, handlePause]);

    const stepFrame = useCallback(
      (direction: 1 | -1) => {
        if (isPlaying) {
          return;
        }
        const delta = frameDeltaMs(fps) * direction;
        const next = Math.max(
          0,
          Math.min(durationMs || Infinity, currentTimeMs + delta)
        );
        setCurrentTimeMs(next);
      },
      [isPlaying, fps, durationMs, currentTimeMs, setCurrentTimeMs]
    );

    const stepBack = useCallback(() => stepFrame(-1), [stepFrame]);
    const stepForward = useCallback(() => stepFrame(1), [stepFrame]);

    /** All unique clip boundary timestamps (start + end), sorted ascending. */
    const clipBoundaries = useMemo(() => {
      const pts = new Set<number>();
      pts.add(0);
      for (const c of clips) {
        pts.add(c.startMs);
        pts.add(c.startMs + c.durationMs);
      }
      if (durationMs) {
        pts.add(durationMs);
      }
      return Array.from(pts).sort((a, b) => a - b);
    }, [clips, durationMs]);

    const jumpToPrevBoundary = useCallback(() => {
      const prev = clipBoundaries
        .filter((t) => t < currentTimeMs - 1)
        .at(-1);
      if (prev !== undefined) {
        if (isPlaying) {
          handleStop();
        }
        setCurrentTimeMs(prev);
      }
    }, [clipBoundaries, currentTimeMs, isPlaying, handleStop, setCurrentTimeMs]);

    const jumpToNextBoundary = useCallback(() => {
      const next = clipBoundaries.find((t) => t > currentTimeMs + 1);
      if (next !== undefined) {
        if (isPlaying) {
          handleStop();
        }
        setCurrentTimeMs(next);
      }
    }, [clipBoundaries, currentTimeMs, isPlaying, handleStop, setCurrentTimeMs]);

    const containerRef = useRef<HTMLDivElement>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [scrubMs, setScrubMs] = useState<number | null>(null);

    useEffect(() => {
      const onFullscreenChange = () => {
        setIsFullscreen(!!document.fullscreenElement);
      };
      document.addEventListener("fullscreenchange", onFullscreenChange);
      return () => {
        document.removeEventListener("fullscreenchange", onFullscreenChange);
      };
    }, []);

    const handleFullscreen = useCallback(() => {
      if (!containerRef.current) {
        return;
      }
      if (!document.fullscreenElement) {
        void containerRef.current.requestFullscreen();
      } else {
        void document.exitFullscreen();
      }
    }, []);

    const scrubMax = Math.max(1, durationMs || 0);
    const scrubValue = Math.min(scrubMax, scrubMs ?? currentTimeMs);

    const handleScrubChange = useCallback(
      (_event: Event, value: number | number[]) => {
        const next = Array.isArray(value) ? value[0] : value;
        setScrubMs(next);
        setCurrentTimeMs(next);
      },
      [setCurrentTimeMs]
    );

    const handleScrubCommit = useCallback(
      (_event: Event | React.SyntheticEvent, value: number | number[]) => {
        const next = Array.isArray(value) ? value[0] : value;
        setScrubMs(null);
        seek(next);
      },
      [seek]
    );

    useCombo([" "], handlePlayPauseToggle);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        switch (e.key) {
          case "ArrowLeft":
            e.preventDefault();
            if (e.shiftKey) {
              jumpToPrevBoundary();
            } else {
              stepFrame(-1);
            }
            break;
          case "ArrowRight":
            e.preventDefault();
            if (e.shiftKey) {
              jumpToNextBoundary();
            } else {
              stepFrame(1);
            }
            break;
          case "Home":
            e.preventDefault();
            if (isPlaying) {
              handleStop();
            }
            setCurrentTimeMs(0);
            break;
          case "End":
            e.preventDefault();
            if (isPlaying) {
              handleStop();
            }
            setCurrentTimeMs(durationMs || 0);
            break;
          default:
            break;
        }
      },
      [
        handlePlayPauseToggle,
        jumpToPrevBoundary,
        jumpToNextBoundary,
        stepFrame,
        isPlaying,
        handleStop,
        setCurrentTimeMs,
        durationMs
      ]
    );

    const timecode = formatTimecode(currentTimeMs, fps);
    const durationTimecode = formatTimecode(durationMs || 0, fps);

    return (
      <div
        ref={containerRef}
        css={containerStyles(theme)}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-label="Preview area"
        data-testid="preview-area"
      >
        <div css={viewportStyles}>
          <PreviewCompositor />
        </div>

        <div css={controlBarStyles(theme)}>
          <ToolbarIconButton
            icon={<SkipPreviousIcon />}
            tooltip="Previous clip boundary (Shift+←)"
            onClick={jumpToPrevBoundary}
            aria-label="Previous clip boundary"
            size="small"
            className="timeline-preview__secondary-control"
          />

          <ToolbarIconButton
            icon={<NavigateBeforeIcon />}
            tooltip="Step back one frame (←)"
            onClick={stepBack}
            disabled={isPlaying}
            aria-label="Step back one frame"
            size="small"
            className="timeline-preview__secondary-control"
          />

          <ToolbarIconButton
            icon={isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
            tooltip={isPlaying ? "Pause (Space)" : "Play (Space)"}
            onClick={handlePlayPauseToggle}
            aria-label={isPlaying ? "Pause" : "Play"}
            variant="primary"
            size="small"
          />

          <ToolbarIconButton
            icon={<StopIcon />}
            tooltip="Stop and return to start"
            onClick={handleStop}
            aria-label="Stop"
            size="small"
          />

          <ToolbarIconButton
            icon={<NavigateNextIcon />}
            tooltip="Step forward one frame (→)"
            onClick={stepForward}
            disabled={isPlaying}
            aria-label="Step forward one frame"
            size="small"
            className="timeline-preview__secondary-control"
          />

          <ToolbarIconButton
            icon={<SkipNextIcon />}
            tooltip="Next clip boundary (Shift+→)"
            onClick={jumpToNextBoundary}
            aria-label="Next clip boundary"
            size="small"
            className="timeline-preview__secondary-control"
          />

          <div css={dividerStyles(theme)} className="timeline-preview__secondary-control" />
          <Text css={timecodeStyles(theme)}>{timecode}</Text>
          <div css={scrubberStyles}>
            <NodeSlider
              aria-label="Scrub timeline"
              min={0}
              max={scrubMax}
              step={frameDeltaMs(fps)}
              value={scrubValue}
              onChange={handleScrubChange}
              onChangeCommitted={handleScrubCommit}
              density="compact"
            />
          </div>
          <Caption css={durationStyles(theme)} className="timeline-preview__duration">
            /{durationTimecode}
          </Caption>
          <Caption css={fpsStyles(theme)} className="timeline-preview__fps">
            {fps} fps
          </Caption>

          <ToolbarIconButton
            icon={isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
            tooltip={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={handleFullscreen}
            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            size="small"
            className="timeline-preview__fullscreen"
          />
        </div>
      </div>
    );
  }
);

PreviewArea.displayName = "PreviewArea";
