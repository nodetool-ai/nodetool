import { useCallback, useEffect, useRef, useState } from "react";
import { Chunk } from "../../stores/ApiTypes";
import {
  base64ToUint8Array,
  int16ToFloat32
} from "../../components/node/output/audio";
import { useAudioQueue } from "../../stores/AudioQueueStore";
import { useSettingsStore } from "../../stores/SettingsStore";
import { subscribeRealtimeAudioChunks } from "../../lib/audio/realtimeAudioChunkBus";

interface UseRealtimeAudioPlaybackOptions {
  chunks: Chunk[];
  sampleRate?: number;
  channels?: number;
  nodeId?: string; // Optional ID for this audio source
  /**
   * Live-monitoring mode: keep the scheduled lead over the playhead within a
   * small bound by dropping stale chunks instead of queueing them. Use for
   * infinite realtime streams (modular patches) where hearing "now" matters
   * more than hearing everything. Off by default so completed streams keep
   * full replay semantics.
   */
  live?: boolean;
}

/** Default live buffer when the setting is absent/invalid (ms). */
const DEFAULT_AUDIO_BUFFER_MS = 100;
/** Clamp range for the configurable buffer (ms). */
const MIN_AUDIO_BUFFER_MS = 20;
const MAX_AUDIO_BUFFER_MS = 1000;

interface UseRealtimeAudioPlaybackReturn {
  isPlaying: boolean;
  isQueued: boolean;
  queuePosition: number | null;
  start: () => void;
  stop: () => void;
  restart: () => void;
  stream: MediaStream | null;
  visualizerVersion: number;
}

/**
 * Hook for managing realtime audio playback from streaming chunks.
 * Handles AudioContext creation, chunk scheduling, and playback control.
 * Integrates with global audio queue to prevent overlapping playback.
 */
export const useRealtimeAudioPlayback = ({
  chunks,
  sampleRate = 22000,
  channels = 1,
  nodeId,
  live = false
}: UseRealtimeAudioPlaybackOptions): UseRealtimeAudioPlaybackReturn => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  // Scheduled chunks tracked by object identity, not array index: chunk
  // arrays get replaced when a new run starts and may be head-trimmed by the
  // store's live-buffer cap, so indices are not stable but the chunk objects
  // are.
  const scheduledChunksRef = useRef<WeakSet<Chunk>>(new WeakSet());
  const instanceIdRef = useRef<string>(
    nodeId || `audio-${Date.now()}-${Math.random()}`
  );
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True once the worklet sink is playing and the store-side backlog has been
  // flushed — only then may bus-delivered chunks go straight to the worklet
  // (engaging earlier would post new chunks ahead of the unflushed backlog).
  const liveSinkActiveRef = useRef<boolean>(false);
  const [internalPlaying, setInternalPlaying] = useState<boolean>(false);
  const [wantsToPlay, setWantsToPlay] = useState<boolean>(true);
  const [visualizerVersion, setVisualizerVersion] = useState<number>(0);

  // Preferred sink: an AudioWorklet that buffers and renders chunks on the
  // audio rendering thread — playback is then immune to main-thread jank.
  // "pending" while the worklet module loads; "unavailable" falls back to
  // AudioBufferSourceNode-per-chunk scheduling.
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const [workletState, setWorkletState] = useState<
    "pending" | "ready" | "unavailable"
  >("pending");

  // Configurable live buffer: max audio held ahead of the playhead. Smaller
  // = lower knob-to-ear latency, larger = more dropout resilience. The prime
  // (jitter re-fill) level scales with it.
  const audioBufferMs = useSettingsStore((s) => s.settings.audioBufferMs);
  const maxLeadSeconds =
    Math.min(
      MAX_AUDIO_BUFFER_MS,
      Math.max(
        MIN_AUDIO_BUFFER_MS,
        Number.isFinite(audioBufferMs) && audioBufferMs > 0
          ? audioBufferMs
          : DEFAULT_AUDIO_BUFFER_MS
      )
    ) / 1000;
  const primeSeconds = Math.min(0.04, maxLeadSeconds / 2);

  const audioQueue = useAudioQueue();
  const isQueuedPlaying = audioQueue.isPlaying(instanceIdRef.current);
  const isQueued = audioQueue.isQueued(instanceIdRef.current);
  const queuePosition = isQueued
    ? audioQueue.queue.findIndex((q) => q.id === instanceIdRef.current) + 1
    : null;

  // Initialize AudioContext and routing
  useEffect(() => {
    type WebkitAudioWindow = Window & { webkitAudioContext?: typeof AudioContext };
    const Ctx: typeof AudioContext =
      window.AudioContext || (window as WebkitAudioWindow).webkitAudioContext!;
    // Ask for the chunk sample rate so the worklet's resampler is a
    // pass-through; browsers that don't support the option get their default
    // rate and the worklet interpolates.
    let ctx: AudioContext;
    try {
      ctx = new Ctx({ sampleRate, latencyHint: "interactive" });
    } catch {
      ctx = new Ctx();
    }
    audioContextRef.current = ctx;
    const streamDest = ctx.createMediaStreamDestination();
    streamDestRef.current = streamDest;
    const gain = ctx.createGain();
    gainRef.current = gain;
    gain.connect(ctx.destination);
    gain.connect(streamDest);
    nextStartTimeRef.current = ctx.currentTime;

    // Load the worklet sink. The URL module is imported dynamically so its
    // `import.meta.url` never reaches the jest transform; environments
    // without AudioWorklet (or a failed module load) fall back to
    // buffer-source scheduling.
    let cancelled = false;
    setWorkletState("pending");
    (async () => {
      try {
        if (typeof ctx.audioWorklet?.addModule !== "function") {
          throw new Error("AudioWorklet unavailable");
        }
        const { getChunkPlayerWorkletUrl } = await import(
          "../../lib/audio/chunkPlayerWorkletUrl"
        );
        await ctx.audioWorklet.addModule(getChunkPlayerWorkletUrl());
        if (cancelled) return;
        const node = new AudioWorkletNode(ctx, "nodetool-chunk-player", {
          numberOfInputs: 0,
          outputChannelCount: [Math.max(1, channels)]
        });
        node.connect(gain);
        workletNodeRef.current = node;
        setWorkletState("ready");
      } catch {
        if (!cancelled) setWorkletState("unavailable");
      }
    })();

    return () => {
      cancelled = true;
      sourcesRef.current.forEach((s) => {
        try {
          s.stop();
          s.disconnect();
        } catch {
          // Silently ignore cleanup errors during unmount
        }
      });
      sourcesRef.current = [];
      try {
        workletNodeRef.current?.disconnect();
      } catch {
        // Silently ignore worklet disconnect errors during unmount
      }
      workletNodeRef.current = null;
      try {
        ctx.close();
      } catch {
        // Silently ignore AudioContext close errors during unmount
      }
      audioContextRef.current = null;
      streamDestRef.current = null;
      gainRef.current = null;
      // Clear any pending restart timeout
      if (restartTimeoutRef.current !== null) {
        clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }
    };
  }, [sampleRate, channels]);

  // Keep the worklet's stream parameters current.
  useEffect(() => {
    const node = workletNodeRef.current;
    if (workletState !== "ready" || !node) return;
    node.port.postMessage({
      type: "config",
      sampleRate,
      channels,
      live,
      // Live patches prime a small jitter buffer and cap the backlog (drop
      // stale audio, monitor "now"); replay streams buffer without bound.
      primeSeconds: live ? primeSeconds : 0.02,
      maxLeadSeconds: live ? maxLeadSeconds : 0
    });
  }, [workletState, sampleRate, channels, live, primeSeconds, maxLeadSeconds]);

  // Interleaved float samples from any of the three chunk payload forms:
  // native Float32Array (in-process), base64 f32le (websocket wire form),
  // or base64 pcm16 (external/legacy sources).
  const decodeChunkSamples = useCallback(
    (chunk: Chunk): Float32Array | null => {
      const content = chunk.content;
      if (content instanceof Float32Array) {
        return content;
      }
      if (typeof content !== "string" || !content) {
        return null;
      }
      const u8 = base64ToUint8Array(content);
      const encoding = (
        chunk.content_metadata as { encoding?: unknown } | undefined
      )?.encoding;
      if (encoding === "f32le") {
        return new Float32Array(u8.buffer, u8.byteOffset, u8.byteLength / 4);
      }
      const frameSamples = new Int16Array(
        u8.buffer,
        u8.byteOffset,
        u8.byteLength / 2
      );
      return int16ToFloat32(frameSamples);
    },
    []
  );

  const scheduleChunk = useCallback(
    (chunk: Chunk) => {
      const ctx = audioContextRef.current;
      const gain = gainRef.current;
      if (!ctx || !gain) {
        return;
      }
      const samples = decodeChunkSamples(chunk);
      if (!samples || samples.length === 0) {
        return;
      }
      const frameCount = Math.floor(samples.length / channels);
      const buffer = ctx.createBuffer(channels, frameCount, sampleRate);
      if (channels === 1) {
        buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
      } else {
        for (let ch = 0; ch < channels; ch++) {
          const channelData = new Float32Array(frameCount);
          for (let i = 0; i < frameCount; i++) {
            channelData[i] = samples[i * channels + ch];
          }
          buffer.copyToChannel(channelData, ch);
        }
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      const startTime = Math.max(nextStartTimeRef.current, ctx.currentTime);
      try {
        source.start(startTime);
        nextStartTimeRef.current = startTime + buffer.duration;
      } catch {
        // Fallback to starting immediately if startTime scheduling fails
        source.start();
        nextStartTimeRef.current = ctx.currentTime + buffer.duration;
      }
      source.onended = () => {
        try {
          source.disconnect();
        } catch {
          // Silently ignore disconnect errors in cleanup
        }
      };
      sourcesRef.current.push(source);
    },
    [channels, sampleRate, decodeChunkSamples]
  );

  // Internal play/stop functions (called by queue)
  const internalStart = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx) {
      return;
    }
    try {
      ctx.resume();
    } catch {
      // Silently ignore AudioContext resume errors
    }
    nextStartTimeRef.current = ctx.currentTime;
    setInternalPlaying(true);
  }, []);

  const internalStop = useCallback(() => {
    setInternalPlaying(false);
    liveSinkActiveRef.current = false;
    // Drop the worklet's buffered audio so sound stops immediately.
    workletNodeRef.current?.port.postMessage({ type: "reset" });
    sourcesRef.current.forEach((s) => {
      try {
        s.stop();
        s.disconnect();
      } catch {
        // Silently ignore stop/disconnect errors in cleanup
      }
    });
    sourcesRef.current = [];
    const ctx = audioContextRef.current;
    if (ctx) {
      nextStartTimeRef.current = ctx.currentTime;
    }
  }, []);

  // Duration of one chunk without decoding it (native Float32Array, base64
  // f32le, or base64 pcm16 payloads).
  const chunkDurationSeconds = useCallback(
    (chunk: Chunk): number => {
      const content = chunk.content;
      if (content instanceof Float32Array) {
        return Math.floor(content.length / channels) / sampleRate;
      }
      if (typeof content !== "string" || !content) {
        return 0;
      }
      let bytes = Math.floor((content.length * 3) / 4);
      if (content.endsWith("==")) {
        bytes -= 2;
      } else if (content.endsWith("=")) {
        bytes -= 1;
      }
      const encoding = (
        chunk.content_metadata as { encoding?: unknown } | undefined
      )?.encoding;
      const bytesPerSample = encoding === "f32le" ? 4 : 2;
      return Math.floor(bytes / bytesPerSample / channels) / sampleRate;
    },
    [channels, sampleRate]
  );

  // Schedule newly arrived chunks when actually playing (queue approved)
  useEffect(() => {
    if (!internalPlaying || !isQueuedPlaying) {
      liveSinkActiveRef.current = false;
      return;
    }
    if (workletState === "pending") {
      // Sink not decided yet; chunks stay unscheduled (WeakSet untouched)
      // and re-enter on the next effect run once the worklet resolves.
      return;
    }
    const ctx = audioContextRef.current;
    const pending = chunks.filter(
      (c) =>
        c?.content_type === "audio" &&
        (typeof c.content === "string" ||
          c.content instanceof Float32Array) &&
        !scheduledChunksRef.current.has(c)
    );

    // Worklet sink: hand the samples to the audio thread and be done — the
    // processor owns priming, jitter buffering and live stale-dropping.
    const workletNode =
      workletState === "ready" ? workletNodeRef.current : null;
    if (workletNode) {
      for (const chunk of pending) {
        scheduledChunksRef.current.add(chunk);
        const samples = decodeChunkSamples(chunk);
        if (samples && samples.length > 0) {
          workletNode.port.postMessage({ type: "chunk", samples });
        }
      }
      // Backlog flushed — from here on, the bus delivers new chunks to the
      // worklet directly (same task as the message, no render round trip).
      liveSinkActiveRef.current = true;
      return;
    }
    liveSinkActiveRef.current = false;
    if (pending.length === 0) {
      return;
    }

    // Fallback sink: buffer-source-per-chunk scheduling on the main thread.
    // In live mode, cap how far the schedule may run ahead of the playhead.
    // Without the cap, any backlog — chunks buffered before the audio queue
    // approved playback, or a burst after a main-thread stall — is queued
    // back-to-back and becomes *permanent* monitoring latency. Walk the
    // pending chunks newest-first, keep what fits in the lead budget, and
    // drop the rest as stale.
    let firstKept = 0;
    if (live && ctx) {
      if (nextStartTimeRef.current <= ctx.currentTime) {
        // Underrun (or fresh start): re-prime a small jitter buffer so the
        // next late chunk doesn't click.
        nextStartTimeRef.current = ctx.currentTime + primeSeconds;
      }
      let budget =
        maxLeadSeconds - (nextStartTimeRef.current - ctx.currentTime);
      firstKept = pending.length;
      for (let i = pending.length - 1; i >= 0; i--) {
        const duration = chunkDurationSeconds(pending[i]);
        if (duration > budget) {
          break;
        }
        budget -= duration;
        firstKept = i;
      }
    }

    for (let i = 0; i < pending.length; i++) {
      // Dropped chunks are marked scheduled too — they're consumed, not
      // deferred.
      scheduledChunksRef.current.add(pending[i]);
      if (i >= firstKept) {
        scheduleChunk(pending[i]);
      }
    }
  }, [
    chunks,
    internalPlaying,
    isQueuedPlaying,
    live,
    workletState,
    primeSeconds,
    maxLeadSeconds,
    decodeChunkSamples,
    chunkDurationSeconds,
    scheduleChunk
  ]);

  // React-free live feed: chunks published by the message handler go to the
  // worklet in the delivery task itself, so playback doesn't wait on a React
  // render. The WeakSet dedupes against the store-driven effect above, which
  // remains the path for backlog flush, fallback scheduling and replay.
  useEffect(() => {
    if (!nodeId) {
      return;
    }
    return subscribeRealtimeAudioChunks(nodeId, (chunk) => {
      if (!liveSinkActiveRef.current) return;
      const workletNode = workletNodeRef.current;
      if (!workletNode || scheduledChunksRef.current.has(chunk)) return;
      if (
        chunk.content_type !== "audio" ||
        (typeof chunk.content !== "string" &&
          !(chunk.content instanceof Float32Array))
      ) {
        return;
      }
      scheduledChunksRef.current.add(chunk);
      const samples = decodeChunkSamples(chunk);
      if (samples && samples.length > 0) {
        workletNode.port.postMessage({ type: "chunk", samples });
      }
    });
  }, [nodeId, decodeChunkSamples]);

  // Public start: requests playback via queue
  const start = useCallback(() => {
    setWantsToPlay(true);
    audioQueue.enqueue({
      id: instanceIdRef.current,
      onPlay: internalStart,
      onStop: internalStop
    });
  }, [audioQueue, internalStart, internalStop]);

  // Public stop: removes from queue
  const stop = useCallback(() => {
    setWantsToPlay(false);
    internalStop();
    audioQueue.dequeue(instanceIdRef.current);
  }, [audioQueue, internalStop]);

  const restart = useCallback(() => {
    stop();
    scheduledChunksRef.current = new WeakSet(); // Reset to replay all chunks
    setVisualizerVersion((v) => v + 1);
    // Clear any existing timeout before setting a new one
    if (restartTimeoutRef.current !== null) {
      clearTimeout(restartTimeoutRef.current);
    }
    restartTimeoutRef.current = setTimeout(() => start(), 50); // Small delay to ensure clean restart
  }, [start, stop]);

  // Auto-enqueue on mount if wantsToPlay is true
  useEffect(() => {
    const instanceId = instanceIdRef.current;
    if (wantsToPlay) {
      audioQueue.enqueue({
        id: instanceId,
        onPlay: internalStart,
        onStop: internalStop
      });
    }
    return () => {
      // Cleanup: dequeue on unmount or when dependencies change
      audioQueue.dequeue(instanceId);
    };
  }, [internalStart, internalStop, wantsToPlay]); // audioQueue is stable, don't include it

  const stream = streamDestRef.current ? streamDestRef.current.stream : null;

  return {
    isPlaying: isQueuedPlaying || isQueued,
    isQueued,
    queuePosition,
    start,
    stop,
    restart,
    stream,
    visualizerVersion
  };
};
