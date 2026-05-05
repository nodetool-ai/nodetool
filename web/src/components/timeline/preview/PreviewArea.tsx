/** @jsxImportSource @emotion/react */
/**
 * PreviewArea
 *
 * Wraps the PreviewCompositor with transport controls:
 *   - Play / Pause (Space key)
 *   - Stop (returns playhead to 0)
 *   - Step back one frame (← when paused)
 *   - Step forward one frame (→ when paused)
 *   - Jump to previous / next clip boundary
 *   - Timecode display (HH:MM:SS:FF)
 *   - FPS readout
 *   - Fullscreen toggle
 *
 * Also owns the PlaybackClock and AudioGraph lifecycle.
 *
 * When playback starts:
 *   1. AudioGraph.getContext() initialises the AudioContext (user-gesture OK).
 *   2. PlaybackClock.start() begins the RAF loop, writing currentTimeMs to
 *      TimelinePlaybackStore.
 *   3. PreviewCompositor reads currentTimeMs and composites the frame.
 *
 * When paused / stopped, PlaybackClock is stopped and AudioGraph.stopAll() is
 * called. The compositor continues to render the still frame at the playhead.
 */

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
import { shallow } from "zustand/shallow";

import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import StopIcon from "@mui/icons-material/Stop";
import SkipPreviousIcon from "@mui/icons-material/SkipPrevious";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import FitScreenIcon from "@mui/icons-material/FitScreen";

import {
  FlexColumn,
  FlexRow,
  Text,
  Caption,
  ToolbarIconButton
} from "../../ui_primitives";

import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useAssetStore } from "../../../stores/AssetStore";

import { PlaybackClock } from "./PlaybackClock";
import { AudioGraph } from "./AudioGraph";
import { PreviewCompositor } from "./PreviewCompositor";

// ── Constants ──────────────────────────────────────────────────────────────

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Format a millisecond value as `HH:MM:SS:FF` timecode.
 */
function formatTimecode(timeMs: number, fps: number): string {
  const totalFrames = Math.floor((timeMs / 1000) * fps);
  const framePart = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  const pad2 = (n: number) => String(n).padStart(2, "0");
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}:${pad2(framePart)}`;
}

/**
 * Compute the frame step in ms for the given fps.
 */
function frameDeltaMs(fps: number): number {
  return 1000 / Math.max(1, fps);
}

// ── Styles ─────────────────────────────────────────────────────────────────

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
    height: 36,
    backgroundColor: theme.vars.palette.background.paper,
    borderTop: `1px solid ${theme.vars.palette.divider}`,
    paddingLeft: theme.spacing(0.5),
    paddingRight: theme.spacing(1),
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(0.25)
  });

const timecodeStyles = (theme: Theme) =>
  css({
    fontFamily: "monospace",
    fontSize: 12,
    color: theme.vars.palette.text.primary,
    letterSpacing: "0.05em",
    minWidth: 88,
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

const dividerStyles = (theme: Theme) =>
  css({
    width: 1,
    height: 18,
    backgroundColor: theme.vars.palette.divider,
    flexShrink: 0,
    margin: `0 ${theme.spacing(0.25)}`
  });

// ── Component ──────────────────────────────────────────────────────────────

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

    // ── Store state ────────────────────────────────────────────────────────

    const { currentTimeMs, isPlaying, play, pause, stop, setCurrentTimeMs } =
      useTimelinePlaybackStore(
        (s) => ({
          currentTimeMs: s.currentTimeMs,
          isPlaying: s.isPlaying,
          play: s.play,
          pause: s.pause,
          stop: s.stop,
          setCurrentTimeMs: s.setCurrentTimeMs
        }),
        shallow
      );

    const { clips, tracks, durationMs } = useTimelineStore(
      (s) => ({
        clips: s.clips,
        tracks: s.tracks,
        durationMs: s.durationMs
      }),
      shallow
    );

    const getAsset = useAssetStore((s) => s.get);

    // ── PlaybackClock + AudioGraph singletons ──────────────────────────────

    const clockRef = useRef<PlaybackClock>(new PlaybackClock());
    const graphRef = useRef<AudioGraph>(new AudioGraph());

    // Clean up on unmount.
    useEffect(() => {
      const clock = clockRef.current;
      const graph = graphRef.current;
      return () => {
        clock.stop();
        graph.dispose();
      };
    }, []);

    // ── Playback control ───────────────────────────────────────────────────

    const handlePlay = useCallback(async () => {
      play();
      const graph = graphRef.current;
      const clock = clockRef.current;

      // Initialise AudioContext on first user gesture.
      const ctx = graph.getContext();
      await ctx.resume();

      // Schedule any active audio clips.
      const activeAudioClips = clips.filter(
        (c) =>
          c.mediaType === "audio" &&
          !c.muted &&
          c.currentAssetId &&
          (c.status === "generated" ||
            c.status === "stale" ||
            c.status === "locked") &&
          c.startMs < currentTimeMs + c.durationMs &&
          c.startMs + c.durationMs > currentTimeMs
      );

      // Resolve URLs for active audio clips.
      const scheduledClips = await Promise.all(
        activeAudioClips.map(async (clip) => {
          try {
            const asset = await getAsset(clip.currentAssetId!);
            // get_url is present at runtime; cast needed because websocket dist
            // may be absent during typecheck, leaving the Asset type incomplete.
            const url = (asset as unknown as { get_url?: string | null })?.get_url;
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

      await graph.scheduleClips(validClips, tracks, currentTimeMs);

      // Start the clock (audio context as master if available).
      clock.start(
        currentTimeMs,
        1,
        validClips.length > 0 ? ctx : null,
        durationMs || Infinity
      );
    }, [play, clips, tracks, currentTimeMs, durationMs, getAsset]);

    const handlePause = useCallback(() => {
      pause();
      clockRef.current.stop();
      graphRef.current.stopAll();
      graphRef.current.suspend();
    }, [pause]);

    const handleStop = useCallback(() => {
      stop();
      clockRef.current.stop();
      graphRef.current.stopAll();
      graphRef.current.suspend();
    }, [stop]);

    const handlePlayPauseToggle = useCallback(() => {
      if (isPlaying) {
        handlePause();
      } else {
        void handlePlay();
      }
    }, [isPlaying, handlePlay, handlePause]);

    // ── Frame stepping ─────────────────────────────────────────────────────

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

    // ── Jump to clip boundary ──────────────────────────────────────────────

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

    // ── Fullscreen ─────────────────────────────────────────────────────────

    const containerRef = useRef<HTMLDivElement>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

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

    // ── Keyboard shortcuts ─────────────────────────────────────────────────

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        switch (e.key) {
          case " ":
            e.preventDefault();
            handlePlayPauseToggle();
            break;
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

    // ── Timecode & FPS ────────────────────────────────────────────────────

    const timecode = formatTimecode(currentTimeMs, fps);

    // ── Render ─────────────────────────────────────────────────────────────

    return (
      <div
        ref={containerRef}
        css={containerStyles(theme)}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-label="Preview area"
        data-testid="preview-area"
      >
        {/* ── Compositor viewport ───────────────────────────────────────── */}
        <div css={viewportStyles}>
          <PreviewCompositor
            sequenceWidth={sequenceWidth}
            sequenceHeight={sequenceHeight}
          />
        </div>

        {/* ── Transport control bar ─────────────────────────────────────── */}
        <div css={controlBarStyles(theme)}>
          {/* Jump to previous clip boundary */}
          <ToolbarIconButton
            icon={<SkipPreviousIcon />}
            tooltip="Previous clip boundary (Shift+←)"
            onClick={jumpToPrevBoundary}
            aria-label="Previous clip boundary"
            size="small"
          />

          {/* Step back one frame */}
          <ToolbarIconButton
            icon={<NavigateBeforeIcon />}
            tooltip="Step back one frame (←)"
            onClick={() => stepFrame(-1)}
            disabled={isPlaying}
            aria-label="Step back one frame"
            size="small"
          />

          {/* Play / Pause */}
          <ToolbarIconButton
            icon={isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
            tooltip={isPlaying ? "Pause (Space)" : "Play (Space)"}
            onClick={handlePlayPauseToggle}
            aria-label={isPlaying ? "Pause" : "Play"}
            variant="primary"
            size="small"
          />

          {/* Stop */}
          <ToolbarIconButton
            icon={<StopIcon />}
            tooltip="Stop and return to start"
            onClick={handleStop}
            aria-label="Stop"
            size="small"
          />

          {/* Step forward one frame */}
          <ToolbarIconButton
            icon={<NavigateNextIcon />}
            tooltip="Step forward one frame (→)"
            onClick={() => stepFrame(1)}
            disabled={isPlaying}
            aria-label="Step forward one frame"
            size="small"
          />

          {/* Jump to next clip boundary */}
          <ToolbarIconButton
            icon={<SkipNextIcon />}
            tooltip="Next clip boundary (Shift+→)"
            onClick={jumpToNextBoundary}
            aria-label="Next clip boundary"
            size="small"
          />

          {/* Separator */}
          <div css={dividerStyles(theme)} />

          {/* Timecode */}
          <Text css={timecodeStyles(theme)}>{timecode}</Text>

          {/* FPS */}
          <Caption css={fpsStyles(theme)}>{fps} fps</Caption>

          {/* Spacer */}
          <FlexRow sx={{ flex: "1 1 auto" }} />

          {/* Fullscreen */}
          <ToolbarIconButton
            icon={isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
            tooltip={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={handleFullscreen}
            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            size="small"
          />

          {/* Fit / fill toggle */}
          <ToolbarIconButton
            icon={<FitScreenIcon />}
            tooltip="Fit to window"
            aria-label="Fit to window"
            size="small"
          />
        </div>
      </div>
    );
  }
);

PreviewArea.displayName = "PreviewArea";
