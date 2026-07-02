import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore
} from "react";

import {
  Box,
  Caption,
  EmptyState,
  FlexColumn,
  FlexRow,
  LoadingSpinner
} from "../ui_primitives";
import { BASE_URL } from "../../stores/BASE_URL";
import type { Asset } from "../../stores/ApiTypes";
import { useSaveAudioToAsset } from "../../hooks/audio/useSaveAudioToAsset";
import WaveformView, { type Selection } from "./WaveformView";
import AudioEditorToolbar from "./AudioEditorToolbar";
import { useEditHistory } from "./useEditHistory";
import { createPlayheadStore, type PlayheadStore } from "./playheadStore";
import {
  applyGain,
  audioBufferToSample,
  cropToRange,
  deleteRange,
  fade,
  normalize,
  reverseRange,
  sampleDuration,
  sampleToAudioBuffer,
  silenceRange,
  type AudioSample
} from "./audioSample";

interface AudioSampleEditorProps {
  asset: Asset;
  onClose: () => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 64;
const ZOOM_STEP = 1.5;

const resolveMediaUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  const trimmed = url.trim();
  if (trimmed === "") return null;
  if (/^(https?:|data:|blob:)/.test(trimmed)) return trimmed;
  return trimmed.startsWith("/") ? `${BASE_URL}${trimmed}` : trimmed;
};

const getAudioContextCtor = (): typeof AudioContext | null => {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext ??
    null
  );
};

const formatTime = (seconds: number): string => {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  const ms = Math.floor((safe % 1) * 1000);
  return `${m}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
};

/** Clock in the footer — the only editor text that updates during playback. */
const PlaybackClock = memo(function PlaybackClock({
  playhead,
  duration
}: {
  playhead: PlayheadStore;
  duration: number;
}) {
  const seconds = useSyncExternalStore(
    playhead.subscribe,
    playhead.get,
    playhead.get
  );
  return (
    <Caption>
      {formatTime(seconds)} / {formatTime(duration)}
    </Caption>
  );
});

/**
 * In-browser audio sample editor (Audacity-style): decode an asset into PCM,
 * select a region on the waveform, apply destructive edits (trim, delete,
 * silence, fade, normalize, reverse, gain) with undo/redo, audition with the
 * transport, and save the result back to the asset as WAV.
 *
 * The playhead advances every animation frame during playback, so it lives in
 * an external store (`playheadStore`) rather than state here — only the
 * playhead line and the clock subscribe, and this component doesn't re-render
 * per frame.
 */
const AudioSampleEditor = ({ asset, onClose }: AudioSampleEditorProps) => {
  const history = useEditHistory<AudioSample>();
  const sample = history.present;
  const sampleRef = useRef<AudioSample | null>(null);
  sampleRef.current = sample;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selection, setSelection] = useState<Selection | null>(null);
  const selectionRef = useRef<Selection | null>(null);
  selectionRef.current = selection;

  const [playhead] = useState(createPlayheadStore);

  const [isPlaying, setIsPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const loopRef = useRef(loop);
  loopRef.current = loop;
  const [zoom, setZoom] = useState(1);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playBufferRef = useRef<{
    sample: AudioSample;
    buffer: AudioBuffer;
  } | null>(null);
  const rafRef = useRef<number | null>(null);
  const startCtxTimeRef = useRef(0);
  const startOffsetRef = useRef(0);
  const endRef = useRef(0);

  const getUrlRef = useRef(asset.get_url);
  getUrlRef.current = asset.get_url;

  const { save, saving } = useSaveAudioToAsset(asset);

  const getCtx = useCallback((): AudioContext => {
    if (!audioCtxRef.current) {
      const Ctor = getAudioContextCtor();
      if (!Ctor) throw new Error("Web Audio API is not available");
      audioCtxRef.current = new Ctor();
    }
    return audioCtxRef.current;
  }, []);

  const teardownSource = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const src = sourceRef.current;
    if (src) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        // already stopped
      }
      src.disconnect();
      sourceRef.current = null;
    }
  }, []);

  const play = useCallback(() => {
    const current = sampleRef.current;
    if (!current) return;
    const ctx = getCtx();
    void ctx.resume();
    teardownSource();

    const duration = sampleDuration(current);
    const sel = selectionRef.current;
    const useLoop = loopRef.current;
    const begin = Math.max(
      0,
      Math.min(sel ? sel.start : playhead.get(), duration)
    );
    const end = sel ? sel.end : duration;

    const src = ctx.createBufferSource();
    // Building the AudioBuffer copies every channel, so reuse it while the
    // sample is unchanged (replay, loop, seek-and-play).
    if (playBufferRef.current?.sample !== current) {
      playBufferRef.current = {
        sample: current,
        buffer: sampleToAudioBuffer(current, ctx)
      };
    }
    src.buffer = playBufferRef.current.buffer;
    src.connect(ctx.destination);
    if (useLoop) {
      src.loop = true;
      if (sel) {
        src.loopStart = sel.start;
        src.loopEnd = sel.end;
      }
    }

    startCtxTimeRef.current = ctx.currentTime;
    startOffsetRef.current = begin;
    endRef.current = end;
    src.start(0, begin, useLoop ? undefined : Math.max(0, end - begin));
    src.onended = () => {
      if (loopRef.current) return;
      teardownSource();
      setIsPlaying(false);
      playhead.set(selectionRef.current ? selectionRef.current.start : begin);
    };
    sourceRef.current = src;
    setIsPlaying(true);

    const tick = () => {
      const elapsed = getCtx().currentTime - startCtxTimeRef.current;
      let t = startOffsetRef.current + elapsed;
      const s = selectionRef.current;
      if (loopRef.current && s && s.end > s.start) {
        t = s.start + ((t - s.start) % (s.end - s.start));
      } else if (t > endRef.current) {
        t = endRef.current;
      }
      playhead.set(t);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [getCtx, teardownSource, playhead]);

  const pause = useCallback(() => {
    teardownSource();
    setIsPlaying(false);
  }, [teardownSource]);

  const stop = useCallback(() => {
    teardownSource();
    setIsPlaying(false);
    playhead.set(selectionRef.current ? selectionRef.current.start : 0);
  }, [teardownSource, playhead]);

  const togglePlay = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, pause, play]);

  // Load + decode the asset once per identity. get_url changes after our own
  // save must not reload and wipe in-progress edits.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const url = resolveMediaUrl(getUrlRef.current);
    if (!url) {
      setError("This audio asset has no URL to load.");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch audio (HTTP ${response.status})`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const decoded = await getCtx().decodeAudioData(arrayBuffer);
        if (cancelled) return;
        history.reset(audioBufferToSample(decoded));
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asset.id]);

  // Stop playback and re-clamp selection/playhead whenever the sample changes
  // (edit, undo, or redo).
  useEffect(() => {
    if (!sample) return;
    teardownSource();
    setIsPlaying(false);
    const duration = sampleDuration(sample);
    setSelection((sel) => {
      if (!sel) return null;
      const start = Math.min(sel.start, duration);
      const end = Math.min(sel.end, duration);
      return end > start ? { start, end } : null;
    });
    if (playhead.get() > duration) {
      playhead.set(duration);
    }
  }, [sample, teardownSource, playhead]);

  useEffect(
    () => () => {
      teardownSource();
      if (audioCtxRef.current) {
        void audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
    },
    [teardownSource]
  );

  // Element state (not a ref) so the observer attaches when the wave area
  // mounts — it only appears after loading finishes, past the mount effect.
  const [waveArea, setWaveArea] = useState<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    if (!waveArea) return;
    const observer = new ResizeObserver((entries) => {
      setContainerWidth(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(waveArea);
    return () => observer.disconnect();
  }, [waveArea]);

  const duration = sample ? sampleDuration(sample) : 0;
  const fitPps =
    duration > 0 && containerWidth > 0 ? containerWidth / duration : 100;
  const pixelsPerSecond = Math.max(1, fitPps * zoom);

  const hasSelection = !!selection && selection.end > selection.start;

  const commitEdit = useCallback(
    (fn: (s: AudioSample) => AudioSample) => {
      const current = sampleRef.current;
      if (!current) return;
      history.commit(fn(current));
    },
    [history]
  );

  const handleTrim = useCallback(() => {
    if (!selection) return;
    commitEdit((s) => cropToRange(s, selection.start, selection.end));
    setSelection(null);
    playhead.set(0);
  }, [selection, commitEdit, playhead]);

  const handleDelete = useCallback(() => {
    if (!selection) return;
    const start = selection.start;
    commitEdit((s) => deleteRange(s, selection.start, selection.end));
    setSelection(null);
    playhead.set(start);
  }, [selection, commitEdit, playhead]);

  const handleSilence = useCallback(() => {
    if (!selection) return;
    commitEdit((s) => silenceRange(s, selection.start, selection.end));
  }, [selection, commitEdit]);

  const handleFade = useCallback(
    (direction: "in" | "out") => {
      if (!selection) return;
      commitEdit((s) => fade(s, selection.start, selection.end, direction));
    },
    [selection, commitEdit]
  );

  const handleNormalize = useCallback(() => {
    commitEdit((s) => normalize(s, selection?.start, selection?.end));
  }, [selection, commitEdit]);

  const handleReverse = useCallback(() => {
    commitEdit((s) => reverseRange(s, selection?.start, selection?.end));
  }, [selection, commitEdit]);

  const handleGain = useCallback(
    (factor: number) => {
      commitEdit((s) => applyGain(s, factor, selection?.start, selection?.end));
    },
    [selection, commitEdit]
  );

  const handleFadeIn = useCallback(() => handleFade("in"), [handleFade]);
  const handleFadeOut = useCallback(() => handleFade("out"), [handleFade]);
  const handleAmplify = useCallback(() => handleGain(1.4), [handleGain]);
  const handleQuieten = useCallback(() => handleGain(0.7), [handleGain]);
  const handleToggleLoop = useCallback(() => setLoop((v) => !v), []);

  const handleSave = useCallback(() => {
    if (sampleRef.current) void save(sampleRef.current);
  }, [save]);

  const zoomIn = useCallback(
    () => setZoom((z) => Math.min(MAX_ZOOM, z * ZOOM_STEP)),
    []
  );
  const zoomOut = useCallback(
    () => setZoom((z) => Math.max(MIN_ZOOM, z / ZOOM_STEP)),
    []
  );
  const zoomFit = useCallback(() => setZoom(1), []);

  if (loading) {
    return (
      <FlexColumn fullWidth fullHeight align="center" justify="center">
        <LoadingSpinner />
      </FlexColumn>
    );
  }

  if (error || !sample) {
    return (
      <FlexColumn fullWidth fullHeight align="center" justify="center">
        <EmptyState
          variant="error"
          title="Could not open audio editor"
          description={error ?? "Audio could not be decoded."}
          actionText="Done"
          onAction={onClose}
        />
      </FlexColumn>
    );
  }

  return (
    <FlexColumn fullWidth fullHeight sx={{ overflow: "hidden" }}>
      <AudioEditorToolbar
        isPlaying={isPlaying}
        loop={loop}
        zoom={zoom}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        canZoomIn={zoom < MAX_ZOOM}
        canZoomOut={zoom > MIN_ZOOM}
        hasSelection={hasSelection}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        saving={saving}
        canSave={!loading && !error}
        onTogglePlay={togglePlay}
        onStop={stop}
        onToggleLoop={handleToggleLoop}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomFit={zoomFit}
        onZoomChange={setZoom}
        onTrim={handleTrim}
        onDelete={handleDelete}
        onSilence={handleSilence}
        onFadeIn={handleFadeIn}
        onFadeOut={handleFadeOut}
        onNormalize={handleNormalize}
        onAmplify={handleAmplify}
        onQuieten={handleQuieten}
        onReverse={handleReverse}
        onUndo={history.undo}
        onRedo={history.redo}
        onSave={handleSave}
        onDone={onClose}
      />

      <Box ref={setWaveArea} sx={{ flex: 1, minHeight: 0, position: "relative" }}>
        <WaveformView
          sample={sample}
          pixelsPerSecond={pixelsPerSecond}
          selection={selection}
          playhead={playhead}
          onSelectionChange={setSelection}
          onSeek={playhead.set}
        />
      </Box>

      <FlexRow
        align="center"
        justify="space-between"
        sx={{
          flexShrink: 0,
          px: 1.5,
          py: 0.5,
          borderTop: "1px solid var(--palette-divider)"
        }}
      >
        <Caption>
          {hasSelection && selection
            ? `Selection ${formatTime(selection.start)} – ${formatTime(
                selection.end
              )} (${formatTime(selection.end - selection.start)})`
            : "Drag to select · Click to seek"}
        </Caption>
        <PlaybackClock playhead={playhead} duration={duration} />
      </FlexRow>
    </FlexColumn>
  );
};

export default AudioSampleEditor;
