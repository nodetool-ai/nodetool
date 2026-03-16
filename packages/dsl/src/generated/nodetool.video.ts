// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput, OutputHandle } from "../core.js";
import type { ImageRef, AudioRef, VideoRef, FolderRef } from "../types.js";

// Text To Video — nodetool.video.TextToVideo
export interface TextToVideoInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  negative_prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
  num_frames?: Connectable<number>;
  guidance_scale?: Connectable<number>;
  num_inference_steps?: Connectable<number>;
  seed?: Connectable<number>;
  timeout_seconds?: Connectable<number>;
}

export function textToVideo(inputs: TextToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("nodetool.video.TextToVideo", inputs as Record<string, unknown>);
}

// Image To Video — nodetool.video.ImageToVideo
export interface ImageToVideoInputs {
  image?: Connectable<ImageRef>;
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  negative_prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
  num_frames?: Connectable<number>;
  guidance_scale?: Connectable<number>;
  num_inference_steps?: Connectable<number>;
  seed?: Connectable<number>;
  timeout_seconds?: Connectable<number>;
}

export function imageToVideo(inputs: ImageToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("nodetool.video.ImageToVideo", inputs as Record<string, unknown>);
}

// Load Video File — nodetool.video.LoadVideoFile
export interface LoadVideoFileInputs {
  path?: Connectable<string>;
}

export function loadVideoFile(inputs: LoadVideoFileInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("nodetool.video.LoadVideoFile", inputs as Record<string, unknown>);
}

// Save Video File — nodetool.video.SaveVideoFile
export interface SaveVideoFileInputs {
  video?: Connectable<VideoRef>;
  folder?: Connectable<string>;
  filename?: Connectable<string>;
}

export function saveVideoFile(inputs: SaveVideoFileInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("nodetool.video.SaveVideoFile", inputs as Record<string, unknown>);
}

// Load Video Folder — nodetool.video.LoadVideoAssets
export interface LoadVideoAssetsInputs {
  folder?: Connectable<FolderRef>;
}

export interface LoadVideoAssetsOutputs {
  video: OutputHandle<VideoRef>;
  name: OutputHandle<string>;
}

export function loadVideoAssets(inputs: LoadVideoAssetsInputs): DslNode<LoadVideoAssetsOutputs> {
  return createNode("nodetool.video.LoadVideoAssets", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Save Video Asset — nodetool.video.SaveVideo
export interface SaveVideoInputs {
  video?: Connectable<VideoRef>;
  folder?: Connectable<FolderRef>;
  name?: Connectable<string>;
}

export function saveVideo(inputs: SaveVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("nodetool.video.SaveVideo", inputs as Record<string, unknown>);
}

// Frame Iterator — nodetool.video.FrameIterator
export interface FrameIteratorInputs {
  video?: Connectable<VideoRef>;
  start?: Connectable<number>;
  end?: Connectable<number>;
}

export interface FrameIteratorOutputs {
  frame: OutputHandle<ImageRef>;
  index: OutputHandle<number>;
  fps: OutputHandle<number>;
}

export function frameIterator(inputs: FrameIteratorInputs): DslNode<FrameIteratorOutputs> {
  return createNode("nodetool.video.FrameIterator", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Fps — nodetool.video.Fps
export interface FpsInputs {
  video?: Connectable<VideoRef>;
}

export function fps(inputs: FpsInputs): DslNode<SingleOutput<number>> {
  return createNode("nodetool.video.Fps", inputs as Record<string, unknown>);
}

// Frame To Video — nodetool.video.FrameToVideo
export interface FrameToVideoInputs {
  frame?: Connectable<ImageRef>;
  fps?: Connectable<number>;
}

export function frameToVideo(inputs: FrameToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("nodetool.video.FrameToVideo", inputs as Record<string, unknown>);
}

// Concat — nodetool.video.Concat
export interface ConcatInputs {
  video_a?: Connectable<VideoRef>;
  video_b?: Connectable<VideoRef>;
}

export function concat(inputs: ConcatInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("nodetool.video.Concat", inputs as Record<string, unknown>);
}

// Trim — nodetool.video.Trim
export interface TrimInputs {
  video?: Connectable<VideoRef>;
  start_time?: Connectable<number>;
  end_time?: Connectable<number>;
}

export function trim(inputs: TrimInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("nodetool.video.Trim", inputs as Record<string, unknown>);
}

// Resize — nodetool.video.Resize
export interface ResizeInputs {
  video?: Connectable<VideoRef>;
  width?: Connectable<number>;
  height?: Connectable<number>;
}

export function resize(inputs: ResizeInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("nodetool.video.Resize", inputs as Record<string, unknown>);
}

// Rotate — nodetool.video.Rotate
export interface RotateInputs {
  video?: Connectable<VideoRef>;
  angle?: Connectable<number>;
}

export function rotate(inputs: RotateInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("nodetool.video.Rotate", inputs as Record<string, unknown>);
}

// Set Speed — nodetool.video.SetSpeed
export interface SetSpeedInputs {
  video?: Connectable<VideoRef>;
  speed_factor?: Connectable<number>;
}

export function setSpeed(inputs: SetSpeedInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("nodetool.video.SetSpeed", inputs as Record<string, unknown>);
}

// Overlay — nodetool.video.Overlay
export interface OverlayInputs {
  main_video?: Connectable<VideoRef>;
  overlay_video?: Connectable<VideoRef>;
  x?: Connectable<number>;
  y?: Connectable<number>;
  scale?: Connectable<number>;
  overlay_audio_volume?: Connectable<number>;
}

export function overlay(inputs: OverlayInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("nodetool.video.Overlay", inputs as Record<string, unknown>);
}

// Color Balance — nodetool.video.ColorBalance
export interface ColorBalanceInputs {
  video?: Connectable<VideoRef>;
  red_adjust?: Connectable<number>;
  green_adjust?: Connectable<number>;
  blue_adjust?: Connectable<number>;
}

export function colorBalance(inputs: ColorBalanceInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("nodetool.video.ColorBalance", inputs as Record<string, unknown>);
}

// Denoise — nodetool.video.Denoise
export interface DenoiseInputs {
  video?: Connectable<VideoRef>;
  strength?: Connectable<number>;
}

export function denoise(inputs: DenoiseInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("nodetool.video.Denoise", inputs as Record<string, unknown>);
}

// Stabilize — nodetool.video.Stabilize
export interface StabilizeInputs {
  video?: Connectable<VideoRef>;
  smoothing?: Connectable<number>;
  crop_black?: Connectable<boolean>;
}

export function stabilize(inputs: StabilizeInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("nodetool.video.Stabilize", inputs as Record<string, unknown>);
}

// Sharpness — nodetool.video.Sharpness
export interface SharpnessInputs {
  video?: Connectable<VideoRef>;
  luma_amount?: Connectable<number>;
  chroma_amount?: Connectable<number>;
}

export function sharpness(inputs: SharpnessInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("nodetool.video.Sharpness", inputs as Record<string, unknown>);
}

// Blur — nodetool.video.Blur
export interface BlurInputs {
  video?: Connectable<VideoRef>;
  strength?: Connectable<number>;
}

export function blur(inputs: BlurInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("nodetool.video.Blur", inputs as Record<string, unknown>);
}

// Saturation — nodetool.video.Saturation
export interface SaturationInputs {
  video?: Connectable<VideoRef>;
  saturation?: Connectable<number>;
}

export function saturation(inputs: SaturationInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("nodetool.video.Saturation", inputs as Record<string, unknown>);
}

// Add Subtitles — nodetool.video.AddSubtitles
export interface AddSubtitlesInputs {
  video?: Connectable<VideoRef>;
  chunks?: Connectable<unknown[]>;
  font?: Connectable<unknown>;
  align?: Connectable<unknown>;
  font_size?: Connectable<number>;
  font_color?: Connectable<unknown>;
}

export function addSubtitles(inputs: AddSubtitlesInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("nodetool.video.AddSubtitles", inputs as Record<string, unknown>);
}

// Reverse — nodetool.video.Reverse
export interface ReverseInputs {
  video?: Connectable<VideoRef>;
}

export function reverse(inputs: ReverseInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("nodetool.video.Reverse", inputs as Record<string, unknown>);
}

// Transition — nodetool.video.Transition
export interface TransitionInputs {
  video_a?: Connectable<VideoRef>;
  video_b?: Connectable<VideoRef>;
  transition_type?: Connectable<unknown>;
  duration?: Connectable<number>;
}

export function transition(inputs: TransitionInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("nodetool.video.Transition", inputs as Record<string, unknown>);
}

// Add Audio — nodetool.video.AddAudio
export interface AddAudioInputs {
  video?: Connectable<VideoRef>;
  audio?: Connectable<AudioRef>;
  volume?: Connectable<number>;
  mix?: Connectable<boolean>;
}

export function addAudio(inputs: AddAudioInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("nodetool.video.AddAudio", inputs as Record<string, unknown>);
}

// Chroma Key — nodetool.video.ChromaKey
export interface ChromaKeyInputs {
  video?: Connectable<VideoRef>;
  key_color?: Connectable<unknown>;
  similarity?: Connectable<number>;
  blend?: Connectable<number>;
}

export function chromaKey(inputs: ChromaKeyInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("nodetool.video.ChromaKey", inputs as Record<string, unknown>);
}

// Extract Audio — nodetool.video.ExtractAudio
export interface ExtractAudioInputs {
  video?: Connectable<VideoRef>;
}

export function extractAudio(inputs: ExtractAudioInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("nodetool.video.ExtractAudio", inputs as Record<string, unknown>);
}

// Extract Frame — nodetool.video.ExtractFrame
export interface ExtractFrameInputs {
  video?: Connectable<VideoRef>;
  time?: Connectable<number>;
}

export function extractFrame(inputs: ExtractFrameInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("nodetool.video.ExtractFrame", inputs as Record<string, unknown>);
}

// Get Video Info — nodetool.video.GetVideoInfo
export interface GetVideoInfoInputs {
  video?: Connectable<VideoRef>;
}

export interface GetVideoInfoOutputs {
  duration: OutputHandle<number>;
  width: OutputHandle<number>;
  height: OutputHandle<number>;
  fps: OutputHandle<number>;
  frame_count: OutputHandle<number>;
  codec: OutputHandle<string>;
  has_audio: OutputHandle<boolean>;
}

export function getVideoInfo(inputs: GetVideoInfoInputs): DslNode<GetVideoInfoOutputs> {
  return createNode("nodetool.video.GetVideoInfo", inputs as Record<string, unknown>, { multiOutput: true });
}
