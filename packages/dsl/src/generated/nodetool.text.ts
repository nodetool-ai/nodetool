// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { AudioRef, TextRef, FolderRef } from "../types.js";

// Split Text — nodetool.text.Split
export interface SplitInputs {
  text?: Connectable<string>;
  delimiter?: Connectable<string>;
}

export interface SplitOutputs {
  output: string[];
}

export function split(inputs: SplitInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SplitOutputs, "output"> {
  return createNode("nodetool.text.Split", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Extract Text — nodetool.text.Extract
export interface ExtractInputs {
  text?: Connectable<string>;
  start?: Connectable<number>;
  end?: Connectable<number>;
}

export interface ExtractOutputs {
  output: string;
}

export function extract(inputs: ExtractInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExtractOutputs, "output"> {
  return createNode("nodetool.text.Extract", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Split Text into Chunks — nodetool.text.Chunk
export interface ChunkInputs {
  text?: Connectable<string>;
  length?: Connectable<number>;
  overlap?: Connectable<number>;
  separator?: Connectable<string>;
}

export interface ChunkOutputs {
  output: string[];
}

export function chunk(inputs: ChunkInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ChunkOutputs, "output"> {
  return createNode("nodetool.text.Chunk", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Extract Regex Groups — nodetool.text.ExtractRegex
export interface ExtractRegexInputs {
  text?: Connectable<string>;
  regex?: Connectable<string>;
  dotall?: Connectable<boolean>;
  ignorecase?: Connectable<boolean>;
  multiline?: Connectable<boolean>;
}

export interface ExtractRegexOutputs {
  output: string[];
}

export function extractRegex(inputs: ExtractRegexInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExtractRegexOutputs, "output"> {
  return createNode("nodetool.text.ExtractRegex", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Find All Regex Matches — nodetool.text.FindAllRegex
export interface FindAllRegexInputs {
  text?: Connectable<string>;
  regex?: Connectable<string>;
  dotall?: Connectable<boolean>;
  ignorecase?: Connectable<boolean>;
  multiline?: Connectable<boolean>;
}

export interface FindAllRegexOutputs {
  output: string[];
}

export function findAllRegex(inputs: FindAllRegexInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<FindAllRegexOutputs, "output"> {
  return createNode("nodetool.text.FindAllRegex", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Parse JSON String — nodetool.text.ParseJSON
export interface ParseJSONInputs {
  text?: Connectable<string>;
}

export interface ParseJSONOutputs {
  output: unknown;
}

export function parseJSON(inputs: ParseJSONInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ParseJSONOutputs, "output"> {
  return createNode("nodetool.text.ParseJSON", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Extract JSON — nodetool.text.ExtractJSON
export interface ExtractJSONInputs {
  text?: Connectable<string>;
  json_path?: Connectable<string>;
  find_all?: Connectable<boolean>;
}

export interface ExtractJSONOutputs {
  output: unknown;
}

export function extractJSON(inputs: ExtractJSONInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExtractJSONOutputs, "output"> {
  return createNode("nodetool.text.ExtractJSON", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Find Regex Matches — nodetool.text.RegexMatch
export interface RegexMatchInputs {
  text?: Connectable<string>;
  pattern?: Connectable<string>;
  group?: Connectable<number>;
}

export interface RegexMatchOutputs {
  output: string[];
}

export function regexMatch(inputs: RegexMatchInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<RegexMatchOutputs, "output"> {
  return createNode("nodetool.text.RegexMatch", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Replace with Regex — nodetool.text.RegexReplace
export interface RegexReplaceInputs {
  text?: Connectable<string>;
  pattern?: Connectable<string>;
  replacement?: Connectable<string>;
  count?: Connectable<number>;
}

export interface RegexReplaceOutputs {
  output: string;
}

export function regexReplace(inputs: RegexReplaceInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<RegexReplaceOutputs, "output"> {
  return createNode("nodetool.text.RegexReplace", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Split with Regex — nodetool.text.RegexSplit
export interface RegexSplitInputs {
  text?: Connectable<string>;
  pattern?: Connectable<string>;
  maxsplit?: Connectable<number>;
}

export interface RegexSplitOutputs {
  output: string[];
}

export function regexSplit(inputs: RegexSplitInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<RegexSplitOutputs, "output"> {
  return createNode("nodetool.text.RegexSplit", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Validate with Regex — nodetool.text.RegexValidate
export interface RegexValidateInputs {
  text?: Connectable<string>;
  pattern?: Connectable<string>;
}

export interface RegexValidateOutputs {
  output: boolean;
}

export function regexValidate(inputs: RegexValidateInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<RegexValidateOutputs, "output"> {
  return createNode("nodetool.text.RegexValidate", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Compare Text — nodetool.text.Compare
export interface CompareInputs {
  text_a?: Connectable<string>;
  text_b?: Connectable<string>;
  case_sensitive?: Connectable<boolean>;
  trim_whitespace?: Connectable<boolean>;
}

export interface CompareOutputs {
  output: string;
}

export function compare(inputs: CompareInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<CompareOutputs, "output"> {
  return createNode("nodetool.text.Compare", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Equals — nodetool.text.Equals
export interface EqualsInputs {
  text_a?: Connectable<string>;
  text_b?: Connectable<string>;
  case_sensitive?: Connectable<boolean>;
  trim_whitespace?: Connectable<boolean>;
}

export interface EqualsOutputs {
  output: boolean;
}

export function equals(inputs: EqualsInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<EqualsOutputs, "output"> {
  return createNode("nodetool.text.Equals", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// To Uppercase — nodetool.text.ToUppercase
export interface ToUppercaseInputs {
  text?: Connectable<string>;
}

export interface ToUppercaseOutputs {
  output: string;
}

export function toUppercase(inputs: ToUppercaseInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ToUppercaseOutputs, "output"> {
  return createNode("nodetool.text.ToUppercase", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// To Lowercase — nodetool.text.ToLowercase
export interface ToLowercaseInputs {
  text?: Connectable<string>;
}

export interface ToLowercaseOutputs {
  output: string;
}

export function toLowercase(inputs: ToLowercaseInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ToLowercaseOutputs, "output"> {
  return createNode("nodetool.text.ToLowercase", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// To Title Case — nodetool.text.ToTitlecase
export interface ToTitlecaseInputs {
  text?: Connectable<string>;
}

export interface ToTitlecaseOutputs {
  output: string;
}

export function toTitlecase(inputs: ToTitlecaseInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ToTitlecaseOutputs, "output"> {
  return createNode("nodetool.text.ToTitlecase", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Capitalize Text — nodetool.text.CapitalizeText
export interface CapitalizeTextInputs {
  text?: Connectable<string>;
}

export interface CapitalizeTextOutputs {
  output: string;
}

export function capitalizeText(inputs: CapitalizeTextInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<CapitalizeTextOutputs, "output"> {
  return createNode("nodetool.text.CapitalizeText", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Slice Text — nodetool.text.Slice
export interface SliceInputs {
  text?: Connectable<string>;
  start?: Connectable<number>;
  stop?: Connectable<number>;
  step?: Connectable<number>;
}

export interface SliceOutputs {
  output: string;
}

export function slice(inputs: SliceInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SliceOutputs, "output"> {
  return createNode("nodetool.text.Slice", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Starts With — nodetool.text.StartsWith
export interface StartsWithInputs {
  text?: Connectable<string>;
  prefix?: Connectable<string>;
}

export interface StartsWithOutputs {
  output: boolean;
}

export function startsWith(inputs: StartsWithInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<StartsWithOutputs, "output"> {
  return createNode("nodetool.text.StartsWith", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Ends With — nodetool.text.EndsWith
export interface EndsWithInputs {
  text?: Connectable<string>;
  suffix?: Connectable<string>;
}

export interface EndsWithOutputs {
  output: boolean;
}

export function endsWith(inputs: EndsWithInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<EndsWithOutputs, "output"> {
  return createNode("nodetool.text.EndsWith", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Contains Text — nodetool.text.Contains
export interface ContainsInputs {
  text?: Connectable<string>;
  substring?: Connectable<string>;
  search_values?: Connectable<string[]>;
  case_sensitive?: Connectable<boolean>;
  match_mode?: Connectable<"any" | "all" | "none">;
}

export interface ContainsOutputs {
  output: boolean;
}

export function contains(inputs: ContainsInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ContainsOutputs, "output"> {
  return createNode("nodetool.text.Contains", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Trim Whitespace — nodetool.text.TrimWhitespace
export interface TrimWhitespaceInputs {
  text?: Connectable<string>;
  trim_start?: Connectable<boolean>;
  trim_end?: Connectable<boolean>;
}

export interface TrimWhitespaceOutputs {
  output: string;
}

export function trimWhitespace(inputs: TrimWhitespaceInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<TrimWhitespaceOutputs, "output"> {
  return createNode("nodetool.text.TrimWhitespace", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Collapse Whitespace — nodetool.text.CollapseWhitespace
export interface CollapseWhitespaceInputs {
  text?: Connectable<string>;
  preserve_newlines?: Connectable<boolean>;
  replacement?: Connectable<string>;
  trim_edges?: Connectable<boolean>;
}

export interface CollapseWhitespaceOutputs {
  output: string;
}

export function collapseWhitespace(inputs: CollapseWhitespaceInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<CollapseWhitespaceOutputs, "output"> {
  return createNode("nodetool.text.CollapseWhitespace", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Is Empty — nodetool.text.IsEmpty
export interface IsEmptyInputs {
  text?: Connectable<string>;
  trim_whitespace?: Connectable<boolean>;
}

export interface IsEmptyOutputs {
  output: boolean;
}

export function isEmpty(inputs: IsEmptyInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<IsEmptyOutputs, "output"> {
  return createNode("nodetool.text.IsEmpty", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Remove Punctuation — nodetool.text.RemovePunctuation
export interface RemovePunctuationInputs {
  text?: Connectable<string>;
  replacement?: Connectable<string>;
  punctuation?: Connectable<string>;
}

export interface RemovePunctuationOutputs {
  output: string;
}

export function removePunctuation(inputs: RemovePunctuationInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<RemovePunctuationOutputs, "output"> {
  return createNode("nodetool.text.RemovePunctuation", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Strip Accents — nodetool.text.StripAccents
export interface StripAccentsInputs {
  text?: Connectable<string>;
  preserve_non_ascii?: Connectable<boolean>;
}

export interface StripAccentsOutputs {
  output: string;
}

export function stripAccents(inputs: StripAccentsInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<StripAccentsOutputs, "output"> {
  return createNode("nodetool.text.StripAccents", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Slugify — nodetool.text.Slugify
export interface SlugifyInputs {
  text?: Connectable<string>;
  separator?: Connectable<string>;
  lowercase?: Connectable<boolean>;
  allow_unicode?: Connectable<boolean>;
}

export interface SlugifyOutputs {
  output: string;
}

export function slugify(inputs: SlugifyInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SlugifyOutputs, "output"> {
  return createNode("nodetool.text.Slugify", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Check Length — nodetool.text.HasLength
export interface HasLengthInputs {
  text?: Connectable<string>;
  min_length?: Connectable<number>;
  max_length?: Connectable<number>;
  exact_length?: Connectable<number>;
}

export interface HasLengthOutputs {
  output: boolean;
}

export function hasLength(inputs: HasLengthInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<HasLengthOutputs, "output"> {
  return createNode("nodetool.text.HasLength", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Truncate Text — nodetool.text.TruncateText
export interface TruncateTextInputs {
  text?: Connectable<string>;
  max_length?: Connectable<number>;
  ellipsis?: Connectable<string>;
}

export interface TruncateTextOutputs {
  output: string;
}

export function truncateText(inputs: TruncateTextInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<TruncateTextOutputs, "output"> {
  return createNode("nodetool.text.TruncateText", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Pad Text — nodetool.text.PadText
export interface PadTextInputs {
  text?: Connectable<string>;
  length?: Connectable<number>;
  pad_character?: Connectable<string>;
  direction?: Connectable<"left" | "right" | "both">;
}

export interface PadTextOutputs {
  output: string;
}

export function padText(inputs: PadTextInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<PadTextOutputs, "output"> {
  return createNode("nodetool.text.PadText", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Measure Length — nodetool.text.Length
export interface LengthInputs {
  text?: Connectable<string>;
  measure?: Connectable<"characters" | "words" | "lines">;
  trim_whitespace?: Connectable<boolean>;
}

export interface LengthOutputs {
  output: number;
}

export function length(inputs: LengthInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<LengthOutputs, "output"> {
  return createNode("nodetool.text.Length", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Index Of — nodetool.text.IndexOf
export interface IndexOfInputs {
  text?: Connectable<string>;
  substring?: Connectable<string>;
  case_sensitive?: Connectable<boolean>;
  start_index?: Connectable<number>;
  end_index?: Connectable<number>;
  search_from_end?: Connectable<boolean>;
}

export interface IndexOfOutputs {
  output: number;
}

export function indexOf(inputs: IndexOfInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<IndexOfOutputs, "output"> {
  return createNode("nodetool.text.IndexOf", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Surround With — nodetool.text.SurroundWith
export interface SurroundWithInputs {
  text?: Connectable<string>;
  prefix?: Connectable<string>;
  suffix?: Connectable<string>;
  skip_if_wrapped?: Connectable<boolean>;
}

export interface SurroundWithOutputs {
  output: string;
}

export function surroundWith(inputs: SurroundWithInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SurroundWithOutputs, "output"> {
  return createNode("nodetool.text.SurroundWith", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Count Tokens — nodetool.text.CountTokens
export interface CountTokensInputs {
  text?: Connectable<string>;
  encoding?: Connectable<"cl100k_base" | "p50k_base" | "r50k_base">;
}

export interface CountTokensOutputs {
  output: number;
}

export function countTokens(inputs: CountTokensInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<CountTokensOutputs, "output"> {
  return createNode("nodetool.text.CountTokens", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// HTML to Text — nodetool.text.HtmlToText
export interface HtmlToTextInputs {
  html?: Connectable<string>;
  base_url?: Connectable<string>;
  body_width?: Connectable<number>;
  ignore_images?: Connectable<boolean>;
  ignore_mailto_links?: Connectable<boolean>;
}

export interface HtmlToTextOutputs {
  output: string;
}

export function htmlToText(inputs: HtmlToTextInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<HtmlToTextOutputs, "output"> {
  return createNode("nodetool.text.HtmlToText", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Automatic Speech Recognition — nodetool.text.AutomaticSpeechRecognition
export interface AutomaticSpeechRecognitionInputs {
  model?: Connectable<unknown>;
  audio?: Connectable<AudioRef>;
}

export interface AutomaticSpeechRecognitionOutputs {
  text: string;
}

export function automaticSpeechRecognition(inputs: AutomaticSpeechRecognitionInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<AutomaticSpeechRecognitionOutputs, "text"> {
  return createNode("nodetool.text.AutomaticSpeechRecognition", inputs as Record<string, unknown>, { outputNames: ["text"], defaultOutput: "text", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Embedding — nodetool.text.Embedding
export interface EmbeddingInputs {
  model?: Connectable<unknown>;
  input?: Connectable<string>;
  chunk_size?: Connectable<number>;
}

export interface EmbeddingOutputs {
  output: unknown[];
}

export function embedding(inputs: EmbeddingInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<EmbeddingOutputs, "output"> {
  return createNode("nodetool.text.Embedding", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Save Text File — nodetool.text.SaveTextFile
export interface SaveTextFileInputs {
  text?: Connectable<string>;
  folder?: Connectable<string>;
  name?: Connectable<string>;
}

export interface SaveTextFileOutputs {
  output: TextRef;
}

export function saveTextFile(inputs: SaveTextFileInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SaveTextFileOutputs, "output"> {
  return createNode("nodetool.text.SaveTextFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Save Text — nodetool.text.SaveText
export interface SaveTextInputs {
  text?: Connectable<string>;
  folder?: Connectable<FolderRef>;
  name?: Connectable<string>;
}

export interface SaveTextOutputs {
  output: TextRef;
}

export function saveText(inputs: SaveTextInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SaveTextOutputs, "output"> {
  return createNode("nodetool.text.SaveText", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Load Text Folder — nodetool.text.LoadTextFolder
export interface LoadTextFolderInputs {
  folder?: Connectable<string>;
  include_subdirectories?: Connectable<boolean>;
  extensions?: Connectable<string[]>;
  pattern?: Connectable<string>;
}

export interface LoadTextFolderOutputs {
  text: string;
  path: string;
  texts: unknown[];
  paths: unknown[];
}

export function loadTextFolder(inputs: LoadTextFolderInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<LoadTextFolderOutputs> {
  return createNode("nodetool.text.LoadTextFolder", inputs as Record<string, unknown>, { outputNames: ["text", "path", "texts", "paths"], streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Load Text Assets — nodetool.text.LoadTextAssets
export interface LoadTextAssetsInputs {
  folder?: Connectable<FolderRef>;
}

export interface LoadTextAssetsOutputs {
  text: TextRef;
  name: string;
  texts: unknown[];
  names: unknown[];
}

export function loadTextAssets(inputs: LoadTextAssetsInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<LoadTextAssetsOutputs> {
  return createNode("nodetool.text.LoadTextAssets", inputs as Record<string, unknown>, { outputNames: ["text", "name", "texts", "names"], streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Filter String — nodetool.text.FilterString
export interface FilterStringInputs {
  value?: Connectable<string>;
  filter_type?: Connectable<"contains" | "starts_with" | "ends_with" | "length_greater" | "length_less" | "exact_length">;
  criteria?: Connectable<string>;
}

export interface FilterStringOutputs {
  output: string;
}

export function filterString(inputs: FilterStringInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<FilterStringOutputs, "output"> {
  return createNode("nodetool.text.FilterString", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Filter Regex String — nodetool.text.FilterRegexString
export interface FilterRegexStringInputs {
  value?: Connectable<string>;
  pattern?: Connectable<string>;
  full_match?: Connectable<boolean>;
}

export interface FilterRegexStringOutputs {
  output: string;
}

export function filterRegexString(inputs: FilterRegexStringInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<FilterRegexStringOutputs, "output"> {
  return createNode("nodetool.text.FilterRegexString", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Concatenate Text — nodetool.text.Concat
export interface ConcatInputs {
  a?: Connectable<string>;
  b?: Connectable<string>;
}

export interface ConcatOutputs {
  output: string;
}

export function concat(inputs: ConcatInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ConcatOutputs, "output"> {
  return createNode("nodetool.text.Concat", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Join — nodetool.text.Join
export interface JoinInputs {
  strings?: Connectable<string[]>;
  separator?: Connectable<string>;
}

export interface JoinOutputs {
  output: string;
}

export function join(inputs: JoinInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<JoinOutputs, "output"> {
  return createNode("nodetool.text.Join", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Collect Text — nodetool.text.Collect
export interface CollectInputs {
  input_item?: Connectable<string>;
  separator?: Connectable<string>;
}

export interface CollectOutputs {
  output: string;
}

export function collect(inputs: CollectInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<CollectOutputs, "output"> {
  return createNode("nodetool.text.Collect", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Format Text — nodetool.text.FormatText
export interface FormatTextInputs {
  template?: Connectable<string>;
}

export interface FormatTextOutputs {
  output: string;
}

export function formatText(inputs: FormatTextInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<FormatTextOutputs, "output"> {
  return createNode("nodetool.text.FormatText", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Template — nodetool.text.Template
export interface TemplateInputs {
  string?: Connectable<string>;
}

export interface TemplateOutputs {
  output: string;
}

export function template(inputs: TemplateInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<TemplateOutputs, "output"> {
  return createNode("nodetool.text.Template", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Replace Text — nodetool.text.Replace
export interface ReplaceInputs {
  text?: Connectable<string>;
  old?: Connectable<string>;
  new_value?: Connectable<string>;
}

export interface ReplaceOutputs {
  output: string;
}

export function replace(inputs: ReplaceInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ReplaceOutputs, "output"> {
  return createNode("nodetool.text.Replace", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// To String — nodetool.text.ToString
export interface ToStringInputs {
  value?: Connectable<unknown>;
  mode?: Connectable<"str" | "repr">;
}

export interface ToStringOutputs {
  output: string;
}

export function toString_(inputs: ToStringInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ToStringOutputs, "output"> {
  return createNode("nodetool.text.ToString", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
