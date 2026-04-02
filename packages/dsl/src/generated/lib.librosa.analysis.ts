// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, AudioRef } from "../types.js";

// Amplitude To DB — lib.librosa.analysis.AmplitudeToDB
export interface AmplitudeToDBInputs {
  tensor?: Connectable<unknown>;
}

export interface AmplitudeToDBOutputs {
  output: unknown;
}

export function amplitudeToDB(
  inputs: AmplitudeToDBInputs
): DslNode<AmplitudeToDBOutputs, "output"> {
  return createNode(
    "lib.librosa.analysis.AmplitudeToDB",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// DBTo Amplitude — lib.librosa.analysis.DBToAmplitude
export interface DBToAmplitudeInputs {
  tensor?: Connectable<unknown>;
}

export interface DBToAmplitudeOutputs {
  output: unknown;
}

export function dbToAmplitude(
  inputs: DBToAmplitudeInputs
): DslNode<DBToAmplitudeOutputs, "output"> {
  return createNode(
    "lib.librosa.analysis.DBToAmplitude",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// DBTo Power — lib.librosa.analysis.DBToPower
export interface DBToPowerInputs {
  tensor?: Connectable<unknown>;
}

export interface DBToPowerOutputs {
  output: unknown;
}

export function dbToPower(
  inputs: DBToPowerInputs
): DslNode<DBToPowerOutputs, "output"> {
  return createNode(
    "lib.librosa.analysis.DBToPower",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Powert To DB — lib.librosa.analysis.PowertToDB
export interface PowertToDBInputs {
  tensor?: Connectable<unknown>;
}

export interface PowertToDBOutputs {
  output: unknown;
}

export function powertToDB(
  inputs: PowertToDBInputs
): DslNode<PowertToDBOutputs, "output"> {
  return createNode(
    "lib.librosa.analysis.PowertToDB",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Plot Spectrogram — lib.librosa.analysis.PlotSpectrogram
export interface PlotSpectrogramInputs {
  tensor?: Connectable<unknown>;
  fmax?: Connectable<number>;
}

export interface PlotSpectrogramOutputs {
  output: ImageRef;
}

export function plotSpectrogram(
  inputs: PlotSpectrogramInputs
): DslNode<PlotSpectrogramOutputs, "output"> {
  return createNode(
    "lib.librosa.analysis.PlotSpectrogram",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export interface STFTOutputs {
  output: unknown;
}

export function stft(inputs: STFTInputs): DslNode<STFTOutputs, "output"> {
  return createNode(
    "lib.librosa.analysis.STFT",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export interface MelSpectrogramOutputs {
  output: unknown;
}

export function melSpectrogram(
  inputs: MelSpectrogramInputs
): DslNode<MelSpectrogramOutputs, "output"> {
  return createNode(
    "lib.librosa.analysis.MelSpectrogram",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export interface MFCCOutputs {
  output: unknown;
}

export function mfcc(inputs: MFCCInputs): DslNode<MFCCOutputs, "output"> {
  return createNode(
    "lib.librosa.analysis.MFCC",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Chroma STFT — lib.librosa.analysis.ChromaSTFT
export interface ChromaSTFTInputs {
  audio?: Connectable<AudioRef>;
  n_fft?: Connectable<number>;
  hop_length?: Connectable<number>;
}

export interface ChromaSTFTOutputs {
  output: unknown;
}

export function chromaSTFT(
  inputs: ChromaSTFTInputs
): DslNode<ChromaSTFTOutputs, "output"> {
  return createNode(
    "lib.librosa.analysis.ChromaSTFT",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Spectral Centroid — lib.librosa.analysis.SpectralCentroid
export interface SpectralCentroidInputs {
  audio?: Connectable<AudioRef>;
  n_fft?: Connectable<number>;
  hop_length?: Connectable<number>;
}

export interface SpectralCentroidOutputs {
  output: unknown;
}

export function spectralCentroid(
  inputs: SpectralCentroidInputs
): DslNode<SpectralCentroidOutputs, "output"> {
  return createNode(
    "lib.librosa.analysis.SpectralCentroid",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Spectral Contrast — lib.librosa.analysis.SpectralContrast
export interface SpectralContrastInputs {
  audio?: Connectable<AudioRef>;
  n_fft?: Connectable<number>;
  hop_length?: Connectable<number>;
}

export interface SpectralContrastOutputs {
  output: unknown;
}

export function spectralContrast(
  inputs: SpectralContrastInputs
): DslNode<SpectralContrastOutputs, "output"> {
  return createNode(
    "lib.librosa.analysis.SpectralContrast",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export interface GriffinLimOutputs {
  output: unknown;
}

export function griffinLim(
  inputs: GriffinLimInputs
): DslNode<GriffinLimOutputs, "output"> {
  return createNode(
    "lib.librosa.analysis.GriffinLim",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
