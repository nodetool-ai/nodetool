// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { AudioRef, TextRef, FolderRef } from "../types.js";

// Automatic Speech Recognition — nodetool.text.AutomaticSpeechRecognition
export type AutomaticSpeechRecognitionInputs = {
  model?: Connectable<unknown>;
  audio?: Connectable<AudioRef>;
  language?: Connectable<string>;
  prompt?: Connectable<string>;
  temperature?: Connectable<number>;
};

export interface AutomaticSpeechRecognitionOutputs {
  text: string;
}

export function automaticSpeechRecognition(inputs: AutomaticSpeechRecognitionInputs, options?: NodeOptions): NodeWithOutputs<AutomaticSpeechRecognitionOutputs, "text"> {
  return createNode("nodetool.text.AutomaticSpeechRecognition", inputs, { id: options?.id, outputNames: ["text"], outputTypes: {"text":"str"}, defaultOutput: "text" });
}

// Embedding — nodetool.text.Embedding
export type EmbeddingInputs = {
  model?: Connectable<unknown>;
  input?: Connectable<string>;
  chunk_size?: Connectable<number>;
};

export interface EmbeddingOutputs {
  output: unknown[];
}

export function embedding(inputs: EmbeddingInputs, options?: NodeOptions): NodeWithOutputs<EmbeddingOutputs, "output"> {
  return createNode("nodetool.text.Embedding", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"list"}, defaultOutput: "output" });
}

// Rerank — nodetool.text.Rerank
export type RerankInputs = {
  model?: Connectable<unknown>;
  query?: Connectable<string>;
  documents?: Connectable<string[]>;
  top_k?: Connectable<number>;
};

export interface RerankOutputs {
  documents: string[];
  scores: number[];
  indices: number[];
}

export function rerank(inputs: RerankInputs, options?: NodeOptions): NodeWithOutputs<RerankOutputs> {
  return createNode("nodetool.text.Rerank", inputs, { id: options?.id, outputNames: ["documents", "scores", "indices"], outputTypes: {"documents":"list[str]","scores":"list[float]","indices":"list[int]"} });
}

// Save Text File — nodetool.text.SaveTextFile
export type SaveTextFileInputs = {
  text?: Connectable<string>;
  save_to_workspace?: Connectable<boolean>;
  folder?: Connectable<string>;
  name?: Connectable<string>;
};

export interface SaveTextFileOutputs {
  output: TextRef;
}

export function saveTextFile(inputs: SaveTextFileInputs, options?: NodeOptions): NodeWithOutputs<SaveTextFileOutputs, "output"> {
  return createNode("nodetool.text.SaveTextFile", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"text"}, defaultOutput: "output" });
}

// Save Text — nodetool.text.SaveText
export type SaveTextInputs = {
  text?: Connectable<string>;
  folder?: Connectable<FolderRef>;
  name?: Connectable<string>;
};

export interface SaveTextOutputs {
  output: TextRef;
}

export function saveText(inputs: SaveTextInputs, options?: NodeOptions): NodeWithOutputs<SaveTextOutputs, "output"> {
  return createNode("nodetool.text.SaveText", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"text"}, defaultOutput: "output" });
}

// Load Text Folder — nodetool.text.LoadTextFolder
export type LoadTextFolderInputs = {
  folder?: Connectable<string>;
  include_subdirectories?: Connectable<boolean>;
  extensions?: Connectable<string[]>;
  pattern?: Connectable<string>;
};

export interface LoadTextFolderOutputs {
  text: string;
  path: string;
  texts: unknown[];
  paths: unknown[];
}

export function loadTextFolder(inputs: LoadTextFolderInputs, options?: NodeOptions): NodeWithOutputs<LoadTextFolderOutputs> {
  return createNode("nodetool.text.LoadTextFolder", inputs, { id: options?.id, outputNames: ["text", "path", "texts", "paths"], outputTypes: {"text":"str","path":"str","texts":"list","paths":"list"}, streaming: true });
}

// Load Text Assets — nodetool.text.LoadTextAssets
export type LoadTextAssetsInputs = {
  folder?: Connectable<FolderRef>;
};

export interface LoadTextAssetsOutputs {
  text: TextRef;
  name: string;
  texts: unknown[];
  names: unknown[];
}

export function loadTextAssets(inputs: LoadTextAssetsInputs, options?: NodeOptions): NodeWithOutputs<LoadTextAssetsOutputs> {
  return createNode("nodetool.text.LoadTextAssets", inputs, { id: options?.id, outputNames: ["text", "name", "texts", "names"], outputTypes: {"text":"text","name":"str","texts":"list","names":"list"}, streaming: true });
}

// Filter String — nodetool.text.FilterString
export type FilterStringInputs = {
  value?: Connectable<string>;
  filter_type?: Connectable<"contains" | "starts_with" | "ends_with" | "length_greater" | "length_less" | "exact_length">;
  criteria?: Connectable<string>;
};

export interface FilterStringOutputs {
  output: string;
}

export function filterString(inputs: FilterStringInputs, options?: NodeOptions): NodeWithOutputs<FilterStringOutputs, "output"> {
  return createNode("nodetool.text.FilterString", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"str"}, defaultOutput: "output", streaming: true, outputCorrelation: {"output":{"kind":"forward","source":"value"}} });
}

// Filter Regex String — nodetool.text.FilterRegexString
export type FilterRegexStringInputs = {
  value?: Connectable<string>;
  pattern?: Connectable<string>;
  full_match?: Connectable<boolean>;
};

export interface FilterRegexStringOutputs {
  output: string;
}

export function filterRegexString(inputs: FilterRegexStringInputs, options?: NodeOptions): NodeWithOutputs<FilterRegexStringOutputs, "output"> {
  return createNode("nodetool.text.FilterRegexString", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"str"}, defaultOutput: "output", streaming: true, outputCorrelation: {"output":{"kind":"forward","source":"value"}} });
}

// Concat — nodetool.text.Concat
export type ConcatInputs = {
  [name: string]: unknown;
};

export interface ConcatOutputs {
  output: string;
}

export function concat(inputs?: ConcatInputs, options?: NodeOptions): NodeWithOutputs<ConcatOutputs, "output"> {
  return createNode("nodetool.text.Concat", inputs ?? {}, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"str"}, defaultOutput: "output" });
}

// Collect Text — nodetool.text.Collect
export type CollectInputs = {
  input_item?: Connectable<string>;
  separator?: Connectable<string>;
};

export interface CollectOutputs {
  output: string;
}

export function collect(inputs: CollectInputs, options?: NodeOptions): NodeWithOutputs<CollectOutputs, "output"> {
  return createNode("nodetool.text.Collect", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"str"}, defaultOutput: "output" });
}

// Prompt — nodetool.text.Prompt
export type PromptInputs = {
  prompt?: Connectable<string>;
  [name: string]: unknown;
};

export interface PromptOutputs {
  output: string;
}

export function prompt(inputs: PromptInputs, options?: NodeOptions): NodeWithOutputs<PromptOutputs, "output"> {
  return createNode("nodetool.text.Prompt", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"str"}, defaultOutput: "output" });
}

// Template — nodetool.text.Template
export type TemplateInputs = {
  string?: Connectable<string>;
  [name: string]: unknown;
};

export interface TemplateOutputs {
  output: string;
}

export function template(inputs: TemplateInputs, options?: NodeOptions): NodeWithOutputs<TemplateOutputs, "output"> {
  return createNode("nodetool.text.Template", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"str"}, defaultOutput: "output" });
}
