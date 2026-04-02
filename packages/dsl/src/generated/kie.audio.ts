// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { AudioRef, TextRef } from "../types.js";

// Generate Music — kie.audio.GenerateMusic
export interface GenerateMusicInputs {
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

export interface GenerateMusicOutputs {
  output: AudioRef;
}

export function generateMusic(
  inputs: GenerateMusicInputs
): DslNode<GenerateMusicOutputs, "output"> {
  return createNode(
    "kie.audio.GenerateMusic",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Extend Music — kie.audio.ExtendMusic
export interface ExtendMusicInputs {
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

export interface ExtendMusicOutputs {
  output: AudioRef;
}

export function extendMusic(
  inputs: ExtendMusicInputs
): DslNode<ExtendMusicOutputs, "output"> {
  return createNode(
    "kie.audio.ExtendMusic",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Cover Audio — kie.audio.CoverAudio
export interface CoverAudioInputs {
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

export interface CoverAudioOutputs {
  output: AudioRef;
}

export function coverAudio(
  inputs: CoverAudioInputs
): DslNode<CoverAudioOutputs, "output"> {
  return createNode("kie.audio.CoverAudio", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Add Instrumental — kie.audio.AddInstrumental
export interface AddInstrumentalInputs {
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

export interface AddInstrumentalOutputs {
  output: AudioRef;
}

export function addInstrumental(
  inputs: AddInstrumentalInputs
): DslNode<AddInstrumentalOutputs, "output"> {
  return createNode(
    "kie.audio.AddInstrumental",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Add Vocals — kie.audio.AddVocals
export interface AddVocalsInputs {
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

export interface AddVocalsOutputs {
  output: AudioRef;
}

export function addVocals(
  inputs: AddVocalsInputs
): DslNode<AddVocalsOutputs, "output"> {
  return createNode("kie.audio.AddVocals", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Replace Music Section — kie.audio.ReplaceMusicSection
export interface ReplaceMusicSectionInputs {
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

export interface ReplaceMusicSectionOutputs {
  output: AudioRef;
}

export function replaceMusicSection(
  inputs: ReplaceMusicSectionInputs
): DslNode<ReplaceMusicSectionOutputs, "output"> {
  return createNode(
    "kie.audio.ReplaceMusicSection",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// ElevenLabs Text To Speech — kie.audio.ElevenLabsTextToSpeech
export interface ElevenLabsTextToSpeechInputs {
  text?: Connectable<string>;
  voice?: Connectable<string>;
  stability?: Connectable<number>;
  similarity_boost?: Connectable<number>;
  style?: Connectable<number>;
  speed?: Connectable<number>;
  language_code?: Connectable<string>;
  model?: Connectable<unknown>;
}

export interface ElevenLabsTextToSpeechOutputs {
  output: AudioRef;
}

export function elevenLabsTextToSpeech(
  inputs: ElevenLabsTextToSpeechInputs
): DslNode<ElevenLabsTextToSpeechOutputs, "output"> {
  return createNode(
    "kie.audio.ElevenLabsTextToSpeech",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// ElevenLabs Audio Isolation — kie.audio.ElevenLabsAudioIsolation
export interface ElevenLabsAudioIsolationInputs {
  audio?: Connectable<AudioRef>;
}

export interface ElevenLabsAudioIsolationOutputs {
  output: AudioRef;
}

export function elevenLabsAudioIsolation(
  inputs: ElevenLabsAudioIsolationInputs
): DslNode<ElevenLabsAudioIsolationOutputs, "output"> {
  return createNode(
    "kie.audio.ElevenLabsAudioIsolation",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// ElevenLabs Sound Effect — kie.audio.ElevenLabsSoundEffect
export interface ElevenLabsSoundEffectInputs {
  text?: Connectable<string>;
  duration_seconds?: Connectable<number>;
  prompt_influence?: Connectable<number>;
}

export interface ElevenLabsSoundEffectOutputs {
  output: AudioRef;
}

export function elevenLabsSoundEffect(
  inputs: ElevenLabsSoundEffectInputs
): DslNode<ElevenLabsSoundEffectOutputs, "output"> {
  return createNode(
    "kie.audio.ElevenLabsSoundEffect",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// ElevenLabs Speech To Text — kie.audio.ElevenLabsSpeechToText
export interface ElevenLabsSpeechToTextInputs {
  audio?: Connectable<AudioRef>;
  language_code?: Connectable<string>;
  diarization?: Connectable<boolean>;
}

export interface ElevenLabsSpeechToTextOutputs {
  output: TextRef;
}

export function elevenLabsSpeechToText(
  inputs: ElevenLabsSpeechToTextInputs
): DslNode<ElevenLabsSpeechToTextOutputs, "output"> {
  return createNode(
    "kie.audio.ElevenLabsSpeechToText",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// ElevenLabs V3 Dialogue — kie.audio.ElevenLabsV3Dialogue
export interface ElevenLabsV3DialogueInputs {
  text?: Connectable<string>;
  voice?: Connectable<string>;
  stability?: Connectable<number>;
  similarity_boost?: Connectable<number>;
  style?: Connectable<number>;
  speed?: Connectable<number>;
  language_code?: Connectable<string>;
}

export interface ElevenLabsV3DialogueOutputs {
  output: AudioRef;
}

export function elevenLabsV3Dialogue(
  inputs: ElevenLabsV3DialogueInputs
): DslNode<ElevenLabsV3DialogueOutputs, "output"> {
  return createNode(
    "kie.audio.ElevenLabsV3Dialogue",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
