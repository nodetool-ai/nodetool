// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { AudioRef, FolderRef } from "../types.js";

// Normalize — nodetool.audio.Normalize
export type NormalizeInputs = {
  audio?: Connectable<AudioRef>;
};

export interface NormalizeOutputs {
  output: AudioRef;
}

export function normalize(inputs: NormalizeInputs, options?: NodeOptions): NodeWithOutputs<NormalizeOutputs, "output"> {
  return createNode("nodetool.audio.Normalize", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// Overlay Audio — nodetool.audio.OverlayAudio
export type OverlayAudioInputs = {
  a?: Connectable<AudioRef>;
  b?: Connectable<AudioRef>;
};

export interface OverlayAudioOutputs {
  output: AudioRef;
}

export function overlayAudio(inputs: OverlayAudioInputs, options?: NodeOptions): NodeWithOutputs<OverlayAudioOutputs, "output"> {
  return createNode("nodetool.audio.OverlayAudio", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
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

export function removeSilence(inputs: RemoveSilenceInputs, options?: NodeOptions): NodeWithOutputs<RemoveSilenceOutputs, "output"> {
  return createNode("nodetool.audio.RemoveSilence", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
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

export function sliceAudio(inputs: SliceAudioInputs, options?: NodeOptions): NodeWithOutputs<SliceAudioOutputs, "output"> {
  return createNode("nodetool.audio.SliceAudio", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// Mono To Stereo — nodetool.audio.MonoToStereo
export type MonoToStereoInputs = {
  audio?: Connectable<AudioRef>;
};

export interface MonoToStereoOutputs {
  output: AudioRef;
}

export function monoToStereo(inputs: MonoToStereoInputs, options?: NodeOptions): NodeWithOutputs<MonoToStereoOutputs, "output"> {
  return createNode("nodetool.audio.MonoToStereo", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// Stereo To Mono — nodetool.audio.StereoToMono
export type StereoToMonoInputs = {
  audio?: Connectable<AudioRef>;
  method?: Connectable<string>;
};

export interface StereoToMonoOutputs {
  output: AudioRef;
}

export function stereoToMono(inputs: StereoToMonoInputs, options?: NodeOptions): NodeWithOutputs<StereoToMonoOutputs, "output"> {
  return createNode("nodetool.audio.StereoToMono", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// Reverse — nodetool.audio.Reverse
export type ReverseInputs = {
  audio?: Connectable<AudioRef>;
};

export interface ReverseOutputs {
  output: AudioRef;
}

export function reverse(inputs: ReverseInputs, options?: NodeOptions): NodeWithOutputs<ReverseOutputs, "output"> {
  return createNode("nodetool.audio.Reverse", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// Fade In — nodetool.audio.FadeIn
export type FadeInInputs = {
  audio?: Connectable<AudioRef>;
  duration?: Connectable<number>;
};

export interface FadeInOutputs {
  output: AudioRef;
}

export function fadeIn(inputs: FadeInInputs, options?: NodeOptions): NodeWithOutputs<FadeInOutputs, "output"> {
  return createNode("nodetool.audio.FadeIn", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// Fade Out — nodetool.audio.FadeOut
export type FadeOutInputs = {
  audio?: Connectable<AudioRef>;
  duration?: Connectable<number>;
};

export interface FadeOutOutputs {
  output: AudioRef;
}

export function fadeOut(inputs: FadeOutInputs, options?: NodeOptions): NodeWithOutputs<FadeOutOutputs, "output"> {
  return createNode("nodetool.audio.FadeOut", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// Repeat — nodetool.audio.Repeat
export type RepeatInputs = {
  audio?: Connectable<AudioRef>;
  loops?: Connectable<number>;
};

export interface RepeatOutputs {
  output: AudioRef;
}

export function repeat(inputs: RepeatInputs, options?: NodeOptions): NodeWithOutputs<RepeatOutputs, "output"> {
  return createNode("nodetool.audio.Repeat", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// Audio Mixer — nodetool.audio.AudioMixer
export type AudioMixerInputs = {
  [name: string]: unknown;
};

export interface AudioMixerOutputs {
  output: AudioRef;
}

export function audioMixer(inputs?: AudioMixerInputs, options?: NodeOptions): NodeWithOutputs<AudioMixerOutputs, "output"> {
  return createNode("nodetool.audio.AudioMixer", inputs ?? {}, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
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

export function trim(inputs: TrimInputs, options?: NodeOptions): NodeWithOutputs<TrimOutputs, "output"> {
  return createNode("nodetool.audio.Trim", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// Create Silence — nodetool.audio.CreateSilence
export type CreateSilenceInputs = {
  duration?: Connectable<number>;
  sample_rate?: Connectable<number>;
};

export interface CreateSilenceOutputs {
  output: AudioRef;
}

export function createSilence(inputs: CreateSilenceInputs, options?: NodeOptions): NodeWithOutputs<CreateSilenceOutputs, "output"> {
  return createNode("nodetool.audio.CreateSilence", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// Concatenate Audio — nodetool.audio.Concat
export type ConcatInputs = {
  [name: string]: unknown;
};

export interface ConcatOutputs {
  output: AudioRef;
}

export function concat(inputs?: ConcatInputs, options?: NodeOptions): NodeWithOutputs<ConcatOutputs, "output"> {
  return createNode("nodetool.audio.Concat", inputs ?? {}, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// Concatenate Audio List — nodetool.audio.ConcatList
export type ConcatListInputs = {
  audio_files?: Connectable<AudioRef[]>;
};

export interface ConcatListOutputs {
  output: AudioRef;
}

export function concatList(inputs: ConcatListInputs, options?: NodeOptions): NodeWithOutputs<ConcatListOutputs, "output"> {
  return createNode("nodetool.audio.ConcatList", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// Chunk To Audio — nodetool.audio.ChunkToAudio
export type ChunkToAudioInputs = {
  chunk?: Connectable<unknown>;
};

export interface ChunkToAudioOutputs {
  audio: AudioRef;
}

export function chunkToAudio(inputs: ChunkToAudioInputs, options?: NodeOptions): NodeWithOutputs<ChunkToAudioOutputs, "audio"> {
  return createNode("nodetool.audio.ChunkToAudio", inputs, { id: options?.id, outputNames: ["audio"], outputTypes: {"audio":"audio"}, defaultOutput: "audio" });
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

export function getAudioInfo(inputs: GetAudioInfoInputs, options?: NodeOptions): NodeWithOutputs<GetAudioInfoOutputs> {
  return createNode("nodetool.audio.GetAudioInfo", inputs, { id: options?.id, outputNames: ["duration", "sample_rate", "channels", "format", "size_bytes"], outputTypes: {"duration":"float","sample_rate":"int","channels":"int","format":"str","size_bytes":"int"} });
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

export function loadAudioAssets(inputs: LoadAudioAssetsInputs, options?: NodeOptions): NodeWithOutputs<LoadAudioAssetsOutputs> {
  return createNode("nodetool.audio.LoadAudioAssets", inputs, { id: options?.id, outputNames: ["audio", "name", "audios"], outputTypes: {"audio":"audio","name":"str","audios":"list"}, streaming: true, inputMode: "buffered", outputCorrelation: {"audio":{"kind":"iteration","source":"__execution__","group":"items"},"name":{"kind":"iteration","source":"__execution__","group":"items"},"audios":{"kind":"single","source":"__execution__"}} });
}

// Load Audio File — nodetool.audio.LoadAudioFile
export type LoadAudioFileInputs = {
  path?: Connectable<string>;
};

export interface LoadAudioFileOutputs {
  output: AudioRef;
}

export function loadAudioFile(inputs: LoadAudioFileInputs, options?: NodeOptions): NodeWithOutputs<LoadAudioFileOutputs, "output"> {
  return createNode("nodetool.audio.LoadAudioFile", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
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

export function loadAudioFolder(inputs: LoadAudioFolderInputs, options?: NodeOptions): NodeWithOutputs<LoadAudioFolderOutputs> {
  return createNode("nodetool.audio.LoadAudioFolder", inputs, { id: options?.id, outputNames: ["audio", "path", "audios"], outputTypes: {"audio":"audio","path":"str","audios":"list"}, streaming: true, inputMode: "buffered", outputCorrelation: {"audio":{"kind":"iteration","source":"__execution__","group":"items"},"path":{"kind":"iteration","source":"__execution__","group":"items"},"audios":{"kind":"single","source":"__execution__"}} });
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

export function saveAudio(inputs: SaveAudioInputs, options?: NodeOptions): NodeWithOutputs<SaveAudioOutputs, "output"> {
  return createNode("nodetool.audio.SaveAudio", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// Save Audio File — nodetool.audio.SaveAudioFile
export type SaveAudioFileInputs = {
  audio?: Connectable<AudioRef>;
  save_to_workspace?: Connectable<boolean>;
  folder?: Connectable<string>;
  filename?: Connectable<string>;
};

export interface SaveAudioFileOutputs {
  output: AudioRef;
}

export function saveAudioFile(inputs: SaveAudioFileInputs, options?: NodeOptions): NodeWithOutputs<SaveAudioFileOutputs, "output"> {
  return createNode("nodetool.audio.SaveAudioFile", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
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

export function textToSpeech(inputs: TextToSpeechInputs, options?: NodeOptions): NodeWithOutputs<TextToSpeechOutputs> {
  return createNode("nodetool.audio.TextToSpeech", inputs, { id: options?.id, outputNames: ["audio", "chunk"], outputTypes: {"audio":"audio","chunk":"chunk"}, inputMode: "buffered", outputCorrelation: {"audio":{"kind":"single","source":"__execution__"},"chunk":{"kind":"single","source":"__execution__"}} });
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

export function textToMusic(inputs: TextToMusicInputs, options?: NodeOptions): NodeWithOutputs<TextToMusicOutputs, "audio"> {
  return createNode("nodetool.audio.TextToMusic", inputs, { id: options?.id, outputNames: ["audio"], outputTypes: {"audio":"audio"}, defaultOutput: "audio", inputMode: "buffered", outputCorrelation: {"audio":{"kind":"single","source":"__execution__"}} });
}

// Audio To Audio — nodetool.audio.AudioToAudio
export type AudioToAudioInputs = {
  model?: Connectable<unknown>;
  audio?: Connectable<AudioRef>;
  prompt?: Connectable<string>;
  voice?: Connectable<string>;
  strength?: Connectable<number>;
};

export interface AudioToAudioOutputs {
  audio: AudioRef;
}

export function audioToAudio(inputs: AudioToAudioInputs, options?: NodeOptions): NodeWithOutputs<AudioToAudioOutputs, "audio"> {
  return createNode("nodetool.audio.AudioToAudio", inputs, { id: options?.id, outputNames: ["audio"], outputTypes: {"audio":"audio"}, defaultOutput: "audio", inputMode: "buffered", outputCorrelation: {"audio":{"kind":"single","source":"__execution__"}} });
}
