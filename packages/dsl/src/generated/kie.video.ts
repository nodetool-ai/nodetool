// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";
import type { ImageRef, AudioRef, VideoRef, DataframeRef } from "../types.js";

// Kling 2.6 Text To Video — kie.video.KlingTextToVideo
export interface KlingTextToVideoInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
  duration?: Connectable<number>;
  resolution?: Connectable<unknown>;
  seed?: Connectable<number>;
}

export function klingTextToVideo(inputs: KlingTextToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.KlingTextToVideo", inputs as Record<string, unknown>);
}

// Kling 2.6 Image To Video — kie.video.KlingImageToVideo
export interface KlingImageToVideoInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  image1?: Connectable<ImageRef>;
  image2?: Connectable<ImageRef>;
  image3?: Connectable<ImageRef>;
  sound?: Connectable<boolean>;
  duration?: Connectable<number>;
}

export function klingImageToVideo(inputs: KlingImageToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.KlingImageToVideo", inputs as Record<string, unknown>);
}

// Kling AIAvatar Standard — kie.video.KlingAIAvatarStandard
export interface KlingAIAvatarStandardInputs {
  timeout_seconds?: Connectable<number>;
  image?: Connectable<ImageRef>;
  audio?: Connectable<AudioRef>;
  prompt?: Connectable<string>;
  mode?: Connectable<unknown>;
}

export function klingAIAvatarStandard(inputs: KlingAIAvatarStandardInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.KlingAIAvatarStandard", inputs as Record<string, unknown>);
}

// Kling AIAvatar Pro — kie.video.KlingAIAvatarPro
export interface KlingAIAvatarProInputs {
  timeout_seconds?: Connectable<number>;
  image?: Connectable<ImageRef>;
  audio?: Connectable<AudioRef>;
  prompt?: Connectable<string>;
  mode?: Connectable<unknown>;
}

export function klingAIAvatarPro(inputs: KlingAIAvatarProInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.KlingAIAvatarPro", inputs as Record<string, unknown>);
}

// Grok Imagine Text To Video — kie.video.GrokImagineTextToVideo
export interface GrokImagineTextToVideoInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  resolution?: Connectable<unknown>;
  duration?: Connectable<unknown>;
}

export function grokImagineTextToVideo(inputs: GrokImagineTextToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.GrokImagineTextToVideo", inputs as Record<string, unknown>);
}

// Grok Imagine Image To Video — kie.video.GrokImagineImageToVideo
export interface GrokImagineImageToVideoInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  image?: Connectable<ImageRef>;
  duration?: Connectable<unknown>;
}

export function grokImagineImageToVideo(inputs: GrokImagineImageToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.GrokImagineImageToVideo", inputs as Record<string, unknown>);
}

// Seedance V1 Lite Text To Video — kie.video.SeedanceV1LiteTextToVideo
export interface SeedanceV1LiteTextToVideoInputs {
  timeout_seconds?: Connectable<number>;
  aspect_ratio?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
  duration?: Connectable<unknown>;
  remove_watermark?: Connectable<boolean>;
  prompt?: Connectable<string>;
}

export function seedanceV1LiteTextToVideo(inputs: SeedanceV1LiteTextToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.SeedanceV1LiteTextToVideo", inputs as Record<string, unknown>);
}

// Seedance V1 Pro Text To Video — kie.video.SeedanceV1ProTextToVideo
export interface SeedanceV1ProTextToVideoInputs {
  timeout_seconds?: Connectable<number>;
  aspect_ratio?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
  duration?: Connectable<unknown>;
  remove_watermark?: Connectable<boolean>;
  prompt?: Connectable<string>;
}

export function seedanceV1ProTextToVideo(inputs: SeedanceV1ProTextToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.SeedanceV1ProTextToVideo", inputs as Record<string, unknown>);
}

// Seedance V1 Lite Image To Video — kie.video.SeedanceV1LiteImageToVideo
export interface SeedanceV1LiteImageToVideoInputs {
  timeout_seconds?: Connectable<number>;
  aspect_ratio?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
  duration?: Connectable<unknown>;
  remove_watermark?: Connectable<boolean>;
  prompt?: Connectable<string>;
  image1?: Connectable<ImageRef>;
  image2?: Connectable<ImageRef>;
  image3?: Connectable<ImageRef>;
}

export function seedanceV1LiteImageToVideo(inputs: SeedanceV1LiteImageToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.SeedanceV1LiteImageToVideo", inputs as Record<string, unknown>);
}

// Seedance V1 Pro Image To Video — kie.video.SeedanceV1ProImageToVideo
export interface SeedanceV1ProImageToVideoInputs {
  timeout_seconds?: Connectable<number>;
  aspect_ratio?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
  duration?: Connectable<unknown>;
  remove_watermark?: Connectable<boolean>;
  prompt?: Connectable<string>;
  image1?: Connectable<ImageRef>;
  image2?: Connectable<ImageRef>;
  image3?: Connectable<ImageRef>;
}

export function seedanceV1ProImageToVideo(inputs: SeedanceV1ProImageToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.SeedanceV1ProImageToVideo", inputs as Record<string, unknown>);
}

// Seedance V1 Pro Fast Image To Video — kie.video.SeedanceV1ProFastImageToVideo
export interface SeedanceV1ProFastImageToVideoInputs {
  timeout_seconds?: Connectable<number>;
  aspect_ratio?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
  duration?: Connectable<unknown>;
  remove_watermark?: Connectable<boolean>;
  image1?: Connectable<ImageRef>;
  image2?: Connectable<ImageRef>;
  image3?: Connectable<ImageRef>;
}

export function seedanceV1ProFastImageToVideo(inputs: SeedanceV1ProFastImageToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.SeedanceV1ProFastImageToVideo", inputs as Record<string, unknown>);
}

// Hailuo 2.3 Pro Text To Video — kie.video.HailuoTextToVideoPro
export interface HailuoTextToVideoProInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  duration?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export function hailuoTextToVideoPro(inputs: HailuoTextToVideoProInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.HailuoTextToVideoPro", inputs as Record<string, unknown>);
}

// Hailuo 2.3 Standard Text To Video — kie.video.HailuoTextToVideoStandard
export interface HailuoTextToVideoStandardInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  duration?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export function hailuoTextToVideoStandard(inputs: HailuoTextToVideoStandardInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.HailuoTextToVideoStandard", inputs as Record<string, unknown>);
}

// Hailuo 2.3 Pro Image To Video — kie.video.HailuoImageToVideoPro
export interface HailuoImageToVideoProInputs {
  timeout_seconds?: Connectable<number>;
  image?: Connectable<ImageRef>;
  prompt?: Connectable<string>;
  duration?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export function hailuoImageToVideoPro(inputs: HailuoImageToVideoProInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.HailuoImageToVideoPro", inputs as Record<string, unknown>);
}

// Hailuo 2.3 Standard Image To Video — kie.video.HailuoImageToVideoStandard
export interface HailuoImageToVideoStandardInputs {
  timeout_seconds?: Connectable<number>;
  image?: Connectable<ImageRef>;
  prompt?: Connectable<string>;
  duration?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export function hailuoImageToVideoStandard(inputs: HailuoImageToVideoStandardInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.HailuoImageToVideoStandard", inputs as Record<string, unknown>);
}

// Kling 2.5 Turbo Text To Video — kie.video.Kling25TurboTextToVideo
export interface Kling25TurboTextToVideoInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  duration?: Connectable<unknown>;
  aspect_ratio?: Connectable<unknown>;
  negative_prompt?: Connectable<string>;
  cfg_scale?: Connectable<number>;
}

export function kling25TurboTextToVideo(inputs: Kling25TurboTextToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.Kling25TurboTextToVideo", inputs as Record<string, unknown>);
}

// Kling 2.5 Turbo Image To Video — kie.video.Kling25TurboImageToVideo
export interface Kling25TurboImageToVideoInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  image?: Connectable<ImageRef>;
  tail_image?: Connectable<ImageRef>;
  duration?: Connectable<unknown>;
  negative_prompt?: Connectable<string>;
  cfg_scale?: Connectable<number>;
}

export function kling25TurboImageToVideo(inputs: Kling25TurboImageToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.Kling25TurboImageToVideo", inputs as Record<string, unknown>);
}

// Sora 2 Pro Text To Video — kie.video.Sora2ProTextToVideo
export interface Sora2ProTextToVideoInputs {
  timeout_seconds?: Connectable<number>;
  aspect_ratio?: Connectable<unknown>;
  remove_watermark?: Connectable<boolean>;
  n_frames?: Connectable<unknown>;
  prompt?: Connectable<string>;
}

export function sora2ProTextToVideo(inputs: Sora2ProTextToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.Sora2ProTextToVideo", inputs as Record<string, unknown>);
}

// Sora 2 Pro Image To Video — kie.video.Sora2ProImageToVideo
export interface Sora2ProImageToVideoInputs {
  timeout_seconds?: Connectable<number>;
  aspect_ratio?: Connectable<unknown>;
  remove_watermark?: Connectable<boolean>;
  n_frames?: Connectable<unknown>;
  prompt?: Connectable<string>;
  image?: Connectable<ImageRef>;
}

export function sora2ProImageToVideo(inputs: Sora2ProImageToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.Sora2ProImageToVideo", inputs as Record<string, unknown>);
}

// Sora 2 Pro Storyboard — kie.video.Sora2ProStoryboard
export interface Sora2ProStoryboardInputs {
  timeout_seconds?: Connectable<number>;
  aspect_ratio?: Connectable<unknown>;
  remove_watermark?: Connectable<boolean>;
  n_frames?: Connectable<unknown>;
  shots?: Connectable<DataframeRef>;
  images?: Connectable<ImageRef[]>;
}

export function sora2ProStoryboard(inputs: Sora2ProStoryboardInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.Sora2ProStoryboard", inputs as Record<string, unknown>);
}

// Sora 2 Text To Video — kie.video.Sora2TextToVideo
export interface Sora2TextToVideoInputs {
  timeout_seconds?: Connectable<number>;
  aspect_ratio?: Connectable<unknown>;
  remove_watermark?: Connectable<boolean>;
  n_frames?: Connectable<unknown>;
  prompt?: Connectable<string>;
}

export function sora2TextToVideo(inputs: Sora2TextToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.Sora2TextToVideo", inputs as Record<string, unknown>);
}

// Wan 2.1 Multi-Shot Text To Video — kie.video.WanMultiShotTextToVideoPro
export interface WanMultiShotTextToVideoProInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
  duration?: Connectable<unknown>;
  remove_watermark?: Connectable<boolean>;
}

export function wanMultiShotTextToVideoPro(inputs: WanMultiShotTextToVideoProInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.WanMultiShotTextToVideoPro", inputs as Record<string, unknown>);
}

// Wan 2.6 Text To Video — kie.video.Wan26TextToVideo
export interface Wan26TextToVideoInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  duration?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export function wan26TextToVideo(inputs: Wan26TextToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.Wan26TextToVideo", inputs as Record<string, unknown>);
}

// Wan 2.6 Image To Video — kie.video.Wan26ImageToVideo
export interface Wan26ImageToVideoInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  image1?: Connectable<ImageRef>;
  image2?: Connectable<ImageRef>;
  image3?: Connectable<ImageRef>;
  duration?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export function wan26ImageToVideo(inputs: Wan26ImageToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.Wan26ImageToVideo", inputs as Record<string, unknown>);
}

// Wan 2.6 Video To Video — kie.video.Wan26VideoToVideo
export interface Wan26VideoToVideoInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  video1?: Connectable<VideoRef>;
  video2?: Connectable<VideoRef>;
  video3?: Connectable<VideoRef>;
  duration?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export function wan26VideoToVideo(inputs: Wan26VideoToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.Wan26VideoToVideo", inputs as Record<string, unknown>);
}

// Topaz Video Upscale — kie.video.TopazVideoUpscale
export interface TopazVideoUpscaleInputs {
  timeout_seconds?: Connectable<number>;
  video?: Connectable<VideoRef>;
  resolution?: Connectable<unknown>;
  denoise?: Connectable<boolean>;
}

export function topazVideoUpscale(inputs: TopazVideoUpscaleInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.TopazVideoUpscale", inputs as Record<string, unknown>);
}

// Infinitalk V1 — kie.video.InfinitalkV1
export interface InfinitalkV1Inputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  image?: Connectable<ImageRef>;
  audio?: Connectable<AudioRef>;
  resolution?: Connectable<unknown>;
}

export function infinitalkV1(inputs: InfinitalkV1Inputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.InfinitalkV1", inputs as Record<string, unknown>);
}

// Veo 31 Text To Video — kie.video.Veo31TextToVideo
export interface Veo31TextToVideoInputs {
  timeout_seconds?: Connectable<number>;
  model?: Connectable<unknown>;
  aspect_ratio?: Connectable<unknown>;
  call_back_url?: Connectable<string>;
  prompt?: Connectable<string>;
}

export function veo31TextToVideo(inputs: Veo31TextToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.Veo31TextToVideo", inputs as Record<string, unknown>);
}

// Runway Gen-3 Alpha Text To Video — kie.video.RunwayGen3AlphaTextToVideo
export interface RunwayGen3AlphaTextToVideoInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
  duration?: Connectable<unknown>;
  quality?: Connectable<unknown>;
  water_mark?: Connectable<string>;
  call_back_url?: Connectable<string>;
}

export function runwayGen3AlphaTextToVideo(inputs: RunwayGen3AlphaTextToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.RunwayGen3AlphaTextToVideo", inputs as Record<string, unknown>);
}

// Runway Gen-3 Alpha Image To Video — kie.video.RunwayGen3AlphaImageToVideo
export interface RunwayGen3AlphaImageToVideoInputs {
  timeout_seconds?: Connectable<number>;
  image?: Connectable<ImageRef>;
  prompt?: Connectable<string>;
  duration?: Connectable<unknown>;
  quality?: Connectable<unknown>;
  water_mark?: Connectable<string>;
  call_back_url?: Connectable<string>;
}

export function runwayGen3AlphaImageToVideo(inputs: RunwayGen3AlphaImageToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.RunwayGen3AlphaImageToVideo", inputs as Record<string, unknown>);
}

// Runway Gen-3 Alpha Extend Video — kie.video.RunwayGen3AlphaExtendVideo
export interface RunwayGen3AlphaExtendVideoInputs {
  timeout_seconds?: Connectable<number>;
  video_url?: Connectable<string>;
  prompt?: Connectable<string>;
  duration?: Connectable<unknown>;
  quality?: Connectable<unknown>;
  water_mark?: Connectable<string>;
  call_back_url?: Connectable<string>;
}

export function runwayGen3AlphaExtendVideo(inputs: RunwayGen3AlphaExtendVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.RunwayGen3AlphaExtendVideo", inputs as Record<string, unknown>);
}

// Runway Aleph Video — kie.video.RunwayAlephVideo
export interface RunwayAlephVideoInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
  duration?: Connectable<unknown>;
  quality?: Connectable<unknown>;
  water_mark?: Connectable<string>;
  call_back_url?: Connectable<string>;
}

export function runwayAlephVideo(inputs: RunwayAlephVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.RunwayAlephVideo", inputs as Record<string, unknown>);
}

// Luma Modify Video — kie.video.LumaModifyVideo
export interface LumaModifyVideoInputs {
  timeout_seconds?: Connectable<number>;
  video?: Connectable<VideoRef>;
  prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
  duration?: Connectable<unknown>;
}

export function lumaModifyVideo(inputs: LumaModifyVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.LumaModifyVideo", inputs as Record<string, unknown>);
}

// Veo 3.1 Image To Video — kie.video.Veo31ImageToVideo
export interface Veo31ImageToVideoInputs {
  timeout_seconds?: Connectable<number>;
  model?: Connectable<unknown>;
  aspect_ratio?: Connectable<unknown>;
  call_back_url?: Connectable<string>;
  prompt?: Connectable<string>;
  image1?: Connectable<ImageRef>;
  image2?: Connectable<ImageRef>;
}

export function veo31ImageToVideo(inputs: Veo31ImageToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.Veo31ImageToVideo", inputs as Record<string, unknown>);
}

// Veo 3.1 Reference To Video — kie.video.Veo31ReferenceToVideo
export interface Veo31ReferenceToVideoInputs {
  timeout_seconds?: Connectable<number>;
  model?: Connectable<unknown>;
  aspect_ratio?: Connectable<unknown>;
  call_back_url?: Connectable<string>;
  prompt?: Connectable<string>;
  image1?: Connectable<ImageRef>;
  image2?: Connectable<ImageRef>;
  image3?: Connectable<ImageRef>;
}

export function veo31ReferenceToVideo(inputs: Veo31ReferenceToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.Veo31ReferenceToVideo", inputs as Record<string, unknown>);
}

// Kling 2.6 Motion Control — kie.video.KlingMotionControl
export interface KlingMotionControlInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  image?: Connectable<ImageRef>;
  video?: Connectable<VideoRef>;
  character_orientation?: Connectable<unknown>;
  mode?: Connectable<unknown>;
}

export function klingMotionControl(inputs: KlingMotionControlInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.KlingMotionControl", inputs as Record<string, unknown>);
}

// Kling 2.1 Text To Video — kie.video.Kling21TextToVideo
export interface Kling21TextToVideoInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
  duration?: Connectable<number>;
  resolution?: Connectable<unknown>;
  mode?: Connectable<unknown>;
  seed?: Connectable<number>;
}

export function kling21TextToVideo(inputs: Kling21TextToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.Kling21TextToVideo", inputs as Record<string, unknown>);
}

// Kling 2.1 Image To Video — kie.video.Kling21ImageToVideo
export interface Kling21ImageToVideoInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  image1?: Connectable<ImageRef>;
  image2?: Connectable<ImageRef>;
  image3?: Connectable<ImageRef>;
  sound?: Connectable<boolean>;
  duration?: Connectable<number>;
  mode?: Connectable<unknown>;
}

export function kling21ImageToVideo(inputs: Kling21ImageToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.Kling21ImageToVideo", inputs as Record<string, unknown>);
}

// Wan 2.5 Text To Video — kie.video.Wan25TextToVideo
export interface Wan25TextToVideoInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  duration?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
  aspect_ratio?: Connectable<unknown>;
}

export function wan25TextToVideo(inputs: Wan25TextToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.Wan25TextToVideo", inputs as Record<string, unknown>);
}

// Wan 2.5 Image To Video — kie.video.Wan25ImageToVideo
export interface Wan25ImageToVideoInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  image1?: Connectable<ImageRef>;
  image2?: Connectable<ImageRef>;
  image3?: Connectable<ImageRef>;
  duration?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export function wan25ImageToVideo(inputs: Wan25ImageToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.Wan25ImageToVideo", inputs as Record<string, unknown>);
}

// Wan 2.2 Animate — kie.video.WanAnimate
export interface WanAnimateInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  image?: Connectable<ImageRef>;
  duration?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export function wanAnimate(inputs: WanAnimateInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.WanAnimate", inputs as Record<string, unknown>);
}

// Wan 2.2 Speech To Video — kie.video.WanSpeechToVideo
export interface WanSpeechToVideoInputs {
  timeout_seconds?: Connectable<number>;
  image?: Connectable<ImageRef>;
  audio?: Connectable<AudioRef>;
  resolution?: Connectable<unknown>;
}

export function wanSpeechToVideo(inputs: WanSpeechToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.WanSpeechToVideo", inputs as Record<string, unknown>);
}

// Wan 2.2 Text To Video — kie.video.Wan22TextToVideo
export interface Wan22TextToVideoInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  duration?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
  aspect_ratio?: Connectable<unknown>;
}

export function wan22TextToVideo(inputs: Wan22TextToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.Wan22TextToVideo", inputs as Record<string, unknown>);
}

// Wan 2.2 Image To Video — kie.video.Wan22ImageToVideo
export interface Wan22ImageToVideoInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  image?: Connectable<ImageRef>;
  duration?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export function wan22ImageToVideo(inputs: Wan22ImageToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.Wan22ImageToVideo", inputs as Record<string, unknown>);
}

// Hailuo 02 Text To Video — kie.video.Hailuo02TextToVideo
export interface Hailuo02TextToVideoInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  duration?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
  aspect_ratio?: Connectable<unknown>;
}

export function hailuo02TextToVideo(inputs: Hailuo02TextToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.Hailuo02TextToVideo", inputs as Record<string, unknown>);
}

// Hailuo 02 Image To Video — kie.video.Hailuo02ImageToVideo
export interface Hailuo02ImageToVideoInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  image?: Connectable<ImageRef>;
  duration?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export function hailuo02ImageToVideo(inputs: Hailuo02ImageToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.Hailuo02ImageToVideo", inputs as Record<string, unknown>);
}

// Sora 2 Watermark Remover — kie.video.Sora2WatermarkRemover
export interface Sora2WatermarkRemoverInputs {
  timeout_seconds?: Connectable<number>;
  video?: Connectable<VideoRef>;
}

export function sora2WatermarkRemover(inputs: Sora2WatermarkRemoverInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("kie.video.Sora2WatermarkRemover", inputs as Record<string, unknown>);
}
