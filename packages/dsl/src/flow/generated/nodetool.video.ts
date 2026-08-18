// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode, streamNode } from "../guest-core.js";
import type { ImageRef, AudioRef, VideoRef, FolderRef } from "../../types.js";

// Text To Video — nodetool.video.TextToVideo
export type TextToVideoInputs = {
  model?: unknown;
  prompt?: string;
  negative_prompt?: string;
  aspect_ratio?: string;
  resolution?: string;
  duration?: number;
  timeout_seconds?: number;
};

export interface TextToVideoOutputs {
  output: VideoRef;
}

export function textToVideo(inputs: TextToVideoInputs): Promise<TextToVideoOutputs> {
  return callNode<TextToVideoOutputs>("nodetool.video.TextToVideo", inputs);
}

// Image To Video — nodetool.video.ImageToVideo
export type ImageToVideoInputs = {
  image?: ImageRef[];
  model?: unknown;
  prompt?: string;
  negative_prompt?: string;
  entities?: Record<string, unknown>[];
  aspect_ratio?: string;
  resolution?: string;
  duration?: number;
  timeout_seconds?: number;
};

export interface ImageToVideoOutputs {
  output: VideoRef;
}

export function imageToVideo(inputs: ImageToVideoInputs): Promise<ImageToVideoOutputs> {
  return callNode<ImageToVideoOutputs>("nodetool.video.ImageToVideo", inputs);
}

// Load Video File — nodetool.video.LoadVideoFile
export type LoadVideoFileInputs = {
  path?: string;
};

export interface LoadVideoFileOutputs {
  output: VideoRef;
}

export function loadVideoFile(inputs: LoadVideoFileInputs): Promise<LoadVideoFileOutputs> {
  return callNode<LoadVideoFileOutputs>("nodetool.video.LoadVideoFile", inputs);
}

// Save Video File — nodetool.video.SaveVideoFile
export type SaveVideoFileInputs = {
  video?: VideoRef;
  folder?: string;
  filename?: string;
};

export interface SaveVideoFileOutputs {
  output: VideoRef;
}

export function saveVideoFile(inputs: SaveVideoFileInputs): Promise<SaveVideoFileOutputs> {
  return callNode<SaveVideoFileOutputs>("nodetool.video.SaveVideoFile", inputs);
}

// Load Video Folder — nodetool.video.LoadVideoAssets
export type LoadVideoAssetsInputs = {
  folder?: FolderRef;
};

export interface LoadVideoAssetsOutputs {
  video: VideoRef;
  name: string;
  videos: unknown[];
  names: unknown[];
}

export function loadVideoAssets(inputs: LoadVideoAssetsInputs): Promise<LoadVideoAssetsOutputs> {
  return callNode<LoadVideoAssetsOutputs>("nodetool.video.LoadVideoAssets", inputs);
}

loadVideoAssets.stream = function (inputs: LoadVideoAssetsInputs): AsyncIterable<Partial<LoadVideoAssetsOutputs>> {
  return streamNode<Partial<LoadVideoAssetsOutputs>>("nodetool.video.LoadVideoAssets", inputs);
};

// Save Video Asset — nodetool.video.SaveVideo
export type SaveVideoInputs = {
  video?: VideoRef;
  folder?: FolderRef;
  name?: string;
};

export interface SaveVideoOutputs {
  output: VideoRef;
}

export function saveVideo(inputs: SaveVideoInputs): Promise<SaveVideoOutputs> {
  return callNode<SaveVideoOutputs>("nodetool.video.SaveVideo", inputs);
}

// For Each Frame — nodetool.video.ForEachFrame
export type ForEachFrameInputs = {
  video?: VideoRef;
  start?: number;
  end?: number;
};

export interface ForEachFrameOutputs {
  frame: ImageRef;
  index: number;
  fps: number;
}

export function forEachFrame(inputs: ForEachFrameInputs): Promise<ForEachFrameOutputs> {
  return callNode<ForEachFrameOutputs>("nodetool.video.ForEachFrame", inputs);
}

forEachFrame.stream = function (inputs: ForEachFrameInputs): AsyncIterable<Partial<ForEachFrameOutputs>> {
  return streamNode<Partial<ForEachFrameOutputs>>("nodetool.video.ForEachFrame", inputs);
};

// Fps — nodetool.video.Fps
export type FpsInputs = {
  video?: VideoRef;
};

export interface FpsOutputs {
  output: number;
}

export function fps(inputs: FpsInputs): Promise<FpsOutputs> {
  return callNode<FpsOutputs>("nodetool.video.Fps", inputs);
}

// Frame To Video — nodetool.video.FrameToVideo
export type FrameToVideoInputs = {
  frame?: ImageRef | ImageRef[];
  fps?: number | number[];
};

export interface FrameToVideoOutputs {
  output: VideoRef;
}

export function frameToVideo(inputs: FrameToVideoInputs): Promise<FrameToVideoOutputs> {
  return callNode<FrameToVideoOutputs>("nodetool.video.FrameToVideo", inputs);
}

frameToVideo.stream = function (inputs: FrameToVideoInputs): AsyncIterable<{ slot: keyof FrameToVideoOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof FrameToVideoOutputs & string; value: unknown }>("nodetool.video.FrameToVideo", inputs);
};

// Concatenate Video — nodetool.video.Concat
export type ConcatInputs = {
};

export interface ConcatOutputs {
  output: VideoRef;
}

export function concat(inputs?: ConcatInputs): Promise<ConcatOutputs> {
  return callNode<ConcatOutputs>("nodetool.video.Concat", inputs ?? {});
}

// Trim — nodetool.video.Trim
export type TrimInputs = {
  video?: VideoRef;
  start_time?: number;
  end_time?: number;
  accurate?: boolean;
};

export interface TrimOutputs {
  output: VideoRef;
}

export function trim(inputs: TrimInputs): Promise<TrimOutputs> {
  return callNode<TrimOutputs>("nodetool.video.Trim", inputs);
}

// Resize — nodetool.video.Resize
export type ResizeInputs = {
  video?: VideoRef;
  width?: number;
  height?: number;
};

export interface ResizeOutputs {
  output: VideoRef;
}

export function resize(inputs: ResizeInputs): Promise<ResizeOutputs> {
  return callNode<ResizeOutputs>("nodetool.video.Resize", inputs);
}

// Rotate — nodetool.video.Rotate
export type RotateInputs = {
  video?: VideoRef;
  angle?: number;
};

export interface RotateOutputs {
  output: VideoRef;
}

export function rotate(inputs: RotateInputs): Promise<RotateOutputs> {
  return callNode<RotateOutputs>("nodetool.video.Rotate", inputs);
}

// Set Speed — nodetool.video.SetSpeed
export type SetSpeedInputs = {
  video?: VideoRef;
  speed_factor?: number;
};

export interface SetSpeedOutputs {
  output: VideoRef;
}

export function setSpeed(inputs: SetSpeedInputs): Promise<SetSpeedOutputs> {
  return callNode<SetSpeedOutputs>("nodetool.video.SetSpeed", inputs);
}

// Overlay — nodetool.video.Overlay
export type OverlayInputs = {
  main_video?: VideoRef;
  overlay_video?: VideoRef;
  x?: number;
  y?: number;
  scale?: number;
  overlay_audio_volume?: number;
};

export interface OverlayOutputs {
  output: VideoRef;
}

export function overlay(inputs: OverlayInputs): Promise<OverlayOutputs> {
  return callNode<OverlayOutputs>("nodetool.video.Overlay", inputs);
}

// Color Balance — nodetool.video.ColorBalance
export type ColorBalanceInputs = {
  video?: VideoRef;
  red_adjust?: number;
  green_adjust?: number;
  blue_adjust?: number;
};

export interface ColorBalanceOutputs {
  output: VideoRef;
}

export function colorBalance(inputs: ColorBalanceInputs): Promise<ColorBalanceOutputs> {
  return callNode<ColorBalanceOutputs>("nodetool.video.ColorBalance", inputs);
}

// Denoise — nodetool.video.Denoise
export type DenoiseInputs = {
  video?: VideoRef;
  strength?: number;
};

export interface DenoiseOutputs {
  output: VideoRef;
}

export function denoise(inputs: DenoiseInputs): Promise<DenoiseOutputs> {
  return callNode<DenoiseOutputs>("nodetool.video.Denoise", inputs);
}

// Stabilize — nodetool.video.Stabilize
export type StabilizeInputs = {
  video?: VideoRef;
  smoothing?: number;
  crop_black?: boolean;
};

export interface StabilizeOutputs {
  output: VideoRef;
}

export function stabilize(inputs: StabilizeInputs): Promise<StabilizeOutputs> {
  return callNode<StabilizeOutputs>("nodetool.video.Stabilize", inputs);
}

// Sharpness — nodetool.video.Sharpness
export type SharpnessInputs = {
  video?: VideoRef;
  luma_amount?: number;
  chroma_amount?: number;
};

export interface SharpnessOutputs {
  output: VideoRef;
}

export function sharpness(inputs: SharpnessInputs): Promise<SharpnessOutputs> {
  return callNode<SharpnessOutputs>("nodetool.video.Sharpness", inputs);
}

// Blur — nodetool.video.Blur
export type BlurInputs = {
  video?: VideoRef;
  strength?: number;
};

export interface BlurOutputs {
  output: VideoRef;
}

export function blur(inputs: BlurInputs): Promise<BlurOutputs> {
  return callNode<BlurOutputs>("nodetool.video.Blur", inputs);
}

// Saturation — nodetool.video.Saturation
export type SaturationInputs = {
  video?: VideoRef;
  saturation?: number;
};

export interface SaturationOutputs {
  output: VideoRef;
}

export function saturation(inputs: SaturationInputs): Promise<SaturationOutputs> {
  return callNode<SaturationOutputs>("nodetool.video.Saturation", inputs);
}

// Add Subtitles — nodetool.video.AddSubtitles
export type AddSubtitlesInputs = {
  video?: VideoRef;
  chunks?: unknown[];
  font?: unknown;
  align?: "top" | "center" | "bottom";
  font_size?: number;
  font_color?: unknown;
};

export interface AddSubtitlesOutputs {
  output: VideoRef;
}

export function addSubtitles(inputs: AddSubtitlesInputs): Promise<AddSubtitlesOutputs> {
  return callNode<AddSubtitlesOutputs>("nodetool.video.AddSubtitles", inputs);
}

// Reverse — nodetool.video.Reverse
export type ReverseInputs = {
  video?: VideoRef;
};

export interface ReverseOutputs {
  output: VideoRef;
}

export function reverse(inputs: ReverseInputs): Promise<ReverseOutputs> {
  return callNode<ReverseOutputs>("nodetool.video.Reverse", inputs);
}

// Transition — nodetool.video.Transition
export type TransitionInputs = {
  video_a?: VideoRef;
  video_b?: VideoRef;
  transition_type?: "fade" | "wipeleft" | "wiperight" | "wipeup" | "wipedown" | "slideleft" | "slideright" | "slideup" | "slidedown" | "circlecrop" | "rectcrop" | "distance" | "fadeblack" | "fadewhite" | "radial" | "smoothleft" | "smoothright" | "smoothup" | "smoothdown" | "circleopen" | "circleclose" | "vertopen" | "vertclose" | "horzopen" | "horzclose" | "dissolve" | "pixelize" | "diagtl" | "diagtr" | "diagbl" | "diagbr" | "hlslice" | "hrslice" | "vuslice" | "vdslice" | "hblur" | "fadegrays" | "wipetl" | "wipetr" | "wipebl" | "wipebr" | "squeezeh" | "squeezev" | "zoomin" | "fadefast" | "fadeslow" | "hlwind" | "hrwind" | "vuwind" | "vdwind" | "coverleft" | "coverright" | "coverup" | "coverdown" | "revealleft" | "revealright" | "revealup" | "revealdown";
  duration?: number;
};

export interface TransitionOutputs {
  output: VideoRef;
}

export function transition(inputs: TransitionInputs): Promise<TransitionOutputs> {
  return callNode<TransitionOutputs>("nodetool.video.Transition", inputs);
}

// Add Audio — nodetool.video.AddAudio
export type AddAudioInputs = {
  video?: VideoRef;
  audio?: AudioRef;
  volume?: number;
  mix?: boolean;
};

export interface AddAudioOutputs {
  output: VideoRef;
}

export function addAudio(inputs: AddAudioInputs): Promise<AddAudioOutputs> {
  return callNode<AddAudioOutputs>("nodetool.video.AddAudio", inputs);
}

// Chroma Key — nodetool.video.ChromaKey
export type ChromaKeyInputs = {
  video?: VideoRef;
  key_color?: unknown;
  similarity?: number;
  blend?: number;
};

export interface ChromaKeyOutputs {
  output: VideoRef;
}

export function chromaKey(inputs: ChromaKeyInputs): Promise<ChromaKeyOutputs> {
  return callNode<ChromaKeyOutputs>("nodetool.video.ChromaKey", inputs);
}

// Extract Audio — nodetool.video.ExtractAudio
export type ExtractAudioInputs = {
  video?: VideoRef;
};

export interface ExtractAudioOutputs {
  output: AudioRef;
}

export function extractAudio(inputs: ExtractAudioInputs): Promise<ExtractAudioOutputs> {
  return callNode<ExtractAudioOutputs>("nodetool.video.ExtractAudio", inputs);
}

// Extract Video Frame — nodetool.video.ExtractFrame
export type ExtractFrameInputs = {
  video?: VideoRef;
  time?: number;
};

export interface ExtractFrameOutputs {
  output: ImageRef;
}

export function extractFrame(inputs: ExtractFrameInputs): Promise<ExtractFrameOutputs> {
  return callNode<ExtractFrameOutputs>("nodetool.video.ExtractFrame", inputs);
}

// Get Video Info — nodetool.video.GetVideoInfo
export type GetVideoInfoInputs = {
  video?: VideoRef;
};

export interface GetVideoInfoOutputs {
  duration: number;
  width: number;
  height: number;
  fps: number;
  frame_count: number;
  codec: string;
  has_audio: boolean;
}

export function getVideoInfo(inputs: GetVideoInfoInputs): Promise<GetVideoInfoOutputs> {
  return callNode<GetVideoInfoOutputs>("nodetool.video.GetVideoInfo", inputs);
}

// Video To Video — nodetool.video.VideoToVideo
export type VideoToVideoInputs = {
  model?: unknown;
  video?: VideoRef;
  prompt?: string;
  negative_prompt?: string;
  strength?: number;
};

export interface VideoToVideoOutputs {
  output: VideoRef;
}

export function videoToVideo(inputs: VideoToVideoInputs): Promise<VideoToVideoOutputs> {
  return callNode<VideoToVideoOutputs>("nodetool.video.VideoToVideo", inputs);
}

// Lip Sync — nodetool.video.LipSync
export type LipSyncInputs = {
  model?: unknown;
  video?: VideoRef;
  audio?: AudioRef;
};

export interface LipSyncOutputs {
  output: VideoRef;
}

export function lipSync(inputs: LipSyncInputs): Promise<LipSyncOutputs> {
  return callNode<LipSyncOutputs>("nodetool.video.LipSync", inputs);
}
