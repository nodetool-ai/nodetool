// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
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

export function automaticSpeechRecognition(inputs: AutomaticSpeechRecognitionInputs): DslNode<AutomaticSpeechRecognitionOutputs, "text"> {
  return createNode("nodetool.text.AutomaticSpeechRecognition", inputs, { outputNames: ["text"], defaultOutput: "text" });
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

export function embedding(inputs: EmbeddingInputs): DslNode<EmbeddingOutputs, "output"> {
  return createNode("nodetool.text.Embedding", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Save Text File — nodetool.text.SaveTextFile
export type SaveTextFileInputs = {
  text?: Connectable<string>;
  folder?: Connectable<string>;
  name?: Connectable<string>;
};

export interface SaveTextFileOutputs {
  output: TextRef;
}

export function saveTextFile(inputs: SaveTextFileInputs): DslNode<SaveTextFileOutputs, "output"> {
  return createNode("nodetool.text.SaveTextFile", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function saveText(inputs: SaveTextInputs): DslNode<SaveTextOutputs, "output"> {
  return createNode("nodetool.text.SaveText", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function loadTextFolder(inputs: LoadTextFolderInputs): DslNode<LoadTextFolderOutputs> {
  return createNode("nodetool.text.LoadTextFolder", inputs, { outputNames: ["text", "path", "texts", "paths"], streaming: true });
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

export function loadTextAssets(inputs: LoadTextAssetsInputs): DslNode<LoadTextAssetsOutputs> {
  return createNode("nodetool.text.LoadTextAssets", inputs, { outputNames: ["text", "name", "texts", "names"], streaming: true });
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

export function filterString(inputs: FilterStringInputs): DslNode<FilterStringOutputs, "output"> {
  return createNode("nodetool.text.FilterString", inputs, { outputNames: ["output"], defaultOutput: "output", streaming: true });
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

export function filterRegexString(inputs: FilterRegexStringInputs): DslNode<FilterRegexStringOutputs, "output"> {
  return createNode("nodetool.text.FilterRegexString", inputs, { outputNames: ["output"], defaultOutput: "output", streaming: true });
}

// Concat — nodetool.text.Concat
export type ConcatInputs = {
};

export interface ConcatOutputs {
  output: string;
}

export function concat(inputs?: ConcatInputs): DslNode<ConcatOutputs, "output"> {
  return createNode("nodetool.text.Concat", inputs ?? {}, { outputNames: ["output"], defaultOutput: "output" });
}

// Collect Text — nodetool.text.Collect
export type CollectInputs = {
  input_item?: Connectable<string>;
  separator?: Connectable<string>;
};

export interface CollectOutputs {
  output: string;
}

export function collect(inputs: CollectInputs): DslNode<CollectOutputs, "output"> {
  return createNode("nodetool.text.Collect", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Prompt — nodetool.text.Prompt
export type PromptInputs = {
  prompt?: Connectable<string>;
};

export interface PromptOutputs {
  output: string;
}

export function prompt(inputs: PromptInputs): DslNode<PromptOutputs, "output"> {
  return createNode("nodetool.text.Prompt", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Template — nodetool.text.Template
export type TemplateInputs = {
  string?: Connectable<string>;
};

export interface TemplateOutputs {
  output: string;
}

export function template(inputs: TemplateInputs): DslNode<TemplateOutputs, "output"> {
  return createNode("nodetool.text.Template", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
