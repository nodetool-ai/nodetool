// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, AudioRef, VideoRef, DataframeRef } from "../types.js";

// Kling 2.6 Text To Video — kie.video.KlingTextToVideo
export interface KlingTextToVideoInputs {
  prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
  duration?: Connectable<number>;
  resolution?: Connectable<unknown>;
  seed?: Connectable<number>;
}

export interface KlingTextToVideoOutputs {
  output: VideoRef;
}

export function klingTextToVideo(
  inputs: KlingTextToVideoInputs
): DslNode<KlingTextToVideoOutputs, "output"> {
  return createNode(
    "kie.video.KlingTextToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Kling 2.6 Image To Video — kie.video.KlingImageToVideo
export interface KlingImageToVideoInputs {
  prompt?: Connectable<string>;
  image1?: Connectable<ImageRef>;
  image2?: Connectable<ImageRef>;
  image3?: Connectable<ImageRef>;
  sound?: Connectable<boolean>;
  duration?: Connectable<number>;
}

export interface KlingImageToVideoOutputs {
  output: VideoRef;
}

export function klingImageToVideo(
  inputs: KlingImageToVideoInputs
): DslNode<KlingImageToVideoOutputs, "output"> {
  return createNode(
    "kie.video.KlingImageToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Kling AIAvatar Standard — kie.video.KlingAIAvatarStandard
export interface KlingAIAvatarStandardInputs {
  image?: Connectable<ImageRef>;
  audio?: Connectable<AudioRef>;
  prompt?: Connectable<string>;
  mode?: Connectable<unknown>;
}

export interface KlingAIAvatarStandardOutputs {
  output: VideoRef;
}

export function klingAIAvatarStandard(
  inputs: KlingAIAvatarStandardInputs
): DslNode<KlingAIAvatarStandardOutputs, "output"> {
  return createNode(
    "kie.video.KlingAIAvatarStandard",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Kling AIAvatar Pro — kie.video.KlingAIAvatarPro
export interface KlingAIAvatarProInputs {
  image?: Connectable<ImageRef>;
  audio?: Connectable<AudioRef>;
  prompt?: Connectable<string>;
  mode?: Connectable<unknown>;
}

export interface KlingAIAvatarProOutputs {
  output: VideoRef;
}

export function klingAIAvatarPro(
  inputs: KlingAIAvatarProInputs
): DslNode<KlingAIAvatarProOutputs, "output"> {
  return createNode(
    "kie.video.KlingAIAvatarPro",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Grok Imagine Text To Video — kie.video.GrokImagineTextToVideo
export interface GrokImagineTextToVideoInputs {
  prompt?: Connectable<string>;
  resolution?: Connectable<unknown>;
  duration?: Connectable<unknown>;
}

export interface GrokImagineTextToVideoOutputs {
  output: VideoRef;
}

export function grokImagineTextToVideo(
  inputs: GrokImagineTextToVideoInputs
): DslNode<GrokImagineTextToVideoOutputs, "output"> {
  return createNode(
    "kie.video.GrokImagineTextToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Grok Imagine Image To Video — kie.video.GrokImagineImageToVideo
export interface GrokImagineImageToVideoInputs {
  prompt?: Connectable<string>;
  image?: Connectable<ImageRef>;
  duration?: Connectable<unknown>;
}

export interface GrokImagineImageToVideoOutputs {
  output: VideoRef;
}

export function grokImagineImageToVideo(
  inputs: GrokImagineImageToVideoInputs
): DslNode<GrokImagineImageToVideoOutputs, "output"> {
  return createNode(
    "kie.video.GrokImagineImageToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Seedance V1 Lite Text To Video — kie.video.SeedanceV1LiteTextToVideo
export interface SeedanceV1LiteTextToVideoInputs {
  aspect_ratio?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
  duration?: Connectable<unknown>;
  remove_watermark?: Connectable<boolean>;
  prompt?: Connectable<string>;
}

export interface SeedanceV1LiteTextToVideoOutputs {
  output: VideoRef;
}

export function seedanceV1LiteTextToVideo(
  inputs: SeedanceV1LiteTextToVideoInputs
): DslNode<SeedanceV1LiteTextToVideoOutputs, "output"> {
  return createNode(
    "kie.video.SeedanceV1LiteTextToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Seedance V1 Pro Text To Video — kie.video.SeedanceV1ProTextToVideo
export interface SeedanceV1ProTextToVideoInputs {
  aspect_ratio?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
  duration?: Connectable<unknown>;
  remove_watermark?: Connectable<boolean>;
  prompt?: Connectable<string>;
}

export interface SeedanceV1ProTextToVideoOutputs {
  output: VideoRef;
}

export function seedanceV1ProTextToVideo(
  inputs: SeedanceV1ProTextToVideoInputs
): DslNode<SeedanceV1ProTextToVideoOutputs, "output"> {
  return createNode(
    "kie.video.SeedanceV1ProTextToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Seedance V1 Lite Image To Video — kie.video.SeedanceV1LiteImageToVideo
export interface SeedanceV1LiteImageToVideoInputs {
  aspect_ratio?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
  duration?: Connectable<unknown>;
  remove_watermark?: Connectable<boolean>;
  prompt?: Connectable<string>;
  image1?: Connectable<ImageRef>;
  image2?: Connectable<ImageRef>;
  image3?: Connectable<ImageRef>;
}

export interface SeedanceV1LiteImageToVideoOutputs {
  output: VideoRef;
}

export function seedanceV1LiteImageToVideo(
  inputs: SeedanceV1LiteImageToVideoInputs
): DslNode<SeedanceV1LiteImageToVideoOutputs, "output"> {
  return createNode(
    "kie.video.SeedanceV1LiteImageToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Seedance V1 Pro Image To Video — kie.video.SeedanceV1ProImageToVideo
export interface SeedanceV1ProImageToVideoInputs {
  aspect_ratio?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
  duration?: Connectable<unknown>;
  remove_watermark?: Connectable<boolean>;
  prompt?: Connectable<string>;
  image1?: Connectable<ImageRef>;
  image2?: Connectable<ImageRef>;
  image3?: Connectable<ImageRef>;
}

export interface SeedanceV1ProImageToVideoOutputs {
  output: VideoRef;
}

export function seedanceV1ProImageToVideo(
  inputs: SeedanceV1ProImageToVideoInputs
): DslNode<SeedanceV1ProImageToVideoOutputs, "output"> {
  return createNode(
    "kie.video.SeedanceV1ProImageToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Seedance V1 Pro Fast Image To Video — kie.video.SeedanceV1ProFastImageToVideo
export interface SeedanceV1ProFastImageToVideoInputs {
  aspect_ratio?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
  duration?: Connectable<unknown>;
  remove_watermark?: Connectable<boolean>;
  image1?: Connectable<ImageRef>;
  image2?: Connectable<ImageRef>;
  image3?: Connectable<ImageRef>;
}

export interface SeedanceV1ProFastImageToVideoOutputs {
  output: VideoRef;
}

export function seedanceV1ProFastImageToVideo(
  inputs: SeedanceV1ProFastImageToVideoInputs
): DslNode<SeedanceV1ProFastImageToVideoOutputs, "output"> {
  return createNode(
    "kie.video.SeedanceV1ProFastImageToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Hailuo 2.3 Pro Text To Video — kie.video.HailuoTextToVideoPro
export interface HailuoTextToVideoProInputs {
  prompt?: Connectable<string>;
  duration?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export interface HailuoTextToVideoProOutputs {
  output: VideoRef;
}

export function hailuoTextToVideoPro(
  inputs: HailuoTextToVideoProInputs
): DslNode<HailuoTextToVideoProOutputs, "output"> {
  return createNode(
    "kie.video.HailuoTextToVideoPro",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Hailuo 2.3 Standard Text To Video — kie.video.HailuoTextToVideoStandard
export interface HailuoTextToVideoStandardInputs {
  prompt?: Connectable<string>;
  duration?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export interface HailuoTextToVideoStandardOutputs {
  output: VideoRef;
}

export function hailuoTextToVideoStandard(
  inputs: HailuoTextToVideoStandardInputs
): DslNode<HailuoTextToVideoStandardOutputs, "output"> {
  return createNode(
    "kie.video.HailuoTextToVideoStandard",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Hailuo 2.3 Pro Image To Video — kie.video.HailuoImageToVideoPro
export interface HailuoImageToVideoProInputs {
  image?: Connectable<ImageRef>;
  prompt?: Connectable<string>;
  duration?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export interface HailuoImageToVideoProOutputs {
  output: VideoRef;
}

export function hailuoImageToVideoPro(
  inputs: HailuoImageToVideoProInputs
): DslNode<HailuoImageToVideoProOutputs, "output"> {
  return createNode(
    "kie.video.HailuoImageToVideoPro",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Hailuo 2.3 Standard Image To Video — kie.video.HailuoImageToVideoStandard
export interface HailuoImageToVideoStandardInputs {
  image?: Connectable<ImageRef>;
  prompt?: Connectable<string>;
  duration?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export interface HailuoImageToVideoStandardOutputs {
  output: VideoRef;
}

export function hailuoImageToVideoStandard(
  inputs: HailuoImageToVideoStandardInputs
): DslNode<HailuoImageToVideoStandardOutputs, "output"> {
  return createNode(
    "kie.video.HailuoImageToVideoStandard",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Kling 2.5 Turbo Text To Video — kie.video.Kling25TurboTextToVideo
export interface Kling25TurboTextToVideoInputs {
  prompt?: Connectable<string>;
  duration?: Connectable<unknown>;
  aspect_ratio?: Connectable<unknown>;
  negative_prompt?: Connectable<string>;
  cfg_scale?: Connectable<number>;
}

export interface Kling25TurboTextToVideoOutputs {
  output: VideoRef;
}

export function kling25TurboTextToVideo(
  inputs: Kling25TurboTextToVideoInputs
): DslNode<Kling25TurboTextToVideoOutputs, "output"> {
  return createNode(
    "kie.video.Kling25TurboTextToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Kling 2.5 Turbo Image To Video — kie.video.Kling25TurboImageToVideo
export interface Kling25TurboImageToVideoInputs {
  prompt?: Connectable<string>;
  image?: Connectable<ImageRef>;
  tail_image?: Connectable<ImageRef>;
  duration?: Connectable<unknown>;
  negative_prompt?: Connectable<string>;
  cfg_scale?: Connectable<number>;
}

export interface Kling25TurboImageToVideoOutputs {
  output: VideoRef;
}

export function kling25TurboImageToVideo(
  inputs: Kling25TurboImageToVideoInputs
): DslNode<Kling25TurboImageToVideoOutputs, "output"> {
  return createNode(
    "kie.video.Kling25TurboImageToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Sora 2 Pro Text To Video — kie.video.Sora2ProTextToVideo
export interface Sora2ProTextToVideoInputs {
  aspect_ratio?: Connectable<unknown>;
  remove_watermark?: Connectable<boolean>;
  n_frames?: Connectable<unknown>;
  prompt?: Connectable<string>;
}

export interface Sora2ProTextToVideoOutputs {
  output: VideoRef;
}

export function sora2ProTextToVideo(
  inputs: Sora2ProTextToVideoInputs
): DslNode<Sora2ProTextToVideoOutputs, "output"> {
  return createNode(
    "kie.video.Sora2ProTextToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Sora 2 Pro Image To Video — kie.video.Sora2ProImageToVideo
export interface Sora2ProImageToVideoInputs {
  aspect_ratio?: Connectable<unknown>;
  remove_watermark?: Connectable<boolean>;
  n_frames?: Connectable<unknown>;
  prompt?: Connectable<string>;
  image?: Connectable<ImageRef>;
}

export interface Sora2ProImageToVideoOutputs {
  output: VideoRef;
}

export function sora2ProImageToVideo(
  inputs: Sora2ProImageToVideoInputs
): DslNode<Sora2ProImageToVideoOutputs, "output"> {
  return createNode(
    "kie.video.Sora2ProImageToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Sora 2 Pro Storyboard — kie.video.Sora2ProStoryboard
export interface Sora2ProStoryboardInputs {
  aspect_ratio?: Connectable<unknown>;
  remove_watermark?: Connectable<boolean>;
  n_frames?: Connectable<unknown>;
  shots?: Connectable<DataframeRef>;
  images?: Connectable<ImageRef[]>;
}

export interface Sora2ProStoryboardOutputs {
  output: VideoRef;
}

export function sora2ProStoryboard(
  inputs: Sora2ProStoryboardInputs
): DslNode<Sora2ProStoryboardOutputs, "output"> {
  return createNode(
    "kie.video.Sora2ProStoryboard",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Sora 2 Text To Video — kie.video.Sora2TextToVideo
export interface Sora2TextToVideoInputs {
  aspect_ratio?: Connectable<unknown>;
  remove_watermark?: Connectable<boolean>;
  n_frames?: Connectable<unknown>;
  prompt?: Connectable<string>;
}

export interface Sora2TextToVideoOutputs {
  output: VideoRef;
}

export function sora2TextToVideo(
  inputs: Sora2TextToVideoInputs
): DslNode<Sora2TextToVideoOutputs, "output"> {
  return createNode(
    "kie.video.Sora2TextToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Wan 2.1 Multi-Shot Text To Video — kie.video.WanMultiShotTextToVideoPro
export interface WanMultiShotTextToVideoProInputs {
  prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
  duration?: Connectable<unknown>;
  remove_watermark?: Connectable<boolean>;
}

export interface WanMultiShotTextToVideoProOutputs {
  output: VideoRef;
}

export function wanMultiShotTextToVideoPro(
  inputs: WanMultiShotTextToVideoProInputs
): DslNode<WanMultiShotTextToVideoProOutputs, "output"> {
  return createNode(
    "kie.video.WanMultiShotTextToVideoPro",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Wan 2.6 Text To Video — kie.video.Wan26TextToVideo
export interface Wan26TextToVideoInputs {
  prompt?: Connectable<string>;
  duration?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export interface Wan26TextToVideoOutputs {
  output: VideoRef;
}

export function wan26TextToVideo(
  inputs: Wan26TextToVideoInputs
): DslNode<Wan26TextToVideoOutputs, "output"> {
  return createNode(
    "kie.video.Wan26TextToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Wan 2.6 Image To Video — kie.video.Wan26ImageToVideo
export interface Wan26ImageToVideoInputs {
  prompt?: Connectable<string>;
  image1?: Connectable<ImageRef>;
  image2?: Connectable<ImageRef>;
  image3?: Connectable<ImageRef>;
  duration?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export interface Wan26ImageToVideoOutputs {
  output: VideoRef;
}

export function wan26ImageToVideo(
  inputs: Wan26ImageToVideoInputs
): DslNode<Wan26ImageToVideoOutputs, "output"> {
  return createNode(
    "kie.video.Wan26ImageToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Wan 2.6 Video To Video — kie.video.Wan26VideoToVideo
export interface Wan26VideoToVideoInputs {
  prompt?: Connectable<string>;
  video1?: Connectable<VideoRef>;
  video2?: Connectable<VideoRef>;
  video3?: Connectable<VideoRef>;
  duration?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export interface Wan26VideoToVideoOutputs {
  output: VideoRef;
}

export function wan26VideoToVideo(
  inputs: Wan26VideoToVideoInputs
): DslNode<Wan26VideoToVideoOutputs, "output"> {
  return createNode(
    "kie.video.Wan26VideoToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Topaz Video Upscale — kie.video.TopazVideoUpscale
export interface TopazVideoUpscaleInputs {
  video?: Connectable<VideoRef>;
  resolution?: Connectable<unknown>;
  denoise?: Connectable<boolean>;
}

export interface TopazVideoUpscaleOutputs {
  output: VideoRef;
}

export function topazVideoUpscale(
  inputs: TopazVideoUpscaleInputs
): DslNode<TopazVideoUpscaleOutputs, "output"> {
  return createNode(
    "kie.video.TopazVideoUpscale",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Infinitalk V1 — kie.video.InfinitalkV1
export interface InfinitalkV1Inputs {
  prompt?: Connectable<string>;
  image?: Connectable<ImageRef>;
  audio?: Connectable<AudioRef>;
  resolution?: Connectable<unknown>;
}

export interface InfinitalkV1Outputs {
  output: VideoRef;
}

export function infinitalkV1(
  inputs: InfinitalkV1Inputs
): DslNode<InfinitalkV1Outputs, "output"> {
  return createNode(
    "kie.video.InfinitalkV1",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Veo 31 Text To Video — kie.video.Veo31TextToVideo
export interface Veo31TextToVideoInputs {
  model?: Connectable<unknown>;
  aspect_ratio?: Connectable<unknown>;
  call_back_url?: Connectable<string>;
  prompt?: Connectable<string>;
}

export interface Veo31TextToVideoOutputs {
  output: VideoRef;
}

export function veo31TextToVideo(
  inputs: Veo31TextToVideoInputs
): DslNode<Veo31TextToVideoOutputs, "output"> {
  return createNode(
    "kie.video.Veo31TextToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Runway Gen-3 Alpha Text To Video — kie.video.RunwayGen3AlphaTextToVideo
export interface RunwayGen3AlphaTextToVideoInputs {
  prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
  duration?: Connectable<unknown>;
  quality?: Connectable<unknown>;
  water_mark?: Connectable<string>;
  call_back_url?: Connectable<string>;
}

export interface RunwayGen3AlphaTextToVideoOutputs {
  output: VideoRef;
}

export function runwayGen3AlphaTextToVideo(
  inputs: RunwayGen3AlphaTextToVideoInputs
): DslNode<RunwayGen3AlphaTextToVideoOutputs, "output"> {
  return createNode(
    "kie.video.RunwayGen3AlphaTextToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Runway Gen-3 Alpha Image To Video — kie.video.RunwayGen3AlphaImageToVideo
export interface RunwayGen3AlphaImageToVideoInputs {
  image?: Connectable<ImageRef>;
  prompt?: Connectable<string>;
  duration?: Connectable<unknown>;
  quality?: Connectable<unknown>;
  water_mark?: Connectable<string>;
  call_back_url?: Connectable<string>;
}

export interface RunwayGen3AlphaImageToVideoOutputs {
  output: VideoRef;
}

export function runwayGen3AlphaImageToVideo(
  inputs: RunwayGen3AlphaImageToVideoInputs
): DslNode<RunwayGen3AlphaImageToVideoOutputs, "output"> {
  return createNode(
    "kie.video.RunwayGen3AlphaImageToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Runway Gen-3 Alpha Extend Video — kie.video.RunwayGen3AlphaExtendVideo
export interface RunwayGen3AlphaExtendVideoInputs {
  video_url?: Connectable<string>;
  prompt?: Connectable<string>;
  duration?: Connectable<unknown>;
  quality?: Connectable<unknown>;
  water_mark?: Connectable<string>;
  call_back_url?: Connectable<string>;
}

export interface RunwayGen3AlphaExtendVideoOutputs {
  output: VideoRef;
}

export function runwayGen3AlphaExtendVideo(
  inputs: RunwayGen3AlphaExtendVideoInputs
): DslNode<RunwayGen3AlphaExtendVideoOutputs, "output"> {
  return createNode(
    "kie.video.RunwayGen3AlphaExtendVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Runway Aleph Video — kie.video.RunwayAlephVideo
export interface RunwayAlephVideoInputs {
  prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
  duration?: Connectable<unknown>;
  quality?: Connectable<unknown>;
  water_mark?: Connectable<string>;
  call_back_url?: Connectable<string>;
}

export interface RunwayAlephVideoOutputs {
  output: VideoRef;
}

export function runwayAlephVideo(
  inputs: RunwayAlephVideoInputs
): DslNode<RunwayAlephVideoOutputs, "output"> {
  return createNode(
    "kie.video.RunwayAlephVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Luma Modify Video — kie.video.LumaModifyVideo
export interface LumaModifyVideoInputs {
  video?: Connectable<VideoRef>;
  prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
  duration?: Connectable<unknown>;
}

export interface LumaModifyVideoOutputs {
  output: VideoRef;
}

export function lumaModifyVideo(
  inputs: LumaModifyVideoInputs
): DslNode<LumaModifyVideoOutputs, "output"> {
  return createNode(
    "kie.video.LumaModifyVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Veo 3.1 Image To Video — kie.video.Veo31ImageToVideo
export interface Veo31ImageToVideoInputs {
  model?: Connectable<unknown>;
  aspect_ratio?: Connectable<unknown>;
  call_back_url?: Connectable<string>;
  prompt?: Connectable<string>;
  image1?: Connectable<ImageRef>;
  image2?: Connectable<ImageRef>;
}

export interface Veo31ImageToVideoOutputs {
  output: VideoRef;
}

export function veo31ImageToVideo(
  inputs: Veo31ImageToVideoInputs
): DslNode<Veo31ImageToVideoOutputs, "output"> {
  return createNode(
    "kie.video.Veo31ImageToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Veo 3.1 Reference To Video — kie.video.Veo31ReferenceToVideo
export interface Veo31ReferenceToVideoInputs {
  model?: Connectable<unknown>;
  aspect_ratio?: Connectable<unknown>;
  call_back_url?: Connectable<string>;
  prompt?: Connectable<string>;
  image1?: Connectable<ImageRef>;
  image2?: Connectable<ImageRef>;
  image3?: Connectable<ImageRef>;
}

export interface Veo31ReferenceToVideoOutputs {
  output: VideoRef;
}

export function veo31ReferenceToVideo(
  inputs: Veo31ReferenceToVideoInputs
): DslNode<Veo31ReferenceToVideoOutputs, "output"> {
  return createNode(
    "kie.video.Veo31ReferenceToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Kling 2.6 Motion Control — kie.video.KlingMotionControl
export interface KlingMotionControlInputs {
  prompt?: Connectable<string>;
  image?: Connectable<ImageRef>;
  video?: Connectable<VideoRef>;
  character_orientation?: Connectable<unknown>;
  mode?: Connectable<unknown>;
}

export interface KlingMotionControlOutputs {
  output: VideoRef;
}

export function klingMotionControl(
  inputs: KlingMotionControlInputs
): DslNode<KlingMotionControlOutputs, "output"> {
  return createNode(
    "kie.video.KlingMotionControl",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Kling 2.1 Text To Video — kie.video.Kling21TextToVideo
export interface Kling21TextToVideoInputs {
  prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
  duration?: Connectable<number>;
  resolution?: Connectable<unknown>;
  mode?: Connectable<unknown>;
  seed?: Connectable<number>;
}

export interface Kling21TextToVideoOutputs {
  output: VideoRef;
}

export function kling21TextToVideo(
  inputs: Kling21TextToVideoInputs
): DslNode<Kling21TextToVideoOutputs, "output"> {
  return createNode(
    "kie.video.Kling21TextToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Kling 2.1 Image To Video — kie.video.Kling21ImageToVideo
export interface Kling21ImageToVideoInputs {
  prompt?: Connectable<string>;
  image1?: Connectable<ImageRef>;
  image2?: Connectable<ImageRef>;
  image3?: Connectable<ImageRef>;
  sound?: Connectable<boolean>;
  duration?: Connectable<number>;
  mode?: Connectable<unknown>;
}

export interface Kling21ImageToVideoOutputs {
  output: VideoRef;
}

export function kling21ImageToVideo(
  inputs: Kling21ImageToVideoInputs
): DslNode<Kling21ImageToVideoOutputs, "output"> {
  return createNode(
    "kie.video.Kling21ImageToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Wan 2.5 Text To Video — kie.video.Wan25TextToVideo
export interface Wan25TextToVideoInputs {
  prompt?: Connectable<string>;
  duration?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
  aspect_ratio?: Connectable<unknown>;
}

export interface Wan25TextToVideoOutputs {
  output: VideoRef;
}

export function wan25TextToVideo(
  inputs: Wan25TextToVideoInputs
): DslNode<Wan25TextToVideoOutputs, "output"> {
  return createNode(
    "kie.video.Wan25TextToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Wan 2.5 Image To Video — kie.video.Wan25ImageToVideo
export interface Wan25ImageToVideoInputs {
  prompt?: Connectable<string>;
  image1?: Connectable<ImageRef>;
  image2?: Connectable<ImageRef>;
  image3?: Connectable<ImageRef>;
  duration?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export interface Wan25ImageToVideoOutputs {
  output: VideoRef;
}

export function wan25ImageToVideo(
  inputs: Wan25ImageToVideoInputs
): DslNode<Wan25ImageToVideoOutputs, "output"> {
  return createNode(
    "kie.video.Wan25ImageToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Wan 2.2 Animate — kie.video.WanAnimate
export interface WanAnimateInputs {
  prompt?: Connectable<string>;
  image?: Connectable<ImageRef>;
  duration?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export interface WanAnimateOutputs {
  output: VideoRef;
}

export function wanAnimate(
  inputs: WanAnimateInputs
): DslNode<WanAnimateOutputs, "output"> {
  return createNode("kie.video.WanAnimate", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Wan 2.2 Speech To Video — kie.video.WanSpeechToVideo
export interface WanSpeechToVideoInputs {
  image?: Connectable<ImageRef>;
  audio?: Connectable<AudioRef>;
  resolution?: Connectable<unknown>;
}

export interface WanSpeechToVideoOutputs {
  output: VideoRef;
}

export function wanSpeechToVideo(
  inputs: WanSpeechToVideoInputs
): DslNode<WanSpeechToVideoOutputs, "output"> {
  return createNode(
    "kie.video.WanSpeechToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Wan 2.2 Text To Video — kie.video.Wan22TextToVideo
export interface Wan22TextToVideoInputs {
  prompt?: Connectable<string>;
  duration?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
  aspect_ratio?: Connectable<unknown>;
}

export interface Wan22TextToVideoOutputs {
  output: VideoRef;
}

export function wan22TextToVideo(
  inputs: Wan22TextToVideoInputs
): DslNode<Wan22TextToVideoOutputs, "output"> {
  return createNode(
    "kie.video.Wan22TextToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Wan 2.2 Image To Video — kie.video.Wan22ImageToVideo
export interface Wan22ImageToVideoInputs {
  prompt?: Connectable<string>;
  image?: Connectable<ImageRef>;
  duration?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export interface Wan22ImageToVideoOutputs {
  output: VideoRef;
}

export function wan22ImageToVideo(
  inputs: Wan22ImageToVideoInputs
): DslNode<Wan22ImageToVideoOutputs, "output"> {
  return createNode(
    "kie.video.Wan22ImageToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Hailuo 02 Text To Video — kie.video.Hailuo02TextToVideo
export interface Hailuo02TextToVideoInputs {
  prompt?: Connectable<string>;
  duration?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
  aspect_ratio?: Connectable<unknown>;
}

export interface Hailuo02TextToVideoOutputs {
  output: VideoRef;
}

export function hailuo02TextToVideo(
  inputs: Hailuo02TextToVideoInputs
): DslNode<Hailuo02TextToVideoOutputs, "output"> {
  return createNode(
    "kie.video.Hailuo02TextToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Hailuo 02 Image To Video — kie.video.Hailuo02ImageToVideo
export interface Hailuo02ImageToVideoInputs {
  prompt?: Connectable<string>;
  image?: Connectable<ImageRef>;
  duration?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export interface Hailuo02ImageToVideoOutputs {
  output: VideoRef;
}

export function hailuo02ImageToVideo(
  inputs: Hailuo02ImageToVideoInputs
): DslNode<Hailuo02ImageToVideoOutputs, "output"> {
  return createNode(
    "kie.video.Hailuo02ImageToVideo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Sora 2 Watermark Remover — kie.video.Sora2WatermarkRemover
export interface Sora2WatermarkRemoverInputs {
  video?: Connectable<VideoRef>;
}

export interface Sora2WatermarkRemoverOutputs {
  output: VideoRef;
}

export function sora2WatermarkRemover(
  inputs: Sora2WatermarkRemoverInputs
): DslNode<Sora2WatermarkRemoverOutputs, "output"> {
  return createNode(
    "kie.video.Sora2WatermarkRemover",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
