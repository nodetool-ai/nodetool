// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput, OutputHandle } from "../core.js";
import type { AudioRef, TextRef, FolderRef } from "../types.js";

// To String — nodetool.text.ToString
export interface ToStringInputs {
  value?: Connectable<unknown>;
  mode?: Connectable<unknown>;
}

export function toString_(inputs: ToStringInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.text.ToString", inputs as Record<string, unknown>);
}

// Concatenate Text — nodetool.text.Concat
export interface ConcatInputs {
  a?: Connectable<string>;
  b?: Connectable<string>;
}

export function concat(inputs: ConcatInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.text.Concat", inputs as Record<string, unknown>);
}

// Join — nodetool.text.Join
export interface JoinInputs {
  strings?: Connectable<unknown[]>;
  separator?: Connectable<string>;
}

export function join(inputs: JoinInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.text.Join", inputs as Record<string, unknown>);
}

// Replace Text — nodetool.text.Replace
export interface ReplaceInputs {
  text?: Connectable<string>;
  old?: Connectable<string>;
  new?: Connectable<string>;
}

export function replace(inputs: ReplaceInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.text.Replace", inputs as Record<string, unknown>);
}

// Collect — nodetool.text.Collect
export interface CollectInputs {
  input_item?: Connectable<string>;
  separator?: Connectable<string>;
}

export function collect(inputs: CollectInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.text.Collect", inputs as Record<string, unknown>);
}

// Format Text — nodetool.text.FormatText
export interface FormatTextInputs {
  template?: Connectable<string>;
}

export function formatText(inputs: FormatTextInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.text.FormatText", inputs as Record<string, unknown>);
}

// Template — nodetool.text.Template
export interface TemplateInputs {
  string?: Connectable<string>;
  values?: Connectable<unknown>;
}

export function template(inputs: TemplateInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.text.Template", inputs as Record<string, unknown>);
}

// Split Text — nodetool.text.Split
export interface SplitInputs {
  text?: Connectable<string>;
  delimiter?: Connectable<string>;
}

export function split(inputs: SplitInputs): DslNode<SingleOutput<string[]>> {
  return createNode("nodetool.text.Split", inputs as Record<string, unknown>);
}

// Extract Text — nodetool.text.Extract
export interface ExtractInputs {
  text?: Connectable<string>;
  start?: Connectable<number>;
  end?: Connectable<number>;
}

export function extract(inputs: ExtractInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.text.Extract", inputs as Record<string, unknown>);
}

// Split Text into Chunks — nodetool.text.Chunk
export interface ChunkInputs {
  text?: Connectable<string>;
  length?: Connectable<number>;
  overlap?: Connectable<number>;
  separator?: Connectable<string>;
}

export function chunk(inputs: ChunkInputs): DslNode<SingleOutput<string[]>> {
  return createNode("nodetool.text.Chunk", inputs as Record<string, unknown>);
}

// Extract Regex Groups — nodetool.text.ExtractRegex
export interface ExtractRegexInputs {
  text?: Connectable<string>;
  regex?: Connectable<string>;
  dotall?: Connectable<boolean>;
  ignorecase?: Connectable<boolean>;
  multiline?: Connectable<boolean>;
}

export function extractRegex(inputs: ExtractRegexInputs): DslNode<SingleOutput<string[]>> {
  return createNode("nodetool.text.ExtractRegex", inputs as Record<string, unknown>);
}

// Find All Regex Matches — nodetool.text.FindAllRegex
export interface FindAllRegexInputs {
  text?: Connectable<string>;
  regex?: Connectable<string>;
  dotall?: Connectable<boolean>;
  ignorecase?: Connectable<boolean>;
  multiline?: Connectable<boolean>;
}

export function findAllRegex(inputs: FindAllRegexInputs): DslNode<SingleOutput<string[]>> {
  return createNode("nodetool.text.FindAllRegex", inputs as Record<string, unknown>);
}

// Parse JSON String — nodetool.text.ParseJSON
export interface ParseJSONInputs {
  text?: Connectable<string>;
}

export function parseJSON(inputs: ParseJSONInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.text.ParseJSON", inputs as Record<string, unknown>);
}

// Extract JSON — nodetool.text.ExtractJSON
export interface ExtractJSONInputs {
  text?: Connectable<string>;
  json_path?: Connectable<string>;
  find_all?: Connectable<boolean>;
}

export function extractJSON(inputs: ExtractJSONInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.text.ExtractJSON", inputs as Record<string, unknown>);
}

// Find Regex Matches — nodetool.text.RegexMatch
export interface RegexMatchInputs {
  text?: Connectable<string>;
  pattern?: Connectable<string>;
  group?: Connectable<number>;
}

export function regexMatch(inputs: RegexMatchInputs): DslNode<SingleOutput<string[]>> {
  return createNode("nodetool.text.RegexMatch", inputs as Record<string, unknown>);
}

// Replace with Regex — nodetool.text.RegexReplace
export interface RegexReplaceInputs {
  text?: Connectable<string>;
  pattern?: Connectable<string>;
  replacement?: Connectable<string>;
  count?: Connectable<number>;
}

export function regexReplace(inputs: RegexReplaceInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.text.RegexReplace", inputs as Record<string, unknown>);
}

// Split with Regex — nodetool.text.RegexSplit
export interface RegexSplitInputs {
  text?: Connectable<string>;
  pattern?: Connectable<string>;
  maxsplit?: Connectable<number>;
}

export function regexSplit(inputs: RegexSplitInputs): DslNode<SingleOutput<string[]>> {
  return createNode("nodetool.text.RegexSplit", inputs as Record<string, unknown>);
}

// Validate with Regex — nodetool.text.RegexValidate
export interface RegexValidateInputs {
  text?: Connectable<string>;
  pattern?: Connectable<string>;
}

export function regexValidate(inputs: RegexValidateInputs): DslNode<SingleOutput<boolean>> {
  return createNode("nodetool.text.RegexValidate", inputs as Record<string, unknown>);
}

// Compare Text — nodetool.text.Compare
export interface CompareInputs {
  text_a?: Connectable<string>;
  text_b?: Connectable<string>;
  case_sensitive?: Connectable<boolean>;
  trim_whitespace?: Connectable<boolean>;
}

export function compare(inputs: CompareInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.text.Compare", inputs as Record<string, unknown>);
}

// Equals — nodetool.text.Equals
export interface EqualsInputs {
  text_a?: Connectable<string>;
  text_b?: Connectable<string>;
  case_sensitive?: Connectable<boolean>;
  trim_whitespace?: Connectable<boolean>;
}

export function equals(inputs: EqualsInputs): DslNode<SingleOutput<boolean>> {
  return createNode("nodetool.text.Equals", inputs as Record<string, unknown>);
}

// To Uppercase — nodetool.text.ToUppercase
export interface ToUppercaseInputs {
  text?: Connectable<string>;
}

export function toUppercase(inputs: ToUppercaseInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.text.ToUppercase", inputs as Record<string, unknown>);
}

// To Lowercase — nodetool.text.ToLowercase
export interface ToLowercaseInputs {
  text?: Connectable<string>;
}

export function toLowercase(inputs: ToLowercaseInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.text.ToLowercase", inputs as Record<string, unknown>);
}

// To Title Case — nodetool.text.ToTitlecase
export interface ToTitlecaseInputs {
  text?: Connectable<string>;
}

export function toTitlecase(inputs: ToTitlecaseInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.text.ToTitlecase", inputs as Record<string, unknown>);
}

// Capitalize Text — nodetool.text.CapitalizeText
export interface CapitalizeTextInputs {
  text?: Connectable<string>;
}

export function capitalizeText(inputs: CapitalizeTextInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.text.CapitalizeText", inputs as Record<string, unknown>);
}

// Slice Text — nodetool.text.Slice
export interface SliceInputs {
  text?: Connectable<string>;
  start?: Connectable<number>;
  stop?: Connectable<number>;
  step?: Connectable<number>;
}

export function slice(inputs: SliceInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.text.Slice", inputs as Record<string, unknown>);
}

// Starts With — nodetool.text.StartsWith
export interface StartsWithInputs {
  text?: Connectable<string>;
  prefix?: Connectable<string>;
}

export function startsWith(inputs: StartsWithInputs): DslNode<SingleOutput<boolean>> {
  return createNode("nodetool.text.StartsWith", inputs as Record<string, unknown>);
}

// Ends With — nodetool.text.EndsWith
export interface EndsWithInputs {
  text?: Connectable<string>;
  suffix?: Connectable<string>;
}

export function endsWith(inputs: EndsWithInputs): DslNode<SingleOutput<boolean>> {
  return createNode("nodetool.text.EndsWith", inputs as Record<string, unknown>);
}

// Contains Text — nodetool.text.Contains
export interface ContainsInputs {
  text?: Connectable<string>;
  substring?: Connectable<string>;
  search_values?: Connectable<string[]>;
  case_sensitive?: Connectable<boolean>;
  match_mode?: Connectable<unknown>;
}

export function contains(inputs: ContainsInputs): DslNode<SingleOutput<boolean>> {
  return createNode("nodetool.text.Contains", inputs as Record<string, unknown>);
}

// Trim Whitespace — nodetool.text.TrimWhitespace
export interface TrimWhitespaceInputs {
  text?: Connectable<string>;
  trim_start?: Connectable<boolean>;
  trim_end?: Connectable<boolean>;
}

export function trimWhitespace(inputs: TrimWhitespaceInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.text.TrimWhitespace", inputs as Record<string, unknown>);
}

// Collapse Whitespace — nodetool.text.CollapseWhitespace
export interface CollapseWhitespaceInputs {
  text?: Connectable<string>;
  preserve_newlines?: Connectable<boolean>;
  replacement?: Connectable<string>;
  trim_edges?: Connectable<boolean>;
}

export function collapseWhitespace(inputs: CollapseWhitespaceInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.text.CollapseWhitespace", inputs as Record<string, unknown>);
}

// Is Empty — nodetool.text.IsEmpty
export interface IsEmptyInputs {
  text?: Connectable<string>;
  trim_whitespace?: Connectable<boolean>;
}

export function isEmpty(inputs: IsEmptyInputs): DslNode<SingleOutput<boolean>> {
  return createNode("nodetool.text.IsEmpty", inputs as Record<string, unknown>);
}

// Remove Punctuation — nodetool.text.RemovePunctuation
export interface RemovePunctuationInputs {
  text?: Connectable<string>;
  replacement?: Connectable<string>;
  punctuation?: Connectable<string>;
}

export function removePunctuation(inputs: RemovePunctuationInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.text.RemovePunctuation", inputs as Record<string, unknown>);
}

// Strip Accents — nodetool.text.StripAccents
export interface StripAccentsInputs {
  text?: Connectable<string>;
  preserve_non_ascii?: Connectable<boolean>;
}

export function stripAccents(inputs: StripAccentsInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.text.StripAccents", inputs as Record<string, unknown>);
}

// Slugify — nodetool.text.Slugify
export interface SlugifyInputs {
  text?: Connectable<string>;
  separator?: Connectable<string>;
  lowercase?: Connectable<boolean>;
  allow_unicode?: Connectable<boolean>;
}

export function slugify(inputs: SlugifyInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.text.Slugify", inputs as Record<string, unknown>);
}

// Check Length — nodetool.text.HasLength
export interface HasLengthInputs {
  text?: Connectable<string>;
  min_length?: Connectable<number>;
  max_length?: Connectable<number>;
  exact_length?: Connectable<number>;
}

export function hasLength(inputs: HasLengthInputs): DslNode<SingleOutput<boolean>> {
  return createNode("nodetool.text.HasLength", inputs as Record<string, unknown>);
}

// Truncate Text — nodetool.text.TruncateText
export interface TruncateTextInputs {
  text?: Connectable<string>;
  max_length?: Connectable<number>;
  ellipsis?: Connectable<string>;
}

export function truncateText(inputs: TruncateTextInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.text.TruncateText", inputs as Record<string, unknown>);
}

// Pad Text — nodetool.text.PadText
export interface PadTextInputs {
  text?: Connectable<string>;
  length?: Connectable<number>;
  pad_character?: Connectable<string>;
  direction?: Connectable<unknown>;
}

export function padText(inputs: PadTextInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.text.PadText", inputs as Record<string, unknown>);
}

// Measure Length — nodetool.text.Length
export interface LengthInputs {
  text?: Connectable<string>;
  measure?: Connectable<unknown>;
  trim_whitespace?: Connectable<boolean>;
}

export function length(inputs: LengthInputs): DslNode<SingleOutput<number>> {
  return createNode("nodetool.text.Length", inputs as Record<string, unknown>);
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

export function indexOf(inputs: IndexOfInputs): DslNode<SingleOutput<number>> {
  return createNode("nodetool.text.IndexOf", inputs as Record<string, unknown>);
}

// Surround With — nodetool.text.SurroundWith
export interface SurroundWithInputs {
  text?: Connectable<string>;
  prefix?: Connectable<string>;
  suffix?: Connectable<string>;
  skip_if_wrapped?: Connectable<boolean>;
}

export function surroundWith(inputs: SurroundWithInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.text.SurroundWith", inputs as Record<string, unknown>);
}

// Count Tokens — nodetool.text.CountTokens
export interface CountTokensInputs {
  text?: Connectable<string>;
  encoding?: Connectable<unknown>;
}

export function countTokens(inputs: CountTokensInputs): DslNode<SingleOutput<number>> {
  return createNode("nodetool.text.CountTokens", inputs as Record<string, unknown>);
}

// HTML to Text — nodetool.text.HtmlToText
export interface HtmlToTextInputs {
  html?: Connectable<string>;
  base_url?: Connectable<string>;
  body_width?: Connectable<number>;
  ignore_images?: Connectable<boolean>;
  ignore_mailto_links?: Connectable<boolean>;
}

export function htmlToText(inputs: HtmlToTextInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.text.HtmlToText", inputs as Record<string, unknown>);
}

// Automatic Speech Recognition — nodetool.text.AutomaticSpeechRecognition
export interface AutomaticSpeechRecognitionInputs {
  model?: Connectable<unknown>;
  audio?: Connectable<AudioRef>;
}

export interface AutomaticSpeechRecognitionOutputs {
  text: OutputHandle<string>;
}

export function automaticSpeechRecognition(inputs: AutomaticSpeechRecognitionInputs): DslNode<AutomaticSpeechRecognitionOutputs> {
  return createNode("nodetool.text.AutomaticSpeechRecognition", inputs as Record<string, unknown>, { multiOutput: true });
}

// Embedding — nodetool.text.Embedding
export interface EmbeddingInputs {
  model?: Connectable<unknown>;
  input?: Connectable<string>;
  chunk_size?: Connectable<number>;
}

export function embedding(inputs: EmbeddingInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.text.Embedding", inputs as Record<string, unknown>);
}

// Save Text File — nodetool.text.SaveTextFile
export interface SaveTextFileInputs {
  text?: Connectable<string>;
  folder?: Connectable<string>;
  name?: Connectable<string>;
}

export function saveTextFile(inputs: SaveTextFileInputs): DslNode<SingleOutput<TextRef>> {
  return createNode("nodetool.text.SaveTextFile", inputs as Record<string, unknown>);
}

// Save Text — nodetool.text.SaveText
export interface SaveTextInputs {
  text?: Connectable<string>;
  folder?: Connectable<FolderRef>;
  name?: Connectable<string>;
}

export function saveText(inputs: SaveTextInputs): DslNode<SingleOutput<TextRef>> {
  return createNode("nodetool.text.SaveText", inputs as Record<string, unknown>);
}

// Load Text Folder — nodetool.text.LoadTextFolder
export interface LoadTextFolderInputs {
  folder?: Connectable<string>;
  include_subdirectories?: Connectable<boolean>;
  extensions?: Connectable<string[]>;
  pattern?: Connectable<string>;
}

export interface LoadTextFolderOutputs {
  text: OutputHandle<string>;
  path: OutputHandle<string>;
}

export function loadTextFolder(inputs: LoadTextFolderInputs): DslNode<LoadTextFolderOutputs> {
  return createNode("nodetool.text.LoadTextFolder", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Load Text Assets — nodetool.text.LoadTextAssets
export interface LoadTextAssetsInputs {
  folder?: Connectable<FolderRef>;
}

export interface LoadTextAssetsOutputs {
  text: OutputHandle<TextRef>;
  name: OutputHandle<string>;
}

export function loadTextAssets(inputs: LoadTextAssetsInputs): DslNode<LoadTextAssetsOutputs> {
  return createNode("nodetool.text.LoadTextAssets", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Filter String — nodetool.text.FilterString
export interface FilterStringInputs {
  value?: Connectable<string>;
  filter_type?: Connectable<unknown>;
  criteria?: Connectable<string>;
}

export function filterString(inputs: FilterStringInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.text.FilterString", inputs as Record<string, unknown>, { streaming: true });
}

// Filter Regex String — nodetool.text.FilterRegexString
export interface FilterRegexStringInputs {
  value?: Connectable<string>;
  pattern?: Connectable<string>;
  full_match?: Connectable<boolean>;
}

export function filterRegexString(inputs: FilterRegexStringInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.text.FilterRegexString", inputs as Record<string, unknown>, { streaming: true });
}
