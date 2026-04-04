import type { ModuleConfig } from "../types.js";

import { config as threeDTo3d } from "./3d-to-3d.js";
import { config as audioToAudio } from "./audio-to-audio.js";
import { config as audioToText } from "./audio-to-text.js";
import { config as audioToVideo } from "./audio-to-video.js";
import { config as imageToImage } from "./image-to-image.js";
import { config as imageTo3d } from "./image-to-3d.js";
import { config as imageToJson } from "./image-to-json.js";
import { config as imageToVideo } from "./image-to-video.js";
import { config as jsonProcessing } from "./json-processing.js";
import { config as llm } from "./llm.js";
import { config as speechToSpeech } from "./speech-to-speech.js";
import { config as speechToText } from "./speech-to-text.js";
import { config as textTo3d } from "./text-to-3d.js";
import { config as textToAudio } from "./text-to-audio.js";
import { config as textToImage } from "./text-to-image.js";
import { config as textToJson } from "./text-to-json.js";
import { config as textToSpeech } from "./text-to-speech.js";
import { config as textToText } from "./text-to-text.js";
import { config as textToVideo } from "./text-to-video.js";
import { config as training } from "./training.js";
import { config as unknown } from "./unknown.js";
import { config as videoToAudio } from "./video-to-audio.js";
import { config as videoToText } from "./video-to-text.js";
import { config as videoToVideo } from "./video-to-video.js";
import { config as vision } from "./vision.js";

export const allConfigs: Record<string, ModuleConfig> = {
  "3d_to_3d": threeDTo3d,
  audio_to_audio: audioToAudio,
  audio_to_text: audioToText,
  audio_to_video: audioToVideo,
  image_to_image: imageToImage,
  image_to_3d: imageTo3d,
  image_to_json: imageToJson,
  image_to_video: imageToVideo,
  json_processing: jsonProcessing,
  llm,
  speech_to_speech: speechToSpeech,
  speech_to_text: speechToText,
  text_to_3d: textTo3d,
  text_to_audio: textToAudio,
  text_to_image: textToImage,
  text_to_json: textToJson,
  text_to_speech: textToSpeech,
  text_to_text: textToText,
  text_to_video: textToVideo,
  training,
  unknown,
  video_to_audio: videoToAudio,
  video_to_text: videoToText,
  video_to_video: videoToVideo,
  vision
};
