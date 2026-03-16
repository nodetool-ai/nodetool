// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput, OutputHandle } from "../core.js";
import type { AudioRef, FolderRef } from "../types.js";

// Load Audio Assets — nodetool.audio.LoadAudioAssets
export interface LoadAudioAssetsInputs {
  folder?: Connectable<FolderRef>;
}

export interface LoadAudioAssetsOutputs {
  audio: OutputHandle<AudioRef>;
  name: OutputHandle<string>;
}

export function loadAudioAssets(inputs: LoadAudioAssetsInputs): DslNode<LoadAudioAssetsOutputs> {
  return createNode("nodetool.audio.LoadAudioAssets", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Load Audio File — nodetool.audio.LoadAudioFile
export interface LoadAudioFileInputs {
  path?: Connectable<string>;
}

export function loadAudioFile(inputs: LoadAudioFileInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("nodetool.audio.LoadAudioFile", inputs as Record<string, unknown>);
}

// Load Audio Folder — nodetool.audio.LoadAudioFolder
export interface LoadAudioFolderInputs {
  folder?: Connectable<string>;
  include_subdirectories?: Connectable<boolean>;
  extensions?: Connectable<string[]>;
}

export interface LoadAudioFolderOutputs {
  audio: OutputHandle<AudioRef>;
  path: OutputHandle<string>;
}

export function loadAudioFolder(inputs: LoadAudioFolderInputs): DslNode<LoadAudioFolderOutputs> {
  return createNode("nodetool.audio.LoadAudioFolder", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Save Audio Asset — nodetool.audio.SaveAudio
export interface SaveAudioInputs {
  audio?: Connectable<AudioRef>;
  folder?: Connectable<FolderRef>;
  name?: Connectable<string>;
}

export function saveAudio(inputs: SaveAudioInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("nodetool.audio.SaveAudio", inputs as Record<string, unknown>);
}

// Save Audio File — nodetool.audio.SaveAudioFile
export interface SaveAudioFileInputs {
  audio?: Connectable<AudioRef>;
  folder?: Connectable<string>;
  filename?: Connectable<string>;
  FORMAT_MAP?: Connectable<Record<string, string>>;
}

export function saveAudioFile(inputs: SaveAudioFileInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("nodetool.audio.SaveAudioFile", inputs as Record<string, unknown>);
}

// Normalize — nodetool.audio.Normalize
export interface NormalizeInputs {
  audio?: Connectable<AudioRef>;
}

export function normalize(inputs: NormalizeInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("nodetool.audio.Normalize", inputs as Record<string, unknown>);
}

// Overlay Audio — nodetool.audio.OverlayAudio
export interface OverlayAudioInputs {
  a?: Connectable<AudioRef>;
  b?: Connectable<AudioRef>;
}

export function overlayAudio(inputs: OverlayAudioInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("nodetool.audio.OverlayAudio", inputs as Record<string, unknown>);
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

export function removeSilence(inputs: RemoveSilenceInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("nodetool.audio.RemoveSilence", inputs as Record<string, unknown>);
}

// Slice Audio — nodetool.audio.SliceAudio
export interface SliceAudioInputs {
  audio?: Connectable<AudioRef>;
  start?: Connectable<number>;
  end?: Connectable<number>;
}

export function sliceAudio(inputs: SliceAudioInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("nodetool.audio.SliceAudio", inputs as Record<string, unknown>);
}

// Mono To Stereo — nodetool.audio.MonoToStereo
export interface MonoToStereoInputs {
  audio?: Connectable<AudioRef>;
}

export function monoToStereo(inputs: MonoToStereoInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("nodetool.audio.MonoToStereo", inputs as Record<string, unknown>);
}

// Stereo To Mono — nodetool.audio.StereoToMono
export interface StereoToMonoInputs {
  audio?: Connectable<AudioRef>;
  method?: Connectable<string>;
}

export function stereoToMono(inputs: StereoToMonoInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("nodetool.audio.StereoToMono", inputs as Record<string, unknown>);
}

// Reverse — nodetool.audio.Reverse
export interface ReverseInputs {
  audio?: Connectable<AudioRef>;
}

export function reverse(inputs: ReverseInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("nodetool.audio.Reverse", inputs as Record<string, unknown>);
}

// Fade In — nodetool.audio.FadeIn
export interface FadeInInputs {
  audio?: Connectable<AudioRef>;
  duration?: Connectable<number>;
}

export function fadeIn(inputs: FadeInInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("nodetool.audio.FadeIn", inputs as Record<string, unknown>);
}

// Fade Out — nodetool.audio.FadeOut
export interface FadeOutInputs {
  audio?: Connectable<AudioRef>;
  duration?: Connectable<number>;
}

export function fadeOut(inputs: FadeOutInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("nodetool.audio.FadeOut", inputs as Record<string, unknown>);
}

// Repeat — nodetool.audio.Repeat
export interface RepeatInputs {
  audio?: Connectable<AudioRef>;
  loops?: Connectable<number>;
}

export function repeat(inputs: RepeatInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("nodetool.audio.Repeat", inputs as Record<string, unknown>);
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

export function audioMixer(inputs: AudioMixerInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("nodetool.audio.AudioMixer", inputs as Record<string, unknown>);
}

// Audio To Numpy — nodetool.audio.AudioToNumpy
export interface AudioToNumpyInputs {
  audio?: Connectable<AudioRef>;
}

export interface AudioToNumpyOutputs {
  array: OutputHandle<unknown>;
  sample_rate: OutputHandle<number>;
  channels: OutputHandle<number>;
}

export function audioToNumpy(inputs: AudioToNumpyInputs): DslNode<AudioToNumpyOutputs> {
  return createNode("nodetool.audio.AudioToNumpy", inputs as Record<string, unknown>, { multiOutput: true });
}

// Numpy To Audio — nodetool.audio.NumpyToAudio
export interface NumpyToAudioInputs {
  array?: Connectable<unknown>;
  sample_rate?: Connectable<number>;
  channels?: Connectable<number>;
}

export function numpyToAudio(inputs: NumpyToAudioInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("nodetool.audio.NumpyToAudio", inputs as Record<string, unknown>);
}

// Trim — nodetool.audio.Trim
export interface TrimInputs {
  audio?: Connectable<AudioRef>;
  start?: Connectable<number>;
  end?: Connectable<number>;
}

export function trim(inputs: TrimInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("nodetool.audio.Trim", inputs as Record<string, unknown>);
}

// Convert To Array — nodetool.audio.ConvertToArray
export interface ConvertToArrayInputs {
  audio?: Connectable<AudioRef>;
}

export function convertToArray(inputs: ConvertToArrayInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.audio.ConvertToArray", inputs as Record<string, unknown>);
}

// Create Silence — nodetool.audio.CreateSilence
export interface CreateSilenceInputs {
  duration?: Connectable<number>;
}

export function createSilence(inputs: CreateSilenceInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("nodetool.audio.CreateSilence", inputs as Record<string, unknown>);
}

// Concat — nodetool.audio.Concat
export interface ConcatInputs {
  a?: Connectable<AudioRef>;
  b?: Connectable<AudioRef>;
}

export function concat(inputs: ConcatInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("nodetool.audio.Concat", inputs as Record<string, unknown>);
}

// Concat List — nodetool.audio.ConcatList
export interface ConcatListInputs {
  audio_files?: Connectable<AudioRef[]>;
}

export function concatList(inputs: ConcatListInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("nodetool.audio.ConcatList", inputs as Record<string, unknown>);
}

// Text To Speech — nodetool.audio.TextToSpeech
export interface TextToSpeechInputs {
  model?: Connectable<unknown>;
  text?: Connectable<string>;
  speed?: Connectable<number>;
}

export interface TextToSpeechOutputs {
  audio: OutputHandle<AudioRef>;
  chunk: OutputHandle<unknown>;
}

export function textToSpeech(inputs: TextToSpeechInputs): DslNode<TextToSpeechOutputs> {
  return createNode("nodetool.audio.TextToSpeech", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Chunk To Audio — nodetool.audio.ChunkToAudio
export interface ChunkToAudioInputs {
  chunk?: Connectable<unknown>;
  batch_size?: Connectable<number>;
}

export interface ChunkToAudioOutputs {
  audio: OutputHandle<AudioRef>;
}

export function chunkToAudio(inputs: ChunkToAudioInputs): DslNode<ChunkToAudioOutputs> {
  return createNode("nodetool.audio.ChunkToAudio", inputs as Record<string, unknown>, { multiOutput: true });
}
