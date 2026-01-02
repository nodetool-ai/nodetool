/**
 * Hook for extracting and caching audio waveform data.
 *
 * Uses Web Audio API to analyze audio files and generate waveform data.
 * Waveform data is cached in memory (with optional IndexedDB support in future).
 */

import { useState, useEffect, useCallback, useRef } from "react";

// ============================================================================
// Types
// ============================================================================

export interface WaveformData {
  /** Normalized audio samples (0-1 range, representing amplitude) */
  peaks: Float32Array;
  /** Duration of the audio in seconds */
  duration: number;
  /** Sample rate of the audio */
  sampleRate: number;
  /** Number of samples in peaks array */
  samplesPerPeak: number;
}

interface WaveformCacheEntry {
  data: WaveformData;
  timestamp: number;
}

// ============================================================================
// Cache
// ============================================================================

// In-memory cache for waveform data
const waveformCache = new Map<string, WaveformCacheEntry>();
const MAX_CACHE_SIZE = 50;
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

/**
 * Gets cached waveform data
 */
function getCachedWaveform(url: string): WaveformData | null {
  const entry = waveformCache.get(url);
  if (!entry) return null;

  // Check if expired
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    waveformCache.delete(url);
    return null;
  }

  return entry.data;
}

/**
 * Caches waveform data
 */
function setCachedWaveform(url: string, data: WaveformData): void {
  // Evict old entries if cache is full
  if (waveformCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = waveformCache.keys().next().value;
    if (oldestKey) {
      waveformCache.delete(oldestKey);
    }
  }

  waveformCache.set(url, {
    data,
    timestamp: Date.now()
  });
}

// ============================================================================
// Audio Analysis
// ============================================================================

/**
 * Extracts waveform data from an audio file URL
 */
async function extractWaveform(
  audioUrl: string,
  targetPeaks: number = 1000
): Promise<WaveformData> {
  // Create audio context
  const audioContext = new (window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext)();

  try {
    // Fetch the audio file
    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();

    // Decode the audio data
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Get the raw audio data (use first channel or mix down)
    const channelCount = audioBuffer.numberOfChannels;
    const rawData = new Float32Array(audioBuffer.length);

    // Mix down to mono if stereo
    for (let channel = 0; channel < channelCount; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      for (let i = 0; i < audioBuffer.length; i++) {
        rawData[i] += channelData[i] / channelCount;
      }
    }

    // Compute peaks
    const samplesPerPeak = Math.ceil(audioBuffer.length / targetPeaks);
    const peaks = new Float32Array(targetPeaks);

    for (let i = 0; i < targetPeaks; i++) {
      const start = i * samplesPerPeak;
      const end = Math.min(start + samplesPerPeak, audioBuffer.length);

      let max = 0;
      for (let j = start; j < end; j++) {
        const abs = Math.abs(rawData[j]);
        if (abs > max) {
          max = abs;
        }
      }
      peaks[i] = max;
    }

    return {
      peaks,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      samplesPerPeak
    };
  } finally {
    // Close the audio context
    await audioContext.close();
  }
}

/**
 * Generates mock waveform data for testing or when real audio is unavailable
 */
function generateMockWaveform(
  duration: number,
  numPeaks: number = 1000
): WaveformData {
  const peaks = new Float32Array(numPeaks);

  // Generate a somewhat realistic-looking waveform
  for (let i = 0; i < numPeaks; i++) {
    const t = i / numPeaks;
    // Combine several sine waves for a more natural look
    const base = Math.sin(t * 10 * Math.PI) * 0.3 + 0.3;
    const detail = Math.sin(t * 30 * Math.PI) * 0.2;
    const noise = (Math.random() - 0.5) * 0.4;
    peaks[i] = Math.max(0, Math.min(1, Math.abs(base + detail + noise)));
  }

  return {
    peaks,
    duration,
    sampleRate: 44100,
    samplesPerPeak: Math.ceil((duration * 44100) / numPeaks)
  };
}

// ============================================================================
// Hook
// ============================================================================

interface UseWaveformOptions {
  /** URL of the audio file */
  url: string;
  /** Duration hint (used for mock waveform if URL is empty) */
  durationHint?: number;
  /** Number of peaks to extract (default: 1000) */
  targetPeaks?: number;
  /** Use mock data instead of real audio analysis */
  useMock?: boolean;
}

interface UseWaveformResult {
  /** Waveform data */
  waveform: WaveformData | null;
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Refetch function */
  refetch: () => void;
}

/**
 * Hook for extracting audio waveform data
 */
export function useWaveform(options: UseWaveformOptions): UseWaveformResult {
  const { url, durationHint = 10, targetPeaks = 1000, useMock = false } = options;

  const [waveform, setWaveform] = useState<WaveformData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchWaveform = useCallback(async () => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      // Use mock data if requested or if URL is empty
      if (useMock || !url) {
        // Slight delay to simulate loading
        await new Promise((resolve) => setTimeout(resolve, 100));
        const mockData = generateMockWaveform(durationHint, targetPeaks);
        setWaveform(mockData);
        setIsLoading(false);
        return;
      }

      // Check cache first
      const cached = getCachedWaveform(url);
      if (cached) {
        setWaveform(cached);
        setIsLoading(false);
        return;
      }

      // Extract waveform from audio
      const data = await extractWaveform(url, targetPeaks);

      // Cache the result
      setCachedWaveform(url, data);

      setWaveform(data);
    } catch (err) {
      // If aborted, don't update state
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }

      console.error("Failed to extract waveform:", err);
      setError(err instanceof Error ? err.message : "Failed to load audio");

      // Fall back to mock waveform
      const mockData = generateMockWaveform(durationHint, targetPeaks);
      setWaveform(mockData);
    } finally {
      setIsLoading(false);
    }
  }, [url, durationHint, targetPeaks, useMock]);

  useEffect(() => {
    fetchWaveform();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchWaveform]);

  return {
    waveform,
    isLoading,
    error,
    refetch: fetchWaveform
  };
}

export default useWaveform;

// Export utility functions for external use
export { extractWaveform, generateMockWaveform, getCachedWaveform };
