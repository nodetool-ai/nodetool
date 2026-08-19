// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, AudioRef, VideoRef, FolderRef } from "../types.js";

// Text To Video — nodetool.video.TextToVideo
export type TextToVideoInputs = {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  negative_prompt?: Connectable<string>;
  aspect_ratio?: Connectable<string>;
  resolution?: Connectable<string>;
  duration?: Connectable<number>;
  timeout_seconds?: Connectable<number>;
};

export interface TextToVideoOutputs {
  output: VideoRef;
}

export function textToVideo(inputs: TextToVideoInputs): DslNode<TextToVideoOutputs, "output"> {
  return createNode("nodetool.video.TextToVideo", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Image To Video — nodetool.video.ImageToVideo
export type ImageToVideoInputs = {
  image?: Connectable<ImageRef[]>;
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  negative_prompt?: Connectable<string>;
  entities?: Connectable<Record<string, unknown>[]>;
  aspect_ratio?: Connectable<string>;
  resolution?: Connectable<string>;
  duration?: Connectable<number>;
  timeout_seconds?: Connectable<number>;
};

export interface ImageToVideoOutputs {
  output: VideoRef;
}

export function imageToVideo(inputs: ImageToVideoInputs): DslNode<ImageToVideoOutputs, "output"> {
  return createNode("nodetool.video.ImageToVideo", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Load Video File — nodetool.video.LoadVideoFile
export type LoadVideoFileInputs = {
  path?: Connectable<string>;
};

export interface LoadVideoFileOutputs {
  output: VideoRef;
}

export function loadVideoFile(inputs: LoadVideoFileInputs): DslNode<LoadVideoFileOutputs, "output"> {
  return createNode("nodetool.video.LoadVideoFile", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Save Video File — nodetool.video.SaveVideoFile
export type SaveVideoFileInputs = {
  video?: Connectable<VideoRef>;
  save_to_workspace?: Connectable<boolean>;
  folder?: Connectable<string>;
  filename?: Connectable<string>;
};

export interface SaveVideoFileOutputs {
  output: VideoRef;
}

export function saveVideoFile(inputs: SaveVideoFileInputs): DslNode<SaveVideoFileOutputs, "output"> {
  return createNode("nodetool.video.SaveVideoFile", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Load Video Folder — nodetool.video.LoadVideoAssets
export type LoadVideoAssetsInputs = {
  folder?: Connectable<FolderRef>;
};

export interface LoadVideoAssetsOutputs {
  video: VideoRef;
  name: string;
  videos: unknown[];
  names: unknown[];
}

export function loadVideoAssets(inputs: LoadVideoAssetsInputs): DslNode<LoadVideoAssetsOutputs> {
  return createNode("nodetool.video.LoadVideoAssets", inputs, { outputNames: ["video", "name", "videos", "names"], streaming: true });
}

// Save Video Asset — nodetool.video.SaveVideo
export type SaveVideoInputs = {
  video?: Connectable<VideoRef>;
  folder?: Connectable<FolderRef>;
  name?: Connectable<string>;
};

export interface SaveVideoOutputs {
  output: VideoRef;
}

export function saveVideo(inputs: SaveVideoInputs): DslNode<SaveVideoOutputs, "output"> {
  return createNode("nodetool.video.SaveVideo", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// For Each Frame — nodetool.video.ForEachFrame
export type ForEachFrameInputs = {
  video?: Connectable<VideoRef>;
  start?: Connectable<number>;
  end?: Connectable<number>;
};

export interface ForEachFrameOutputs {
  frame: ImageRef;
  index: number;
  fps: number;
}

export function forEachFrame(inputs: ForEachFrameInputs): DslNode<ForEachFrameOutputs> {
  return createNode("nodetool.video.ForEachFrame", inputs, { outputNames: ["frame", "index", "fps"], streaming: true });
}

// Fps — nodetool.video.Fps
export type FpsInputs = {
  video?: Connectable<VideoRef>;
};

export interface FpsOutputs {
  output: number;
}

export function fps(inputs: FpsInputs): DslNode<FpsOutputs, "output"> {
  return createNode("nodetool.video.Fps", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Frame To Video — nodetool.video.FrameToVideo
export type FrameToVideoInputs = {
  frame?: Connectable<ImageRef>;
  fps?: Connectable<number>;
};

export interface FrameToVideoOutputs {
  output: VideoRef;
}

export function frameToVideo(inputs: FrameToVideoInputs): DslNode<FrameToVideoOutputs, "output"> {
  return createNode("nodetool.video.FrameToVideo", inputs, { outputNames: ["output"], defaultOutput: "output", streamingInput: true });
}

// Concatenate Video — nodetool.video.Concat
export type ConcatInputs = {
};

export interface ConcatOutputs {
  output: VideoRef;
}

export function concat(inputs?: ConcatInputs): DslNode<ConcatOutputs, "output"> {
  return createNode("nodetool.video.Concat", inputs ?? {}, { outputNames: ["output"], defaultOutput: "output" });
}

// Trim — nodetool.video.Trim
export type TrimInputs = {
  video?: Connectable<VideoRef>;
  start_time?: Connectable<number>;
  end_time?: Connectable<number>;
  accurate?: Connectable<boolean>;
};

export interface TrimOutputs {
  output: VideoRef;
}

export function trim(inputs: TrimInputs): DslNode<TrimOutputs, "output"> {
  return createNode("nodetool.video.Trim", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Resize — nodetool.video.Resize
export type ResizeInputs = {
  video?: Connectable<VideoRef>;
  width?: Connectable<number>;
  height?: Connectable<number>;
};

export interface ResizeOutputs {
  output: VideoRef;
}

export function resize(inputs: ResizeInputs): DslNode<ResizeOutputs, "output"> {
  return createNode("nodetool.video.Resize", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Rotate — nodetool.video.Rotate
export type RotateInputs = {
  video?: Connectable<VideoRef>;
  angle?: Connectable<number>;
};

export interface RotateOutputs {
  output: VideoRef;
}

export function rotate(inputs: RotateInputs): DslNode<RotateOutputs, "output"> {
  return createNode("nodetool.video.Rotate", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Set Speed — nodetool.video.SetSpeed
export type SetSpeedInputs = {
  video?: Connectable<VideoRef>;
  speed_factor?: Connectable<number>;
};

export interface SetSpeedOutputs {
  output: VideoRef;
}

export function setSpeed(inputs: SetSpeedInputs): DslNode<SetSpeedOutputs, "output"> {
  return createNode("nodetool.video.SetSpeed", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Overlay — nodetool.video.Overlay
export type OverlayInputs = {
  main_video?: Connectable<VideoRef>;
  overlay_video?: Connectable<VideoRef>;
  x?: Connectable<number>;
  y?: Connectable<number>;
  scale?: Connectable<number>;
  overlay_audio_volume?: Connectable<number>;
};

export interface OverlayOutputs {
  output: VideoRef;
}

export function overlay(inputs: OverlayInputs): DslNode<OverlayOutputs, "output"> {
  return createNode("nodetool.video.Overlay", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Color Balance — nodetool.video.ColorBalance
export type ColorBalanceInputs = {
  video?: Connectable<VideoRef>;
  red_adjust?: Connectable<number>;
  green_adjust?: Connectable<number>;
  blue_adjust?: Connectable<number>;
};

export interface ColorBalanceOutputs {
  output: VideoRef;
}

export function colorBalance(inputs: ColorBalanceInputs): DslNode<ColorBalanceOutputs, "output"> {
  return createNode("nodetool.video.ColorBalance", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Denoise — nodetool.video.Denoise
export type DenoiseInputs = {
  video?: Connectable<VideoRef>;
  strength?: Connectable<number>;
};

export interface DenoiseOutputs {
  output: VideoRef;
}

export function denoise(inputs: DenoiseInputs): DslNode<DenoiseOutputs, "output"> {
  return createNode("nodetool.video.Denoise", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Stabilize — nodetool.video.Stabilize
export type StabilizeInputs = {
  video?: Connectable<VideoRef>;
  smoothing?: Connectable<number>;
  crop_black?: Connectable<boolean>;
};

export interface StabilizeOutputs {
  output: VideoRef;
}

export function stabilize(inputs: StabilizeInputs): DslNode<StabilizeOutputs, "output"> {
  return createNode("nodetool.video.Stabilize", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Sharpness — nodetool.video.Sharpness
export type SharpnessInputs = {
  video?: Connectable<VideoRef>;
  luma_amount?: Connectable<number>;
  chroma_amount?: Connectable<number>;
};

export interface SharpnessOutputs {
  output: VideoRef;
}

export function sharpness(inputs: SharpnessInputs): DslNode<SharpnessOutputs, "output"> {
  return createNode("nodetool.video.Sharpness", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Blur — nodetool.video.Blur
export type BlurInputs = {
  video?: Connectable<VideoRef>;
  strength?: Connectable<number>;
};

export interface BlurOutputs {
  output: VideoRef;
}

export function blur(inputs: BlurInputs): DslNode<BlurOutputs, "output"> {
  return createNode("nodetool.video.Blur", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Saturation — nodetool.video.Saturation
export type SaturationInputs = {
  video?: Connectable<VideoRef>;
  saturation?: Connectable<number>;
};

export interface SaturationOutputs {
  output: VideoRef;
}

export function saturation(inputs: SaturationInputs): DslNode<SaturationOutputs, "output"> {
  return createNode("nodetool.video.Saturation", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Add Subtitles — nodetool.video.AddSubtitles
export type AddSubtitlesInputs = {
  video?: Connectable<VideoRef>;
  chunks?: Connectable<unknown[]>;
  font?: Connectable<unknown>;
  align?: Connectable<"top" | "center" | "bottom">;
  font_size?: Connectable<number>;
  font_color?: Connectable<unknown>;
};

export interface AddSubtitlesOutputs {
  output: VideoRef;
}

export function addSubtitles(inputs: AddSubtitlesInputs): DslNode<AddSubtitlesOutputs, "output"> {
  return createNode("nodetool.video.AddSubtitles", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Reverse — nodetool.video.Reverse
export type ReverseInputs = {
  video?: Connectable<VideoRef>;
};

export interface ReverseOutputs {
  output: VideoRef;
}

export function reverse(inputs: ReverseInputs): DslNode<ReverseOutputs, "output"> {
  return createNode("nodetool.video.Reverse", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Transition — nodetool.video.Transition
export type TransitionInputs = {
  video_a?: Connectable<VideoRef>;
  video_b?: Connectable<VideoRef>;
  transition_type?: Connectable<"fade" | "wipeleft" | "wiperight" | "wipeup" | "wipedown" | "slideleft" | "slideright" | "slideup" | "slidedown" | "circlecrop" | "rectcrop" | "distance" | "fadeblack" | "fadewhite" | "radial" | "smoothleft" | "smoothright" | "smoothup" | "smoothdown" | "circleopen" | "circleclose" | "vertopen" | "vertclose" | "horzopen" | "horzclose" | "dissolve" | "pixelize" | "diagtl" | "diagtr" | "diagbl" | "diagbr" | "hlslice" | "hrslice" | "vuslice" | "vdslice" | "hblur" | "fadegrays" | "wipetl" | "wipetr" | "wipebl" | "wipebr" | "squeezeh" | "squeezev" | "zoomin" | "fadefast" | "fadeslow" | "hlwind" | "hrwind" | "vuwind" | "vdwind" | "coverleft" | "coverright" | "coverup" | "coverdown" | "revealleft" | "revealright" | "revealup" | "revealdown">;
  duration?: Connectable<number>;
};

export interface TransitionOutputs {
  output: VideoRef;
}

export function transition(inputs: TransitionInputs): DslNode<TransitionOutputs, "output"> {
  return createNode("nodetool.video.Transition", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Add Audio — nodetool.video.AddAudio
export type AddAudioInputs = {
  video?: Connectable<VideoRef>;
  audio?: Connectable<AudioRef>;
  volume?: Connectable<number>;
  mix?: Connectable<boolean>;
};

export interface AddAudioOutputs {
  output: VideoRef;
}

export function addAudio(inputs: AddAudioInputs): DslNode<AddAudioOutputs, "output"> {
  return createNode("nodetool.video.AddAudio", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Chroma Key — nodetool.video.ChromaKey
export type ChromaKeyInputs = {
  video?: Connectable<VideoRef>;
  key_color?: Connectable<unknown>;
  similarity?: Connectable<number>;
  blend?: Connectable<number>;
};

export interface ChromaKeyOutputs {
  output: VideoRef;
}

export function chromaKey(inputs: ChromaKeyInputs): DslNode<ChromaKeyOutputs, "output"> {
  return createNode("nodetool.video.ChromaKey", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Extract Audio — nodetool.video.ExtractAudio
export type ExtractAudioInputs = {
  video?: Connectable<VideoRef>;
};

export interface ExtractAudioOutputs {
  output: AudioRef;
}

export function extractAudio(inputs: ExtractAudioInputs): DslNode<ExtractAudioOutputs, "output"> {
  return createNode("nodetool.video.ExtractAudio", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Extract Video Frame — nodetool.video.ExtractFrame
export type ExtractFrameInputs = {
  video?: Connectable<VideoRef>;
  time?: Connectable<number>;
};

export interface ExtractFrameOutputs {
  output: ImageRef;
}

export function extractFrame(inputs: ExtractFrameInputs): DslNode<ExtractFrameOutputs, "output"> {
  return createNode("nodetool.video.ExtractFrame", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Get Video Info — nodetool.video.GetVideoInfo
export type GetVideoInfoInputs = {
  video?: Connectable<VideoRef>;
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

export function getVideoInfo(inputs: GetVideoInfoInputs): DslNode<GetVideoInfoOutputs> {
  return createNode("nodetool.video.GetVideoInfo", inputs, { outputNames: ["duration", "width", "height", "fps", "frame_count", "codec", "has_audio"] });
}

// Video To Video — nodetool.video.VideoToVideo
export type VideoToVideoInputs = {
  model?: Connectable<unknown>;
  video?: Connectable<VideoRef>;
  prompt?: Connectable<string>;
  negative_prompt?: Connectable<string>;
  strength?: Connectable<number>;
};

export interface VideoToVideoOutputs {
  output: VideoRef;
}

export function videoToVideo(inputs: VideoToVideoInputs): DslNode<VideoToVideoOutputs, "output"> {
  return createNode("nodetool.video.VideoToVideo", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Lip Sync — nodetool.video.LipSync
export type LipSyncInputs = {
  model?: Connectable<unknown>;
  video?: Connectable<VideoRef>;
  audio?: Connectable<AudioRef>;
};

export interface LipSyncOutputs {
  output: VideoRef;
}

export function lipSync(inputs: LipSyncInputs): DslNode<LipSyncOutputs, "output"> {
  return createNode("nodetool.video.LipSync", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
