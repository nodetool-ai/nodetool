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

export function split(inputs: SplitInputs): DslNode<SplitOutputs, "output"> {
  return createNode("nodetool.text.Split", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
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

export function extract(
  inputs: ExtractInputs
): DslNode<ExtractOutputs, "output"> {
  return createNode(
    "nodetool.text.Extract",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export function chunk(inputs: ChunkInputs): DslNode<ChunkOutputs, "output"> {
  return createNode("nodetool.text.Chunk", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
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

export function extractRegex(
  inputs: ExtractRegexInputs
): DslNode<ExtractRegexOutputs, "output"> {
  return createNode(
    "nodetool.text.ExtractRegex",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export function findAllRegex(
  inputs: FindAllRegexInputs
): DslNode<FindAllRegexOutputs, "output"> {
  return createNode(
    "nodetool.text.FindAllRegex",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Parse JSON String — nodetool.text.ParseJSON
export interface ParseJSONInputs {
  text?: Connectable<string>;
}

export interface ParseJSONOutputs {
  output: unknown;
}

export function parseJSON(
  inputs: ParseJSONInputs
): DslNode<ParseJSONOutputs, "output"> {
  return createNode(
    "nodetool.text.ParseJSON",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export function extractJSON(
  inputs: ExtractJSONInputs
): DslNode<ExtractJSONOutputs, "output"> {
  return createNode(
    "nodetool.text.ExtractJSON",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export function regexMatch(
  inputs: RegexMatchInputs
): DslNode<RegexMatchOutputs, "output"> {
  return createNode(
    "nodetool.text.RegexMatch",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export function regexReplace(
  inputs: RegexReplaceInputs
): DslNode<RegexReplaceOutputs, "output"> {
  return createNode(
    "nodetool.text.RegexReplace",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export function regexSplit(
  inputs: RegexSplitInputs
): DslNode<RegexSplitOutputs, "output"> {
  return createNode(
    "nodetool.text.RegexSplit",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Validate with Regex — nodetool.text.RegexValidate
export interface RegexValidateInputs {
  text?: Connectable<string>;
  pattern?: Connectable<string>;
}

export interface RegexValidateOutputs {
  output: boolean;
}

export function regexValidate(
  inputs: RegexValidateInputs
): DslNode<RegexValidateOutputs, "output"> {
  return createNode(
    "nodetool.text.RegexValidate",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export function compare(
  inputs: CompareInputs
): DslNode<CompareOutputs, "output"> {
  return createNode(
    "nodetool.text.Compare",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export function equals(inputs: EqualsInputs): DslNode<EqualsOutputs, "output"> {
  return createNode("nodetool.text.Equals", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// To Uppercase — nodetool.text.ToUppercase
export interface ToUppercaseInputs {
  text?: Connectable<string>;
}

export interface ToUppercaseOutputs {
  output: string;
}

export function toUppercase(
  inputs: ToUppercaseInputs
): DslNode<ToUppercaseOutputs, "output"> {
  return createNode(
    "nodetool.text.ToUppercase",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// To Lowercase — nodetool.text.ToLowercase
export interface ToLowercaseInputs {
  text?: Connectable<string>;
}

export interface ToLowercaseOutputs {
  output: string;
}

export function toLowercase(
  inputs: ToLowercaseInputs
): DslNode<ToLowercaseOutputs, "output"> {
  return createNode(
    "nodetool.text.ToLowercase",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// To Title Case — nodetool.text.ToTitlecase
export interface ToTitlecaseInputs {
  text?: Connectable<string>;
}

export interface ToTitlecaseOutputs {
  output: string;
}

export function toTitlecase(
  inputs: ToTitlecaseInputs
): DslNode<ToTitlecaseOutputs, "output"> {
  return createNode(
    "nodetool.text.ToTitlecase",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Capitalize Text — nodetool.text.CapitalizeText
export interface CapitalizeTextInputs {
  text?: Connectable<string>;
}

export interface CapitalizeTextOutputs {
  output: string;
}

export function capitalizeText(
  inputs: CapitalizeTextInputs
): DslNode<CapitalizeTextOutputs, "output"> {
  return createNode(
    "nodetool.text.CapitalizeText",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export function slice(inputs: SliceInputs): DslNode<SliceOutputs, "output"> {
  return createNode("nodetool.text.Slice", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Starts With — nodetool.text.StartsWith
export interface StartsWithInputs {
  text?: Connectable<string>;
  prefix?: Connectable<string>;
}

export interface StartsWithOutputs {
  output: boolean;
}

export function startsWith(
  inputs: StartsWithInputs
): DslNode<StartsWithOutputs, "output"> {
  return createNode(
    "nodetool.text.StartsWith",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Ends With — nodetool.text.EndsWith
export interface EndsWithInputs {
  text?: Connectable<string>;
  suffix?: Connectable<string>;
}

export interface EndsWithOutputs {
  output: boolean;
}

export function endsWith(
  inputs: EndsWithInputs
): DslNode<EndsWithOutputs, "output"> {
  return createNode(
    "nodetool.text.EndsWith",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Contains Text — nodetool.text.Contains
export interface ContainsInputs {
  text?: Connectable<string>;
  substring?: Connectable<string>;
  search_values?: Connectable<string[]>;
  case_sensitive?: Connectable<boolean>;
  match_mode?: Connectable<unknown>;
}

export interface ContainsOutputs {
  output: boolean;
}

export function contains(
  inputs: ContainsInputs
): DslNode<ContainsOutputs, "output"> {
  return createNode(
    "nodetool.text.Contains",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export function trimWhitespace(
  inputs: TrimWhitespaceInputs
): DslNode<TrimWhitespaceOutputs, "output"> {
  return createNode(
    "nodetool.text.TrimWhitespace",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export function collapseWhitespace(
  inputs: CollapseWhitespaceInputs
): DslNode<CollapseWhitespaceOutputs, "output"> {
  return createNode(
    "nodetool.text.CollapseWhitespace",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Is Empty — nodetool.text.IsEmpty
export interface IsEmptyInputs {
  text?: Connectable<string>;
  trim_whitespace?: Connectable<boolean>;
}

export interface IsEmptyOutputs {
  output: boolean;
}

export function isEmpty(
  inputs: IsEmptyInputs
): DslNode<IsEmptyOutputs, "output"> {
  return createNode(
    "nodetool.text.IsEmpty",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export function removePunctuation(
  inputs: RemovePunctuationInputs
): DslNode<RemovePunctuationOutputs, "output"> {
  return createNode(
    "nodetool.text.RemovePunctuation",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Strip Accents — nodetool.text.StripAccents
export interface StripAccentsInputs {
  text?: Connectable<string>;
  preserve_non_ascii?: Connectable<boolean>;
}

export interface StripAccentsOutputs {
  output: string;
}

export function stripAccents(
  inputs: StripAccentsInputs
): DslNode<StripAccentsOutputs, "output"> {
  return createNode(
    "nodetool.text.StripAccents",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export function slugify(
  inputs: SlugifyInputs
): DslNode<SlugifyOutputs, "output"> {
  return createNode(
    "nodetool.text.Slugify",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export function hasLength(
  inputs: HasLengthInputs
): DslNode<HasLengthOutputs, "output"> {
  return createNode(
    "nodetool.text.HasLength",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export function truncateText(
  inputs: TruncateTextInputs
): DslNode<TruncateTextOutputs, "output"> {
  return createNode(
    "nodetool.text.TruncateText",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Pad Text — nodetool.text.PadText
export interface PadTextInputs {
  text?: Connectable<string>;
  length?: Connectable<number>;
  pad_character?: Connectable<string>;
  direction?: Connectable<unknown>;
}

export interface PadTextOutputs {
  output: string;
}

export function padText(
  inputs: PadTextInputs
): DslNode<PadTextOutputs, "output"> {
  return createNode(
    "nodetool.text.PadText",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Measure Length — nodetool.text.Length
export interface LengthInputs {
  text?: Connectable<string>;
  measure?: Connectable<unknown>;
  trim_whitespace?: Connectable<boolean>;
}

export interface LengthOutputs {
  output: number;
}

export function length(inputs: LengthInputs): DslNode<LengthOutputs, "output"> {
  return createNode("nodetool.text.Length", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
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

export function indexOf(
  inputs: IndexOfInputs
): DslNode<IndexOfOutputs, "output"> {
  return createNode(
    "nodetool.text.IndexOf",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export function surroundWith(
  inputs: SurroundWithInputs
): DslNode<SurroundWithOutputs, "output"> {
  return createNode(
    "nodetool.text.SurroundWith",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Count Tokens — nodetool.text.CountTokens
export interface CountTokensInputs {
  text?: Connectable<string>;
  encoding?: Connectable<unknown>;
}

export interface CountTokensOutputs {
  output: number;
}

export function countTokens(
  inputs: CountTokensInputs
): DslNode<CountTokensOutputs, "output"> {
  return createNode(
    "nodetool.text.CountTokens",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export function htmlToText(
  inputs: HtmlToTextInputs
): DslNode<HtmlToTextOutputs, "output"> {
  return createNode(
    "nodetool.text.HtmlToText",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Automatic Speech Recognition — nodetool.text.AutomaticSpeechRecognition
export interface AutomaticSpeechRecognitionInputs {
  model?: Connectable<unknown>;
  audio?: Connectable<AudioRef>;
}

export interface AutomaticSpeechRecognitionOutputs {
  text: string;
}

export function automaticSpeechRecognition(
  inputs: AutomaticSpeechRecognitionInputs
): DslNode<AutomaticSpeechRecognitionOutputs, "text"> {
  return createNode(
    "nodetool.text.AutomaticSpeechRecognition",
    inputs as Record<string, unknown>,
    { outputNames: ["text"], defaultOutput: "text" }
  );
}

// Embedding — nodetool.text.Embedding
export interface EmbeddingInputs {
  model?: Connectable<unknown>;
  input?: Connectable<string>;
  chunk_size?: Connectable<number>;
}

export interface EmbeddingOutputs {
  output: unknown;
}

export function embedding(
  inputs: EmbeddingInputs
): DslNode<EmbeddingOutputs, "output"> {
  return createNode(
    "nodetool.text.Embedding",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export function saveTextFile(
  inputs: SaveTextFileInputs
): DslNode<SaveTextFileOutputs, "output"> {
  return createNode(
    "nodetool.text.SaveTextFile",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export function saveText(
  inputs: SaveTextInputs
): DslNode<SaveTextOutputs, "output"> {
  return createNode(
    "nodetool.text.SaveText",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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
}

export function loadTextFolder(
  inputs: LoadTextFolderInputs
): DslNode<LoadTextFolderOutputs> {
  return createNode(
    "nodetool.text.LoadTextFolder",
    inputs as Record<string, unknown>,
    { outputNames: ["text", "path"], streaming: true }
  );
}

// Load Text Assets — nodetool.text.LoadTextAssets
export interface LoadTextAssetsInputs {
  folder?: Connectable<FolderRef>;
}

export interface LoadTextAssetsOutputs {
  text: TextRef;
  name: string;
}

export function loadTextAssets(
  inputs: LoadTextAssetsInputs
): DslNode<LoadTextAssetsOutputs> {
  return createNode(
    "nodetool.text.LoadTextAssets",
    inputs as Record<string, unknown>,
    { outputNames: ["text", "name"], streaming: true }
  );
}

// Filter String — nodetool.text.FilterString
export interface FilterStringInputs {
  value?: Connectable<string>;
  filter_type?: Connectable<unknown>;
  criteria?: Connectable<string>;
}

export interface FilterStringOutputs {
  output: string;
}

export function filterString(
  inputs: FilterStringInputs
): DslNode<FilterStringOutputs, "output"> {
  return createNode(
    "nodetool.text.FilterString",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output", streaming: true }
  );
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

export function filterRegexString(
  inputs: FilterRegexStringInputs
): DslNode<FilterRegexStringOutputs, "output"> {
  return createNode(
    "nodetool.text.FilterRegexString",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output", streaming: true }
  );
}
