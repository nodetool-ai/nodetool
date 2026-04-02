// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
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

export interface TextToVideoOutputs {
  output: VideoRef;
}

export function textToVideo(
  inputs: TextToVideoInputs
): DslNode<TextToVideoOutputs, "output"> {
  return createNode(
    "nodetool.video.TextToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export interface ImageToVideoOutputs {
  output: VideoRef;
}

export function imageToVideo(
  inputs: ImageToVideoInputs
): DslNode<ImageToVideoOutputs, "output"> {
  return createNode(
    "nodetool.video.ImageToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Load Video File — nodetool.video.LoadVideoFile
export interface LoadVideoFileInputs {
  path?: Connectable<string>;
}

export interface LoadVideoFileOutputs {
  output: VideoRef;
}

export function loadVideoFile(
  inputs: LoadVideoFileInputs
): DslNode<LoadVideoFileOutputs, "output"> {
  return createNode(
    "nodetool.video.LoadVideoFile",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Save Video File — nodetool.video.SaveVideoFile
export interface SaveVideoFileInputs {
  video?: Connectable<VideoRef>;
  folder?: Connectable<string>;
  filename?: Connectable<string>;
}

export interface SaveVideoFileOutputs {
  output: VideoRef;
}

export function saveVideoFile(
  inputs: SaveVideoFileInputs
): DslNode<SaveVideoFileOutputs, "output"> {
  return createNode(
    "nodetool.video.SaveVideoFile",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Load Video Folder — nodetool.video.LoadVideoAssets
export interface LoadVideoAssetsInputs {
  folder?: Connectable<FolderRef>;
}

export interface LoadVideoAssetsOutputs {
  video: VideoRef;
  name: string;
}

export function loadVideoAssets(
  inputs: LoadVideoAssetsInputs
): DslNode<LoadVideoAssetsOutputs> {
  return createNode(
    "nodetool.video.LoadVideoAssets",
    inputs as Record<string, unknown>,
    { outputNames: ["video", "name"], streaming: true }
  );
}

// Save Video Asset — nodetool.video.SaveVideo
export interface SaveVideoInputs {
  video?: Connectable<VideoRef>;
  folder?: Connectable<FolderRef>;
  name?: Connectable<string>;
}

export interface SaveVideoOutputs {
  output: VideoRef;
}

export function saveVideo(
  inputs: SaveVideoInputs
): DslNode<SaveVideoOutputs, "output"> {
  return createNode(
    "nodetool.video.SaveVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Frame Iterator — nodetool.video.FrameIterator
export interface FrameIteratorInputs {
  video?: Connectable<VideoRef>;
  start?: Connectable<number>;
  end?: Connectable<number>;
}

export interface FrameIteratorOutputs {
  frame: ImageRef;
  index: number;
  fps: number;
}

export function frameIterator(
  inputs: FrameIteratorInputs
): DslNode<FrameIteratorOutputs> {
  return createNode(
    "nodetool.video.FrameIterator",
    inputs as Record<string, unknown>,
    { outputNames: ["frame", "index", "fps"], streaming: true }
  );
}

// Fps — nodetool.video.Fps
export interface FpsInputs {
  video?: Connectable<VideoRef>;
}

export interface FpsOutputs {
  output: number;
}

export function fps(inputs: FpsInputs): DslNode<FpsOutputs, "output"> {
  return createNode("nodetool.video.Fps", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Frame To Video — nodetool.video.FrameToVideo
export interface FrameToVideoInputs {
  frame?: Connectable<ImageRef>;
  fps?: Connectable<number>;
}

export interface FrameToVideoOutputs {
  output: VideoRef;
}

export function frameToVideo(
  inputs: FrameToVideoInputs
): DslNode<FrameToVideoOutputs, "output"> {
  return createNode(
    "nodetool.video.FrameToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Concat — nodetool.video.Concat
export interface ConcatInputs {
  video_a?: Connectable<VideoRef>;
  video_b?: Connectable<VideoRef>;
}

export interface ConcatOutputs {
  output: VideoRef;
}

export function concat(inputs: ConcatInputs): DslNode<ConcatOutputs, "output"> {
  return createNode(
    "nodetool.video.Concat",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Trim — nodetool.video.Trim
export interface TrimInputs {
  video?: Connectable<VideoRef>;
  start_time?: Connectable<number>;
  end_time?: Connectable<number>;
}

export interface TrimOutputs {
  output: VideoRef;
}

export function trim(inputs: TrimInputs): DslNode<TrimOutputs, "output"> {
  return createNode("nodetool.video.Trim", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Resize — nodetool.video.Resize
export interface ResizeInputs {
  video?: Connectable<VideoRef>;
  width?: Connectable<number>;
  height?: Connectable<number>;
}

export interface ResizeOutputs {
  output: VideoRef;
}

export function resize(inputs: ResizeInputs): DslNode<ResizeOutputs, "output"> {
  return createNode(
    "nodetool.video.Resize",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Rotate — nodetool.video.Rotate
export interface RotateInputs {
  video?: Connectable<VideoRef>;
  angle?: Connectable<number>;
}

export interface RotateOutputs {
  output: VideoRef;
}

export function rotate(inputs: RotateInputs): DslNode<RotateOutputs, "output"> {
  return createNode(
    "nodetool.video.Rotate",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Set Speed — nodetool.video.SetSpeed
export interface SetSpeedInputs {
  video?: Connectable<VideoRef>;
  speed_factor?: Connectable<number>;
}

export interface SetSpeedOutputs {
  output: VideoRef;
}

export function setSpeed(
  inputs: SetSpeedInputs
): DslNode<SetSpeedOutputs, "output"> {
  return createNode(
    "nodetool.video.SetSpeed",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export interface OverlayOutputs {
  output: VideoRef;
}

export function overlay(
  inputs: OverlayInputs
): DslNode<OverlayOutputs, "output"> {
  return createNode(
    "nodetool.video.Overlay",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Color Balance — nodetool.video.ColorBalance
export interface ColorBalanceInputs {
  video?: Connectable<VideoRef>;
  red_adjust?: Connectable<number>;
  green_adjust?: Connectable<number>;
  blue_adjust?: Connectable<number>;
}

export interface ColorBalanceOutputs {
  output: VideoRef;
}

export function colorBalance(
  inputs: ColorBalanceInputs
): DslNode<ColorBalanceOutputs, "output"> {
  return createNode(
    "nodetool.video.ColorBalance",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Denoise — nodetool.video.Denoise
export interface DenoiseInputs {
  video?: Connectable<VideoRef>;
  strength?: Connectable<number>;
}

export interface DenoiseOutputs {
  output: VideoRef;
}

export function denoise(
  inputs: DenoiseInputs
): DslNode<DenoiseOutputs, "output"> {
  return createNode(
    "nodetool.video.Denoise",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Stabilize — nodetool.video.Stabilize
export interface StabilizeInputs {
  video?: Connectable<VideoRef>;
  smoothing?: Connectable<number>;
  crop_black?: Connectable<boolean>;
}

export interface StabilizeOutputs {
  output: VideoRef;
}

export function stabilize(
  inputs: StabilizeInputs
): DslNode<StabilizeOutputs, "output"> {
  return createNode(
    "nodetool.video.Stabilize",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Sharpness — nodetool.video.Sharpness
export interface SharpnessInputs {
  video?: Connectable<VideoRef>;
  luma_amount?: Connectable<number>;
  chroma_amount?: Connectable<number>;
}

export interface SharpnessOutputs {
  output: VideoRef;
}

export function sharpness(
  inputs: SharpnessInputs
): DslNode<SharpnessOutputs, "output"> {
  return createNode(
    "nodetool.video.Sharpness",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Blur — nodetool.video.Blur
export interface BlurInputs {
  video?: Connectable<VideoRef>;
  strength?: Connectable<number>;
}

export interface BlurOutputs {
  output: VideoRef;
}

export function blur(inputs: BlurInputs): DslNode<BlurOutputs, "output"> {
  return createNode("nodetool.video.Blur", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Saturation — nodetool.video.Saturation
export interface SaturationInputs {
  video?: Connectable<VideoRef>;
  saturation?: Connectable<number>;
}

export interface SaturationOutputs {
  output: VideoRef;
}

export function saturation(
  inputs: SaturationInputs
): DslNode<SaturationOutputs, "output"> {
  return createNode(
    "nodetool.video.Saturation",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export interface AddSubtitlesOutputs {
  output: VideoRef;
}

export function addSubtitles(
  inputs: AddSubtitlesInputs
): DslNode<AddSubtitlesOutputs, "output"> {
  return createNode(
    "nodetool.video.AddSubtitles",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Reverse — nodetool.video.Reverse
export interface ReverseInputs {
  video?: Connectable<VideoRef>;
}

export interface ReverseOutputs {
  output: VideoRef;
}

export function reverse(
  inputs: ReverseInputs
): DslNode<ReverseOutputs, "output"> {
  return createNode(
    "nodetool.video.Reverse",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Transition — nodetool.video.Transition
export interface TransitionInputs {
  video_a?: Connectable<VideoRef>;
  video_b?: Connectable<VideoRef>;
  transition_type?: Connectable<unknown>;
  duration?: Connectable<number>;
}

export interface TransitionOutputs {
  output: VideoRef;
}

export function transition(
  inputs: TransitionInputs
): DslNode<TransitionOutputs, "output"> {
  return createNode(
    "nodetool.video.Transition",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Add Audio — nodetool.video.AddAudio
export interface AddAudioInputs {
  video?: Connectable<VideoRef>;
  audio?: Connectable<AudioRef>;
  volume?: Connectable<number>;
  mix?: Connectable<boolean>;
}

export interface AddAudioOutputs {
  output: VideoRef;
}

export function addAudio(
  inputs: AddAudioInputs
): DslNode<AddAudioOutputs, "output"> {
  return createNode(
    "nodetool.video.AddAudio",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Chroma Key — nodetool.video.ChromaKey
export interface ChromaKeyInputs {
  video?: Connectable<VideoRef>;
  key_color?: Connectable<unknown>;
  similarity?: Connectable<number>;
  blend?: Connectable<number>;
}

export interface ChromaKeyOutputs {
  output: VideoRef;
}

export function chromaKey(
  inputs: ChromaKeyInputs
): DslNode<ChromaKeyOutputs, "output"> {
  return createNode(
    "nodetool.video.ChromaKey",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Extract Audio — nodetool.video.ExtractAudio
export interface ExtractAudioInputs {
  video?: Connectable<VideoRef>;
}

export interface ExtractAudioOutputs {
  output: AudioRef;
}

export function extractAudio(
  inputs: ExtractAudioInputs
): DslNode<ExtractAudioOutputs, "output"> {
  return createNode(
    "nodetool.video.ExtractAudio",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Extract Frame — nodetool.video.ExtractFrame
export interface ExtractFrameInputs {
  video?: Connectable<VideoRef>;
  time?: Connectable<number>;
}

export interface ExtractFrameOutputs {
  output: ImageRef;
}

export function extractFrame(
  inputs: ExtractFrameInputs
): DslNode<ExtractFrameOutputs, "output"> {
  return createNode(
    "nodetool.video.ExtractFrame",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Get Video Info — nodetool.video.GetVideoInfo
export interface GetVideoInfoInputs {
  video?: Connectable<VideoRef>;
}

export interface GetVideoInfoOutputs {
  duration: number;
  width: number;
  height: number;
  fps: number;
  frame_count: number;
  codec: string;
  has_audio: boolean;
}

export function getVideoInfo(
  inputs: GetVideoInfoInputs
): DslNode<GetVideoInfoOutputs> {
  return createNode(
    "nodetool.video.GetVideoInfo",
    inputs as Record<string, unknown>,
    {
      outputNames: [
        "duration",
        "width",
        "height",
        "fps",
        "frame_count",
        "codec",
        "has_audio"
      ]
    }
  );
}
