/**
 * Type definitions for FAL nodes.
 *
 * Translated from Python nodetool-fal/src/nodetool/nodes/fal/types.py.
 * These types represent complex nested structures in the FAL API.
 */

/** Audio time span specification. */
export interface AudioTimeSpan {
  /** Start time in seconds */
  start?: number;
  /** End time in seconds */
  end?: number;
}

/** Bounding box prompt base. */
export interface BBoxPromptBase {
  /** X coordinate */
  x?: number;
  /** Y coordinate */
  y?: number;
  /** Width */
  width?: number;
  /** Height */
  height?: number;
}

/** Box prompt for image segmentation. */
export interface BoxPrompt {
  /** X coordinate */
  x?: number;
  /** Y coordinate */
  y?: number;
  /** Width */
  width?: number;
  /** Height */
  height?: number;
}

/** Base class for box prompts. */
export interface BoxPromptBase {
  /** X coordinate */
  x?: number;
  /** Y coordinate */
  y?: number;
  /** Width */
  width?: number;
  /** Height */
  height?: number;
}

/** Chrono LoRA weight configuration. */
export interface ChronoLoraWeight {
  /** Path to LoRA weights */
  path?: string;
  /** Weight scale */
  scale?: number;
}

/** Control LoRA weight configuration. */
export interface ControlLoraWeight {
  /** Path to LoRA weights */
  path?: string;
  /** Weight scale */
  scale?: number;
}

/** ControlNet configuration. */
export interface ControlNet {
  /** ControlNet model path */
  path?: string;
  /** Conditioning scale */
  conditioning_scale?: number;
}

/** ControlNet Union configuration. */
export interface ControlNetUnion {
  /** ControlNet model path */
  path?: string;
  /** Conditioning scale */
  conditioning_scale?: number;
}

/** Dialogue block for text-to-speech. */
export interface DialogueBlock {
  /** Speaker identifier */
  speaker?: string;
  /** Text content */
  text?: string;
}

/** Easy control weight configuration. */
export interface EasyControlWeight {
  /** Weight scale */
  scale?: number;
}

/** Embedding configuration. */
export interface Embedding {
  /** Embedding path */
  path?: string;
  /** Token list */
  tokens?: string[];
}

/** Frame specification for video. */
export interface Frame {
  /** Frame index */
  index?: number;
  /** Frame data */
  data?: unknown;
}

/** Guidance input for image generation. */
export interface GuidanceInput {
  /** Guidance data */
  guidance_data?: unknown;
}

/** IP-Adapter configuration. */
export interface IPAdapter {
  /** Image encoder path */
  image_encoder_path?: string;
  /** IP-Adapter model path */
  ip_adapter_path?: string;
  /** Adapter scale */
  scale?: number;
}

/** Image conditioning input. */
export interface ImageConditioningInput {
  /** Image URL */
  image_url?: string;
  /** Conditioning scale */
  conditioning_scale?: number;
}

/** Image input specification. */
export interface ImageInput {
  /** Image URL */
  image_url?: string;
}

/** Keyframe transition specification. */
export interface KeyframeTransition {
  /** Frame number */
  frame?: number;
  /** Transition type */
  transition_type?: string;
}

/** LoRA input configuration. */
export interface LoRAInput {
  /** LoRA model path */
  path?: string;
  /** LoRA scale */
  scale?: number;
}

/** LoRA weight configuration. */
export interface LoRAWeight {
  /** LoRA weights path */
  path?: string;
  /** Weight scale */
  scale?: number;
}

/** LoRA weight configuration (alternate naming). */
export interface LoraWeight {
  /** LoRA weights path */
  path?: string;
  /** Weight scale */
  scale?: number;
}

/** Moondream input parameters. */
export interface MoondreamInputParam {
  /** Parameter data */
  param_data?: unknown;
}

/** Point prompt for image segmentation. */
export interface PointPrompt {
  /** X coordinate */
  x?: number;
  /** Y coordinate */
  y?: number;
  /** Point label */
  label?: number;
}

/** Base class for point prompts. */
export interface PointPromptBase {
  /** X coordinate */
  x?: number;
  /** Y coordinate */
  y?: number;
}

/** Pronunciation dictionary locator. */
export interface PronunciationDictionaryLocator {
  /** Dictionary ID */
  dictionary_id?: string;
}

/** RGB color specification. */
export interface RGBColor {
  /** Red component (0-255) */
  r?: number;
  /** Green component (0-255) */
  g?: number;
  /** Blue component (0-255) */
  b?: number;
}

/** Reference image input. */
export interface ReferenceImageInput {
  /** Reference image URL */
  image_url?: string;
}

/** Semantic image input. */
export interface SemanticImageInput {
  /** Semantic image URL */
  image_url?: string;
}

/** Speaker configuration. */
export interface Speaker {
  /** Speaker identifier */
  speaker_id?: string;
  /** Voice identifier */
  voice?: string;
}

/** Audio/video track specification. */
export interface Track {
  /** Track identifier */
  track_id?: string;
  /** Track data */
  track_data?: unknown;
}

/** Conversation turn specification. */
export interface Turn {
  /** Turn role (user/assistant) */
  role?: string;
  /** Turn content */
  content?: string;
}

/** Vibe voice speaker configuration. */
export interface VibeVoiceSpeaker {
  /** Speaker identifier */
  speaker_id?: string;
  /** Voice style */
  voice_style?: string;
}

/** Video conditioning input. */
export interface VideoConditioningInput {
  /** Video URL */
  video_url?: string;
  /** Conditioning scale */
  conditioning_scale?: number;
}
