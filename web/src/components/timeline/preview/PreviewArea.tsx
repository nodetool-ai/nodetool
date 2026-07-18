/** @jsxImportSource @emotion/react */

import React, {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useShallow } from "zustand/react/shallow";
import type { TimelineClip } from "@nodetool-ai/timeline";

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
  Text,
  Caption,
  Slider,
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

/** Schedule/top-up audio clips whose start falls within this horizon of the
 *  playhead — matches PreviewCompositor's PRELOAD_LOOKAHEAD_MS so video and
 *  audio preload the same window. Bounds play-gesture decode latency and
 *  resident PCM memory regardless of timeline length. */
const AUDIO_LOOKAHEAD_MS = 30_000;
/** How often the top-up interval re-scans for clips that entered the window
 *  while playing. Must stay well under AUDIO_LOOKAHEAD_MS so every clip is
 *  scheduled before the playhead reaches it. */
const AUDIO_TOPUP_INTERVAL_MS = 5_000;
/** Trailing debounce for the seek-while-playing audio restart. A ruler scrub
 *  delivers pointermove-rate seeks; only the last one in a burst should pay
 *  for asset resolution + decode + a fresh clock start. */
const SEEK_RESTART_DEBOUNCE_MS = 120;

/** True if `clip` is a schedulable audio clip that hasn't finished by `atMs`. */
function isPendingAudioClip(clip: TimelineClip, atMs: number): boolean {
  return (
    clip.mediaType === "audio" &&
    !clip.muted &&
    !!clip.currentAssetId &&
    (clip.status === "generated" ||
      clip.status === "stale" ||
      clip.status === "locked") &&
    clip.startMs + clip.durationMs > atMs
  );
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
    fontSize: theme.fontSizeSmall,
    color: theme.vars.palette.text.primary,
    letterSpacing: "0.05em",
    minWidth: 78,
    textAlign: "center",
    userSelect: "none"
  });

const fpsStyles = (theme: Theme) =>
  css({
    fontSize: theme.fontSizeSmaller,
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
    fontSize: theme.fontSizeSmaller,
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
  ({ fps = 30 }) => {
    const theme = useTheme();

    const {
      currentTimeMs,
      isPlaying,
      play,
      pause,
      stop,
      setCurrentTimeMs,
      seek,
      seekNonce,
      subscribeTime,
      getTimeMs,
      rate
    } = useTimelinePlaybackStore(
      useShallow((s) => ({
        // Reactive position is now discrete-only (seek/scrub/pause/stop). The
        // live playback readout is driven imperatively from `subscribeTime`
        // below so playback never re-renders this control bar 60×/s.
        currentTimeMs: s.currentTimeMs,
        isPlaying: s.isPlaying,
        play: s.play,
        pause: s.pause,
        stop: s.stop,
        setCurrentTimeMs: s.setCurrentTimeMs,
        seek: s.seek,
        seekNonce: s.seekNonce,
        subscribeTime: s.subscribeTime,
        getTimeMs: s.getTimeMs,
        rate: s.rate
      }))
    );

    // `clips` is read imperatively via `useTimelineStore.getState()` inside
    // handlers (handlePlay, the audio top-up) rather than subscribed here —
    // it gets a new identity on every drag/trim/slider tick, which would
    // otherwise re-render this whole control bar per pointermove for a value
    // only ever read at click/gesture time. `tracks` stays a live
    // subscription: it feeds the `graph.updateTracks` effect below so DSP/
    // gain/solo/mute changes are audible immediately.
    const tracks = useTimelineStore((s) => s.tracks);
    const durationMs = useTimelineStore((s) => s.durationMs);

    // `durationMs` is set only on load and is NOT recomputed when clips are
    // added/moved (see TracksRegion, which derives its own content extent).
    // For a new/unsaved sequence it stays 0, which would pin the scrubber's
    // range to [0, 1] (max ≤ step → every drag snaps to the end). Derive the
    // max from the actual clip extent, matching the ruler. Returning a
    // primitive means the default equality skips re-renders for edits that
    // don't move the content boundary (e.g. an opacity slider drag).
    const contentEndMs = useTimelineStore((s) => {
      let end = s.durationMs || 0;
      for (const c of s.clips) {
        end = Math.max(end, c.startMs + c.durationMs);
      }
      return end;
    });

    /** All unique clip boundary timestamps (start + end), sorted ascending.
     *  `useShallow` keeps the returned array's identity stable across clip
     *  edits that don't touch start/end (opacity, color, transform, ...), so
     *  boundary-jump navigation doesn't re-render on every unrelated drag
     *  tick. */
    const clipBoundaries = useTimelineStore(
      useShallow((s) => {
        const pts = new Set<number>();
        pts.add(0);
        for (const c of s.clips) {
          pts.add(c.startMs);
          pts.add(c.startMs + c.durationMs);
        }
        if (s.durationMs) {
          pts.add(s.durationMs);
        }
        return Array.from(pts).sort((a, b) => a - b);
      })
    );

    const getAsset = useAssetStore((s) => s.get);

    const clockRef = useRef<PlaybackClock>(new PlaybackClock());
    const graphRef = useRef<AudioGraph>(new AudioGraph());
    /** Bumped by every play/pause/stop/seek gesture. Async continuations in
     *  handlePlay compare against their captured value and bail when a later
     *  gesture has superseded them, so stale audio is never scheduled. */
    const playGenRef = useRef(0);
    /** Clip ids scheduled in AudioGraph for the current play session. Reset
     *  on every stop/restart so the top-up interval can tell which clips
     *  still need scheduling. */
    const scheduledClipIdsRef = useRef<Set<string>>(new Set());
    /** Windowed-audio top-up interval id — started in handlePlay, cleared
     *  with the rest of the session. */
    const topUpIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
      null
    );
    /** Pending seek-while-playing restart — see the seekNonce effect. */
    const seekDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
      null
    );

    const clearTopUpInterval = useCallback(() => {
      if (topUpIntervalRef.current !== null) {
        clearInterval(topUpIntervalRef.current);
        topUpIntervalRef.current = null;
      }
    }, []);

    const clearSeekDebounce = useCallback(() => {
      if (seekDebounceRef.current !== null) {
        clearTimeout(seekDebounceRef.current);
        seekDebounceRef.current = null;
      }
    }, []);

    /** Tear down the windowed-audio session: stop the top-up interval,
     *  cancel a pending seek-restart debounce, and forget which clips were
     *  scheduled so the next play/seek starts a clean window. Called on
     *  every path that stops or restarts audio — pause, stop, the
     *  end-of-timeline auto-pause, seek, and the top of handlePlay itself. */
    const stopAudioSession = useCallback(() => {
      clearTopUpInterval();
      clearSeekDebounce();
      scheduledClipIdsRef.current.clear();
    }, [clearTopUpInterval, clearSeekDebounce]);

    useEffect(() => {
      const clock = clockRef.current;
      const graph = graphRef.current;
      return () => {
        clock.stop();
        graph.dispose();
        stopAudioSession();
      };
    }, [stopAudioSession]);

    // Live-apply track gain/solo/mute and DSP chain changes so effect tweaks
    // are audible immediately without waiting for the next play/seek cycle.
    useEffect(() => {
      const graph = graphRef.current;
      if (!graph.context) return;
      graph.updateTracks(tracks);
    }, [tracks]);

    /**
     * Re-scan for audio clips that entered the lookahead window since the
     * last check and schedule only those, without touching clips already
     * playing. Runs on a timer started in handlePlay so a long timeline's
     * audio is brought in incrementally instead of decoding everything up
     * front.
     */
    const topUpAudio = useCallback(
      async (isStale: () => boolean) => {
        if (isStale()) return;
        const graph = graphRef.current;
        const liveMs = getTimeMs();
        const windowEndMs = liveMs + AUDIO_LOOKAHEAD_MS;
        const clipsNow = useTimelineStore.getState().clips;

        const newlyEnteredClips = clipsNow.filter(
          (c) =>
            isPendingAudioClip(c, liveMs) &&
            c.startMs < windowEndMs &&
            !scheduledClipIdsRef.current.has(c.id)
        );
        if (newlyEnteredClips.length === 0) return;

        // Mark up front so an overlapping tick (a slow asset fetch outliving
        // the 5 s interval) can't attempt the same clip twice.
        for (const c of newlyEnteredClips) {
          scheduledClipIdsRef.current.add(c.id);
        }

        const resolved = await Promise.all(
          newlyEnteredClips.map(async (clip) => {
            try {
              const asset = await getAsset(clip.currentAssetId!);
              const url = getAssetUrl(asset);
              return url ? { clip, assetUrl: url } : null;
            } catch {
              return null;
            }
          })
        );
        if (isStale()) return;

        const validClips = resolved.filter(
          (c): c is NonNullable<typeof c> => c !== null
        );
        if (validClips.length === 0) return;

        // `addClips` reuses scheduleClips' decode+schedule internals but
        // skips its "stop sources not in this list" prune, so sources
        // already playing from the initial window are left untouched.
        await graph.addClips(
          validClips,
          useTimelineStore.getState().tracks,
          getTimeMs(),
          isStale,
          useTimelinePlaybackStore.getState().rate
        );
      },
      [getAsset, getTimeMs]
    );

    const handlePlay = useCallback(async () => {
      const generation = ++playGenRef.current;
      const isStale = () => playGenRef.current !== generation;

      const graph = graphRef.current;
      const clock = clockRef.current;

      // Kill any running clock now: during the async work below (context
      // resume, asset fetches) a still-ticking clock would keep overwriting
      // currentTimeMs from its old start position, stomping a fresh seek.
      clock.stop();
      // A fresh play/restart supersedes any top-up interval or debounced
      // seek-restart left over from a previous session.
      stopAudioSession();

      // Read fresh to avoid stale closure when the user scrubs before pressing play.
      let startMs = useTimelinePlaybackStore.getState().currentTimeMs;
      // Pressing Play while parked at the end restarts from the top. Uses the
      // live content end (contentEndMs), not the stale store `durationMs`,
      // which is only set on load and never recomputed as clips change.
      if (contentEndMs > 0 && startMs >= contentEndMs - frameDeltaMs(fps)) {
        startMs = 0;
        setCurrentTimeMs(0);
      }

      play();

      // Global playback speed, read fresh so a rate set before pressing play
      // (and the live rate-change restart below) takes effect. Feeds both the
      // clock and audio scheduling so the visual clock and audio stay locked.
      const globalRate = useTimelinePlaybackStore.getState().rate;

      // Read fresh rather than closing over the reactive `clips` value so
      // this component never needs to subscribe to (and re-render on) the
      // clips array itself.
      const clipsNow = useTimelineStore.getState().clips;
      const remainingAudioClips = clipsNow.filter((c) =>
        isPendingAudioClip(c, startMs)
      );

      if (remainingAudioClips.length === 0) {
        // Nothing left to play — e.g. a seek landed past the last audio
        // clip. Silence whatever an older gesture left running, but skip
        // AudioContext creation/resume entirely rather than paying the
        // autoplay-policy round trip for silence.
        graph.stopAll();
        clock.start(startMs, globalRate, null, contentEndMs || Infinity);
        return;
      }

      const ctx = graph.getContext();
      await ctx.resume();
      if (isStale()) return;

      // Only decode/schedule what's audible now or about to become audible —
      // not the rest of the timeline. The top-up interval below brings in
      // the remaining clips as the playhead advances, so play latency and
      // resident PCM memory stop scaling with timeline length.
      const windowEndMs = startMs + AUDIO_LOOKAHEAD_MS;
      const windowedClips = remainingAudioClips.filter(
        (c) => c.startMs < windowEndMs
      );

      const scheduledClips = await Promise.all(
        windowedClips.map(async (clip) => {
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
      await graph.scheduleClips(validClips, tracks, startMs, isStale, globalRate);
      if (isStale()) return;

      for (const { clip } of validClips) {
        scheduledClipIdsRef.current.add(clip.id);
      }

      clock.start(startMs, globalRate, ctx, contentEndMs || Infinity);

      topUpIntervalRef.current = setInterval(() => {
        void topUpAudio(isStale);
      }, AUDIO_TOPUP_INTERVAL_MS);
    }, [
      play,
      tracks,
      contentEndMs,
      fps,
      getAsset,
      setCurrentTimeMs,
      stopAudioSession,
      topUpAudio
    ]);

    const handlePause = useCallback(() => {
      playGenRef.current++;
      pause();
      clockRef.current.stop();
      graphRef.current.stopAll();
      graphRef.current.suspend();
      stopAudioSession();
    }, [pause, stopAudioSession]);

    const handleStop = useCallback(() => {
      playGenRef.current++;
      stop();
      clockRef.current.stop();
      graphRef.current.stopAll();
      graphRef.current.suspend();
      stopAudioSession();
    }, [stop, stopAudioSession]);

    // The clock auto-pauses via the store when it hits the timeline end —
    // a path that bypasses handlePause. Mirror its teardown here so audio
    // sources are released and the AudioContext suspends.
    useEffect(() => {
      if (isPlaying) return;
      playGenRef.current++;
      clockRef.current.stop();
      graphRef.current.stopAll();
      graphRef.current.suspend();
      stopAudioSession();
    }, [isPlaying, stopAudioSession]);

    // On external seek while playing, restart audio scheduling + clock at the
    // new position so audio re-aligns with the playhead. We key on seekNonce
    // (bumped only by store.seek()) so frame-by-frame clock updates don't
    // trigger a restart. Silence immediately (`stopAll`), but debounce the
    // actual restart: a ruler scrub delivers pointermove-rate seeks, and only
    // the last one in a burst should pay for asset resolution, decode, and a
    // fresh clock start. The effect cleanup cancels the pending restart when
    // a newer seek supersedes it (or the component unmounts); `stopAudioSession`
    // cancels it on pause/stop too.
    useEffect(() => {
      if (seekNonce === 0 || !isPlaying) {
        return;
      }
      // Stop the clock immediately — otherwise it keeps ticking off its old
      // start position and overwrites (via setTimeMs) the liveTimeMs that
      // seek() just set, so the seek is visually ignored until the debounced
      // restart below fires and calls handlePlay's own clock.stop().
      clockRef.current.stop();
      graphRef.current.stopAll();
      stopAudioSession();

      seekDebounceRef.current = setTimeout(() => {
        seekDebounceRef.current = null;
        void handlePlay();
      }, SEEK_RESTART_DEBOUNCE_MS);

      return clearSeekDebounce;
      // handlePlay reads the latest currentTimeMs from the store.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [seekNonce]);

    // Changing the global rate mid-playback re-aligns the clock and audio.
    // Seek to the live position (rebasing currentTimeMs and bumping seekNonce)
    // so the seek-restart effect above re-runs handlePlay, which reads the new
    // rate. Guarded on isPlaying so a rate set while paused just applies on the
    // next play.
    useEffect(() => {
      if (!isPlaying) return;
      seek(getTimeMs());
      // Only restart on an actual rate change, not on play/pause transitions.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rate]);

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

    const jumpToPrevBoundary = useCallback(() => {
      // Read the live playhead: while playing, `currentTimeMs` is frozen at the
      // last discrete event, so jumps must use the transient position.
      const from = isPlaying ? getTimeMs() : currentTimeMs;
      const prev = clipBoundaries.filter((t) => t < from - 1).at(-1);
      if (prev !== undefined) {
        if (isPlaying) {
          handleStop();
        }
        setCurrentTimeMs(prev);
      }
    }, [
      clipBoundaries,
      currentTimeMs,
      isPlaying,
      handleStop,
      setCurrentTimeMs,
      getTimeMs
    ]);

    const jumpToNextBoundary = useCallback(() => {
      const from = isPlaying ? getTimeMs() : currentTimeMs;
      const next = clipBoundaries.find((t) => t > from + 1);
      if (next !== undefined) {
        if (isPlaying) {
          handleStop();
        }
        setCurrentTimeMs(next);
      }
    }, [
      clipBoundaries,
      currentTimeMs,
      isPlaying,
      handleStop,
      setCurrentTimeMs,
      getTimeMs
    ]);

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

    const scrubMax = Math.max(1, contentEndMs);
    const scrubValue = Math.min(scrubMax, scrubMs ?? currentTimeMs);

    // Live timecode without per-frame React renders: while playing, subscribe
    // to the transient playhead and write the readout straight to the DOM.
    const timecodeRef = useRef<HTMLElement>(null);
    useEffect(() => {
      if (!isPlaying) return;
      const node = timecodeRef.current;
      if (!node) return;
      const unsubscribe = subscribeTime((ms) => {
        node.textContent = formatTimecode(ms, fps);
      });
      return unsubscribe;
    }, [isPlaying, subscribeTime, fps]);

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
          <Text ref={timecodeRef} css={timecodeStyles(theme)}>
            {timecode}
          </Text>
          <div css={scrubberStyles}>
            <Slider
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
