// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { ImageRef, AudioRef, VideoRef, FolderRef, Entity } from "../types.js";

// Text To Video — nodetool.video.TextToVideo
export type TextToVideoInputs = {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  negative_prompt?: Connectable<string>;
  entities?: Connectable<Entity[]>;
  aspect_ratio?: Connectable<string>;
  resolution?: Connectable<string>;
  duration?: Connectable<number>;
  timeout_seconds?: Connectable<number>;
};

export interface TextToVideoOutputs {
  output: VideoRef;
}

export function textToVideo(inputs: TextToVideoInputs, options?: NodeOptions): NodeWithOutputs<TextToVideoOutputs, "output"> {
  return createNode("nodetool.video.TextToVideo", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
}

// Image To Video — nodetool.video.ImageToVideo
export type ImageToVideoInputs = {
  image?: Connectable<ImageRef[]>;
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  negative_prompt?: Connectable<string>;
  entities?: Connectable<Entity[]>;
  aspect_ratio?: Connectable<string>;
  resolution?: Connectable<string>;
  duration?: Connectable<number>;
  timeout_seconds?: Connectable<number>;
};

export interface ImageToVideoOutputs {
  output: VideoRef;
}

export function imageToVideo(inputs: ImageToVideoInputs, options?: NodeOptions): NodeWithOutputs<ImageToVideoOutputs, "output"> {
  return createNode("nodetool.video.ImageToVideo", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
}

// Reference To Video — nodetool.video.ReferenceToVideo
export type ReferenceToVideoInputs = {
  reference_images?: Connectable<ImageRef[]>;
  reference_videos?: Connectable<VideoRef[]>;
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  use_reference_video_audio?: Connectable<boolean>;
  negative_prompt?: Connectable<string>;
  entities?: Connectable<Entity[]>;
  aspect_ratio?: Connectable<string>;
  resolution?: Connectable<string>;
  duration?: Connectable<number>;
  timeout_seconds?: Connectable<number>;
};

export interface ReferenceToVideoOutputs {
  output: VideoRef;
}

export function referenceToVideo(inputs: ReferenceToVideoInputs, options?: NodeOptions): NodeWithOutputs<ReferenceToVideoOutputs, "output"> {
  return createNode("nodetool.video.ReferenceToVideo", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
}

// Load Video File — nodetool.video.LoadVideoFile
export type LoadVideoFileInputs = {
  path?: Connectable<string>;
};

export interface LoadVideoFileOutputs {
  output: VideoRef;
}

export function loadVideoFile(inputs: LoadVideoFileInputs, options?: NodeOptions): NodeWithOutputs<LoadVideoFileOutputs, "output"> {
  return createNode("nodetool.video.LoadVideoFile", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
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

export function saveVideoFile(inputs: SaveVideoFileInputs, options?: NodeOptions): NodeWithOutputs<SaveVideoFileOutputs, "output"> {
  return createNode("nodetool.video.SaveVideoFile", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
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

export function loadVideoAssets(inputs: LoadVideoAssetsInputs, options?: NodeOptions): NodeWithOutputs<LoadVideoAssetsOutputs> {
  return createNode("nodetool.video.LoadVideoAssets", inputs, { id: options?.id, outputNames: ["video", "name", "videos", "names"], outputTypes: {"video":"video","name":"str","videos":"list","names":"list"}, streaming: true, inputMode: "buffered", outputCorrelation: {"video":{"kind":"iteration","source":"__execution__","group":"items"},"name":{"kind":"iteration","source":"__execution__","group":"items"},"videos":{"kind":"single","source":"__execution__"},"names":{"kind":"single","source":"__execution__"}} });
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

export function saveVideo(inputs: SaveVideoInputs, options?: NodeOptions): NodeWithOutputs<SaveVideoOutputs, "output"> {
  return createNode("nodetool.video.SaveVideo", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
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

export function forEachFrame(inputs: ForEachFrameInputs, options?: NodeOptions): NodeWithOutputs<ForEachFrameOutputs> {
  return createNode("nodetool.video.ForEachFrame", inputs, { id: options?.id, outputNames: ["frame", "index", "fps"], outputTypes: {"frame":"image","index":"int","fps":"float"}, streaming: true, inputMode: "buffered", outputCorrelation: {"frame":{"kind":"iteration","source":"video","group":"items"},"index":{"kind":"iteration","source":"video","group":"items"},"fps":{"kind":"single","source":"video"}} });
}

// Fps — nodetool.video.Fps
export type FpsInputs = {
  video?: Connectable<VideoRef>;
};

export interface FpsOutputs {
  output: number;
}

export function fps(inputs: FpsInputs, options?: NodeOptions): NodeWithOutputs<FpsOutputs, "output"> {
  return createNode("nodetool.video.Fps", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"float"}, defaultOutput: "output" });
}

// Frame To Video — nodetool.video.FrameToVideo
export type FrameToVideoInputs = {
  frame?: Connectable<ImageRef>;
  fps?: Connectable<number>;
};

export interface FrameToVideoOutputs {
  output: VideoRef;
}

export function frameToVideo(inputs: FrameToVideoInputs, options?: NodeOptions): NodeWithOutputs<FrameToVideoOutputs, "output"> {
  return createNode("nodetool.video.FrameToVideo", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output", streamingInput: true, inputMode: "stream", outputCorrelation: {"output":{"kind":"aggregate","source":"frame","collapse":"innermost"}} });
}

// Concatenate Video — nodetool.video.Concat
export type ConcatInputs = {
  [name: string]: unknown;
};

export interface ConcatOutputs {
  output: VideoRef;
}

export function concat(inputs?: ConcatInputs, options?: NodeOptions): NodeWithOutputs<ConcatOutputs, "output"> {
  return createNode("nodetool.video.Concat", inputs ?? {}, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
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

export function trim(inputs: TrimInputs, options?: NodeOptions): NodeWithOutputs<TrimOutputs, "output"> {
  return createNode("nodetool.video.Trim", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
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

export function resize(inputs: ResizeInputs, options?: NodeOptions): NodeWithOutputs<ResizeOutputs, "output"> {
  return createNode("nodetool.video.Resize", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
}

// Rotate — nodetool.video.Rotate
export type RotateInputs = {
  video?: Connectable<VideoRef>;
  angle?: Connectable<number>;
};

export interface RotateOutputs {
  output: VideoRef;
}

export function rotate(inputs: RotateInputs, options?: NodeOptions): NodeWithOutputs<RotateOutputs, "output"> {
  return createNode("nodetool.video.Rotate", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
}

// Set Speed — nodetool.video.SetSpeed
export type SetSpeedInputs = {
  video?: Connectable<VideoRef>;
  speed_factor?: Connectable<number>;
};

export interface SetSpeedOutputs {
  output: VideoRef;
}

export function setSpeed(inputs: SetSpeedInputs, options?: NodeOptions): NodeWithOutputs<SetSpeedOutputs, "output"> {
  return createNode("nodetool.video.SetSpeed", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
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

export function overlay(inputs: OverlayInputs, options?: NodeOptions): NodeWithOutputs<OverlayOutputs, "output"> {
  return createNode("nodetool.video.Overlay", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
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

export function colorBalance(inputs: ColorBalanceInputs, options?: NodeOptions): NodeWithOutputs<ColorBalanceOutputs, "output"> {
  return createNode("nodetool.video.ColorBalance", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
}

// Denoise — nodetool.video.Denoise
export type DenoiseInputs = {
  video?: Connectable<VideoRef>;
  strength?: Connectable<number>;
};

export interface DenoiseOutputs {
  output: VideoRef;
}

export function denoise(inputs: DenoiseInputs, options?: NodeOptions): NodeWithOutputs<DenoiseOutputs, "output"> {
  return createNode("nodetool.video.Denoise", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
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

export function stabilize(inputs: StabilizeInputs, options?: NodeOptions): NodeWithOutputs<StabilizeOutputs, "output"> {
  return createNode("nodetool.video.Stabilize", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
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

export function sharpness(inputs: SharpnessInputs, options?: NodeOptions): NodeWithOutputs<SharpnessOutputs, "output"> {
  return createNode("nodetool.video.Sharpness", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
}

// Blur — nodetool.video.Blur
export type BlurInputs = {
  video?: Connectable<VideoRef>;
  strength?: Connectable<number>;
};

export interface BlurOutputs {
  output: VideoRef;
}

export function blur(inputs: BlurInputs, options?: NodeOptions): NodeWithOutputs<BlurOutputs, "output"> {
  return createNode("nodetool.video.Blur", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
}

// Saturation — nodetool.video.Saturation
export type SaturationInputs = {
  video?: Connectable<VideoRef>;
  saturation?: Connectable<number>;
};

export interface SaturationOutputs {
  output: VideoRef;
}

export function saturation(inputs: SaturationInputs, options?: NodeOptions): NodeWithOutputs<SaturationOutputs, "output"> {
  return createNode("nodetool.video.Saturation", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
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

export function addSubtitles(inputs: AddSubtitlesInputs, options?: NodeOptions): NodeWithOutputs<AddSubtitlesOutputs, "output"> {
  return createNode("nodetool.video.AddSubtitles", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
}

// Reverse — nodetool.video.Reverse
export type ReverseInputs = {
  video?: Connectable<VideoRef>;
};

export interface ReverseOutputs {
  output: VideoRef;
}

export function reverse(inputs: ReverseInputs, options?: NodeOptions): NodeWithOutputs<ReverseOutputs, "output"> {
  return createNode("nodetool.video.Reverse", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
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

export function transition(inputs: TransitionInputs, options?: NodeOptions): NodeWithOutputs<TransitionOutputs, "output"> {
  return createNode("nodetool.video.Transition", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
}

// Add Audio — nodetool.video.AddAudio
export type AddAudioInputs = {
  video?: Connectable<VideoRef>;
  audio?: Connectable<AudioRef>;
  volume?: Connectable<number>;
  mix?: Connectable<boolean>;
  output_length?: Connectable<"video" | "longest">;
};

export interface AddAudioOutputs {
  output: VideoRef;
}

export function addAudio(inputs: AddAudioInputs, options?: NodeOptions): NodeWithOutputs<AddAudioOutputs, "output"> {
  return createNode("nodetool.video.AddAudio", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
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

export function chromaKey(inputs: ChromaKeyInputs, options?: NodeOptions): NodeWithOutputs<ChromaKeyOutputs, "output"> {
  return createNode("nodetool.video.ChromaKey", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
}

// Extract Audio — nodetool.video.ExtractAudio
export type ExtractAudioInputs = {
  video?: Connectable<VideoRef>;
};

export interface ExtractAudioOutputs {
  output: AudioRef;
}

export function extractAudio(inputs: ExtractAudioInputs, options?: NodeOptions): NodeWithOutputs<ExtractAudioOutputs, "output"> {
  return createNode("nodetool.video.ExtractAudio", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// Extract Video Frame — nodetool.video.ExtractFrame
export type ExtractFrameInputs = {
  video?: Connectable<VideoRef>;
  time?: Connectable<number>;
};

export interface ExtractFrameOutputs {
  output: ImageRef;
}

export function extractFrame(inputs: ExtractFrameInputs, options?: NodeOptions): NodeWithOutputs<ExtractFrameOutputs, "output"> {
  return createNode("nodetool.video.ExtractFrame", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
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

export function getVideoInfo(inputs: GetVideoInfoInputs, options?: NodeOptions): NodeWithOutputs<GetVideoInfoOutputs> {
  return createNode("nodetool.video.GetVideoInfo", inputs, { id: options?.id, outputNames: ["duration", "width", "height", "fps", "frame_count", "codec", "has_audio"], outputTypes: {"duration":"float","width":"int","height":"int","fps":"float","frame_count":"int","codec":"str","has_audio":"bool"} });
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

export function videoToVideo(inputs: VideoToVideoInputs, options?: NodeOptions): NodeWithOutputs<VideoToVideoOutputs, "output"> {
  return createNode("nodetool.video.VideoToVideo", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
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

export function lipSync(inputs: LipSyncInputs, options?: NodeOptions): NodeWithOutputs<LipSyncOutputs, "output"> {
  return createNode("nodetool.video.LipSync", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
}
