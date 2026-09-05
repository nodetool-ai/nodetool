import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { Platform } from "@nodetool-ai/protocol";
import type { OutputCorrelation } from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { assetRefToPromptToken } from "@nodetool-ai/runtime";
import {
  tagAsServer,
  renderTemplate,
  referencedVariables,
  base64ToBytes
} from "@nodetool-ai/nodes-utils";
import type { TemplateVars } from "@nodetool-ai/nodes-utils";
import {
  loadNodeFsPromises,
  loadNodePath,
  folderPathOf,
  writeSavedFile,
  VISIBLE_WHEN_NOT_SAVING_TO_WORKSPACE,
  SAVE_TO_WORKSPACE_DESCRIPTION,
  SAVE_TO_WORKSPACE_TITLE
} from "@nodetool-ai/nodes-utils";
import {
  isNonEmptyString,
  isString
} from "@nodetool-ai/node-sdk";

const NODE_ONLY: readonly Platform[] = ["node"];

/** The provider bridge a node routes a prediction through. */
type ProviderPredictionFn = ProcessingContext["runProviderPrediction"];

/**
 * `ProcessingContext` declares the provider bridge, but a node is also handed
 * partial stubs (tests, hosts with no provider access), so the method can be
 * absent at runtime.
 */
function hasProviderPrediction(
  run: ProviderPredictionFn | undefined
): run is ProviderPredictionFn {
  return typeof run === "function";
}

/** The ASR capability's answer — every provider returns an `ASRResult`. */
function isAsrResult<T>(value: T): value is T & { text: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    "text" in value &&
    typeof value.text === "string"
  );
}

/** What an `audio` slot delivers: an `AudioRef`, or `{}` before one is wired. */
type AudioLike = { data?: unknown; uri?: unknown };

/** The embedding capability's answer — one vector per embedded chunk. */
function isEmbeddingVectors<T>(value: T): value is T & number[][] {
  return Array.isArray(value) && value.every((row) => Array.isArray(row));
}

/**
 * Turn any asset-ref values in a template's variable bag into their
 * `asset://<id>.<ext>` token so a wired image / audio / video / document
 * expands like an inline `@`-mention instead of rendering as `"[object
 * Object]"`. Non-asset values take the string form the renderer would have
 * given them anyway; `null`/`undefined` stay absent so they render as "".
 *
 * The bag arrives as the dynamic-input map the node already holds: a wire value
 * has no type narrower than `unknown`, and a `Record` would promise callers a
 * value contract that does not exist.
 */
function tokenizeAssetVars(vars: ReadonlyMap<string, unknown>): TemplateVars {
  const out: TemplateVars = {};
  for (const [key, value] of vars) {
    out[key] =
      assetRefToPromptToken(value) ?? (value == null ? undefined : String(value));
  }
  return out;
}

// Expands strftime-style date tokens (%Y %m %d %H %M %S) so the documented
// filename variables produce unique names instead of a literal "%Y-...".
function formatFilename(name: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return name
    .replace(/%Y/g, String(now.getFullYear()))
    .replace(/%m/g, pad(now.getMonth() + 1))
    .replace(/%d/g, pad(now.getDate()))
    .replace(/%H/g, pad(now.getHours()))
    .replace(/%M/g, pad(now.getMinutes()))
    .replace(/%S/g, pad(now.getSeconds()));
}

/**
 * What a `folder` slot delivers: a bare path, a `FolderRef` carrying a `uri`,
 * or a local-folder object carrying a `path`.
 */
type FolderLike = string | { path?: unknown; uri?: unknown } | null | undefined;

function folderPath(value: FolderLike): string {
  if (isString(value)) return value;
  if (value == null) return "";
  if (isString(value.path)) return value.path;
  if (isString(value.uri)) {
    return value.uri.startsWith("file://")
      ? value.uri.slice("file://".length)
      : value.uri;
  }
  return "";
}

/**
 * What a `*_model` slot carries: the provider and model ids naming a
 * provider-backed model, and — on an embedding model — the vector width.
 */
type ModelSelection =
  | {
      provider?: unknown;
      id?: unknown;
      dimensions?: unknown;
    }
  | null
  | undefined;

/** The provider-backed model a node routes a prediction to; "" when unselected. */
type ModelConfig = { providerId: string; modelId: string };

function modelConfig(model: ModelSelection): ModelConfig {
  const provider = model?.provider;
  const id = model?.id;
  return {
    providerId: isString(provider) ? provider : "",
    modelId: isString(id) ? id : ""
  };
}

type EmbeddingParams = { text: string; dimensions?: number };

/** Embedding params; `dimensions` travels only when the model declares one. */
function embeddingParams(text: string, dimensions: number): EmbeddingParams {
  const params: EmbeddingParams = { text };
  if (dimensions > 0) {
    params.dimensions = dimensions;
  }
  return params;
}

/** Output handles AutomaticSpeechRecognitionNode.process() emits. */
type AutomaticSpeechRecognitionNodeOutputs = {
  text: string;
  output: string;
};

export class AutomaticSpeechRecognitionNode extends BaseNode {
  static readonly nodeType = "nodetool.text.AutomaticSpeechRecognition";
  static readonly body = "content_card";
  static readonly title = "Automatic Speech Recognition";
  static readonly description =
    "Transcribe audio to text using automatic speech recognition models.\n    audio, speech, recognition, transcription, ASR, whisper";
  static readonly metadataOutputTypes = {
    text: "str"
  };
  static readonly inputFields: string[] = ["audio"];

  @prop({
    type: "asr_model",
    default: {
      type: "asr_model",
      provider: "fal_ai",
      id: "openai/whisper-large-v3",
      name: "",
      path: null
    },
    title: "Model"
  })
  declare model: ModelSelection;

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "The audio to transcribe",
    required: true
  })
  declare audio: AudioLike | null;

  @prop({
    type: "str",
    default: "",
    title: "Language",
    description: "Language of the audio (ISO 639-1 code, empty for auto-detect)"
  })
  declare language: string;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Optional prompt to guide the transcription"
  })
  declare prompt: string;

  @prop({
    type: "float",
    default: 0,
    title: "Temperature",
    description: "Sampling temperature for the transcription model",
    min: 0,
    max: 1
  })
  declare temperature: number;

  async process(context?: ProcessingContext): Promise<AutomaticSpeechRecognitionNodeOutputs> {
    const { providerId, modelId } = modelConfig(this.model);
    const audio: AudioLike = this.audio ?? {};
    let bytes: Uint8Array = new Uint8Array();
    if (isString(audio.data)) {
      bytes = base64ToBytes(audio.data);
    } else if (audio.data instanceof Uint8Array) {
      bytes = new Uint8Array(audio.data);
    } else if (isNonEmptyString(audio.uri)) {
      if (context?.storage) {
        const stored = await context.storage.retrieve(audio.uri);
        if (stored !== null) bytes = new Uint8Array(stored);
      }
      if (bytes.length === 0 && audio.uri.startsWith("file://")) {
        const fs = await loadNodeFsPromises();
        bytes = new Uint8Array(
          await fs.readFile(audio.uri.slice("file://".length))
        );
      }
    }

    if (
      context &&
      hasProviderPrediction(context.runProviderPrediction) &&
      providerId &&
      modelId &&
      bytes.length > 0
    ) {
      const result = await context.runProviderPrediction({
        provider: providerId,
        capability: "automatic_speech_recognition",
        model: modelId,
        params: {
          audio: bytes,
          language: this.language || undefined,
          prompt: this.prompt || undefined,
          temperature: this.temperature || undefined
        }
      });
      if (!isAsrResult(result)) {
        throw new Error(
          "AutomaticSpeechRecognition expected a transcript from the provider."
        );
      }
      return { text: result.text, output: result.text };
    }

    throw new Error(
      "AutomaticSpeechRecognition requires a provider-backed model and audio input."
    );
  }
}

/** Output handles EmbeddingTextNode.process() emits. */
type EmbeddingTextNodeOutputs = {
  output: number[];
};

export class EmbeddingTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.Embedding";
  static readonly title = "Embedding";
  static readonly description =
    "Generate vector representations of text using any supported embedding provider (OpenAI, Gemini, Mistral).\n    embeddings, similarity, search, clustering, classification, vectors, semantic\n\n    Use cases:\n    - Semantic search and recommendation\n    - Text clustering and classification\n    - Anomaly detection\n    - Measuring text similarity and diversity";
  static readonly metadataOutputTypes = {
    output: "list"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["input"];

  @prop({
    type: "embedding_model",
    default: {
      type: "embedding_model",
      provider: "openai",
      id: "text-embedding-3-small",
      name: "Text Embedding 3 Small",
      dimensions: 0
    },
    title: "Model",
    description: "The embedding model to use"
  })
  declare model: ModelSelection;

  @prop({
    type: "str",
    default: "",
    title: "Input",
    description: "The text to embed"
  })
  declare input: string;

  @prop({
    type: "int",
    default: 4096,
    title: "Chunk Size",
    description:
      "Size of text chunks for embedding (used when input exceeds model limits)",
    min: 1,
    max: 8192
  })
  declare chunk_size: number;

  async process(context?: ProcessingContext): Promise<EmbeddingTextNodeOutputs> {
    const text = this.input;
    if (!text) {
      throw new Error("input text must not be empty");
    }
    const model = this.model;
    const { providerId, modelId } = modelConfig(model);
    if (!context || !hasProviderPrediction(context.runProviderPrediction)) {
      throw new Error(
        "Embedding requires a processing context with provider access"
      );
    }
    if (!providerId || !modelId) {
      throw new Error(
        "Embedding requires an embedding model with provider and id"
      );
    }
    const dimensions = Number(model?.dimensions ?? 0);
    const vectors = await context.runProviderPrediction({
      provider: providerId,
      capability: "generate_embedding",
      model: modelId,
      params: embeddingParams(text, dimensions)
    });
    if (!isEmbeddingVectors(vectors)) {
      throw new Error("Embedding expected vectors from the provider.");
    }
    return { output: vectors[0] ?? [] };
  }
}

/** Output handles SaveTextFileNode.process() emits. */
type SaveTextFileNodeOutputs = {
  output: { uri: string; data: string };
};

export class SaveTextFileNode extends BaseNode {
  static readonly nodeType = "nodetool.text.SaveTextFile";
  static readonly platforms = NODE_ONLY;
  static readonly title = "Save Text File";
  static readonly description =
    "Saves input text to a file in the assets folder.\n    text, save, file";
  static readonly metadataOutputTypes = {
    output: "text"
  };
  static readonly inlineFields: string[] = ["save_to_workspace"];
  static readonly inputFields: string[] = ["text"];

  @prop({ type: "str", default: "", title: "Text" })
  declare text: string;

  @prop({
    type: "bool",
    default: true,
    title: SAVE_TO_WORKSPACE_TITLE,
    description: SAVE_TO_WORKSPACE_DESCRIPTION
  })
  declare save_to_workspace: boolean;

  @prop({
    type: "str",
    default: "",
    title: "Folder",
    description: "Path to the output folder.",
    json_schema_extra: VISIBLE_WHEN_NOT_SAVING_TO_WORKSPACE
  })
  declare folder: string;

  @prop({
    type: "str",
    default: "%Y-%m-%d-%H-%M-%S.txt",
    title: "Name",
    description:
      "\n        Name of the output file.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        "
  })
  declare name: string;

  async process(context?: ProcessingContext): Promise<SaveTextFileNodeOutputs> {
    const text = this.text;
    const saveToWorkspace = this.save_to_workspace;
    const folder = folderPathOf(this.folder);
    if (!folder && !(saveToWorkspace && context?.workspace)) {
      throw new Error(
        "No destination: set a folder, or turn on \"Save to workspace\" and assign a workspace to this workflow."
      );
    }
    const fsPath = await writeSavedFile({
      folder: this.folder,
      filename: formatFilename(this.name),
      saveToWorkspace,
      workspace: context?.workspace,
      workspaceDir: context?.workspaceDir,
      bytes: text
    });
    // The output `uri` is a portable, URI-style path (forward slashes) so
    // downstream nodes and the web UI never have to special-case Windows.
    const uri = fsPath.replace(/\\/g, "/");
    return { output: { uri, data: text } };
  }
}

/** Output handles SaveTextNode.process() emits. */
type SaveTextNodeOutputs = {
  output: { uri: string; data: string };
};

export class SaveTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.SaveText";
  static readonly platforms = NODE_ONLY;
  static readonly title = "Save Text";
  static readonly description =
    "Saves input text to a file in the assets folder.\n    text, save, file\n\n    Use cases:\n    - Persisting processed text results\n    - Creating text files for downstream nodes or external use\n    - Archiving text data within the workflow";
  static readonly metadataOutputTypes = {
    output: "text"
  };
  static readonly inputFields: string[] = ["text"];

  @prop({ type: "str", default: "", title: "Text" })
  declare text: string;

  @prop({
    type: "folder",
    default: {
      type: "folder",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Folder",
    description: "Name of the output folder."
  })
  declare folder: FolderLike;

  @prop({
    type: "str",
    default: "%Y-%m-%d-%H-%M-%S.txt",
    title: "Name",
    description:
      "\n        Name of the output file.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        "
  })
  declare name: string;

  async process(): Promise<SaveTextNodeOutputs> {
    const text = this.text;
    const name = formatFilename(this.name);
    const folder = folderPath(this.folder);
    const fs = await loadNodeFsPromises();
    const path = await loadNodePath();
    const fsPath = folder ? path.join(folder, name) : name;
    if (folder) {
      await fs.mkdir(folder, { recursive: true });
    }
    await fs.writeFile(fsPath, text, "utf-8");
    const uri = fsPath.replace(/\\/g, "/");
    return { output: { uri, data: text } };
  }
}

/** Output handles LoadTextFolderNode.genProcess() emits. */
type LoadTextFolderNodeStreamOutputs = {
  path?: string;
  text?: string;
  texts?: string[];
  paths?: string[];
};

/** Output handles LoadTextFolderNode.process() emits. */
type LoadTextFolderNodeOutputs = {
  text: string;
  path: string;
  texts: string[];
  paths: string[];
};

export class LoadTextFolderNode extends BaseNode {
  static readonly nodeType = "nodetool.text.LoadTextFolder";
  static readonly platforms = NODE_ONLY;
  static readonly title = "Load Text Folder";
  static readonly description =
    "Load all text files from a folder, optionally including subfolders.\n    text, load, folder, files";
  static readonly metadataOutputTypes = {
    text: "str",
    path: "str",
    texts: "list",
    paths: "list"
  };

  @prop({
    type: "str",
    default: "",
    title: "Folder",
    description: "Folder to scan for text files"
  })
  declare folder: string;

  @prop({
    type: "bool",
    default: false,
    title: "Include Subdirectories",
    description: "Include text files in subfolders"
  })
  declare include_subdirectories: boolean;

  @prop({
    type: "list[str]",
    default: [".txt", ".csv", ".json", ".xml", ".md", ".html", ".pdf"],
    title: "Extensions",
    description: "Text file extensions to include"
  })
  declare extensions: string[];

  @prop({
    type: "str",
    default: "",
    title: "Pattern",
    description: "Pattern to match text files"
  })
  declare pattern: string;

  async process(): Promise<LoadTextFolderNodeOutputs> {
    const allTexts: string[] = [];
    const allPaths: string[] = [];
    for await (const item of this._walkFiles()) {
      allTexts.push(item.text);
      allPaths.push(item.path);
    }
    return {
      text: allTexts[0] ?? "",
      path: allPaths[0] ?? "",
      texts: allTexts,
      paths: allPaths
    };
  }

  async *_walkFiles(): AsyncGenerator<{
    text: string;
    path: string;
  }> {
    const folder = this.folder;
    const includeSubdirs = this.include_subdirectories;
    const extensions = this.extensions.map((ext) => String(ext).toLowerCase());

    if (!folder) {
      throw new Error("folder cannot be empty");
    }
    const fs = await loadNodeFsPromises();
    const path = await loadNodePath();

    const walk = async function* (dir: string): AsyncGenerator<string> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (includeSubdirs) {
            yield* walk(full);
          }
          continue;
        }
        yield full;
      }
    };

    for await (const filePath of walk(folder)) {
      if (!extensions.includes(path.extname(filePath).toLowerCase())) {
        continue;
      }
      const text = await fs.readFile(filePath, "utf-8");
      yield { path: filePath, text };
    }
  }

  async *genProcess(): AsyncGenerator<LoadTextFolderNodeStreamOutputs> {
    const allTexts: string[] = [];
    const allPaths: string[] = [];
    for await (const item of this._walkFiles()) {
      allTexts.push(item.text);
      allPaths.push(item.path);
      yield { path: item.path, text: item.text };
    }
    yield { texts: allTexts, paths: allPaths };
  }
}

/**
 * Output handles LoadTextAssetsNode emits. `genProcess` yields them in two
 * waves — one file at a time, then the collected lists — so every handle is
 * optional.
 */
type LoadTextAssetsNodeOutputs = {
  text?: string;
  name?: string;
  texts?: string[];
  names?: string[];
};

export class LoadTextAssetsNode extends BaseNode {
  static readonly nodeType = "nodetool.text.LoadTextAssets";
  static readonly title = "Load Text Assets";
  static readonly description =
    "Load text files from an asset folder.\n    load, text, file, import";
  static readonly metadataOutputTypes = {
    text: "text",
    name: "str",
    texts: "list",
    names: "list"
  };

  @prop({
    type: "folder",
    default: {
      type: "folder",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Folder",
    description: "The asset folder to load the text files from."
  })
  declare folder: FolderLike;

  async process(): Promise<LoadTextAssetsNodeOutputs> {
    const allTexts: string[] = [];
    const allNames: string[] = [];
    const folder = folderPath(this.folder);
    if (!folder) {
      throw new Error("folder cannot be empty");
    }
    const walker = new LoadTextFolderNode();
    walker.assign({ folder });
    for await (const item of walker._walkFiles()) {
      allTexts.push(item.text);
      allNames.push(item.path);
    }
    return {
      text: allTexts[0] ?? "",
      name: allNames[0] ?? "",
      texts: allTexts,
      names: allNames
    };
  }

  async *genProcess(): AsyncGenerator<LoadTextAssetsNodeOutputs> {
    const folder = folderPath(this.folder);
    if (!folder) {
      throw new Error("folder cannot be empty");
    }

    const allTexts: string[] = [];
    const allNames: string[] = [];
    const walker = new LoadTextFolderNode();
    walker.assign({ folder });
    for await (const item of walker._walkFiles()) {
      allTexts.push(item.text);
      allNames.push(item.path);
      yield { text: item.text, name: item.path };
    }
    yield { texts: allTexts, names: allNames };
  }
}

/** The filters FilterStringNode implements; its enum prop offers exactly these. */
const FILTER_STRING_TYPES = [
  "contains",
  "starts_with",
  "ends_with",
  "length_greater",
  "length_less",
  "exact_length"
] as const;

type FilterStringType = (typeof FILTER_STRING_TYPES)[number];

function isFilterStringType(value: string): value is FilterStringType {
  return FILTER_STRING_TYPES.some((filter) => filter === value);
}

/** Output handles FilterStringNode.process() emits. */
type FilterStringNodeOutputs = {
  output?: string;
};

export class FilterStringNode extends BaseNode {
  static readonly nodeType = "nodetool.text.FilterString";
  static readonly retrySafe = true;
  static readonly title = "Filter String";
  static readonly description =
    "Filters a stream of strings based on various criteria.\n    filter, strings, text, stream";
  static readonly metadataOutputTypes = {
    output: "str"
  };
  static readonly outputCorrelation = {
    output: { kind: "forward", source: "value" }
  } satisfies Record<string, OutputCorrelation>;

  /** null when the prop names no filter this node implements — nothing matches. */
  private _filterType: FilterStringType | null = "contains";
  private _criteria = "";
  @prop({
    type: "str",
    default: "",
    title: "Value",
    description: "Input string stream"
  })
  declare value: string;

  @prop({
    type: "enum",
    default: "contains",
    title: "Filter Type",
    description: "The type of filter to apply",
    values: [
      "contains",
      "starts_with",
      "ends_with",
      "length_greater",
      "length_less",
      "exact_length"
    ]
  })
  declare filter_type: FilterStringType;

  @prop({
    type: "str",
    default: "",
    title: "Criteria",
    description: "The filtering criteria (text to match or length as string)"
  })
  declare criteria: string;

  private readFilterProps(): void {
    this._filterType = isFilterStringType(this.filter_type)
      ? this.filter_type
      : null;
    this._criteria = this.criteria;
  }

  async initialize(): Promise<void> {
    this.readFilterProps();
  }

  async process(): Promise<FilterStringNodeOutputs> {
    this.readFilterProps();

    const value = this.value;
    if (!isString(value)) {
      return {};
    }

    const criteria = this._criteria;
    const len = value.length;
    const n = Number(criteria);

    let matched: boolean;
    switch (this._filterType) {
      case "contains":
        matched = value.includes(criteria);
        break;
      case "starts_with":
        matched = value.startsWith(criteria);
        break;
      case "ends_with":
        matched = value.endsWith(criteria);
        break;
      case "length_greater":
        matched = Number.isFinite(n) && len > n;
        break;
      case "length_less":
        matched = Number.isFinite(n) && len < n;
        break;
      case "exact_length":
        matched = Number.isFinite(n) && len === n;
        break;
      default:
        matched = false;
    }

    if (!matched) {
      return {};
    }
    return { output: value };
  }
}

/** Output handles FilterRegexStringNode.process() emits. */
type FilterRegexStringNodeOutputs = {
  output?: string;
};

export class FilterRegexStringNode extends BaseNode {
  static readonly nodeType = "nodetool.text.FilterRegexString";
  static readonly retrySafe = true;
  static readonly title = "Filter Regex String";
  static readonly description =
    "Filters a stream of strings using regular expressions.\n    filter, regex, pattern, text, stream";
  static readonly metadataOutputTypes = {
    output: "str"
  };
  static readonly outputCorrelation = {
    output: { kind: "forward", source: "value" }
  } satisfies Record<string, OutputCorrelation>;

  private _pattern = "";
  private _fullMatch = false;
  @prop({
    type: "str",
    default: "",
    title: "Value",
    description: "Input string stream"
  })
  declare value: string;

  @prop({
    type: "str",
    default: "",
    title: "Pattern",
    description: "The regular expression pattern to match against."
  })
  declare pattern: string;

  @prop({
    type: "bool",
    default: false,
    title: "Full Match",
    description:
      "Whether to match the entire string or find pattern anywhere in string"
  })
  declare full_match: boolean;

  async initialize(): Promise<void> {
    this._pattern = this.pattern;
    this._fullMatch = this.full_match;
  }

  async process(): Promise<FilterRegexStringNodeOutputs> {
    this._pattern = this.pattern;
    this._fullMatch = this.full_match;

    const value = this.value;
    if (!isString(value)) {
      return {};
    }

    let regex: RegExp;
    try {
      regex = new RegExp(this._pattern);
    } catch {
      return {};
    }

    const matched = this._fullMatch
      ? (value.match(regex)?.[0] ?? "") === value
      : regex.test(value);

    if (!matched) {
      return {};
    }
    return { output: value };
  }
}

// nodetool.text.CountTokens was removed; tiktoken now reaches the sandbox as
// the @nodetool-ai/sandbox-tokens host pack. nodetool.text.Join was removed
// too — it was `list.join(sep)`. Old workflows are rewritten to
// nodetool.code.Code on load — see NODE_TYPE_MIGRATIONS in @nodetool-ai/protocol.

/** Output handles ConcatTextNode.process() emits. */
type ConcatTextNodeOutputs = {
  output: string;
};

export class ConcatTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.Concat";
  static readonly retrySafe = true;
  static readonly cacheTtl = "forever";
  static readonly body = "content_card";
  static readonly title = "Concat";
  static readonly description =
    "Concatenates text inputs into a single output. Add inputs dynamically with the “add text input” button, or wire a list of strings into a single input.\n    +, text, combine, add, concatenate, merge, join, append";
  static readonly metadataOutputTypes = {
    output: "str"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = [];
  static readonly supportsDynamicInputs = true;

  async process(): Promise<ConcatTextNodeOutputs> {
    // A dynamic input may carry a single value or a list<str> from an upstream
    // loop/list node — flatten so list elements concatenate in order instead of
    // stringifying the whole array as "a,b,c".
    return {
      output: Array.from(this.dynamicProps.values())
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .map((value) => String(value ?? ""))
        .join("")
    };
  }
}

/** Output handles CollectTextNode.process() emits. */
type CollectTextNodeOutputs = {
  output: string;
};

export class CollectTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.Collect";
  static readonly title = "Collect Text";
  static readonly description =
    "Collects streaming text inputs into a single concatenated string.\n    text, collect, stream, aggregate";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  private _items: string[] = [];

  @prop({
    type: "str",
    default: "",
    title: "Input Item",
    description: "Text to collect."
  })
  declare input_item: string;

  @prop({
    type: "str",
    default: "",
    title: "Separator",
    description: "Separator between collected items."
  })
  declare separator: string;

  async initialize(): Promise<void> {
    this._items = [];
  }

  async process(): Promise<CollectTextNodeOutputs> {
    this._items.push(this.input_item);
    return { output: this._items.join(this.separator) };
  }
}

// nodetool.text.FormatText was removed; it was identical to PromptNode apart
// from its input field name (`template` vs `prompt`). Old workflows are
// rewritten to nodetool.text.Prompt on load — see NODE_TYPE_MIGRATIONS in
// @nodetool-ai/protocol.

/**
 * Output handles PromptNode.process() emits: the rendered text on `output`,
 * plus one handle per dynamic input carrying its raw wire value. The set is
 * open (`supportsDynamicOutputs`), so the contract is the SDK's own output bag
 * rather than a fixed list of handles.
 */
type PromptNodeOutputs = Awaited<ReturnType<BaseNode["process"]>>;

export class PromptNode extends BaseNode {
  static readonly nodeType = "nodetool.text.Prompt";
  static readonly cacheTtl = "forever";
  static readonly title = "Prompt";
  static readonly description =
    "Compose a prompt string with named variables. Add variables via the Add Variable button; reference them in the prompt as {{ variable }} (or {variable}). Supports filters: {{ var|upper }}, {{ var|lower }}, {{ var|capitalize }}, {{ var|title }}, {{ var|trim }}, {{ var|truncate(n) }}, {{ var|default(val) }}.\n    prompt, text, template, variable, llm, agent";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  static readonly supportsDynamicInputs = true;
  // Every variable is also forwarded on an output handle of the same name, so
  // an image used as `{{ var }}` in the text can additionally be wired into a
  // downstream node that wants the real asset (e.g. reference images).
  static readonly supportsDynamicOutputs = true;
  static readonly inputFields: string[] = ["prompt"];

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Prompt text. Reference variables with {{ name }} or {name}."
  })
  declare prompt: string;

  async process(context?: ProcessingContext): Promise<PromptNodeOutputs> {
    const template = this.prompt;
    const props = new Map<string, unknown>(this.dynamicProps);

    // Resolve `{{ name }}` references against variable channels: wait for the
    // first value published by a Set Variable node anywhere in the graph. Only
    // names with a registered writer are awaited (others are left intact), and
    // the node's own dynamic inputs take precedence on conflict.
    if (context) {
      const pending = referencedVariables(template)
        .filter((name) => !props.has(name) && context.hasChannelWriters(name))
        .map(async (name) => {
          const value = await context.getChannel(name).first();
          if (value !== undefined) {
            props.set(name, value);
          }
        });
      await Promise.all(pending);
    }

    // Pass every variable through on a handle of its own name, carrying the
    // raw value (an image ref stays an image ref — only the rendered text gets
    // asset tokens). Keys without an outgoing edge are dropped by the runner.
    // The rendered text is assigned last so a variable named "output" can't
    // shadow it.
    return {
      ...Object.fromEntries(props),
      output: renderTemplate(template, tokenizeAssetVars(props))
    };
  }
}

/** Output handles TemplateTextNode.process() emits. */
type TemplateTextNodeOutputs = {
  output: string;
};

export class TemplateTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.Template";
  static readonly retrySafe = true;
  static readonly cacheTtl = "forever";
  static readonly title = "Template";
  static readonly description =
    "Uses template syntax to format strings with variables. Supports {{ variable }} and {variable} patterns.\n    text, template, formatting, format, combine, concatenate, variable, replace\n\n    Use cases:\n    - Generating personalized messages\n    - Creating parameterized queries\n    - Formatting text with variable inputs";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  static readonly supportsDynamicInputs = true;

  @prop({
    type: "str",
    default: "",
    title: "String",
    description:
      "Template string with {{ variable }} or {variable} placeholders."
  })
  declare string: string;

  async process(): Promise<TemplateTextNodeOutputs> {
    let result = this.string;
    const props = tokenizeAssetVars(this.dynamicProps);

    for (const [key, value] of Object.entries(props)) {
      const strValue = String(value ?? "");
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const jinja = new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}`, "g");
      result = result.replace(jinja, () => strValue);
      const single = new RegExp(`(?<!\\{)\\{${escapedKey}\\}(?!\\})`, "g");
      result = result.replace(single, () => strValue);
    }
    return { output: result };
  }
}

export const TEXT_EXTRA_NODES = tagAsServer([
  AutomaticSpeechRecognitionNode,
  EmbeddingTextNode,
  SaveTextFileNode,
  SaveTextNode,
  LoadTextFolderNode,
  LoadTextAssetsNode,
  FilterStringNode,
  FilterRegexStringNode,
  ConcatTextNode,
  CollectTextNode,
  PromptNode,
  TemplateTextNode
]);
