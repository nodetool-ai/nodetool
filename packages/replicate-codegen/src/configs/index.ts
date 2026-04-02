import type { ModuleConfig } from "../types.js";

import { imageGenerateConfig } from "./image-generate.js";
import { imageAnalyzeConfig } from "./image-analyze.js";
import { imageOcrConfig } from "./image-ocr.js";
import { imageFaceConfig } from "./image-face.js";
import { imageUpscaleConfig } from "./image-upscale.js";
import { imageEnhanceConfig } from "./image-enhance.js";
import { imageProcessConfig } from "./image-process.js";
import { imageBackgroundConfig } from "./image-background.js";
import { image3dConfig } from "./image-3d.js";
import { videoGenerateConfig } from "./video-generate.js";
import { videoEnhanceConfig } from "./video-enhance.js";
import { videoFaceConfig } from "./video-face.js";
import { videoProcessConfig } from "./video-process.js";
import { audioGenerateConfig } from "./audio-generate.js";
import { audioEnhanceConfig } from "./audio-enhance.js";
import { audioSeparateConfig } from "./audio-separate.js";
import { audioTranscribeConfig } from "./audio-transcribe.js";
import { audioSpeechConfig } from "./audio-speech.js";
import { textGenerateConfig } from "./text-generate.js";
import { embeddingConfig } from "./embedding.js";

export {
  imageGenerateConfig,
  imageAnalyzeConfig,
  imageOcrConfig,
  imageFaceConfig,
  imageUpscaleConfig,
  imageEnhanceConfig,
  imageProcessConfig,
  imageBackgroundConfig,
  image3dConfig,
  videoGenerateConfig,
  videoEnhanceConfig,
  videoFaceConfig,
  videoProcessConfig,
  audioGenerateConfig,
  audioEnhanceConfig,
  audioSeparateConfig,
  audioTranscribeConfig,
  audioSpeechConfig,
  textGenerateConfig,
  embeddingConfig
};

export const allConfigs: Record<string, ModuleConfig> = {
  "image.generate": imageGenerateConfig,
  "image.analyze": imageAnalyzeConfig,
  "image.ocr": imageOcrConfig,
  "image.face": imageFaceConfig,
  "image.upscale": imageUpscaleConfig,
  "image.enhance": imageEnhanceConfig,
  "image.process": imageProcessConfig,
  "image.background": imageBackgroundConfig,
  "image.3d": image3dConfig,
  "video.generate": videoGenerateConfig,
  "video.enhance": videoEnhanceConfig,
  "video.face": videoFaceConfig,
  "video.process": videoProcessConfig,
  "audio.generate": audioGenerateConfig,
  "audio.enhance": audioEnhanceConfig,
  "audio.separate": audioSeparateConfig,
  "audio.transcribe": audioTranscribeConfig,
  "audio.speech": audioSpeechConfig,
  "text.generate": textGenerateConfig,
  embedding: embeddingConfig
};
