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

export function sentimentAnalysis(inputs: SentimentAnalysisInputs): DslNode<SentimentAnalysisOutputs> {
  return createNode("lib.nlp.SentimentAnalysis", inputs as Record<string, unknown>, { outputNames: ["score", "comparative", "positive_words", "negative_words"] });
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

export function tokenize(inputs: TokenizeInputs): DslNode<TokenizeOutputs> {
  return createNode("lib.nlp.Tokenize", inputs as Record<string, unknown>, { outputNames: ["output", "count"] });
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

export function stem(inputs: StemInputs): DslNode<StemOutputs> {
  return createNode("lib.nlp.Stem", inputs as Record<string, unknown>, { outputNames: ["output", "tokens"] });
}

// TF-IDF — lib.nlp.TfIdf
export interface TfIdfInputs {
  documents?: Connectable<unknown[]>;
  query?: Connectable<string>;
}

export interface TfIdfOutputs {
  output: unknown[];
}

export function tfIdf(inputs: TfIdfInputs): DslNode<TfIdfOutputs, "output"> {
  return createNode("lib.nlp.TfIdf", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
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

export function classifyText(inputs: ClassifyTextInputs): DslNode<ClassifyTextOutputs> {
  return createNode("lib.nlp.ClassifyText", inputs as Record<string, unknown>, { outputNames: ["output", "classifications"] });
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

export function extractEntities(inputs: ExtractEntitiesInputs): DslNode<ExtractEntitiesOutputs> {
  return createNode("lib.nlp.ExtractEntities", inputs as Record<string, unknown>, { outputNames: ["people", "places", "organizations", "numbers", "nouns", "verbs"] });
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

export function phoneticMatch(inputs: PhoneticMatchInputs): DslNode<PhoneticMatchOutputs> {
  return createNode("lib.nlp.PhoneticMatch", inputs as Record<string, unknown>, { outputNames: ["output", "tokens"] });
}
