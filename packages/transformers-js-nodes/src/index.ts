import type { NodeClass } from "@nodetool-ai/node-sdk";

import { TEXT_CLASSIFICATION_NODES } from "./nodes/text-classification.js";
import { TOKEN_CLASSIFICATION_NODES } from "./nodes/token-classification.js";
import { QUESTION_ANSWERING_NODES } from "./nodes/question-answering.js";
import { SUMMARIZATION_NODES } from "./nodes/summarization.js";
import { TRANSLATION_NODES } from "./nodes/translation.js";
import { TEXT_GENERATION_NODES } from "./nodes/text-generation.js";
import { FILL_MASK_NODES } from "./nodes/fill-mask.js";
import { FEATURE_EXTRACTION_NODES } from "./nodes/feature-extraction.js";
import { ZERO_SHOT_CLASSIFICATION_NODES } from "./nodes/zero-shot-classification.js";
import { IMAGE_CLASSIFICATION_NODES } from "./nodes/image-classification.js";
import { OBJECT_DETECTION_NODES } from "./nodes/object-detection.js";
import { IMAGE_TO_TEXT_NODES } from "./nodes/image-to-text.js";
import { ZERO_SHOT_IMAGE_CLASSIFICATION_NODES } from "./nodes/zero-shot-image-classification.js";
import { AUTOMATIC_SPEECH_RECOGNITION_NODES } from "./nodes/automatic-speech-recognition.js";
import { AUDIO_CLASSIFICATION_NODES } from "./nodes/audio-classification.js";
import { TEXT_TO_SPEECH_NODES } from "./nodes/text-to-speech.js";

export { TextClassificationNode } from "./nodes/text-classification.js";
export { TokenClassificationNode } from "./nodes/token-classification.js";
export { QuestionAnsweringNode } from "./nodes/question-answering.js";
export { SummarizationNode } from "./nodes/summarization.js";
export { TranslationNode } from "./nodes/translation.js";
export { TextGenerationNode } from "./nodes/text-generation.js";
export { FillMaskNode } from "./nodes/fill-mask.js";
export { FeatureExtractionNode } from "./nodes/feature-extraction.js";
export { ZeroShotClassificationNode } from "./nodes/zero-shot-classification.js";
export { ImageClassificationNode } from "./nodes/image-classification.js";
export { ObjectDetectionNode } from "./nodes/object-detection.js";
export { ImageToTextNode } from "./nodes/image-to-text.js";
export { ZeroShotImageClassificationNode } from "./nodes/zero-shot-image-classification.js";
export { AutomaticSpeechRecognitionNode } from "./nodes/automatic-speech-recognition.js";
export { AudioClassificationNode } from "./nodes/audio-classification.js";
export { TextToSpeechNode } from "./nodes/text-to-speech.js";

export {
  clearPipelineCache,
  extractRepoId,
  getPipeline,
  getTransformersJsCacheDir,
  loadTransformers,
  setTransformersJsCacheDir,
  tjsModelDefault,
  type HfModelRef
} from "./transformers-base.js";

export {
  TJS_MODEL_TYPES,
  defaultRepoFor,
  recommendedFor,
  type TjsModelRef
} from "./recommended-models.js";

export {
  isRepoCached,
  scanTransformersJsCache,
  type CachedTjsModel
} from "./cache-scan.js";

export {
  KOKORO_VOICES,
  clearKokoroCache,
  getKokoro,
  isKokoroRepo,
  isSpeechT5Repo,
  type KokoroVoice
} from "./tts-shared.js";

export {
  decodeWav,
  encodeWav,
  resampleLinear,
  type DecodedWav
} from "./wav.js";

export {
  downloadTransformersJsModel,
  tjsTypeToPipelineTask,
  type TjsDownloadOptions,
  type TjsDownloadProgress
} from "./tjs-downloader.js";

export const TRANSFORMERS_JS_NODES: readonly NodeClass[] = [
  ...TEXT_CLASSIFICATION_NODES,
  ...TOKEN_CLASSIFICATION_NODES,
  ...QUESTION_ANSWERING_NODES,
  ...SUMMARIZATION_NODES,
  ...TRANSLATION_NODES,
  ...TEXT_GENERATION_NODES,
  ...FILL_MASK_NODES,
  ...FEATURE_EXTRACTION_NODES,
  ...ZERO_SHOT_CLASSIFICATION_NODES,
  ...IMAGE_CLASSIFICATION_NODES,
  ...OBJECT_DETECTION_NODES,
  ...IMAGE_TO_TEXT_NODES,
  ...ZERO_SHOT_IMAGE_CLASSIFICATION_NODES,
  ...AUTOMATIC_SPEECH_RECOGNITION_NODES,
  ...AUDIO_CLASSIFICATION_NODES,
  ...TEXT_TO_SPEECH_NODES
];

export function registerTransformersJsNodes(registry: {
  register: (nodeClass: NodeClass) => void;
}): void {
  for (const nodeClass of TRANSFORMERS_JS_NODES) {
    registry.register(nodeClass);
  }
}
