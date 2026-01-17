/**
 * Shared audio utility functions for audio input testing and recording.
 */

/**
 * Formats seconds into MM:SS format for display.
 * @param seconds - Number of seconds to format
 * @returns Formatted time string in MM:SS format
 */
export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

/**
 * Configuration constants for audio analysis.
 */
export const AUDIO_ANALYSER_CONFIG = {
  /** FFT size for frequency analysis */
  fftSize: 256,
  /** Smoothing factor for analyser (0-1) */
  smoothingTimeConstant: 0.5
} as const;

/**
 * Creates an AudioContext using the appropriate constructor for the browser.
 * @returns A new AudioContext instance
 */
export const createAudioContext = (): AudioContext => {
  const AudioCtx =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  return new AudioCtx();
};

/**
 * Creates an AnalyserNode with standard configuration for signal level analysis.
 * @param audioContext - The AudioContext to create the analyser in
 * @returns Configured AnalyserNode
 */
export const createConfiguredAnalyser = (
  audioContext: AudioContext
): AnalyserNode => {
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = AUDIO_ANALYSER_CONFIG.fftSize;
  analyser.smoothingTimeConstant = AUDIO_ANALYSER_CONFIG.smoothingTimeConstant;
  return analyser;
};

/**
 * Calculates the normalized RMS (Root Mean Square) signal level from frequency data.
 * @param dataArray - Uint8Array of frequency data from getByteFrequencyData
 * @returns Normalized signal level between 0 and 1
 */
export const calculateSignalLevel = (dataArray: Uint8Array): number => {
  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    sum += dataArray[i] * dataArray[i];
  }
  const rms = Math.sqrt(sum / dataArray.length);
  // Normalize to 0-1 range (128 is roughly the midpoint for byte data)
  return Math.min(1, rms / 128);
};
