// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { AudioRef, FolderRef } from "../types.js";

// Normalize — nodetool.audio.Normalize
export type NormalizeInputs = {
  audio?: Connectable<AudioRef>;
};

export interface NormalizeOutputs {
  output: AudioRef;
}

export function normalize(inputs: NormalizeInputs): DslNode<NormalizeOutputs, "output"> {
  return createNode("nodetool.audio.Normalize", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Overlay Audio — nodetool.audio.OverlayAudio
export type OverlayAudioInputs = {
  a?: Connectable<AudioRef>;
  b?: Connectable<AudioRef>;
};

export interface OverlayAudioOutputs {
  output: AudioRef;
}

export function overlayAudio(inputs: OverlayAudioInputs): DslNode<OverlayAudioOutputs, "output"> {
  return createNode("nodetool.audio.OverlayAudio", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Remove Silence — nodetool.audio.RemoveSilence
export type RemoveSilenceInputs = {
  audio?: Connectable<AudioRef>;
  min_length?: Connectable<number>;
  threshold?: Connectable<number>;
  reduction_factor?: Connectable<number>;
  crossfade?: Connectable<number>;
  min_silence_between_parts?: Connectable<number>;
};

export interface RemoveSilenceOutputs {
  output: AudioRef;
}

export function removeSilence(inputs: RemoveSilenceInputs): DslNode<RemoveSilenceOutputs, "output"> {
  return createNode("nodetool.audio.RemoveSilence", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Slice Audio — nodetool.audio.SliceAudio
export type SliceAudioInputs = {
  audio?: Connectable<AudioRef>;
  start?: Connectable<number>;
  end?: Connectable<number>;
};

export interface SliceAudioOutputs {
  output: AudioRef;
}

export function sliceAudio(inputs: SliceAudioInputs): DslNode<SliceAudioOutputs, "output"> {
  return createNode("nodetool.audio.SliceAudio", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Mono To Stereo — nodetool.audio.MonoToStereo
export type MonoToStereoInputs = {
  audio?: Connectable<AudioRef>;
};

export interface MonoToStereoOutputs {
  output: AudioRef;
}

export function monoToStereo(inputs: MonoToStereoInputs): DslNode<MonoToStereoOutputs, "output"> {
  return createNode("nodetool.audio.MonoToStereo", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Stereo To Mono — nodetool.audio.StereoToMono
export type StereoToMonoInputs = {
  audio?: Connectable<AudioRef>;
  method?: Connectable<string>;
};

export interface StereoToMonoOutputs {
  output: AudioRef;
}

export function stereoToMono(inputs: StereoToMonoInputs): DslNode<StereoToMonoOutputs, "output"> {
  return createNode("nodetool.audio.StereoToMono", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Reverse — nodetool.audio.Reverse
export type ReverseInputs = {
  audio?: Connectable<AudioRef>;
};

export interface ReverseOutputs {
  output: AudioRef;
}

export function reverse(inputs: ReverseInputs): DslNode<ReverseOutputs, "output"> {
  return createNode("nodetool.audio.Reverse", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Fade In — nodetool.audio.FadeIn
export type FadeInInputs = {
  audio?: Connectable<AudioRef>;
  duration?: Connectable<number>;
};

export interface FadeInOutputs {
  output: AudioRef;
}

export function fadeIn(inputs: FadeInInputs): DslNode<FadeInOutputs, "output"> {
  return createNode("nodetool.audio.FadeIn", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Fade Out — nodetool.audio.FadeOut
export type FadeOutInputs = {
  audio?: Connectable<AudioRef>;
  duration?: Connectable<number>;
};

export interface FadeOutOutputs {
  output: AudioRef;
}

export function fadeOut(inputs: FadeOutInputs): DslNode<FadeOutOutputs, "output"> {
  return createNode("nodetool.audio.FadeOut", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Repeat — nodetool.audio.Repeat
export type RepeatInputs = {
  audio?: Connectable<AudioRef>;
  loops?: Connectable<number>;
};

export interface RepeatOutputs {
  output: AudioRef;
}

export function repeat(inputs: RepeatInputs): DslNode<RepeatOutputs, "output"> {
  return createNode("nodetool.audio.Repeat", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Audio Mixer — nodetool.audio.AudioMixer
export type AudioMixerInputs = {
};

export interface AudioMixerOutputs {
  output: AudioRef;
}

export function audioMixer(inputs?: AudioMixerInputs): DslNode<AudioMixerOutputs, "output"> {
  return createNode("nodetool.audio.AudioMixer", inputs ?? {}, { outputNames: ["output"], defaultOutput: "output" });
}

// Trim — nodetool.audio.Trim
export type TrimInputs = {
  audio?: Connectable<AudioRef>;
  start?: Connectable<number>;
  end?: Connectable<number>;
};

export interface TrimOutputs {
  output: AudioRef;
}

export function trim(inputs: TrimInputs): DslNode<TrimOutputs, "output"> {
  return createNode("nodetool.audio.Trim", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Create Silence — nodetool.audio.CreateSilence
export type CreateSilenceInputs = {
  duration?: Connectable<number>;
  sample_rate?: Connectable<number>;
};

export interface CreateSilenceOutputs {
  output: AudioRef;
}

export function createSilence(inputs: CreateSilenceInputs): DslNode<CreateSilenceOutputs, "output"> {
  return createNode("nodetool.audio.CreateSilence", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Concatenate Audio — nodetool.audio.Concat
export type ConcatInputs = {
};

export interface ConcatOutputs {
  output: AudioRef;
}

export function concat(inputs?: ConcatInputs): DslNode<ConcatOutputs, "output"> {
  return createNode("nodetool.audio.Concat", inputs ?? {}, { outputNames: ["output"], defaultOutput: "output" });
}

// Concatenate Audio List — nodetool.audio.ConcatList
export type ConcatListInputs = {
  audio_files?: Connectable<AudioRef[]>;
};

export interface ConcatListOutputs {
  output: AudioRef;
}

export function concatList(inputs: ConcatListInputs): DslNode<ConcatListOutputs, "output"> {
  return createNode("nodetool.audio.ConcatList", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Chunk To Audio — nodetool.audio.ChunkToAudio
export type ChunkToAudioInputs = {
  chunk?: Connectable<unknown>;
};

export interface ChunkToAudioOutputs {
  audio: AudioRef;
}

export function chunkToAudio(inputs: ChunkToAudioInputs): DslNode<ChunkToAudioOutputs, "audio"> {
  return createNode("nodetool.audio.ChunkToAudio", inputs, { outputNames: ["audio"], defaultOutput: "audio" });
}

// Get Audio Info — nodetool.audio.GetAudioInfo
export type GetAudioInfoInputs = {
  audio?: Connectable<AudioRef>;
};

export interface GetAudioInfoOutputs {
  duration: number;
  sample_rate: number;
  channels: number;
  format: string;
  size_bytes: number;
}

export function getAudioInfo(inputs: GetAudioInfoInputs): DslNode<GetAudioInfoOutputs> {
  return createNode("nodetool.audio.GetAudioInfo", inputs, { outputNames: ["duration", "sample_rate", "channels", "format", "size_bytes"] });
}

// Load Audio Assets — nodetool.audio.LoadAudioAssets
export type LoadAudioAssetsInputs = {
  folder?: Connectable<FolderRef>;
};

export interface LoadAudioAssetsOutputs {
  audio: AudioRef;
  name: string;
  audios: unknown[];
}

export function loadAudioAssets(inputs: LoadAudioAssetsInputs): DslNode<LoadAudioAssetsOutputs> {
  return createNode("nodetool.audio.LoadAudioAssets", inputs, { outputNames: ["audio", "name", "audios"], streaming: true });
}

// Load Audio File — nodetool.audio.LoadAudioFile
export type LoadAudioFileInputs = {
  path?: Connectable<string>;
};

export interface LoadAudioFileOutputs {
  output: AudioRef;
}

export function loadAudioFile(inputs: LoadAudioFileInputs): DslNode<LoadAudioFileOutputs, "output"> {
  return createNode("nodetool.audio.LoadAudioFile", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Load Audio Folder — nodetool.audio.LoadAudioFolder
export type LoadAudioFolderInputs = {
  folder?: Connectable<string>;
  include_subdirectories?: Connectable<boolean>;
  extensions?: Connectable<string[]>;
};

export interface LoadAudioFolderOutputs {
  audio: AudioRef;
  path: string;
  audios: unknown[];
}

export function loadAudioFolder(inputs: LoadAudioFolderInputs): DslNode<LoadAudioFolderOutputs> {
  return createNode("nodetool.audio.LoadAudioFolder", inputs, { outputNames: ["audio", "path", "audios"], streaming: true });
}

// Save Audio Asset — nodetool.audio.SaveAudio
export type SaveAudioInputs = {
  audio?: Connectable<AudioRef>;
  folder?: Connectable<FolderRef>;
  name?: Connectable<string>;
};

export interface SaveAudioOutputs {
  output: AudioRef;
}

export function saveAudio(inputs: SaveAudioInputs): DslNode<SaveAudioOutputs, "output"> {
  return createNode("nodetool.audio.SaveAudio", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Save Audio File — nodetool.audio.SaveAudioFile
export type SaveAudioFileInputs = {
  audio?: Connectable<AudioRef>;
  save_to_workspace?: Connectable<boolean>;
  folder?: Connectable<string>;
  filename?: Connectable<string>;
  FORMAT_MAP?: Connectable<Record<string, string>>;
};

export interface SaveAudioFileOutputs {
  output: AudioRef;
}

export function saveAudioFile(inputs: SaveAudioFileInputs): DslNode<SaveAudioFileOutputs, "output"> {
  return createNode("nodetool.audio.SaveAudioFile", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Text To Speech — nodetool.audio.TextToSpeech
export type TextToSpeechInputs = {
  model?: Connectable<unknown>;
  text?: Connectable<string>;
  speed?: Connectable<number>;
  reference_audio?: Connectable<AudioRef>;
  reference_text?: Connectable<string>;
  language?: Connectable<string>;
  instructions?: Connectable<string>;
};

export interface TextToSpeechOutputs {
  audio: AudioRef;
  chunk: unknown;
}

export function textToSpeech(inputs: TextToSpeechInputs): DslNode<TextToSpeechOutputs> {
  return createNode("nodetool.audio.TextToSpeech", inputs, { outputNames: ["audio", "chunk"] });
}

// Text To Music — nodetool.audio.TextToMusic
export type TextToMusicInputs = {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  lyrics?: Connectable<string>;
  duration?: Connectable<number>;
};

export interface TextToMusicOutputs {
  audio: AudioRef;
}

export function textToMusic(inputs: TextToMusicInputs): DslNode<TextToMusicOutputs, "audio"> {
  return createNode("nodetool.audio.TextToMusic", inputs, { outputNames: ["audio"], defaultOutput: "audio" });
}
