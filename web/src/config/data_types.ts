function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  return `#${((hash >>> 0) & 0xffffff).toString(16).padStart(6, "0")}`;
}

import { COMFY_DATA_TYPES } from "./comfy_data_types";

/**
 * SpectraNode palette — core "500" tone for each conceptual category
 * Most node types are mapped to these category buckets.
 */
const SpectraNode = {
  // Cyan / blue family aligns with app primary for technical types
  scalar: "#18E0F8", // cyan 400 boosted — numbers
  boolean: "#0DD49A", // emerald 500 boosted — booleans / flags
  vector: "#00C8E8", // cyan 500 boosted — vectors
  matrix: "#5B5EFF", // indigo 500 boosted — tensors / matrices
  // Accents
  spatial: "#B0F030", // lime 400 boosted — geometry
  texture: "#E838FF", // fuchsia 500 boosted — images / textures
  video: "#9460FF", // violet 500 boosted — video
  textual: "#FFA808", // amber 500 boosted — text / strings
  collection: "#FFD612", // yellow 400 boosted — list / dict / dataframe / enum
  reference: "#3888FF", // blue 500 boosted — file‑like / objects / models / assets
  event: "#FF3060", // rose 500 boosted — events / tasks
  audio: "#08B8FF", // sky/cyan 500 boosted — audio / sound
  execution: "#6880A0" // slate 500 boosted — misc / execution
} as const;

type SpectraKey = keyof typeof SpectraNode;

export interface DataType {
  value: string;
  label: string;
  namespace: string;
  name: string;
  slug: string;
  description: string;
  /**
   * Core 500 tone for this type as HEX.
   * (Light / dark variants are derived in CSS).
   */
  color: string;
  /**
   * Fallback text colour. Re‑evaluated later for WCAG contrast.
   */
  textColor: "#fff" | "#111" | "#eee" | "dark" | "var(--palette-action-active)";
  icon?: string;
}

/**
 * Helper that assigns a palette colour to a node by conceptual bucket.
 */
function colour(k: SpectraKey) {
  return SpectraNode[k];
}

export function normalizeTypeName(value: string) {
  return value === "model3d" ? "model_3d" : value;
}

/**
 * NODETOOL built‑in data types with SpectraNode colours applied.
 */
const NODETOOL_DATA_TYPES: DataType[] = [
  {
    value: "any",
    label: "Any",
    description:
      "Accepts any data type. Use when a node can handle multiple input types dynamically.",
    color: colour("execution"),
    textColor: "dark",
    name: "",
    slug: "",
    namespace: "",
    icon: "QuestionMark"
  },
  {
    value: "notype",
    label: "No Type",
    description: "No output or type not specified.",
    color: "#A7B1BF",
    textColor: "dark",
    name: "",
    slug: "",
    namespace: "",
    icon: "NotType"
  },
  {
    value: "asset",
    label: "Asset",
    description:
      "Reference to media files or documents stored in the asset library.",
    color: colour("reference"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "audio",
    label: "Audio",
    description:
      "Audio data for playback, processing, or generation. Supports WAV, MP3, and other formats.",
    color: colour("audio"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "Audiotrack"
  },
  {
    value: "video",
    label: "Video",
    description:
      "Video data for playback, editing, or generation. Supports MP4, WebM, and other formats.",
    color: colour("video"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "Videocam"
  },
  {
    value: "bool",
    label: "Boolean",
    description:
      "Logical true or false value. Used for conditions, toggles, and binary choices.",
    color: colour("boolean"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "CheckBoxOutlineBlank"
  },
  {
    value: "chunk",
    label: "Chunk",
    description:
      "Partial data from a streaming response. Used in real-time chat and generation workflows.",
    color: colour("collection"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "Message"
  },
  {
    value: "dataframe",
    label: "Dataframe",
    description:
      "Tabular data with rows and columns. Used for CSV data, analytics, and data processing.",
    color: colour("collection"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "TableChart"
  },
  {
    value: "document",
    label: "Document",
    description:
      "Structured document with text content and metadata. Supports PDF, DOCX, and text files.",
    color: colour("reference"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "Document"
  },
  {
    value: "dict",
    label: "Dictionary",
    description:
      "Key-value pairs collection. Used for structured data, configurations, and JSON objects.",
    color: colour("collection"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "List"
  },
  {
    value: "enum",
    label: "Enumeration",
    description:
      "A predefined set of named options. Used for dropdowns and fixed-choice selections.",
    color: colour("collection"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "ShortText"
  },
  {
    value: "file",
    label: "File",
    description:
      "Reference to an uploaded file. Used for file inputs and attachments.",
    color: colour("reference"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "InsertDriveFile"
  },
  {
    value: "float",
    label: "Float",
    description:
      "Decimal number with fractional precision. Used for measurements, percentages, and ratios.",
    color: colour("scalar"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "Numbers"
  },
  {
    value: "folder",
    label: "Folder",
    description:
      "Reference to a folder in the asset library. Used for batch processing multiple files.",
    color: colour("reference"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "Folder"
  },
  {
    value: "image",
    label: "Image",
    description:
      "Image data for display, editing, or generation. Supports PNG, JPEG, WebP, and other formats.",
    color: colour("texture"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "Image"
  },
  {
    value: "int",
    label: "Integer",
    description:
      "Whole number without decimals. Used for counts, indices, and discrete quantities.",
    color: "#0891B2",
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "Numbers"
  },
  {
    value: "list",
    label: "List",
    description:
      "Ordered collection of items. Used for arrays, sequences, and batch processing.",
    color: colour("collection"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "List"
  },
  {
    value: "str",
    label: "String",
    description:
      "Text value for labels, names, and short text. Use Text type for longer content.",
    color: colour("textual"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "Abc"
  },
  {
    value: "tensor",
    label: "Tensor",
    description:
      "Multi-dimensional numerical array. Used for ML model inputs, embeddings, and computations.",
    color: colour("matrix"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "text",
    label: "Text",
    description:
      "Extended text content for documents, prompts, and multi-line strings.",
    color: colour("textual"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "TextSnippet"
  },
  {
    value: "union",
    label: "Union",
    description:
      "Value that can be one of several specified types. Enables flexible type handling.",
    color: colour("reference"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "MergeType"
  },
  {
    value: "language_model",
    label: "Language Model",
    description:
      "Reference to an LLM for text generation, chat, and language understanding tasks.",
    color: colour("reference"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "ViewInAr"
  },
  {
    value: "embedding_model",
    label: "Embedding Model",
    description:
      "Reference to an embedding model for generating vector embeddings from text or images.",
    color: colour("reference"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "tensor"
  },
  {
    value: "asr_model",
    label: "ASR Model",
    description:
      "Reference to an automatic speech recognition model for transcribing audio.",
    color: colour("reference"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "model"
  },
  {
    value: "bytes",
    label: "Bytes",
    description:
      "Raw binary data (e.g. downloaded file bodies). Typically converted to assets or decoded downstream.",
    color: colour("reference"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "InsertDriveFile"
  },
  {
    value: "collection",
    label: "Collection",
    description:
      "Reference to a vector / document collection used for retrieval and indexing (e.g. RAG).",
    color: colour("collection"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "Storage"
  },
  {
    value: "font",
    label: "Font",
    description:
      "Font asset reference (e.g. for video subtitles or rasterized text overlays). Behaves like other asset-backed pins.",
    color: colour("reference"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "TextFields"
  },
  {
    value: "image_size",
    label: "Image size",
    description:
      "Structured width/height (and related) dimensions for generation or preprocessing nodes.",
    color: colour("scalar"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "AspectRatio"
  },
  {
    value: "llama_cpp_model",
    label: "Llama.cpp model",
    description:
      "Reference to a local GGUF / llama.cpp–compatible checkpoint for LlamaCpp-backed nodes.",
    color: colour("reference"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "ViewInAr"
  },
  {
    value: "llama_model",
    label: "Llama model (HF)",
    description:
      "Reference to a Hugging Face/transformers-compatible Llama-family model selector.",
    color: colour("reference"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "ViewInAr"
  },
  {
    value: "message",
    label: "Message",
    description:
      "Chat message with role and content. Used in conversation flows and chat interfaces.",
    color: colour("textual"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "Message"
  },
  {
    value: "mistral_model",
    label: "Mistral model",
    description:
      "Reference to a Mistral model for nodes that expose provider-specific selectors.",
    color: colour("reference"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "ViewInAr"
  },
  {
    value: "model_3d_model",
    label: "3D pipeline model",
    description:
      "Provider selector for 3D generation APIs (e.g. Meshy), distinct from an output model_3d asset.",
    color: colour("reference"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },
  {
    value: "none",
    label: "None",
    description:
      "No meaningful output value — used for nodes that exist for side effects (e.g. delete/move) rather than wiring data onward.",
    color: colour("execution"),
    textColor: "dark",
    name: "",
    slug: "",
    namespace: "",
    icon: "NotInterested"
  },
  {
    value: "task",
    label: "Task",
    description:
      "Agent task with goals and context. Used for autonomous AI agent workflows.",
    color: colour("event"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "Task"
  },
  {
    value: "thread",
    label: "Thread",
    description:
      "Conversation thread containing a sequence of messages for chat interactions.",
    color: colour("textual"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "thread"
  },
  {
    value: "model_ref",
    label: "Model Reference",
    description:
      "Reference to a machine learning model file or repository for inference.",
    color: colour("reference"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "model"
  },
  {
    value: "image_model",
    label: "Image Model",
    description:
      "Reference to an image generation or processing model for visual AI tasks.",
    color: colour("reference"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "model"
  },
  {
    value: "tjs.cached",
    label: "Transformers.js model (tjs.*)",
    description:
      "Cached Transformers.js / ONNX hub model selectors. Ports use runtime-specific names such as tjs.text_generation or tjs.text_classification; they behave like model references for browser-side inference.",
    color: colour("reference"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "ViewInAr"
  },
  {
    value: "torch_tensor",
    label: "Torch tensor",
    description:
      "PyTorch-backed tensor blob (often latents). Used mainly by Hugging Face–side nodes and Python interoperability.",
    color: colour("matrix"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "tts_model",
    label: "TTS model",
    description:
      "Reference to a text-to-speech model for speech synthesis pipelines.",
    color: colour("reference"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "model"
  },
  {
    value: "video_model",
    label: "Video model",
    description:
      "Reference to a video generation or processing model selector.",
    color: colour("reference"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "model"
  },
  {
    value: "workflow",
    label: "Workflow",
    description:
      "Reference to another workflow. Used for nesting and composing complex pipelines.",
    color: colour("reference"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "datetime",
    label: "DateTime",
    description:
      "Date and time value with timezone support. Used for scheduling and timestamps.",
    color: colour("scalar"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "date",
    label: "Date",
    description: "Calendar date without a time component.",
    color: colour("scalar"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "object",
    label: "Object",
    description:
      "Generic structured object. Used for complex data that doesn't fit other types.",
    color: colour("collection"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "json",
    label: "JSON",
    description:
      "Structured JSON data. Used for nested objects, configuration, and API payloads.",
    color: colour("collection"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "model_3d",
    label: "Model 3D",
    description:
      "3D model data for visualization or processing. Supports GLB and GLTF.",
    color: colour("reference"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },
  {
    value: "np_array",
    label: "NumPy Array",
    description:
      "NumPy array for numerical computing. Used for scientific data and ML operations.",
    color: colour("matrix"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "tensor"
  }
];

let DATA_TYPES: DataType[] = [...NODETOOL_DATA_TYPES, ...COMFY_DATA_TYPES];
const DATA_TYPE_MAP: Record<string, DataType> = {};

/** Resolved built-in datatype for coloring, icons, and Help blurbs (includes tjs.* family). */
function bundledDataTypeForTypeName(normalizedBaseName: string): DataType | undefined {
  const direct = DATA_TYPE_MAP[normalizedBaseName];
  if (direct) {
    return direct;
  }
  if (
    normalizedBaseName.startsWith("tjs.") &&
    normalizedBaseName !== "tjs.cached" &&
    DATA_TYPE_MAP["tjs.cached"]
  ) {
    return DATA_TYPE_MAP["tjs.cached"];
  }
  return undefined;
}

export function datatypeByName(name: string): DataType | null {
  const stripped = name.replace(/^nodetool\./, "");
  const normalizedName = normalizeTypeName(stripped);
  const hit = bundledDataTypeForTypeName(normalizedName);
  if (hit) {
    return hit;
  }
  return DATA_TYPE_MAP["notype"] ?? null;
}

export function colorForType(type: string): string {
  const n = normalizeTypeName(type.replace(/^nodetool\./, ""));
  return bundledDataTypeForTypeName(n)?.color || stringToColor(type);
}

export function descriptionForType(type: string): string {
  const n = normalizeTypeName(type.replace(/^nodetool\./, ""));
  return bundledDataTypeForTypeName(n)?.description || "";
}

export function labelForType(type: string): string {
  const n = normalizeTypeName(type.replace(/^nodetool\./, ""));
  return bundledDataTypeForTypeName(n)?.label || "";
}

// Alphabetical ordering for ease of lookup
DATA_TYPES.sort((a, b) => a.value.localeCompare(b.value));

/** Utilities ------------------------------------------------------------- */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      }
    : null;
}

function getLuminance({
  r,
  g,
  b
}: {
  r: number;
  g: number;
  b: number;
}): number {
  const a = [r, g, b].map(function (v) {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function getNames(value: string): {
  namespace: string;
  name: string;
  slug: string;
} {
  const lastIndex = value.lastIndexOf(".");
  const namespace = lastIndex === -1 ? "" : value.substring(0, lastIndex);
  const name = lastIndex === -1 ? value : value.substring(lastIndex + 1);
  const slug = value.replaceAll(".", "_").replaceAll("-", "_").toLowerCase();

  return { namespace, name, slug };
}

// Inject namespace/name/slug fields
DATA_TYPES = DATA_TYPES.map((node): DataType => {
  const { namespace, name, slug } = getNames(node.value);

  return {
    ...node,
    namespace,
    name,
    slug
  };
});

// Auto‑derive text colour + register CSS variables
DATA_TYPES = DATA_TYPES.map((type: DataType) => {
  const color = type.color || stringToColor(type.value);
  const { namespace, name, slug } = getNames(type.value);
  const rgbColor = hexToRgb(color);
  const luminance = rgbColor ? getLuminance(rgbColor) : 0;
  const textColor = luminance > 0.4 ? "#111" : "#eee";
  return {
    ...type,
    color,
    textColor,
    namespace,
    name,
    slug
  };
});

DATA_TYPES.forEach((type) => {
  const color: string = type.color || stringToColor(type.value);
  document.documentElement.style.setProperty(`--c_${type.slug}`, color);
  document.documentElement.style.setProperty(
    `--c_${type.slug}_text`,
    type.textColor
  );
  DATA_TYPE_MAP[type.value] = type;
});

export { DATA_TYPES };
