// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";

// Sentiment Analysis — lib.nlp.SentimentAnalysis
export type SentimentAnalysisInputs = {
  text?: string;
  language?: "English" | "Spanish" | "French";
};

export interface SentimentAnalysisOutputs {
  score: number;
  comparative: number;
  positive_words: unknown[];
  negative_words: unknown[];
}

export function sentimentAnalysis(inputs: SentimentAnalysisInputs): Promise<SentimentAnalysisOutputs> {
  return callNode<SentimentAnalysisOutputs>("lib.nlp.SentimentAnalysis", inputs);
}

// Tokenize — lib.nlp.Tokenize
export type TokenizeInputs = {
  text?: string;
  mode?: "word" | "sentence";
};

export interface TokenizeOutputs {
  output: unknown[];
  count: number;
}

export function tokenize(inputs: TokenizeInputs): Promise<TokenizeOutputs> {
  return callNode<TokenizeOutputs>("lib.nlp.Tokenize", inputs);
}

// Stem — lib.nlp.Stem
export type StemInputs = {
  text?: string;
  algorithm?: "porter" | "lancaster";
};

export interface StemOutputs {
  output: string;
  tokens: unknown[];
}

export function stem(inputs: StemInputs): Promise<StemOutputs> {
  return callNode<StemOutputs>("lib.nlp.Stem", inputs);
}

// TF-IDF — lib.nlp.TfIdf
export type TfIdfInputs = {
  documents?: unknown[];
  query?: string;
};

export interface TfIdfOutputs {
  output: unknown[];
}

export function tfIdf(inputs: TfIdfInputs): Promise<TfIdfOutputs> {
  return callNode<TfIdfOutputs>("lib.nlp.TfIdf", inputs);
}

// Classify Text — lib.nlp.ClassifyText
export type ClassifyTextInputs = {
  text?: string;
  training_data?: unknown[];
};

export interface ClassifyTextOutputs {
  output: string;
  classifications: unknown[];
}

export function classifyText(inputs: ClassifyTextInputs): Promise<ClassifyTextOutputs> {
  return callNode<ClassifyTextOutputs>("lib.nlp.ClassifyText", inputs);
}

// Extract Entities — lib.nlp.ExtractEntities
export type ExtractEntitiesInputs = {
  text?: string;
};

export interface ExtractEntitiesOutputs {
  people: unknown[];
  places: unknown[];
  organizations: unknown[];
  numbers: unknown[];
  nouns: unknown[];
  verbs: unknown[];
}

export function extractEntities(inputs: ExtractEntitiesInputs): Promise<ExtractEntitiesOutputs> {
  return callNode<ExtractEntitiesOutputs>("lib.nlp.ExtractEntities", inputs);
}

// Phonetic Match — lib.nlp.PhoneticMatch
export type PhoneticMatchInputs = {
  text?: string;
  algorithm?: "soundex" | "metaphone" | "double_metaphone";
};

export interface PhoneticMatchOutputs {
  output: string;
  tokens: unknown[];
}

export function phoneticMatch(inputs: PhoneticMatchInputs): Promise<PhoneticMatchOutputs> {
  return callNode<PhoneticMatchOutputs>("lib.nlp.PhoneticMatch", inputs);
}
