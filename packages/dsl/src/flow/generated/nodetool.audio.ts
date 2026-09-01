// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode, streamNode } from "../guest-core.js";
import type { AudioRef, FolderRef } from "../../types.js";

// Normalize — nodetool.audio.Normalize
export type NormalizeInputs = {
  audio?: AudioRef;
};

export interface NormalizeOutputs {
  output: AudioRef;
}

export function normalize(inputs: NormalizeInputs): Promise<NormalizeOutputs> {
  return callNode<NormalizeOutputs>("nodetool.audio.Normalize", inputs);
}

// Overlay Audio — nodetool.audio.OverlayAudio
export type OverlayAudioInputs = {
  a?: AudioRef;
  b?: AudioRef;
};

export interface OverlayAudioOutputs {
  output: AudioRef;
}

export function overlayAudio(inputs: OverlayAudioInputs): Promise<OverlayAudioOutputs> {
  return callNode<OverlayAudioOutputs>("nodetool.audio.OverlayAudio", inputs);
}

// Remove Silence — nodetool.audio.RemoveSilence
export type RemoveSilenceInputs = {
  audio?: AudioRef;
  min_length?: number;
  threshold?: number;
  reduction_factor?: number;
  crossfade?: number;
  min_silence_between_parts?: number;
};

export interface RemoveSilenceOutputs {
  output: AudioRef;
}

export function removeSilence(inputs: RemoveSilenceInputs): Promise<RemoveSilenceOutputs> {
  return callNode<RemoveSilenceOutputs>("nodetool.audio.RemoveSilence", inputs);
}

// Slice Audio — nodetool.audio.SliceAudio
export type SliceAudioInputs = {
  audio?: AudioRef;
  start?: number;
  end?: number;
};

export interface SliceAudioOutputs {
  output: AudioRef;
}

export function sliceAudio(inputs: SliceAudioInputs): Promise<SliceAudioOutputs> {
  return callNode<SliceAudioOutputs>("nodetool.audio.SliceAudio", inputs);
}

// Mono To Stereo — nodetool.audio.MonoToStereo
export type MonoToStereoInputs = {
  audio?: AudioRef;
};

export interface MonoToStereoOutputs {
  output: AudioRef;
}

export function monoToStereo(inputs: MonoToStereoInputs): Promise<MonoToStereoOutputs> {
  return callNode<MonoToStereoOutputs>("nodetool.audio.MonoToStereo", inputs);
}

// Stereo To Mono — nodetool.audio.StereoToMono
export type StereoToMonoInputs = {
  audio?: AudioRef;
  method?: string;
};

export interface StereoToMonoOutputs {
  output: AudioRef;
}

export function stereoToMono(inputs: StereoToMonoInputs): Promise<StereoToMonoOutputs> {
  return callNode<StereoToMonoOutputs>("nodetool.audio.StereoToMono", inputs);
}

// Reverse — nodetool.audio.Reverse
export type ReverseInputs = {
  audio?: AudioRef;
};

export interface ReverseOutputs {
  output: AudioRef;
}

export function reverse(inputs: ReverseInputs): Promise<ReverseOutputs> {
  return callNode<ReverseOutputs>("nodetool.audio.Reverse", inputs);
}

// Fade In — nodetool.audio.FadeIn
export type FadeInInputs = {
  audio?: AudioRef;
  duration?: number;
};

export interface FadeInOutputs {
  output: AudioRef;
}

export function fadeIn(inputs: FadeInInputs): Promise<FadeInOutputs> {
  return callNode<FadeInOutputs>("nodetool.audio.FadeIn", inputs);
}

// Fade Out — nodetool.audio.FadeOut
export type FadeOutInputs = {
  audio?: AudioRef;
  duration?: number;
};

export interface FadeOutOutputs {
  output: AudioRef;
}

export function fadeOut(inputs: FadeOutInputs): Promise<FadeOutOutputs> {
  return callNode<FadeOutOutputs>("nodetool.audio.FadeOut", inputs);
}

// Repeat — nodetool.audio.Repeat
export type RepeatInputs = {
  audio?: AudioRef;
  loops?: number;
};

export interface RepeatOutputs {
  output: AudioRef;
}

export function repeat(inputs: RepeatInputs): Promise<RepeatOutputs> {
  return callNode<RepeatOutputs>("nodetool.audio.Repeat", inputs);
}

// Audio Mixer — nodetool.audio.AudioMixer
export type AudioMixerInputs = {
};

export interface AudioMixerOutputs {
  output: AudioRef;
}

export function audioMixer(inputs?: AudioMixerInputs): Promise<AudioMixerOutputs> {
  return callNode<AudioMixerOutputs>("nodetool.audio.AudioMixer", inputs ?? {});
}

// Trim — nodetool.audio.Trim
export type TrimInputs = {
  audio?: AudioRef;
  start?: number;
  end?: number;
};

export interface TrimOutputs {
  output: AudioRef;
}

export function trim(inputs: TrimInputs): Promise<TrimOutputs> {
  return callNode<TrimOutputs>("nodetool.audio.Trim", inputs);
}

// Create Silence — nodetool.audio.CreateSilence
export type CreateSilenceInputs = {
  duration?: number;
  sample_rate?: number;
};

export interface CreateSilenceOutputs {
  output: AudioRef;
}

export function createSilence(inputs: CreateSilenceInputs): Promise<CreateSilenceOutputs> {
  return callNode<CreateSilenceOutputs>("nodetool.audio.CreateSilence", inputs);
}

// Concatenate Audio — nodetool.audio.Concat
export type ConcatInputs = {
};

export interface ConcatOutputs {
  output: AudioRef;
}

export function concat(inputs?: ConcatInputs): Promise<ConcatOutputs> {
  return callNode<ConcatOutputs>("nodetool.audio.Concat", inputs ?? {});
}

// Concatenate Audio List — nodetool.audio.ConcatList
export type ConcatListInputs = {
  audio_files?: AudioRef[];
};

export interface ConcatListOutputs {
  output: AudioRef;
}

export function concatList(inputs: ConcatListInputs): Promise<ConcatListOutputs> {
  return callNode<ConcatListOutputs>("nodetool.audio.ConcatList", inputs);
}

// Chunk To Audio — nodetool.audio.ChunkToAudio
export type ChunkToAudioInputs = {
  chunk?: unknown;
};

export interface ChunkToAudioOutputs {
  audio: AudioRef;
}

export function chunkToAudio(inputs: ChunkToAudioInputs): Promise<ChunkToAudioOutputs> {
  return callNode<ChunkToAudioOutputs>("nodetool.audio.ChunkToAudio", inputs);
}

// Get Audio Info — nodetool.audio.GetAudioInfo
export type GetAudioInfoInputs = {
  audio?: AudioRef;
};

export interface GetAudioInfoOutputs {
  duration: number;
  sample_rate: number;
  channels: number;
  format: string;
  size_bytes: number;
}

export function getAudioInfo(inputs: GetAudioInfoInputs): Promise<GetAudioInfoOutputs> {
  return callNode<GetAudioInfoOutputs>("nodetool.audio.GetAudioInfo", inputs);
}

// Load Audio Assets — nodetool.audio.LoadAudioAssets
export type LoadAudioAssetsInputs = {
  folder?: FolderRef;
};

export interface LoadAudioAssetsOutputs {
  audio: AudioRef;
  name: string;
  audios: unknown[];
}

export function loadAudioAssets(inputs: LoadAudioAssetsInputs): Promise<LoadAudioAssetsOutputs> {
  return callNode<LoadAudioAssetsOutputs>("nodetool.audio.LoadAudioAssets", inputs);
}

loadAudioAssets.stream = function (inputs: LoadAudioAssetsInputs): AsyncIterable<Partial<LoadAudioAssetsOutputs>> {
  return streamNode<Partial<LoadAudioAssetsOutputs>>("nodetool.audio.LoadAudioAssets", inputs);
};

// Load Audio File — nodetool.audio.LoadAudioFile
export type LoadAudioFileInputs = {
  path?: string;
};

export interface LoadAudioFileOutputs {
  output: AudioRef;
}

export function loadAudioFile(inputs: LoadAudioFileInputs): Promise<LoadAudioFileOutputs> {
  return callNode<LoadAudioFileOutputs>("nodetool.audio.LoadAudioFile", inputs);
}

// Load Audio Folder — nodetool.audio.LoadAudioFolder
export type LoadAudioFolderInputs = {
  folder?: string;
  include_subdirectories?: boolean;
  extensions?: string[];
};

export interface LoadAudioFolderOutputs {
  audio: AudioRef;
  path: string;
  audios: unknown[];
}

export function loadAudioFolder(inputs: LoadAudioFolderInputs): Promise<LoadAudioFolderOutputs> {
  return callNode<LoadAudioFolderOutputs>("nodetool.audio.LoadAudioFolder", inputs);
}

loadAudioFolder.stream = function (inputs: LoadAudioFolderInputs): AsyncIterable<Partial<LoadAudioFolderOutputs>> {
  return streamNode<Partial<LoadAudioFolderOutputs>>("nodetool.audio.LoadAudioFolder", inputs);
};

// Save Audio Asset — nodetool.audio.SaveAudio
export type SaveAudioInputs = {
  audio?: AudioRef;
  folder?: FolderRef;
  name?: string;
};

export interface SaveAudioOutputs {
  output: AudioRef;
}

export function saveAudio(inputs: SaveAudioInputs): Promise<SaveAudioOutputs> {
  return callNode<SaveAudioOutputs>("nodetool.audio.SaveAudio", inputs);
}

// Save Audio File — nodetool.audio.SaveAudioFile
export type SaveAudioFileInputs = {
  audio?: AudioRef;
  save_to_workspace?: boolean;
  folder?: string;
  filename?: string;
  FORMAT_MAP?: Record<string, string>;
};

export interface SaveAudioFileOutputs {
  output: AudioRef;
}

export function saveAudioFile(inputs: SaveAudioFileInputs): Promise<SaveAudioFileOutputs> {
  return callNode<SaveAudioFileOutputs>("nodetool.audio.SaveAudioFile", inputs);
}

// Text To Speech — nodetool.audio.TextToSpeech
export type TextToSpeechInputs = {
  model?: unknown;
  text?: string;
  speed?: number;
  reference_audio?: AudioRef;
  reference_text?: string;
  language?: string;
  instructions?: string;
};

export interface TextToSpeechOutputs {
  audio: AudioRef;
  chunk: unknown;
}

export function textToSpeech(inputs: TextToSpeechInputs): Promise<TextToSpeechOutputs> {
  return callNode<TextToSpeechOutputs>("nodetool.audio.TextToSpeech", inputs);
}

// Text To Music — nodetool.audio.TextToMusic
export type TextToMusicInputs = {
  model?: unknown;
  prompt?: string;
  lyrics?: string;
  duration?: number;
};

export interface TextToMusicOutputs {
  audio: AudioRef;
}

export function textToMusic(inputs: TextToMusicInputs): Promise<TextToMusicOutputs> {
  return callNode<TextToMusicOutputs>("nodetool.audio.TextToMusic", inputs);
}
