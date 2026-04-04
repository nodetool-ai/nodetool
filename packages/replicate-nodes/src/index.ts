import type { NodeClass, NodeRegistry } from "@nodetool/node-sdk";

// Generated node arrays
import { REPLICATE_AUDIO_ENHANCE_NODES } from "./generated/audio-enhance.js";
import { REPLICATE_AUDIO_GENERATE_NODES } from "./generated/audio-generate.js";
import { REPLICATE_AUDIO_SEPARATE_NODES } from "./generated/audio-separate.js";
import { REPLICATE_AUDIO_SPEECH_NODES } from "./generated/audio-speech.js";
import { REPLICATE_AUDIO_TRANSCRIBE_NODES } from "./generated/audio-transcribe.js";
import { REPLICATE_IMAGE_3D_NODES } from "./generated/image-3d.js";
import { REPLICATE_IMAGE_ANALYZE_NODES } from "./generated/image-analyze.js";
import { REPLICATE_IMAGE_BACKGROUND_NODES } from "./generated/image-background.js";
import { REPLICATE_IMAGE_ENHANCE_NODES } from "./generated/image-enhance.js";
import { REPLICATE_IMAGE_FACE_NODES } from "./generated/image-face.js";
import { REPLICATE_IMAGE_GENERATE_NODES } from "./generated/image-generate.js";
import { REPLICATE_IMAGE_OCR_NODES } from "./generated/image-ocr.js";
import { REPLICATE_IMAGE_PROCESS_NODES } from "./generated/image-process.js";
import { REPLICATE_IMAGE_UPSCALE_NODES } from "./generated/image-upscale.js";
import { REPLICATE_TEXT_GENERATE_NODES } from "./generated/text-generate.js";
import { REPLICATE_VIDEO_ENHANCE_NODES } from "./generated/video-enhance.js";
import { REPLICATE_VIDEO_FACE_NODES } from "./generated/video-face.js";
import { REPLICATE_VIDEO_GENERATE_NODES } from "./generated/video-generate.js";
import { REPLICATE_VIDEO_PROCESS_NODES } from "./generated/video-process.js";
import { REPLICATE_EMBEDDING_NODES } from "./generated/embedding.js";

export const REPLICATE_NODES: readonly NodeClass[] = [
  ...REPLICATE_AUDIO_ENHANCE_NODES,
  ...REPLICATE_AUDIO_GENERATE_NODES,
  ...REPLICATE_AUDIO_SEPARATE_NODES,
  ...REPLICATE_AUDIO_SPEECH_NODES,
  ...REPLICATE_AUDIO_TRANSCRIBE_NODES,
  ...REPLICATE_IMAGE_3D_NODES,
  ...REPLICATE_IMAGE_ANALYZE_NODES,
  ...REPLICATE_IMAGE_BACKGROUND_NODES,
  ...REPLICATE_IMAGE_ENHANCE_NODES,
  ...REPLICATE_IMAGE_FACE_NODES,
  ...REPLICATE_IMAGE_GENERATE_NODES,
  ...REPLICATE_IMAGE_OCR_NODES,
  ...REPLICATE_IMAGE_PROCESS_NODES,
  ...REPLICATE_IMAGE_UPSCALE_NODES,
  ...REPLICATE_TEXT_GENERATE_NODES,
  ...REPLICATE_VIDEO_ENHANCE_NODES,
  ...REPLICATE_VIDEO_FACE_NODES,
  ...REPLICATE_VIDEO_GENERATE_NODES,
  ...REPLICATE_VIDEO_PROCESS_NODES,
  ...REPLICATE_EMBEDDING_NODES
];

export function registerReplicateNodes(registry: NodeRegistry): void {
  for (const nodeClass of REPLICATE_NODES) {
    registry.register(nodeClass);
  }
}

export * from "./replicate-base.js";
