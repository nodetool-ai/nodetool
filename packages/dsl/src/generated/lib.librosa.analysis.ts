// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";
import type { ImageRef, AudioRef } from "../types.js";

// Amplitude To DB — lib.librosa.analysis.AmplitudeToDB
export interface AmplitudeToDBInputs {
  tensor?: Connectable<unknown>;
}

export function amplitudeToDB(inputs: AmplitudeToDBInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.librosa.analysis.AmplitudeToDB", inputs as Record<string, unknown>);
}

// DBTo Amplitude — lib.librosa.analysis.DBToAmplitude
export interface DBToAmplitudeInputs {
  tensor?: Connectable<unknown>;
}

export function dbToAmplitude(inputs: DBToAmplitudeInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.librosa.analysis.DBToAmplitude", inputs as Record<string, unknown>);
}

// DBTo Power — lib.librosa.analysis.DBToPower
export interface DBToPowerInputs {
  tensor?: Connectable<unknown>;
}

export function dbToPower(inputs: DBToPowerInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.librosa.analysis.DBToPower", inputs as Record<string, unknown>);
}

// Powert To DB — lib.librosa.analysis.PowertToDB
export interface PowertToDBInputs {
  tensor?: Connectable<unknown>;
}

export function powertToDB(inputs: PowertToDBInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.librosa.analysis.PowertToDB", inputs as Record<string, unknown>);
}

// Plot Spectrogram — lib.librosa.analysis.PlotSpectrogram
export interface PlotSpectrogramInputs {
  tensor?: Connectable<unknown>;
  fmax?: Connectable<number>;
}

export function plotSpectrogram(inputs: PlotSpectrogramInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.librosa.analysis.PlotSpectrogram", inputs as Record<string, unknown>);
}

// STFT — lib.librosa.analysis.STFT
export interface STFTInputs {
  audio?: Connectable<AudioRef>;
  n_fft?: Connectable<number>;
  hop_length?: Connectable<number>;
  win_length?: Connectable<number>;
  window?: Connectable<string>;
  center?: Connectable<boolean>;
}

export function stft(inputs: STFTInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.librosa.analysis.STFT", inputs as Record<string, unknown>);
}

// Mel Spectrogram — lib.librosa.analysis.MelSpectrogram
export interface MelSpectrogramInputs {
  audio?: Connectable<AudioRef>;
  n_fft?: Connectable<number>;
  hop_length?: Connectable<number>;
  n_mels?: Connectable<number>;
  fmin?: Connectable<number>;
  fmax?: Connectable<number>;
}

export function melSpectrogram(inputs: MelSpectrogramInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.librosa.analysis.MelSpectrogram", inputs as Record<string, unknown>);
}

// MFCC — lib.librosa.analysis.MFCC
export interface MFCCInputs {
  audio?: Connectable<AudioRef>;
  n_mfcc?: Connectable<number>;
  n_fft?: Connectable<number>;
  hop_length?: Connectable<number>;
  fmin?: Connectable<number>;
  fmax?: Connectable<number>;
}

export function mfcc(inputs: MFCCInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.librosa.analysis.MFCC", inputs as Record<string, unknown>);
}

// Chroma STFT — lib.librosa.analysis.ChromaSTFT
export interface ChromaSTFTInputs {
  audio?: Connectable<AudioRef>;
  n_fft?: Connectable<number>;
  hop_length?: Connectable<number>;
}

export function chromaSTFT(inputs: ChromaSTFTInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.librosa.analysis.ChromaSTFT", inputs as Record<string, unknown>);
}

// Spectral Centroid — lib.librosa.analysis.SpectralCentroid
export interface SpectralCentroidInputs {
  audio?: Connectable<AudioRef>;
  n_fft?: Connectable<number>;
  hop_length?: Connectable<number>;
}

export function spectralCentroid(inputs: SpectralCentroidInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.librosa.analysis.SpectralCentroid", inputs as Record<string, unknown>);
}

// Spectral Contrast — lib.librosa.analysis.SpectralContrast
export interface SpectralContrastInputs {
  audio?: Connectable<AudioRef>;
  n_fft?: Connectable<number>;
  hop_length?: Connectable<number>;
}

export function spectralContrast(inputs: SpectralContrastInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.librosa.analysis.SpectralContrast", inputs as Record<string, unknown>);
}

// Griffin Lim — lib.librosa.analysis.GriffinLim
export interface GriffinLimInputs {
  magnitude_spectrogram?: Connectable<unknown>;
  n_iter?: Connectable<number>;
  hop_length?: Connectable<number>;
  win_length?: Connectable<number>;
  window?: Connectable<string>;
  center?: Connectable<boolean>;
  length?: Connectable<number>;
}

export function griffinLim(inputs: GriffinLimInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.librosa.analysis.GriffinLim", inputs as Record<string, unknown>);
}
