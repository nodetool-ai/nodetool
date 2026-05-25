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
      seekNonce
    } = useTimelinePlaybackStore(
      useShallow((s) => ({
        currentTimeMs: s.currentTimeMs,
        isPlaying: s.isPlaying,
        play: s.play,
        pause: s.pause,
        stop: s.stop,
        setCurrentTimeMs: s.setCurrentTimeMs,
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
      play();
      const graph = graphRef.current;
      const clock = clockRef.current;

      // Read fresh to avoid stale closure when the user scrubs before pressing play.
      const startMs = useTimelinePlaybackStore.getState().currentTimeMs;

      const ctx = graph.getContext();
      await ctx.resume();

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

      await graph.scheduleClips(validClips, tracks, startMs);

      clock.start(
        startMs,
        1,
        validClips.length > 0 ? ctx : null,
        durationMs || Infinity
      );
    }, [play, clips, tracks, durationMs, getAsset]);

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
          />

          <ToolbarIconButton
            icon={<NavigateBeforeIcon />}
            tooltip="Step back one frame (←)"
            onClick={stepBack}
            disabled={isPlaying}
            aria-label="Step back one frame"
            size="small"
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
          />

          <ToolbarIconButton
            icon={<SkipNextIcon />}
            tooltip="Next clip boundary (Shift+→)"
            onClick={jumpToNextBoundary}
            aria-label="Next clip boundary"
            size="small"
          />

          <div css={dividerStyles(theme)} />
          <Text css={timecodeStyles(theme)}>{timecode}</Text>
          <Caption css={fpsStyles(theme)}>{fps} fps</Caption>
          <FlexRow sx={{ flex: "1 1 auto" }} />

          <ToolbarIconButton
            icon={isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
            tooltip={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={handleFullscreen}
            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            size="small"
          />
        </div>
      </div>
    );
  }
);

PreviewArea.displayName = "PreviewArea";
