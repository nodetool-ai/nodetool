import type { ModuleConfig } from "../types.js";

import { imageGenerateConfig } from "./image-generate.js";
import { imageAnalyzeConfig } from "./image-analyze.js";
import { imageOcrConfig } from "./image-ocr.js";
import { imageFaceConfig } from "./image-face.js";
import { imageUpscaleConfig } from "./image-upscale.js";
import { imageEnhanceConfig } from "./image-enhance.js";
import { imageProcessConfig } from "./image-process.js";
import { videoGenerateConfig } from "./video-generate.js";
import { videoEnhanceConfig } from "./video-enhance.js";
import { audioGenerateConfig } from "./audio-generate.js";
import { audioEnhanceConfig } from "./audio-enhance.js";
import { audioSeparateConfig } from "./audio-separate.js";
import { audioTranscribeConfig } from "./audio-transcribe.js";
import { textGenerateConfig } from "./text-generate.js";

export {
  imageGenerateConfig,
  imageAnalyzeConfig,
  imageOcrConfig,
  imageFaceConfig,
  imageUpscaleConfig,
  imageEnhanceConfig,
  imageProcessConfig,
  videoGenerateConfig,
  videoEnhanceConfig,
  audioGenerateConfig,
  audioEnhanceConfig,
  audioSeparateConfig,
  audioTranscribeConfig,
  textGenerateConfig,
};

export const allConfigs: Record<string, ModuleConfig> = {
  "image.generate": imageGenerateConfig,
  "image.analyze": imageAnalyzeConfig,
  "image.ocr": imageOcrConfig,
  "image.face": imageFaceConfig,
  "image.upscale": imageUpscaleConfig,
  "image.enhance": imageEnhanceConfig,
  "image.process": imageProcessConfig,
  "video.generate": videoGenerateConfig,
  "video.enhance": videoEnhanceConfig,
  "audio.generate": audioGenerateConfig,
  "audio.enhance": audioEnhanceConfig,
  "audio.separate": audioSeparateConfig,
  "audio.transcribe": audioTranscribeConfig,
  "text.generate": textGenerateConfig,
};
