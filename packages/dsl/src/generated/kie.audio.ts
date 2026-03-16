// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";
import type { AudioRef, TextRef } from "../types.js";

// Generate Music — kie.audio.GenerateMusic
export interface GenerateMusicInputs {
  timeout_seconds?: Connectable<number>;
  custom_mode?: Connectable<boolean>;
  prompt?: Connectable<string>;
  style?: Connectable<string>;
  title?: Connectable<string>;
  instrumental?: Connectable<boolean>;
  model?: Connectable<unknown>;
  negative_tags?: Connectable<string>;
  vocal_gender?: Connectable<unknown>;
  style_weight?: Connectable<number>;
  weirdness_constraint?: Connectable<number>;
  audio_weight?: Connectable<number>;
  persona_id?: Connectable<string>;
}

export function generateMusic(inputs: GenerateMusicInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("kie.audio.GenerateMusic", inputs as Record<string, unknown>);
}

// Extend Music — kie.audio.ExtendMusic
export interface ExtendMusicInputs {
  timeout_seconds?: Connectable<number>;
  default_param_flag?: Connectable<boolean>;
  audio_id?: Connectable<string>;
  prompt?: Connectable<string>;
  style?: Connectable<string>;
  title?: Connectable<string>;
  continue_at?: Connectable<number>;
  model?: Connectable<unknown>;
  negative_tags?: Connectable<string>;
  vocal_gender?: Connectable<unknown>;
  style_weight?: Connectable<number>;
  weirdness_constraint?: Connectable<number>;
  audio_weight?: Connectable<number>;
  persona_id?: Connectable<string>;
}

export function extendMusic(inputs: ExtendMusicInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("kie.audio.ExtendMusic", inputs as Record<string, unknown>);
}

// Cover Audio — kie.audio.CoverAudio
export interface CoverAudioInputs {
  timeout_seconds?: Connectable<number>;
  custom_mode?: Connectable<boolean>;
  audio?: Connectable<AudioRef>;
  prompt?: Connectable<string>;
  style?: Connectable<string>;
  title?: Connectable<string>;
  instrumental?: Connectable<boolean>;
  model?: Connectable<unknown>;
  negative_tags?: Connectable<string>;
  vocal_gender?: Connectable<unknown>;
  style_weight?: Connectable<number>;
  weirdness_constraint?: Connectable<number>;
  audio_weight?: Connectable<number>;
  persona_id?: Connectable<string>;
}

export function coverAudio(inputs: CoverAudioInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("kie.audio.CoverAudio", inputs as Record<string, unknown>);
}

// Add Instrumental — kie.audio.AddInstrumental
export interface AddInstrumentalInputs {
  timeout_seconds?: Connectable<number>;
  audio?: Connectable<AudioRef>;
  title?: Connectable<string>;
  tags?: Connectable<string>;
  negative_tags?: Connectable<string>;
  model?: Connectable<unknown>;
  vocal_gender?: Connectable<unknown>;
  style_weight?: Connectable<number>;
  weirdness_constraint?: Connectable<number>;
  audio_weight?: Connectable<number>;
}

export function addInstrumental(inputs: AddInstrumentalInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("kie.audio.AddInstrumental", inputs as Record<string, unknown>);
}

// Add Vocals — kie.audio.AddVocals
export interface AddVocalsInputs {
  timeout_seconds?: Connectable<number>;
  audio?: Connectable<AudioRef>;
  prompt?: Connectable<string>;
  title?: Connectable<string>;
  style?: Connectable<string>;
  tags?: Connectable<string>;
  negative_tags?: Connectable<string>;
  model?: Connectable<unknown>;
  vocal_gender?: Connectable<unknown>;
  style_weight?: Connectable<number>;
  weirdness_constraint?: Connectable<number>;
  audio_weight?: Connectable<number>;
}

export function addVocals(inputs: AddVocalsInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("kie.audio.AddVocals", inputs as Record<string, unknown>);
}

// Replace Music Section — kie.audio.ReplaceMusicSection
export interface ReplaceMusicSectionInputs {
  timeout_seconds?: Connectable<number>;
  task_id?: Connectable<string>;
  audio_id?: Connectable<string>;
  prompt?: Connectable<string>;
  tags?: Connectable<string>;
  title?: Connectable<string>;
  infill_start_s?: Connectable<number>;
  infill_end_s?: Connectable<number>;
  negative_tags?: Connectable<string>;
  full_lyrics?: Connectable<string>;
}

export function replaceMusicSection(inputs: ReplaceMusicSectionInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("kie.audio.ReplaceMusicSection", inputs as Record<string, unknown>);
}

// ElevenLabs Text To Speech — kie.audio.ElevenLabsTextToSpeech
export interface ElevenLabsTextToSpeechInputs {
  timeout_seconds?: Connectable<number>;
  text?: Connectable<string>;
  voice?: Connectable<string>;
  stability?: Connectable<number>;
  similarity_boost?: Connectable<number>;
  style?: Connectable<number>;
  speed?: Connectable<number>;
  language_code?: Connectable<string>;
  model?: Connectable<unknown>;
}

export function elevenLabsTextToSpeech(inputs: ElevenLabsTextToSpeechInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("kie.audio.ElevenLabsTextToSpeech", inputs as Record<string, unknown>);
}

// ElevenLabs Audio Isolation — kie.audio.ElevenLabsAudioIsolation
export interface ElevenLabsAudioIsolationInputs {
  timeout_seconds?: Connectable<number>;
  audio?: Connectable<AudioRef>;
}

export function elevenLabsAudioIsolation(inputs: ElevenLabsAudioIsolationInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("kie.audio.ElevenLabsAudioIsolation", inputs as Record<string, unknown>);
}

// ElevenLabs Sound Effect — kie.audio.ElevenLabsSoundEffect
export interface ElevenLabsSoundEffectInputs {
  timeout_seconds?: Connectable<number>;
  text?: Connectable<string>;
  duration_seconds?: Connectable<number>;
  prompt_influence?: Connectable<number>;
}

export function elevenLabsSoundEffect(inputs: ElevenLabsSoundEffectInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("kie.audio.ElevenLabsSoundEffect", inputs as Record<string, unknown>);
}

// ElevenLabs Speech To Text — kie.audio.ElevenLabsSpeechToText
export interface ElevenLabsSpeechToTextInputs {
  timeout_seconds?: Connectable<number>;
  audio?: Connectable<AudioRef>;
  language_code?: Connectable<string>;
  diarization?: Connectable<boolean>;
}

export function elevenLabsSpeechToText(inputs: ElevenLabsSpeechToTextInputs): DslNode<SingleOutput<TextRef>> {
  return createNode("kie.audio.ElevenLabsSpeechToText", inputs as Record<string, unknown>);
}

// ElevenLabs V3 Dialogue — kie.audio.ElevenLabsV3Dialogue
export interface ElevenLabsV3DialogueInputs {
  timeout_seconds?: Connectable<number>;
  text?: Connectable<string>;
  voice?: Connectable<string>;
  stability?: Connectable<number>;
  similarity_boost?: Connectable<number>;
  style?: Connectable<number>;
  speed?: Connectable<number>;
  language_code?: Connectable<string>;
}

export function elevenLabsV3Dialogue(inputs: ElevenLabsV3DialogueInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("kie.audio.ElevenLabsV3Dialogue", inputs as Record<string, unknown>);
}
