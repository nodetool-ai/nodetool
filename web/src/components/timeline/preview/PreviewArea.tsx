/** @jsxImportSource @emotion/react */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useShallow } from "zustand/react/shallow";
import {
  DEFAULT_MIDI_INSTRUMENT,
  effectiveAssetId,
  harmonizeClips,
  midiRenderKey,
  previewTake,
  resolveTempo,
  videoClipsWithOwnAudio
} from "@nodetool-ai/timeline";
import type {
  HarmonyDocument,
  MidiInstrument,
  TimelineClip,
  TimelineTrack
} from "@nodetool-ai/timeline";

import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import StopIcon from "@mui/icons-material/Stop";
import SkipPreviousIcon from "@mui/icons-material/SkipPrevious";
import RepeatIcon from "@mui/icons-material/Repeat";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import FilterBAndWOutlinedIcon from "@mui/icons-material/FilterBAndWOutlined";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import VolumeDownIcon from "@mui/icons-material/VolumeDown";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";

import {
  Caption,
  Slider,
  SelectField,
  ToolbarIconButton,
  focusRing,
  SPACING,
  TYPOGRAPHY,
  Z_INDEX
} from "../../ui_primitives";

import {
  useTimelinePlaybackStore,
  useTimelinePlaybackStoreApi
} from "../../../stores/timeline/TimelinePlaybackStore";
import {
  useTimelineStore,
  useTimelineStoreApi
} from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import type { TimelineAudition } from "../../../stores/timeline/TimelineUIStore";
import { useAssetStore } from "../../../stores/AssetStore";
import { PlaybackClock } from "./PlaybackClock";
import { AudioGraph } from "./AudioGraph";
import type { ScheduledAudioClip } from "./AudioGraph";
import { AudioScrubber } from "./audioScrub";
import { getMidiClipBuffer } from "./midiRender";
import { PreviewCompositor } from "./PreviewCompositor";
import { getAssetMediaUrl } from "../../../utils/assetHelpers";
import { useCombo } from "../../../stores/KeyPressedStore";
import { formatTimecode } from "../Inspector/InspectorPrimitives.helpers";
import { previewQualityScale } from "./previewQuality";
import type { PreviewQuality } from "./previewQuality";
import { resolvePlayStartMs } from "./playbackSync";
import { useSettingsStore } from "../../../stores/SettingsStore";
import { formatBinding, withActionShortcut } from "../timelineKeymap";
import { liveDeviceFactory } from "../daw/devices/liveDevice";
import { DawTransport } from "../daw/transport/DawTransport";
import { EditableTimecode } from "../EditableTimecode";
import { Metronome } from "../daw/transport/metronome";
import { useTimelineLayoutStore } from "../../../stores/timeline/TimelineLayoutStore";
import "../daw/devices/registerFablesynthDevices";

/** Space is bound by the preview itself (useCombo below), not the keymap. */
const PLAY_PAUSE_KEY = formatBinding({ key: " " });

function frameDeltaMs(fps: number): number {
  return 1000 / Math.max(1, fps);
}

/** The media URL of an asset already in the query cache, or null. A relinked
 *  file keeps its asset id but changes URL, so the schedule key carries it. */
function cachedAssetUrl(assetId: string | undefined): string | null {
  if (!assetId) return null;
  try {
    const asset = useAssetStore
      .getState()
      .queryClient?.getQueryData(["asset", assetId]);
    return asset ? getAssetMediaUrl(asset) : null;
  } catch {
    return null;
  }
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

/**
 * Ids of the video clips that sound their own audio (no extracted-audio
 * partner, unmuted, not silenced by a solo). The video elements stay muted;
 * these clips are played through the audio graph like an audio clip.
 */
function ownAudioClipIds(
  clips: readonly TimelineClip[],
  tracks: readonly TimelineTrack[]
): Set<string> {
  return new Set(videoClipsWithOwnAudio(clips, tracks).map((clip) => clip.id));
}

/**
 * True if `clip` is a schedulable sounding clip that hasn't finished by `atMs`.
 *
 * A midi clip has no asset and no generation to wait for — its notes are the
 * content — so it needs neither `currentAssetId` nor a status; an empty note
 * list would render silence, so it is skipped instead. An audio clip sounds
 * under the status rule its picture would be drawn under, and a video clip
 * only when it is in `ownAudio`.
 */
function isPendingAudioClip(
  clip: TimelineClip,
  atMs: number,
  ownAudio: ReadonlySet<string>
): boolean {
  if (clip.muted || clip.startMs + clip.durationMs <= atMs) return false;
  if (clip.mediaType === "midi") {
    return (clip.notes?.length ?? 0) > 0;
  }
  if (clip.mediaType === "video") return ownAudio.has(clip.id);
  return clip.mediaType === "audio" && effectiveAssetId(clip) !== undefined;
}

/** The voice a midi clip on this track plays. */
function instrumentForTrack(
  tracks: readonly TimelineTrack[],
  trackId: string
): MidiInstrument {
  return (
    tracks.find((t) => t.id === trackId)?.instrument ?? DEFAULT_MIDI_INSTRUMENT
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
    outline: "none",
    "&[data-audio-only='true']": {
      height: "auto",
      flexShrink: 0
    },
    // The area takes focus for its playback keys; show it when it does. Inset,
    // because the area clips its overflow.
    "&:focus-visible": focusRing(theme),
    "&[data-expanded='true']": {
      position: "fixed",
      inset: 0,
      width: "100vw",
      height: "100dvh",
      maxWidth: "none",
      maxHeight: "none",
      margin: 0,
      padding: 0,
      border: 0,
      zIndex: Z_INDEX.modal
    }
  });

const viewportStyles = css({
  flex: "1 1 0%",
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
    paddingLeft: theme.spacing(SPACING.micro),
    paddingRight: theme.spacing(SPACING.micro),
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(SPACING.micro),
    overflow: "hidden",
    containerType: "inline-size",
    containerName: "timelinePreviewControls",
    ".toolbar-icon-button": {
      flexShrink: 0
    },
    ".timeline-preview__quality": {
      // Fits the longest option, "Auto (Half)", next to the arrow.
      width: theme.spacing(SPACING.xxxl * 3 + SPACING.xl),
      flexShrink: 0
    },
    ".timeline-preview__volume": {
      width: theme.spacing(SPACING.xxxl),
      flexShrink: 0,
      paddingLeft: theme.spacing(SPACING.xs),
      paddingRight: theme.spacing(SPACING.xs),
      display: "flex",
      alignItems: "center"
    },
    "@container timelinePreviewControls (max-width: 560px)": {
      ".timeline-preview__secondary-control, .timeline-preview__fps, .timeline-preview__volume": {
        display: "none"
      }
    },
    "@container timelinePreviewControls (max-width: 420px)": {
      ".timeline-preview__duration": {
        display: "none"
      }
    }
  });

const timecodeStyles = (theme: Theme) =>
  css({
    ...TYPOGRAPHY.mono.label,
    color: theme.vars.palette.text.secondary,
    fontVariantNumeric: "tabular-nums",
    display: "flex",
    alignItems: "center",
    lineHeight: 1,
    margin: 0,
    flexShrink: 0,
    paddingLeft: theme.spacing(SPACING.xs),
    userSelect: "none"
  });

const fpsStyles = (theme: Theme) =>
  css({
    ...TYPOGRAPHY.mono.caption,
    color: theme.vars.palette.text.secondary,
    flexShrink: 0,
    userSelect: "none"
  });

const scrubberStyles = (theme: Theme) =>
  css({
    flex: "1 1 auto",
    minWidth: theme.spacing(SPACING.xxxl),
    // Compact thumb (12px) hangs 6px past the rail start.
    paddingLeft: theme.spacing(SPACING.lg),
    paddingRight: theme.spacing(SPACING.lg),
    display: "flex",
    alignItems: "center"
  });

const durationStyles = (theme: Theme) =>
  css({
    ...TYPOGRAPHY.mono.caption,
    color: theme.vars.palette.text.secondary,
    fontVariantNumeric: "tabular-nums",
    flexShrink: 0,
    userSelect: "none"
  });

interface PreviewAreaProps {
  /** Sequence fps — read from the parent so no extra query is needed here. */
  fps?: number;
  /** Sequence pixel width (pass-through to compositor). */
  sequenceWidth?: number;
  /** Sequence pixel height (pass-through to compositor). */
  sequenceHeight?: number;
  /** Playhead timecode. Default on. */
  showTimecode?: boolean;
  /** Duration readout after the scrubber (`/HH:MM:SS:FF`). Default on. */
  showDuration?: boolean;
  /** Sequence fps readout. Default on. */
  showFps?: boolean;
  /**
   * DAW mode: keep the audio graph, the clock and the Space binding, but
   * render no compositor (no canvas, no GPU work) and swap the control bar
   * for the DAW transport strip, which adds loop and a metronome.
   */
  audioOnly?: boolean;
}

interface PlaybackScrubberProps {
  max: number;
  /** The paused position, or the drag position while scrubbing. */
  value: number;
  isPlaying: boolean;
  subscribeTime: (cb: (timeMs: number) => void) => () => void;
  step: number;
  onChange: (event: Event, value: number | number[]) => void;
  onChangeCommitted: (
    event: Event | React.SyntheticEvent,
    value: number | number[]
  ) => void;
}

/**
 * The scrub bar. While playing it follows the live playhead itself, so the
 * position moves without a render of the whole preview on every frame.
 */
const PlaybackScrubber: React.FC<PlaybackScrubberProps> = memo(
  ({ max, value, isPlaying, subscribeTime, step, onChange, onChangeCommitted }) => {
    const { t } = useTranslation();
    const [liveMs, setLiveMs] = useState<number | null>(null);
    useEffect(() => {
      if (!isPlaying) {
        setLiveMs(null);
        return;
      }
      // One step of the bar is one frame: finer updates move nothing.
      return subscribeTime((ms) =>
        setLiveMs(Math.round(ms / step) * step)
      );
    }, [isPlaying, subscribeTime, step]);

    return (
      <Slider
        aria-label={t("i18n-next6.preview.scrubTimeline")}
        min={0}
        max={max}
        step={step}
        value={Math.min(max, liveMs ?? value)}
        onChange={onChange}
        onChangeCommitted={onChangeCommitted}
        density="compact"
      />
    );
  }
);
PlaybackScrubber.displayName = "PlaybackScrubber";

/**
 * The clips as the audio graph should hear them. Auditioning a take swaps its
 * media into the clip for preview only, the same projection the picture uses
 * in `PreviewCompositor`, so a Preview Candidate on an audio take is heard.
 */
function auditionedClips(
  clips: TimelineClip[],
  audition: TimelineAudition | null,
  doc: HarmonyDocument
): TimelineClip[] {
  // A midi clip with `harmony` sounds its arp or comp expansion.
  const heard = harmonizeClips(clips, doc);
  if (!audition) return heard;
  const target = heard.find((clip) => clip.id === audition.clipId);
  const preview = target && previewTake(target, audition.takeId);
  if (!target || !preview) return heard;
  return heard.map((clip) => (clip.id === target.id ? preview : clip));
}

export const PreviewArea: React.FC<PreviewAreaProps> = memo(
  ({
    fps = 30,
    sequenceWidth = 1920,
    sequenceHeight = 1080,
    showTimecode = true,
    showDuration = true,
    showFps = true,
    audioOnly = false
  }) => {
    const theme = useTheme();
    const { t } = useTranslation();

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

    // `clips` is read imperatively via `timelineApi.getState()` inside
    // handlers (handlePlay, the audio top-up) rather than subscribed here —
    // it gets a new identity on every drag/trim/slider tick, which would
    // otherwise re-render this whole control bar per pointermove for a value
    // only ever read at click/gesture time. `tracks` stays a live
    // subscription: it feeds the `graph.updateTracks` effect below so DSP/
    // gain/solo/mute changes are audible immediately.
    const tracks = useTimelineStore((s) => s.tracks);
    const master = useTimelineStore((s) => s.master);
    const fxBpm = useTimelineStore((s) => resolveTempo(s).bpm);
    // `durationMs` is set only on load and is NOT recomputed when clips are
    // added/moved (see TracksRegion, which derives its own content extent).
    // For a new/unsaved sequence it stays 0, which would pin the scrubber's
    // range to [0, 1] (max ≤ step → every drag snaps to the end). Derive the
    // max from the actual clip extent, matching the ruler. When a sequence is
    // empty, retain its stored duration so an intentional blank sequence still
    // has a usable range. Returning a
    // primitive means the default equality skips re-renders for edits that
    // don't move the content boundary (e.g. an opacity slider drag).
    const contentEndMs = useTimelineStore((s) => {
      let end = 0;
      for (const c of s.clips) {
        end = Math.max(end, c.startMs + c.durationMs);
      }
      return s.clips.length > 0 ? end : s.durationMs || 0;
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
        if (s.clips.length === 0 && s.durationMs) {
          pts.add(s.durationMs);
        }
        return Array.from(pts).sort((a, b) => a - b);
      })
    );

    // "Show matte": swap the composite for the selected clip's generated
    // matte, drawn on its own. Offered only when there is one to look at —
    // one clip selected, its matte cut and ready.
    const matteViewEnabled = useTimelineUIStore((s) => s.matteViewEnabled);
    const toggleMatteView = useTimelineUIStore((s) => s.toggleMatteView);
    const selectedClipId = useTimelineUIStore((s) =>
      s.selectedClipIds.size === 1 ? [...s.selectedClipIds][0] : null
    );
    const hasReadyMatte = useTimelineStore((s) => {
      if (!selectedClipId) return false;
      const matte = s.clips.find(
        (c) => c.id === selectedClipId
      )?.generatedMatte;
      return matte !== undefined && (matte.status ?? "ready") === "ready";
    });

    const getAsset = useAssetStore((s) => s.get);
    const timelineApi = useTimelineStoreApi();
    const playbackApi = useTimelinePlaybackStoreApi();

    const clockRef = useRef<PlaybackClock>(
      new PlaybackClock(() => playbackApi.getState())
    );
    const graphRef = useRef<AudioGraph>(new AudioGraph());
    // Clicks on the beat in DAW mode. Not part of the mix, so never exported.
    const metronomeRef = useRef<Metronome>(new Metronome());
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const isSilent = isMuted || volume === 0;
    useEffect(() => {
      graphRef.current.setMasterVolume(isMuted ? 0 : volume);
      metronomeRef.current.setVolume(isMuted ? 0 : volume);
    }, [volume, isMuted]);
    const handleVolumeChange = useCallback(
      (_event: Event, value: number | number[]) => {
        const next = Array.isArray(value) ? value[0] : value;
        setVolume(next);
        setIsMuted(false);
      },
      []
    );
    const toggleMute = useCallback(() => {
      if (isMuted || volume > 0) {
        setIsMuted(!isMuted);
      } else {
        // Unmuting at zero volume would stay silent.
        setVolume(1);
      }
    }, [isMuted, volume]);
    /** Bumped by every play/pause/stop/seek gesture. Async continuations in
     *  handlePlay compare against their captured value and bail when a later
     *  gesture has superseded them, so stale audio is never scheduled. */
    const playGenRef = useRef(0);
    /** Clip ids scheduled in AudioGraph for the current play session. Reset
     *  on every stop/restart so the top-up interval can tell which clips
     *  still need scheduling. */
    const scheduledClipIdsRef = useRef<Set<string>>(new Set());

    /** The source, timing, rate, and mix key of every sounding clip scheduled
     * this session. A changed key means its WebAudio source must be replaced
     * at the live playhead. Cleared with the rest of the session. */
    const scheduledAudioKeysRef = useRef<Map<string, string>>(new Map());
    /** True once the current forward-playback session has started its clock,
     * including sessions that began with every sound clip muted. */
    const audioSessionActiveRef = useRef(false);
    /** Serializes timer and edit-driven top-ups. A later MIDI edit must run
     * after an in-flight render so the newest source is always installed last. */
    const topUpQueueRef = useRef<Promise<void>>(Promise.resolve());
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
      metronomeRef.current.stop();
      audioSessionActiveRef.current = false;
      clearTopUpInterval();
      clearSeekDebounce();
      scheduledClipIdsRef.current.clear();
      scheduledAudioKeysRef.current.clear();
      topUpQueueRef.current = Promise.resolve();
    }, [clearTopUpInterval, clearSeekDebounce]);

    useEffect(() => {
      const clock = clockRef.current;
      const graph = graphRef.current;
      playbackApi.getState().setAudioGraph(graph);
      return () => {
        if (playbackApi.getState().audioGraph === graph) {
          playbackApi.getState().setAudioGraph(null);
        }
        clock.stop();
        graph.dispose();
        stopAudioSession();
      };
    }, [playbackApi, stopAudioSession]);

    // Live-apply track gain/solo/mute and DSP chain changes so effect tweaks
    // are audible immediately without waiting for the next play/seek cycle.
    useEffect(() => {
      const graph = graphRef.current;
      if (!graph.context) return;
      graph.updateTracks(tracks);
    }, [tracks]);

    // The master channel is kept by the graph until its context exists.
    useEffect(() => {
      graphRef.current.setMaster(master);
    }, [master]);

    // Tempo-synced FableSynth inserts (tape echo SYNC, LAB divisions).
    useEffect(() => {
      graphRef.current.setTempo(fxBpm);
    }, [fxBpm]);

    /**
     * The PCM a clip should play: an asset URL for an audio clip, or a freshly
     * rendered buffer for a midi one (cached by `midiRenderKey`, so a repeat
     * of the same notes/tempo/instrument costs nothing). `null` when the asset
     * cannot be resolved or the render fails — the clip is then skipped rather
     * than silencing the whole gesture.
     */
    const resolveScheduledClip = useCallback(
      async (
        clip: TimelineClip,
        lookupAsset: typeof getAsset = getAsset
      ): Promise<ScheduledAudioClip | null> => {
        if (clip.mediaType === "midi") {
          const state = timelineApi.getState();
          if (liveDeviceFactory(instrumentForTrack(state.tracks, clip.trackId))) {
            return { clip, live: { bpm: resolveTempo(state).bpm } };
          }
          try {
            const buffer = await getMidiClipBuffer(
              graphRef.current.getContext(),
              clip,
              resolveTempo(state).bpm,
              instrumentForTrack(state.tracks, clip.trackId)
            );
            return { clip, buffer };
          } catch {
            return null;
          }
        }
        try {
          const asset = await lookupAsset(clip.currentAssetId!);
          const url = getAssetMediaUrl(asset);
          // Size and duration pick decoded or streamed playback in the graph.
          return url
            ? {
                clip,
                assetUrl: url,
                assetSize: asset.size,
                assetDurationSec: asset.duration
              }
            : null;
        } catch {
          return null;
        }
      },
      [getAsset, timelineApi]
    );

    /** The key `clip`'s scheduled sound answers to, or null when it has no
     * schedulable sound. Track routing is part of the key because a source is
     * connected to its track chain when it is scheduled. A video clip has a
     * key only while it sounds its own audio, so muting its track, soloing a
     * sound track or adding an audio partner stops it. */
    const audioScheduleKeyOf = useCallback(
      (clip: TimelineClip, ownAudio: ReadonlySet<string>): string | null => {
        const ownVideoAudio =
          clip.mediaType === "video" && ownAudio.has(clip.id);
        if (
          clip.mediaType !== "audio" &&
          clip.mediaType !== "midi" &&
          !ownVideoAudio
        ) {
          return null;
        }
        const midiKey = (() => {
          if (clip.mediaType !== "midi") return null;
          const state = timelineApi.getState();
          // A live device plays the notes as they are; its sound follows the
          // instrument without rescheduling, so only the notes and tempo key it.
          if (liveDeviceFactory(instrumentForTrack(state.tracks, clip.trackId))) {
            return JSON.stringify({ notes: clip.notes ?? [], bpm: resolveTempo(state).bpm });
          }
          return midiRenderKey({
            clip,
            bpm: resolveTempo(state).bpm,
            instrument: instrumentForTrack(state.tracks, clip.trackId),
            sampleRate: graphRef.current.context?.sampleRate ?? 48_000
          });
        })();
        return JSON.stringify({
          mediaType: clip.mediaType,
          assetId: clip.currentAssetId ?? null,
          assetUrl: cachedAssetUrl(clip.currentAssetId),
          midiKey,
          trackId: clip.trackId,
          startMs: clip.startMs,
          durationMs: clip.durationMs,
          inPointMs: clip.inPointMs ?? 0,
          outPointMs: clip.outPointMs ?? null,
          speedMultiplier: clip.speedMultiplier ?? 1,
          speedBaked: clip.speedBaked === true,
          timeRemap: clip.timeRemap ?? null,
          muted: clip.muted === true,
          volumeDb: clip.volumeDb ?? 0,
          fadeInMs: clip.fadeInMs ?? 0,
          fadeOutMs: clip.fadeOutMs ?? 0,
          fadeInShape: clip.fadeInShape ?? "linear",
          fadeOutShape: clip.fadeOutShape ?? "linear",
          audioEffects: clip.audioEffects ?? null,
          auditionTakeId: (() => {
            const audition = useTimelineUIStore.getState().audition;
            return audition?.clipId === clip.id ? audition.takeId : null;
          })()
        });
      },
      [timelineApi]
    );

    /** Plays a grain of the mix on each paused playhead move. */
    const scrubberRef = useRef<AudioScrubber | null>(null);
    useEffect(() => {
      const graph = graphRef.current;
      // A grain must not wait on a server round trip per pointermove, so the
      // scrub keeps each asset lookup. A failed lookup is dropped and retried.
      const assetLookups = new Map<string, ReturnType<typeof getAsset>>();
      const lookupAsset = (id: string): ReturnType<typeof getAsset> => {
        let lookup = assetLookups.get(id);
        if (!lookup) {
          lookup = getAsset(id);
          assetLookups.set(id, lookup);
          lookup.catch(() => assetLookups.delete(id));
        }
        return lookup;
      };
      const scrubber = new AudioScrubber({
        start: async (position, isStale) => {
          const state = timelineApi.getState();
          const clipsNow = auditionedClips(
            state.clips,
            useTimelineUIStore.getState().audition,
            state
          );
          const ownAudio = ownAudioClipIds(clipsNow, state.tracks);
          const soundsAt = (clip: TimelineClip, atMs: number): boolean =>
            clip.startMs <= atMs && isPendingAudioClip(clip, atMs, ownAudio);
          const sounding = clipsNow.filter((c) => soundsAt(c, position()));
          if (sounding.length === 0) return position();
          const resolved = await Promise.all(
            sounding.map((clip) => resolveScheduledClip(clip, lookupAsset))
          );
          // The cursor moved on while the clips resolved: play where it is
          // now, with the resolved clips that still sound there.
          const atMs = position();
          if (isStale()) return atMs;
          await graph.playGrain(
            resolved.filter(
              (c): c is ScheduledAudioClip =>
                c !== null && soundsAt(c.clip, atMs)
            ),
            state.tracks,
            atMs,
            isStale
          );
          return atMs;
        },
        release: (fadeMs) => graph.releaseGrain(fadeMs / 1000),
        stop: () => graph.stopAll(),
        idle: () => graph.suspend()
      });
      scrubberRef.current = scrubber;
      // A paused move is a scrub. A pause also writes the position, so a
      // change that crosses a play or pause transition is left out.
      const unsubscribe = playbackApi.subscribe((state, previous) => {
        if (state.isPlaying || previous.isPlaying) return;
        if (state.currentTimeMs === previous.currentTimeMs) return;
        scrubber.request(state.currentTimeMs);
      });
      return () => {
        unsubscribe();
        scrubber.cancel();
        scrubberRef.current = null;
      };
    }, [playbackApi, timelineApi, resolveScheduledClip, getAsset]);

    /**
     * Re-scan for audio clips that entered the lookahead window since the
     * last check and schedule only those, without touching clips already
     * playing. Runs on a timer started in handlePlay so a long timeline's
     * audio is brought in incrementally instead of decoding everything up
     * front.
     *
     * The same pass replaces any scheduled clip whose source, timing, rate,
     * or mix key moved, and stops sources for clips removed from the document.
     */
    const topUpAudio = useCallback(
      async (isStale: () => boolean) => {
        if (isStale()) return;
        const graph = graphRef.current;
        const liveMs = getTimeMs();
        const windowEndMs = liveMs + AUDIO_LOOKAHEAD_MS;
        const clipsNow = auditionedClips(
          timelineApi.getState().clips,
          useTimelineUIStore.getState().audition,
          timelineApi.getState()
        );
        const clipIdsNow = new Set(clipsNow.map((c) => c.id));
        const ownAudio = ownAudioClipIds(
          clipsNow,
          timelineApi.getState().tracks
        );

        const removedClipIds = [...scheduledClipIdsRef.current].filter(
          (id) => !clipIdsNow.has(id)
        );
        if (removedClipIds.length > 0) {
          graph.stopClips(removedClipIds);
          for (const id of removedClipIds) {
            scheduledClipIdsRef.current.delete(id);
            scheduledAudioKeysRef.current.delete(id);
          }
        }

        const newlyEnteredClips = clipsNow.filter(
          (c) =>
            isPendingAudioClip(c, liveMs, ownAudio) &&
            c.startMs < windowEndMs &&
            !scheduledClipIdsRef.current.has(c.id)
        );

        // A scheduled clip whose sound key changed is stopped. Audible clips
        // are re-added at the live position; muted or finished clips are
        // forgotten so they can be scheduled again after a later edit.
        const changedAudioClips = clipsNow.filter((c) => {
          if (!scheduledClipIdsRef.current.has(c.id)) return false;
          return (
            audioScheduleKeyOf(c, ownAudio) !==
            scheduledAudioKeysRef.current.get(c.id)
          );
        });
        if (changedAudioClips.length > 0) {
          graph.stopClips(changedAudioClips.map((c) => c.id));
        }
        const restaleAudioClips = changedAudioClips.filter((c) =>
          isPendingAudioClip(c, liveMs, ownAudio)
        );
        const restaleAudioIds = new Set(restaleAudioClips.map((c) => c.id));
        for (const c of changedAudioClips) {
          if (restaleAudioIds.has(c.id)) continue;
          scheduledClipIdsRef.current.delete(c.id);
          scheduledAudioKeysRef.current.delete(c.id);
        }

        const pending = [...newlyEnteredClips, ...restaleAudioClips];
        if (pending.length === 0) return;

        // Mark up front so an overlapping tick (a slow asset fetch outliving
        // the 5 s interval) can't attempt the same clip twice.
        for (const c of pending) {
          scheduledClipIdsRef.current.add(c.id);
          const key = audioScheduleKeyOf(c, ownAudio);
          if (key !== null) scheduledAudioKeysRef.current.set(c.id, key);
        }

        const resolved = await Promise.all(
          pending.map((c) => resolveScheduledClip(c))
        );
        if (isStale()) return;

        const validClips = resolved.filter(
          (c): c is NonNullable<typeof c> => c !== null
        );
        if (validClips.length === 0) return;

        // `addClips` reuses scheduleClips' decode+schedule internals but
        // skips its "stop sources not in this list" prune, so sources
        // already playing from the initial window are left untouched.
        // A clip that becomes audible mid-playback may find the context
        // suspended (play began with nothing to hear, or it was suspended).
        const ctx = graph.getContext();
        if (ctx instanceof AudioContext && ctx.state === "suspended") {
          await ctx.resume();
          if (isStale()) return;
        }

        // Pass the clock reader: addClips awaits fetch and decode, and the
        // playhead keeps moving meanwhile.
        await graph.addClips(
          validClips,
          timelineApi.getState().tracks,
          getTimeMs,
          isStale,
          playbackApi.getState().rate
        );
      },
      [
        getTimeMs,
        audioScheduleKeyOf,
        playbackApi,
        resolveScheduledClip,
        timelineApi
      ]
    );

    const queueTopUpAudio = useCallback(
      (isStale: () => boolean) => {
        topUpQueueRef.current = topUpQueueRef.current
          .catch(() => undefined)
          .then(() => topUpAudio(isStale));
      },
      [topUpAudio]
    );

    const startAudioSession = useCallback(
      (isStale: () => boolean) => {
        audioSessionActiveRef.current = true;
        // Reconcile once after asynchronous initial rendering/scheduling. A
        // clip edit made while handlePlay was awaiting those steps otherwise
        // would leave the just-installed source stale until the timer fired.
        queueTopUpAudio(isStale);
        topUpIntervalRef.current = setInterval(() => {
          queueTopUpAudio(isStale);
        }, AUDIO_TOPUP_INTERVAL_MS);
      },
      [queueTopUpAudio]
    );

    // A timer keeps the lookahead window populated, but edits to a sounding
    // sounding clip must be audible immediately. Timeline subscriptions run
    // as soon as the document changes, so reconcile sources without waiting
    // for the next five-second top-up tick.
    useEffect(
      () =>
        timelineApi.subscribe(() => {
          if (!audioSessionActiveRef.current) return;
          const generation = playGenRef.current;
          queueTopUpAudio(
            () =>
              playGenRef.current !== generation ||
              !audioSessionActiveRef.current
          );
        }),
      [queueTopUpAudio, timelineApi]
    );

    // Starting, switching or ending an audition changes what a clip sounds
    // like without touching the document, so it reconciles the same way.
    useEffect(
      () =>
        useTimelineUIStore.subscribe((state, previous) => {
          if (state.audition === previous.audition) return;
          if (!audioSessionActiveRef.current) return;
          const generation = playGenRef.current;
          queueTopUpAudio(
            () =>
              playGenRef.current !== generation ||
              !audioSessionActiveRef.current
          );
        }),
      [queueTopUpAudio]
    );

    /** Set by the loop wrap so the seek-restart effect skips its debounce. */
    const loopWrapRef = useRef(false);

    /** The rate the running clock was started with; the rate-change restart
     *  effect compares against it so a same-rate re-render is not a restart. */
    const startedRateRef = useRef(1);

    const handlePlay = useCallback(async () => {
      const generation = ++playGenRef.current;
      const isStale = () => playGenRef.current !== generation;

      const graph = graphRef.current;
      const clock = clockRef.current;
      // A scrub grain's timer must not stop the sources scheduled below.
      scrubberRef.current?.cancel();

      // Kill any running clock now: during the async work below (context
      // resume, asset fetches) a still-ticking clock would keep overwriting
      // currentTimeMs from its old start position, stomping a fresh seek.
      clock.stop();
      // A fresh play/restart supersedes any top-up interval or debounced
      // seek-restart left over from a previous session.
      stopAudioSession();

      // Read fresh to avoid stale closure when the user scrubs before pressing play.
      let startMs = playbackApi.getState().currentTimeMs;
      // With loop on, playback wraps from the out point (or the content end)
      // back to the in point (or the top). Play In to Out stops at the out
      // point. Otherwise the marks do not bound playback and the live content
      // end stops it. The store `durationMs` is only set on load and never
      // recomputed as clips change.
      const loop = useTimelineLayoutStore.getState().loopPlayback;
      const {
        rangeInMs: markedIn,
        rangeOutMs: markedOut,
        playingInToOut
      } = playbackApi.getState();
      const ranged = loop || playingInToOut;
      const rangeIn = ranged ? markedIn : null;
      const rangeOut = ranged ? markedOut : null;
      const loopStartMs = rangeIn ?? 0;
      const endMs = rangeOut ?? contentEndMs;
      // Pressing Play while parked at the end restarts from the top (or the
      // in point).
      // Global playback speed, read fresh so a rate set before pressing play
      // (and the live rate-change restart below) takes effect. Feeds both the
      // clock and audio scheduling so the visual clock and audio stay locked.
      const globalRate = playbackApi.getState().rate;
      // The restart rule follows the rate's sign: reverse playback parked at
      // the end runs backwards from there instead of jumping to the top.
      const resolvedStartMs = resolvePlayStartMs({
        startMs,
        rate: globalRate,
        loopStartMs,
        endMs,
        frameMs: frameDeltaMs(fps)
      });
      if (resolvedStartMs !== startMs) {
        startMs = resolvedStartMs;
        setCurrentTimeMs(startMs);
      }

      play();

      startedRateRef.current = globalRate;
      const clockOptions = {
        floorMs: loopStartMs,
        // Loop wraps at the end; otherwise the clock parks there.
        onReachEnd:
          loop && endMs > loopStartMs
            ? () => {
                // A loop wrap restarts at once: there is no scrub burst to
                // wait out, and the debounce would stall picture and audio.
                loopWrapRef.current = true;
                playbackApi.getState().seek(loopStartMs);
              }
            : undefined
      };

      // Read fresh rather than closing over the reactive `clips` value so
      // this component never needs to subscribe to (and re-render on) the
      // clips array itself.
      const clipsNow = auditionedClips(
        timelineApi.getState().clips,
        useTimelineUIStore.getState().audition,
        timelineApi.getState()
      );
      // Backwards playback (J) is picture only: the audio graph schedules
      // forward from a source position.
      const ownAudio = ownAudioClipIds(
        clipsNow,
        timelineApi.getState().tracks
      );
      const remainingAudioClips =
        globalRate < 0
          ? []
          : clipsNow.filter((c) => isPendingAudioClip(c, startMs, ownAudio));
      // The metronome needs the audio clock even when nothing else sounds.
      const metronomeOn =
        audioOnly &&
        globalRate > 0 &&
        useTimelineLayoutStore.getState().metronomeEnabled;

      if (remainingAudioClips.length === 0 && !metronomeOn) {
        // Nothing left to play — e.g. a seek landed past the last audio
        // clip. Silence whatever an older gesture left running, but skip
        // AudioContext creation/resume entirely rather than paying the
        // autoplay-policy round trip for silence.
        graph.stopAll();
        clock.start(startMs, globalRate, null, endMs || Infinity, clockOptions);
        if (globalRate >= 0) startAudioSession(isStale);
        return;
      }

      const ctx = graph.getContext();
      if (ctx instanceof AudioContext) await ctx.resume();
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
        windowedClips.map((c) => resolveScheduledClip(c))
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
        const key = audioScheduleKeyOf(clip, ownAudio);
        if (key !== null) scheduledAudioKeysRef.current.set(clip.id, key);
      }

      clock.start(startMs, globalRate, ctx, endMs || Infinity, clockOptions);
      if (metronomeOn) {
        metronomeRef.current.start({
          context: ctx,
          anchorContextSec: ctx.currentTime,
          anchorMs: startMs,
          rate: globalRate,
          tempo: resolveTempo(timelineApi.getState())
        });
      }
      startAudioSession(isStale);
    }, [
      audioOnly,
      play,
      tracks,
      contentEndMs,
      fps,
      audioScheduleKeyOf,
      resolveScheduledClip,
      setCurrentTimeMs,
      stopAudioSession,
      startAudioSession,
      playbackApi,
      timelineApi
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

      if (loopWrapRef.current) {
        loopWrapRef.current = false;
        void handlePlay();
        return;
      }

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
      if (!isPlaying || rate === startedRateRef.current) return;
      seek(getTimeMs());
      // Only restart on an actual rate change, not on play/pause transitions.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rate]);

    const loopPlayback = useTimelineLayoutStore((s) => s.loopPlayback);
    const handleToggleLoop = useCallback(() => {
      useTimelineLayoutStore.getState().toggleLoopPlayback();
      // A running playback picks the new loop rule up from a restart.
      const playback = playbackApi.getState();
      if (playback.isPlaying) playback.seek(playback.getTimeMs());
    }, [playbackApi]);

    // Space always plays at normal speed; a J/L shuttle speed does not
    // outlive the pause that ended it.
    const handlePlayPauseToggle = useCallback(() => {
      if (isPlaying) {
        handlePause();
      } else {
        playbackApi.getState().setRate(1);
        void handlePlay();
      }
    }, [isPlaying, handlePlay, handlePause, playbackApi]);

    const stepFrame = useCallback(
      (direction: 1 | -1) => {
        if (isPlaying) {
          return;
        }
        const delta = frameDeltaMs(fps) * direction;
        const next = Math.max(
          0,
          Math.min(contentEndMs || Infinity, currentTimeMs + delta)
        );
        setCurrentTimeMs(next);
      },
      [isPlaying, fps, contentEndMs, currentTimeMs, setCurrentTimeMs]
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

    const goToStart = useCallback(() => {
      if (isPlaying) {
        handleStop();
      }
      setCurrentTimeMs(0);
    }, [isPlaying, handleStop, setCurrentTimeMs]);

    const goToEnd = useCallback(() => {
      if (isPlaying) {
        handleStop();
      }
      setCurrentTimeMs(contentEndMs || 0);
    }, [isPlaying, handleStop, setCurrentTimeMs, contentEndMs]);

    const containerRef = useRef<HTMLDivElement>(null);
    const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [previewQuality, setPreviewQuality] = useState<PreviewQuality>("auto");
    const autoQualityLabel = previewQualityScale(
      "auto",
      sequenceWidth,
      sequenceHeight,
      isPlaying
    ) === 1 ? t("i18n-next6.preview.full") : t("i18n-next6.preview.half");
    const isFullscreen = isNativeFullscreen || isExpanded;
    const [scrubMs, setScrubMs] = useState<number | null>(null);

    useEffect(() => {
      const onFullscreenChange = () => {
        setIsNativeFullscreen(document.fullscreenElement === containerRef.current);
      };
      document.addEventListener("fullscreenchange", onFullscreenChange);
      return () => {
        document.removeEventListener("fullscreenchange", onFullscreenChange);
      };
    }, []);

    useEffect(() => {
      if (!isExpanded) {
        return;
      }
      const container = containerRef.current;
      const previousFocus = document.activeElement;
      // The top layer escapes workspace clipping without remounting the canvas.
      if (container?.showPopover) {
        container.setAttribute("popover", "manual");
        container.showPopover();
      }
      container?.focus();
      return () => {
        if (container?.hasAttribute("popover")) {
          container.hidePopover();
          container.removeAttribute("popover");
        }
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
          previousFocus.focus();
        }
      };
    }, [isExpanded]);

    const handleFullscreen = useCallback(async () => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      if (isExpanded) {
        setIsExpanded(false);
      } else if (document.fullscreenElement === container) {
        await document.exitFullscreen();
      } else if (container.requestFullscreen) {
        try {
          await container.requestFullscreen();
        } catch {
          // Embedded browsers can expose the API while refusing the request.
          setIsExpanded(true);
        }
      } else {
        setIsExpanded(true);
      }
    }, [isExpanded]);

    // Ctrl+` asks for full screen through the UI store. The count a mount
    // starts at is not a request.
    const fullscreenRequest = useTimelineUIStore((s) => s.previewFullscreenRequest);
    const handledFullscreenRequest = useRef(fullscreenRequest);
    useEffect(() => {
      if (handledFullscreenRequest.current === fullscreenRequest) {
        return;
      }
      handledFullscreenRequest.current = fullscreenRequest;
      if (!audioOnly) {
        void handleFullscreen();
      }
    }, [audioOnly, fullscreenRequest, handleFullscreen]);

    const scrubMax = Math.max(1, contentEndMs);
    const scrubValue = Math.min(scrubMax, scrubMs ?? currentTimeMs);

    // Live timecode without per-frame React renders: while playing, subscribe
    // to the transient playhead and write the readout straight to the DOM.

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

    // Targeted at the preview root: every open workspace tab stays mounted, and
    // an inert one must not swallow Space from the visible editor.
    const previewTarget = useCallback(() => containerRef.current, []);
    useCombo([" "], handlePlayPauseToggle, true, true, {
      target: previewTarget
    });

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        switch (e.key) {
          case "Escape":
            if (isExpanded) {
              e.preventDefault();
              e.stopPropagation();
              setIsExpanded(false);
            }
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
            goToStart();
            break;
          case "End":
            e.preventDefault();
            goToEnd();
            break;
          default:
            break;
        }
      },
      [
        isExpanded,
        jumpToPrevBoundary,
        jumpToNextBoundary,
        stepFrame,
        goToStart,
        goToEnd
      ]
    );

    // Transport tooltips name the keys of the active keyboard layout, the same
    // table the tracks window handler resolves against.
    const keyboardPreset = useSettingsStore(
      (s) => s.settings.timelineKeyboardPreset
    );

    const durationTimecode = formatTimecode(contentEndMs, fps);

    // Playback no longer re-renders the bar (see above), but a scrub still
    // does, once per discrete `currentTimeMs` write.
    const containerCss = useMemo(() => containerStyles(theme), [theme]);
    const controlBarCss = useMemo(() => controlBarStyles(theme), [theme]);
    const timecodeCss = useMemo(() => timecodeStyles(theme), [theme]);
    const scrubberCss = useMemo(() => scrubberStyles(theme), [theme]);
    const durationCss = useMemo(() => durationStyles(theme), [theme]);
    const fpsCss = useMemo(() => fpsStyles(theme), [theme]);

    if (audioOnly) {
      return (
        <div
          ref={containerRef}
          css={containerCss}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          aria-label={t("i18n-next6.preview.transport")}
          data-testid="preview-area"
          data-audio-only="true"
        >
          <DawTransport
            isPlaying={isPlaying}
            onPlayPause={handlePlayPauseToggle}
            onStop={handleStop}
            fps={fps}
            volume={volume}
            isMuted={isMuted}
            onVolumeChange={handleVolumeChange}
            onToggleMute={toggleMute}
            playPauseKey={PLAY_PAUSE_KEY}
          />
        </div>
      );
    }

    return (
      <div
        ref={containerRef}
        css={containerCss}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-label={t("i18n-next6.preview.previewArea")}
        data-testid="preview-area"
        data-expanded={isExpanded}
      >
        <div css={viewportStyles}>
          <PreviewCompositor quality={previewQuality} />
        </div>

        <div css={controlBarCss}>
          {/* The skip icons read as "to the start" and "to the end", as in
              every media player: three of three study 16 sessions pressed
              this one to play from the beginning. Clip boundaries stay on
              Shift+Arrow and the timeline's own keys. Never hidden, because
              a narrow window would otherwise lose its only way back to 0. */}
          <ToolbarIconButton
            icon={<SkipPreviousIcon />}
            tooltip={`${t("i18n-next6.preview.goToStart")} (Home)`}
            onClick={goToStart}
            aria-label={t("i18n-next6.preview.goToStart")}
            size="small"
          />

          <ToolbarIconButton
            icon={<NavigateBeforeIcon />}
            tooltip={withActionShortcut(t("i18n-next6.preview.stepBackOneFrame"), keyboardPreset, "stepFrameBack")}
            onClick={stepBack}
            disabled={isPlaying}
            aria-label={t("i18n-next6.preview.stepBackOneFrame")}
            size="small"
            className="timeline-preview__secondary-control"
          />

          <ToolbarIconButton
            icon={isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
            tooltip={`${isPlaying ? t("i18n-next6.preview.pause") : t("i18n-next6.preview.play")} (${PLAY_PAUSE_KEY})`}
            onClick={handlePlayPauseToggle}
            aria-label={isPlaying ? t("i18n-next6.preview.pause") : t("i18n-next6.preview.play")}
            variant="primary"
            size="small"
          />

          <ToolbarIconButton
            icon={<StopIcon />}
            tooltip={t("i18n-next6.preview.stopAndReturnToStart")}
            onClick={handleStop}
            aria-label={t("i18n-next6.preview.stop")}
            size="small"
          />

          <ToolbarIconButton
            icon={<RepeatIcon />}
            tooltip={withActionShortcut(
              loopPlayback
                ? t("i18n-next6.preview.loopOnDescription")
                : t("i18n-next6.preview.loopPlayback"),
              keyboardPreset,
              "toggleLoop"
            )}
            onClick={handleToggleLoop}
            aria-label={t("i18n-next6.preview.loop")}
            aria-pressed={loopPlayback}
            active={loopPlayback}
            size="small"
            className="timeline-preview__secondary-control"
          />

          <ToolbarIconButton
            icon={<NavigateNextIcon />}
            tooltip={withActionShortcut(t("i18n-next6.preview.stepForwardOneFrame"), keyboardPreset, "stepFrameForward")}
            onClick={stepForward}
            disabled={isPlaying}
            aria-label={t("i18n-next6.preview.stepForwardOneFrame")}
            size="small"
            className="timeline-preview__secondary-control"
          />

          <ToolbarIconButton
            icon={<SkipNextIcon />}
            tooltip={`${t("i18n-next6.preview.goToEnd")} (End)`}
            onClick={goToEnd}
            aria-label={t("i18n-next6.preview.goToEnd")}
            size="small"
            className="timeline-preview__secondary-control"
          />

          {showTimecode && (
            <EditableTimecode css={timecodeCss} fps={fps} />
          )}
          <div css={scrubberCss}>
            <PlaybackScrubber
              max={scrubMax}
              value={scrubValue}
              isPlaying={isPlaying}
              subscribeTime={subscribeTime}
              step={frameDeltaMs(fps)}
              onChange={handleScrubChange}
              onChangeCommitted={handleScrubCommit}
            />
          </div>
          {showDuration && (
            <Caption css={durationCss} className="timeline-preview__duration">
              /{durationTimecode}
            </Caption>
          )}
          {showFps && (
            <Caption css={fpsCss} className="timeline-preview__fps">
              {t("i18n-next6.preview.framesPerSecond", { count: fps })}
            </Caption>
          )}

          <SelectField
            label={t("i18n-next6.preview.previewQuality")}
            hideLabel
            size="small"
            value={previewQuality}
            onChange={(value) => {
              if (value === "auto" || value === "full" || value === "half" || value === "quarter") {
                setPreviewQuality(value);
              }
            }}
            options={[
              { value: "auto", label: t("i18n-next6.preview.autoQuality", { quality: autoQualityLabel }) },
              { value: "full", label: t("i18n-next6.preview.full") },
              { value: "half", label: t("i18n-next6.preview.half") },
              { value: "quarter", label: t("i18n-next6.preview.quarter") }
            ]}
            className="timeline-preview__quality"
          />

          <ToolbarIconButton
            icon={
              isSilent ? (
                <VolumeOffIcon />
              ) : volume < 0.5 ? (
                <VolumeDownIcon />
              ) : (
                <VolumeUpIcon />
              )
            }
            tooltip={isSilent ? t("i18n-next6.preview.unmute") : t("i18n-next6.preview.mute")}
            onClick={toggleMute}
            aria-label={isSilent ? t("i18n-next6.preview.unmute") : t("i18n-next6.preview.mute")}
            aria-pressed={isSilent}
            size="small"
          />
          <div className="timeline-preview__volume">
            <Slider
              aria-label={t("i18n-next6.preview.volume")}
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              getAriaValueText={(v) => `${Math.round(v * 100)}%`}
              density="compact"
            />
          </div>

          <ToolbarIconButton
            icon={<FilterBAndWOutlinedIcon />}
            tooltip={t("i18n-next6.preview.showSubjectMatte")}
            onClick={toggleMatteView}
            disabled={!hasReadyMatte}
            active={matteViewEnabled}
            aria-label={t("i18n-next6.preview.showMatte")}
            aria-pressed={matteViewEnabled}
            size="small"
            className="timeline-preview__matte-view"
          />

          <ToolbarIconButton
            icon={isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
            tooltip={isFullscreen ? t("i18n-next6.preview.exitFullscreen") : t("i18n-next6.preview.fullscreen")}
            onClick={handleFullscreen}
            aria-label={isFullscreen ? t("i18n-next6.preview.exitFullscreen") : t("i18n-next6.preview.fullscreen")}
            size="small"
            className="timeline-preview__fullscreen"
          />
        </div>
      </div>
    );
  }
);

PreviewArea.displayName = "PreviewArea";
