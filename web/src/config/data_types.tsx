/** @jsxImportSource @emotion/react */
import React from "react";
import { Tooltip } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../config/constants";
import { memo } from "react";
import isEqual from "lodash/isEqual";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

// icons
import stc from "string-to-color";
import any from "../icons/data_types/nodetool/any.svg?react";
import notype from "../icons/data_types/nodetool/notype.svg?react";
import asset from "../icons/data_types/nodetool/asset.svg?react";
import audio from "../icons/data_types/nodetool/audio.svg?react";
import bool from "../icons/data_types/nodetool/bool.svg?react";
import chunk from "../icons/data_types/nodetool/chunk.svg?react";
import dataframe from "../icons/data_types/nodetool/dataframe.svg?react";
import dict from "../icons/data_types/nodetool/dict.svg?react";
import _enum from "../icons/data_types/nodetool/enum.svg?react"; // 'enum' is a reserved keyword
import file from "../icons/data_types/nodetool/file.svg?react";
import float from "../icons/data_types/nodetool/float.svg?react";
import folder from "../icons/data_types/nodetool/folder.svg?react";
import image from "../icons/data_types/nodetool/image.svg?react";
import int from "../icons/data_types/nodetool/int.svg?react";
import list from "../icons/data_types/nodetool/list.svg?react";
import model from "../icons/data_types/nodetool/model.svg?react";
import language_model from "../icons/data_types/nodetool/language_model.svg?react";
import image_model from "../icons/data_types/nodetool/image_model.svg?react";
import model_3d from "../icons/data_types/nodetool/model_3d.svg?react";
import str from "../icons/data_types/nodetool/str.svg?react";
import tensor from "../icons/data_types/nodetool/tensor.svg?react";
import text from "../icons/data_types/nodetool/text.svg?react";
import thread from "../icons/data_types/nodetool/thread.svg?react";
import thread_message from "../icons/data_types/nodetool/thread_message.svg?react";
import union from "../icons/data_types/nodetool/union.svg?react";
import video from "../icons/data_types/nodetool/video.svg?react";
import database from "../icons/data_types/nodetool/database.svg?react";
import task from "../icons/data_types/nodetool/task.svg?react";
import documentIcon from "../icons/data_types/nodetool/document.svg?react";
import np_array from "../icons/data_types/nodetool/np_array.svg?react";
import datetime from "../icons/data_types/nodetool/datetime.svg?react";
import date from "../icons/data_types/nodetool/date.svg?react";

import { COMFY_DATA_TYPES, comfyIconMap } from "./comfy_data_types";

/**
 * SpectraNode palette — core "500" tone for each conceptual category
 * Most node types are mapped to these category buckets.
 */
const SpectraNode = {
  // Cyan / blue family aligns with app primary for technical types
  scalar: "#22D3EE", // cyan 400 — numbers
  boolean: "#10B981", // emerald 500 — booleans / flags
  vector: "#06B6D4", // cyan 500 — vectors
  matrix: "#6366F1", // indigo 500 — tensors / matrices
  // Accents
  spatial: "#A3E635", // lime 400 — geometry
  texture: "#D946EF", // fuchsia 500 — images / textures
  video: "#8B5CF6", // violet 500 — video
  textual: "#F59E0B", // amber 500 — text / strings
  collection: "#FACC15", // yellow 400 — list / dict / dataframe / enum
  reference: "#3B82F6", // blue 500 — file‑like / objects / models / assets
  event: "#F43F5E", // rose 500 — events / tasks
  audio: "#0EA5E9", // sky/cyan 500 — audio / sound
  execution: "#64748B" // slate 500 — misc / execution
} as const;

type SpectraKey = keyof typeof SpectraNode;

// Mapping of icon names to their respective imports
const iconMap: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
  any,
  notype,
  asset,
  audio,
  bool,
  chunk,
  dataframe,
  dict,
  enum: _enum,
  file,
  float,
  folder,
  image,
  int,
  list,
  model,
  model_ref: model,
  language_model,
  image_model,
  str,
  tensor,
  text,
  message: thread_message,
  union,
  video,
  database,
  task,
  thread,
  workflow: dataframe,
  datetime,
  date,
  object: dict,
  np_array,
  json: dict,
  document: documentIcon,
  model_3d,
  ...comfyIconMap
};

export { iconMap };

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
  textColor: "#fff" | "dark" | "var(--palette-action-active)";
  icon?: string;
}

/**
 * Helper that assigns a palette colour to a node by conceptual bucket.
 */
function colour(k: SpectraKey) {
  return SpectraNode[k];
}

function normalizeTypeName(value: string) {
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
    value: "taesd",
    label: "TAESD",
    description:
      "Tiny Autoencoder for Stable Diffusion. Enables fast image previews during generation.",
    color: colour("reference"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },
  {
    value: "database",
    label: "Database",
    description:
      "Connection to a database for storing and querying structured data.",
    color: colour("reference"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "Database"
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

type IconProps = React.SVGProps<SVGSVGElement> & {
  containerStyle?: React.CSSProperties;
  bgStyle?: React.CSSProperties;
};

const iconStyles = (_theme: Theme) => ({
  "&": {
    display: "flex",
    justifyContent: "center",
    alignItems: "center"
  },
  ".icon-bg": {
    width: "100%",
    height: "100%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: "4px"
  },
  "& svg": {
    width: "100%",
    height: "100%"
  }
});

export function datatypeByName(name: string): DataType | null {
  const normalizedName = normalizeTypeName(name);
  const foundItem = DATA_TYPES.find((item) => item.value === normalizedName);
  return (
    foundItem || DATA_TYPES.find((item) => item.value === "notype") || null
  );
}

interface IconForTypeProps extends IconProps {
  iconName: string;
  showTooltip?: boolean;
  props?: IconProps;
  containerStyle?: React.CSSProperties;
  bgStyle?: React.CSSProperties;
  svgProps?: React.SVGProps<SVGSVGElement>;
  iconSize?: IconSizeOption;
}

type IconSizeOption = "small" | "normal" | "medium" | "large";

const ICON_SIZE_MAP: Record<IconSizeOption, number> = {
  small: 20,
  normal: 24,
  medium: 32,
  large: 40
};

export const IconForType = memo(function IconForType({
  iconName,
  containerStyle,
  bgStyle,
  svgProps,
  showTooltip = true,
  iconSize = "normal"
}: IconForTypeProps) {
  const theme = useTheme();
  const name = iconName?.replace("nodetool.", "") || "notype";
  const normalizedName = normalizeTypeName(name);
  const dataType = datatypeByName(normalizedName);
  const description = dataType?.description || "";
  const IconComponent = normalizedName
    ? iconMap[normalizedName] || iconMap["any"] || iconMap["notype"]
    : iconMap["notype"];
  const resolvedSize = `${ICON_SIZE_MAP[iconSize] ?? ICON_SIZE_MAP.normal}px`;

  return (
    <div
      css={iconStyles(theme)}
      style={{
        width: resolvedSize,
        height: resolvedSize,
        ...containerStyle
      }}
      className="icon-container"
    >
      <Tooltip
        enterDelay={TOOLTIP_ENTER_DELAY}
        title={
          showTooltip ? (
            <span
              style={{
                textAlign: "left",
                backgroundColor: "transparent",
                color: "var(--palette-action-active)",
                display: "block",
                fontSize: "var(--fontSizeNormal)",
                fontFamily: "var(--fontFamily1)"
              }}
            >
              {name.toUpperCase()} <br />
              {description}
            </span>
          ) : (
            ""
          )
        }
        placement="top"
      >
        <div className="icon-bg" style={bgStyle}>
          <IconComponent {...svgProps} />
        </div>
      </Tooltip>
    </div>
  );
},
isEqual);

export function colorForType(type: string): string {
  const normalizedType = normalizeTypeName(type);
  const foundType = DATA_TYPES.find((dt) => dt.value === normalizedType);
  return foundType?.color || stc(type);
}

export function textColorForType(type: string): string {
  const normalizedType = normalizeTypeName(type);
  const foundType = DATA_TYPES.find((dt) => dt.value === normalizedType);
  return foundType?.textColor || "#eee";
}

export function descriptionForType(type: string): string {
  const normalizedType = normalizeTypeName(type);
  const foundType = DATA_TYPES.find((dt) => dt.value === normalizedType);
  return foundType?.description || "";
}

export function labelForType(type: string): string {
  const normalizedType = normalizeTypeName(type);
  const foundType = DATA_TYPES.find((dt) => dt.value === normalizedType);
  return foundType?.label || "";
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
DATA_TYPES = DATA_TYPES.map((type: any) => {
  const color = type.color || stc(type.value);
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
  const color: string = type.color || stc(type.value);
  document.documentElement.style.setProperty(`--c_${type.slug}`, color);
  document.documentElement.style.setProperty(
    `--c_${type.slug}_text`,
    type.textColor
  );
});

export { DATA_TYPES };
