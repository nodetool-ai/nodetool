// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Sentiment Analysis — lib.nlp.SentimentAnalysis
export interface SentimentAnalysisInputs {
  text?: Connectable<string>;
  language?: Connectable<"English" | "Spanish" | "French">;
}

export interface SentimentAnalysisOutputs {
  score: number;
  comparative: number;
  positive_words: unknown[];
  negative_words: unknown[];
}

export function sentimentAnalysis(inputs: SentimentAnalysisInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SentimentAnalysisOutputs> {
  return createNode("lib.nlp.SentimentAnalysis", inputs as Record<string, unknown>, { outputNames: ["score", "comparative", "positive_words", "negative_words"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Tokenize — lib.nlp.Tokenize
export interface TokenizeInputs {
  text?: Connectable<string>;
  mode?: Connectable<"word" | "sentence">;
}

export interface TokenizeOutputs {
  output: unknown[];
  count: number;
}

export function tokenize(inputs: TokenizeInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<TokenizeOutputs> {
  return createNode("lib.nlp.Tokenize", inputs as Record<string, unknown>, { outputNames: ["output", "count"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Stem — lib.nlp.Stem
export interface StemInputs {
  text?: Connectable<string>;
  algorithm?: Connectable<"porter" | "lancaster">;
}

export interface StemOutputs {
  output: string;
  tokens: unknown[];
}

export function stem(inputs: StemInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<StemOutputs> {
  return createNode("lib.nlp.Stem", inputs as Record<string, unknown>, { outputNames: ["output", "tokens"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// TF-IDF — lib.nlp.TfIdf
export interface TfIdfInputs {
  documents?: Connectable<unknown[]>;
  query?: Connectable<string>;
}

export interface TfIdfOutputs {
  output: unknown[];
}

export function tfIdf(inputs: TfIdfInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<TfIdfOutputs, "output"> {
  return createNode("lib.nlp.TfIdf", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Classify Text — lib.nlp.ClassifyText
export interface ClassifyTextInputs {
  text?: Connectable<string>;
  training_data?: Connectable<unknown[]>;
}

export interface ClassifyTextOutputs {
  output: string;
  classifications: unknown[];
}

export function classifyText(inputs: ClassifyTextInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ClassifyTextOutputs> {
  return createNode("lib.nlp.ClassifyText", inputs as Record<string, unknown>, { outputNames: ["output", "classifications"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Extract Entities — lib.nlp.ExtractEntities
export interface ExtractEntitiesInputs {
  text?: Connectable<string>;
}

export interface ExtractEntitiesOutputs {
  people: unknown[];
  places: unknown[];
  organizations: unknown[];
  numbers: unknown[];
  nouns: unknown[];
  verbs: unknown[];
}

export function extractEntities(inputs: ExtractEntitiesInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExtractEntitiesOutputs> {
  return createNode("lib.nlp.ExtractEntities", inputs as Record<string, unknown>, { outputNames: ["people", "places", "organizations", "numbers", "nouns", "verbs"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Phonetic Match — lib.nlp.PhoneticMatch
export interface PhoneticMatchInputs {
  text?: Connectable<string>;
  algorithm?: Connectable<"soundex" | "metaphone" | "double_metaphone">;
}

export interface PhoneticMatchOutputs {
  output: string;
  tokens: unknown[];
}

export function phoneticMatch(inputs: PhoneticMatchInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<PhoneticMatchOutputs> {
  return createNode("lib.nlp.PhoneticMatch", inputs as Record<string, unknown>, { outputNames: ["output", "tokens"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
