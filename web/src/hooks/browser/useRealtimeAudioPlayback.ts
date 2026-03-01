import { useCallback, useEffect, useRef, useState } from "react";
import { Chunk } from "../../stores/ApiTypes";
import {
  base64ToUint8Array,
  int16ToFloat32
} from "../../components/node/output/audio";
import { useAudioQueue } from "../../stores/AudioQueueStore";

interface UseRealtimeAudioPlaybackOptions {
  chunks: Chunk[];
  sampleRate?: number;
  channels?: number;
  nodeId?: string; // Optional ID for this audio source
}

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
  nodeId
}: UseRealtimeAudioPlaybackOptions): UseRealtimeAudioPlaybackReturn => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const lastIndexRef = useRef<number>(0);
  const scheduledChunkIndices = useRef<Set<number>>(new Set());
  const instanceIdRef = useRef<string>(
    nodeId || `audio-${Date.now()}-${Math.random()}`
  );
  const [internalPlaying, setInternalPlaying] = useState<boolean>(false);
  const [wantsToPlay, setWantsToPlay] = useState<boolean>(true);
  const [visualizerVersion, setVisualizerVersion] = useState<number>(0);

  const audioQueue = useAudioQueue();
  const isQueuedPlaying = audioQueue.isPlaying(instanceIdRef.current);
  const isQueued = audioQueue.isQueued(instanceIdRef.current);
  const queuePosition = isQueued
    ? audioQueue.queue.findIndex((q) => q.id === instanceIdRef.current) + 1
    : null;

  // Initialize AudioContext and routing
  useEffect(() => {
    const Ctx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = new Ctx();
    audioContextRef.current = ctx;
    const streamDest = ctx.createMediaStreamDestination();
    streamDestRef.current = streamDest;
    const gain = ctx.createGain();
    gainRef.current = gain;
    gain.connect(ctx.destination);
    gain.connect(streamDest);
    nextStartTimeRef.current = ctx.currentTime;

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
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
        ctx.close();
      } catch {
        // Silently ignore AudioContext close errors during unmount
      }
      audioContextRef.current = null;
      streamDestRef.current = null;
      gainRef.current = null;
    };
  }, []);

  const scheduleChunk = useCallback(
    (base64: string) => {
      const ctx = audioContextRef.current;
      const gain = gainRef.current;
      if (!ctx || !gain || !base64) {
        return;
      }
      const u8 = base64ToUint8Array(base64);
      const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      const frameCount = Math.floor(u8.byteLength / 2 / channels);
      const buffer = ctx.createBuffer(channels, frameCount, sampleRate);
      for (let ch = 0; ch < channels; ch++) {
        const channelData = new Int16Array(frameCount);
        let srcIndex = ch * 2;
        for (let i = 0; i < frameCount; i++) {
          const sample = view.getInt16(srcIndex, true);
          channelData[i] = sample;
          srcIndex += channels * 2;
        }
        const floatData = int16ToFloat32(channelData);
        buffer.copyToChannel(floatData, ch);
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
    [channels, sampleRate]
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

  // Schedule newly arrived chunks when actually playing (queue approved)
  useEffect(() => {
    if (!internalPlaying || !isQueuedPlaying) {
      return;
    }
    const audioChunks = chunks.filter(
      (c) => c?.content_type === "audio" && typeof c.content === "string"
    );
    for (let i = lastIndexRef.current; i < audioChunks.length; i++) {
      // Skip if already scheduled (prevents double-scheduling in StrictMode)
      if (scheduledChunkIndices.current.has(i)) {
        continue;
      }
      scheduleChunk(audioChunks[i].content as string);
      scheduledChunkIndices.current.add(i);
    }
    lastIndexRef.current = audioChunks.length;
  }, [chunks, internalPlaying, isQueuedPlaying, scheduleChunk]);

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
    lastIndexRef.current = 0; // Reset to replay all chunks
    scheduledChunkIndices.current.clear(); // Clear scheduled indices for replay
    setVisualizerVersion((v) => v + 1);
    setTimeout(() => start(), 50); // Small delay to ensure clean restart
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
