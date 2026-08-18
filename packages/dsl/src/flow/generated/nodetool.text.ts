// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode, streamNode } from "../guest-core.js";
import type { AudioRef, TextRef, FolderRef } from "../../types.js";

// Automatic Speech Recognition — nodetool.text.AutomaticSpeechRecognition
export type AutomaticSpeechRecognitionInputs = {
  model?: unknown;
  audio?: AudioRef;
  language?: string;
  prompt?: string;
  temperature?: number;
};

export interface AutomaticSpeechRecognitionOutputs {
  text: string;
}

export function automaticSpeechRecognition(inputs: AutomaticSpeechRecognitionInputs): Promise<AutomaticSpeechRecognitionOutputs> {
  return callNode<AutomaticSpeechRecognitionOutputs>("nodetool.text.AutomaticSpeechRecognition", inputs);
}

// Embedding — nodetool.text.Embedding
export type EmbeddingInputs = {
  model?: unknown;
  input?: string;
  chunk_size?: number;
};

export interface EmbeddingOutputs {
  output: unknown[];
}

export function embedding(inputs: EmbeddingInputs): Promise<EmbeddingOutputs> {
  return callNode<EmbeddingOutputs>("nodetool.text.Embedding", inputs);
}

// Save Text File — nodetool.text.SaveTextFile
export type SaveTextFileInputs = {
  text?: string;
  folder?: string;
  name?: string;
};

export interface SaveTextFileOutputs {
  output: TextRef;
}

export function saveTextFile(inputs: SaveTextFileInputs): Promise<SaveTextFileOutputs> {
  return callNode<SaveTextFileOutputs>("nodetool.text.SaveTextFile", inputs);
}

// Save Text — nodetool.text.SaveText
export type SaveTextInputs = {
  text?: string;
  folder?: FolderRef;
  name?: string;
};

export interface SaveTextOutputs {
  output: TextRef;
}

export function saveText(inputs: SaveTextInputs): Promise<SaveTextOutputs> {
  return callNode<SaveTextOutputs>("nodetool.text.SaveText", inputs);
}

// Load Text Folder — nodetool.text.LoadTextFolder
export type LoadTextFolderInputs = {
  folder?: string;
  include_subdirectories?: boolean;
  extensions?: string[];
  pattern?: string;
};

export interface LoadTextFolderOutputs {
  text: string;
  path: string;
  texts: unknown[];
  paths: unknown[];
}

export function loadTextFolder(inputs: LoadTextFolderInputs): Promise<LoadTextFolderOutputs> {
  return callNode<LoadTextFolderOutputs>("nodetool.text.LoadTextFolder", inputs);
}

loadTextFolder.stream = function (inputs: LoadTextFolderInputs): AsyncIterable<Partial<LoadTextFolderOutputs>> {
  return streamNode<Partial<LoadTextFolderOutputs>>("nodetool.text.LoadTextFolder", inputs);
};

// Load Text Assets — nodetool.text.LoadTextAssets
export type LoadTextAssetsInputs = {
  folder?: FolderRef;
};

export interface LoadTextAssetsOutputs {
  text: TextRef;
  name: string;
  texts: unknown[];
  names: unknown[];
}

export function loadTextAssets(inputs: LoadTextAssetsInputs): Promise<LoadTextAssetsOutputs> {
  return callNode<LoadTextAssetsOutputs>("nodetool.text.LoadTextAssets", inputs);
}

loadTextAssets.stream = function (inputs: LoadTextAssetsInputs): AsyncIterable<Partial<LoadTextAssetsOutputs>> {
  return streamNode<Partial<LoadTextAssetsOutputs>>("nodetool.text.LoadTextAssets", inputs);
};

// Filter String — nodetool.text.FilterString
export type FilterStringInputs = {
  value?: string;
  filter_type?: "contains" | "starts_with" | "ends_with" | "length_greater" | "length_less" | "exact_length";
  criteria?: string;
};

export interface FilterStringOutputs {
  output: string;
}

export function filterString(inputs: FilterStringInputs): Promise<FilterStringOutputs> {
  return callNode<FilterStringOutputs>("nodetool.text.FilterString", inputs);
}

filterString.stream = function (inputs: FilterStringInputs): AsyncIterable<Partial<FilterStringOutputs>> {
  return streamNode<Partial<FilterStringOutputs>>("nodetool.text.FilterString", inputs);
};

// Filter Regex String — nodetool.text.FilterRegexString
export type FilterRegexStringInputs = {
  value?: string;
  pattern?: string;
  full_match?: boolean;
};

export interface FilterRegexStringOutputs {
  output: string;
}

export function filterRegexString(inputs: FilterRegexStringInputs): Promise<FilterRegexStringOutputs> {
  return callNode<FilterRegexStringOutputs>("nodetool.text.FilterRegexString", inputs);
}

filterRegexString.stream = function (inputs: FilterRegexStringInputs): AsyncIterable<Partial<FilterRegexStringOutputs>> {
  return streamNode<Partial<FilterRegexStringOutputs>>("nodetool.text.FilterRegexString", inputs);
};

// Concat — nodetool.text.Concat
export type ConcatInputs = {
};

export interface ConcatOutputs {
  output: string;
}

export function concat(inputs?: ConcatInputs): Promise<ConcatOutputs> {
  return callNode<ConcatOutputs>("nodetool.text.Concat", inputs ?? {});
}

// Collect Text — nodetool.text.Collect
export type CollectInputs = {
  input_item?: string;
  separator?: string;
};

export interface CollectOutputs {
  output: string;
}

export function collect(inputs: CollectInputs): Promise<CollectOutputs> {
  return callNode<CollectOutputs>("nodetool.text.Collect", inputs);
}

// Prompt — nodetool.text.Prompt
export type PromptInputs = {
  prompt?: string;
};

export interface PromptOutputs {
  output: string;
}

export function prompt(inputs: PromptInputs): Promise<PromptOutputs> {
  return callNode<PromptOutputs>("nodetool.text.Prompt", inputs);
}

// Template — nodetool.text.Template
export type TemplateInputs = {
  string?: string;
};

export interface TemplateOutputs {
  output: string;
}

export function template(inputs: TemplateInputs): Promise<TemplateOutputs> {
  return callNode<TemplateOutputs>("nodetool.text.Template", inputs);
}
