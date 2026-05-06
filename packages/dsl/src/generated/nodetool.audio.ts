// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { AudioRef, FolderRef } from "../types.js";

// Load Audio Assets — nodetool.audio.LoadAudioAssets
export interface LoadAudioAssetsInputs {
  folder?: Connectable<FolderRef>;
}

export interface LoadAudioAssetsOutputs {
  audio: AudioRef;
  name: string;
  audios: unknown[];
}

export function loadAudioAssets(inputs: LoadAudioAssetsInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<LoadAudioAssetsOutputs> {
  return createNode("nodetool.audio.LoadAudioAssets", inputs as Record<string, unknown>, { outputNames: ["audio", "name", "audios"], streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Load Audio File — nodetool.audio.LoadAudioFile
export interface LoadAudioFileInputs {
  path?: Connectable<string>;
}

export interface LoadAudioFileOutputs {
  output: AudioRef;
}

export function loadAudioFile(inputs: LoadAudioFileInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<LoadAudioFileOutputs, "output"> {
  return createNode("nodetool.audio.LoadAudioFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Load Audio Folder — nodetool.audio.LoadAudioFolder
export interface LoadAudioFolderInputs {
  folder?: Connectable<string>;
  include_subdirectories?: Connectable<boolean>;
  extensions?: Connectable<string[]>;
}

export interface LoadAudioFolderOutputs {
  audio: AudioRef;
  path: string;
  audios: unknown[];
}

export function loadAudioFolder(inputs: LoadAudioFolderInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<LoadAudioFolderOutputs> {
  return createNode("nodetool.audio.LoadAudioFolder", inputs as Record<string, unknown>, { outputNames: ["audio", "path", "audios"], streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Save Audio Asset — nodetool.audio.SaveAudio
export interface SaveAudioInputs {
  audio?: Connectable<AudioRef>;
  folder?: Connectable<FolderRef>;
  name?: Connectable<string>;
}

export interface SaveAudioOutputs {
  output: AudioRef;
}

export function saveAudio(inputs: SaveAudioInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SaveAudioOutputs, "output"> {
  return createNode("nodetool.audio.SaveAudio", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Save Audio File — nodetool.audio.SaveAudioFile
export interface SaveAudioFileInputs {
  audio?: Connectable<AudioRef>;
  folder?: Connectable<string>;
  filename?: Connectable<string>;
  FORMAT_MAP?: Connectable<Record<string, string>>;
}

export interface SaveAudioFileOutputs {
  output: AudioRef;
}

export function saveAudioFile(inputs: SaveAudioFileInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SaveAudioFileOutputs, "output"> {
  return createNode("nodetool.audio.SaveAudioFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Normalize — nodetool.audio.Normalize
export interface NormalizeInputs {
  audio?: Connectable<AudioRef>;
}

export interface NormalizeOutputs {
  output: AudioRef;
}

export function normalize(inputs: NormalizeInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<NormalizeOutputs, "output"> {
  return createNode("nodetool.audio.Normalize", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Overlay Audio — nodetool.audio.OverlayAudio
export interface OverlayAudioInputs {
  a?: Connectable<AudioRef>;
  b?: Connectable<AudioRef>;
}

export interface OverlayAudioOutputs {
  output: AudioRef;
}

export function overlayAudio(inputs: OverlayAudioInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<OverlayAudioOutputs, "output"> {
  return createNode("nodetool.audio.OverlayAudio", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Remove Silence — nodetool.audio.RemoveSilence
export interface RemoveSilenceInputs {
  audio?: Connectable<AudioRef>;
  min_length?: Connectable<number>;
  threshold?: Connectable<number>;
  reduction_factor?: Connectable<number>;
  crossfade?: Connectable<number>;
  min_silence_between_parts?: Connectable<number>;
}

export interface RemoveSilenceOutputs {
  output: AudioRef;
}

export function removeSilence(inputs: RemoveSilenceInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<RemoveSilenceOutputs, "output"> {
  return createNode("nodetool.audio.RemoveSilence", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Slice Audio — nodetool.audio.SliceAudio
export interface SliceAudioInputs {
  audio?: Connectable<AudioRef>;
  start?: Connectable<number>;
  end?: Connectable<number>;
}

export interface SliceAudioOutputs {
  output: AudioRef;
}

export function sliceAudio(inputs: SliceAudioInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SliceAudioOutputs, "output"> {
  return createNode("nodetool.audio.SliceAudio", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Mono To Stereo — nodetool.audio.MonoToStereo
export interface MonoToStereoInputs {
  audio?: Connectable<AudioRef>;
}

export interface MonoToStereoOutputs {
  output: AudioRef;
}

export function monoToStereo(inputs: MonoToStereoInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<MonoToStereoOutputs, "output"> {
  return createNode("nodetool.audio.MonoToStereo", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Stereo To Mono — nodetool.audio.StereoToMono
export interface StereoToMonoInputs {
  audio?: Connectable<AudioRef>;
  method?: Connectable<string>;
}

export interface StereoToMonoOutputs {
  output: AudioRef;
}

export function stereoToMono(inputs: StereoToMonoInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<StereoToMonoOutputs, "output"> {
  return createNode("nodetool.audio.StereoToMono", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Reverse — nodetool.audio.Reverse
export interface ReverseInputs {
  audio?: Connectable<AudioRef>;
}

export interface ReverseOutputs {
  output: AudioRef;
}

export function reverse(inputs: ReverseInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ReverseOutputs, "output"> {
  return createNode("nodetool.audio.Reverse", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Fade In — nodetool.audio.FadeIn
export interface FadeInInputs {
  audio?: Connectable<AudioRef>;
  duration?: Connectable<number>;
}

export interface FadeInOutputs {
  output: AudioRef;
}

export function fadeIn(inputs: FadeInInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<FadeInOutputs, "output"> {
  return createNode("nodetool.audio.FadeIn", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Fade Out — nodetool.audio.FadeOut
export interface FadeOutInputs {
  audio?: Connectable<AudioRef>;
  duration?: Connectable<number>;
}

export interface FadeOutOutputs {
  output: AudioRef;
}

export function fadeOut(inputs: FadeOutInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<FadeOutOutputs, "output"> {
  return createNode("nodetool.audio.FadeOut", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Repeat — nodetool.audio.Repeat
export interface RepeatInputs {
  audio?: Connectable<AudioRef>;
  loops?: Connectable<number>;
}

export interface RepeatOutputs {
  output: AudioRef;
}

export function repeat(inputs: RepeatInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<RepeatOutputs, "output"> {
  return createNode("nodetool.audio.Repeat", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Audio Mixer — nodetool.audio.AudioMixer
export interface AudioMixerInputs {
  track1?: Connectable<AudioRef>;
  track2?: Connectable<AudioRef>;
  track3?: Connectable<AudioRef>;
  track4?: Connectable<AudioRef>;
  track5?: Connectable<AudioRef>;
  volume1?: Connectable<number>;
  volume2?: Connectable<number>;
  volume3?: Connectable<number>;
  volume4?: Connectable<number>;
  volume5?: Connectable<number>;
}

export interface AudioMixerOutputs {
  output: AudioRef;
}

export function audioMixer(inputs: AudioMixerInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<AudioMixerOutputs, "output"> {
  return createNode("nodetool.audio.AudioMixer", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Trim — nodetool.audio.Trim
export interface TrimInputs {
  audio?: Connectable<AudioRef>;
  start?: Connectable<number>;
  end?: Connectable<number>;
}

export interface TrimOutputs {
  output: AudioRef;
}

export function trim(inputs: TrimInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<TrimOutputs, "output"> {
  return createNode("nodetool.audio.Trim", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Create Silence — nodetool.audio.CreateSilence
export interface CreateSilenceInputs {
  duration?: Connectable<number>;
}

export interface CreateSilenceOutputs {
  output: AudioRef;
}

export function createSilence(inputs: CreateSilenceInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<CreateSilenceOutputs, "output"> {
  return createNode("nodetool.audio.CreateSilence", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Concat — nodetool.audio.Concat
export interface ConcatInputs {
  a?: Connectable<AudioRef>;
  b?: Connectable<AudioRef>;
}

export interface ConcatOutputs {
  output: AudioRef;
}

export function concat(inputs: ConcatInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ConcatOutputs, "output"> {
  return createNode("nodetool.audio.Concat", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Concat List — nodetool.audio.ConcatList
export interface ConcatListInputs {
  audio_files?: Connectable<AudioRef[]>;
}

export interface ConcatListOutputs {
  output: AudioRef;
}

export function concatList(inputs: ConcatListInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ConcatListOutputs, "output"> {
  return createNode("nodetool.audio.ConcatList", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Text To Speech — nodetool.audio.TextToSpeech
export interface TextToSpeechInputs {
  model?: Connectable<unknown>;
  text?: Connectable<string>;
  speed?: Connectable<number>;
}

export interface TextToSpeechOutputs {
  audio: AudioRef;
  chunk: unknown;
}

export function textToSpeech(inputs: TextToSpeechInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<TextToSpeechOutputs> {
  return createNode("nodetool.audio.TextToSpeech", inputs as Record<string, unknown>, { outputNames: ["audio", "chunk"], streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Chunk To Audio — nodetool.audio.ChunkToAudio
export interface ChunkToAudioInputs {
  chunk?: Connectable<unknown>;
  batch_size?: Connectable<number>;
}

export interface ChunkToAudioOutputs {
  audio: AudioRef;
}

export function chunkToAudio(inputs: ChunkToAudioInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ChunkToAudioOutputs, "audio"> {
  return createNode("nodetool.audio.ChunkToAudio", inputs as Record<string, unknown>, { outputNames: ["audio"], defaultOutput: "audio", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Get Audio Info — nodetool.audio.GetAudioInfo
export interface GetAudioInfoInputs {
  audio?: Connectable<AudioRef>;
}

export interface GetAudioInfoOutputs {
  duration: number;
  sample_rate: number;
  channels: number;
  format: string;
  size_bytes: number;
}

export function getAudioInfo(inputs: GetAudioInfoInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<GetAudioInfoOutputs> {
  return createNode("nodetool.audio.GetAudioInfo", inputs as Record<string, unknown>, { outputNames: ["duration", "sample_rate", "channels", "format", "size_bytes"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
