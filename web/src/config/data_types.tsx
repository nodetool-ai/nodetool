/** @jsxImportSource @emotion/react */
import React from "react";
import { Tooltip } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../config/constants";
import { memo } from "react";
import { isEqual } from "lodash";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

// icons
import stc from "string-to-color";
import any from "../icons/any.svg?react";
import notype from "../icons/notype.svg?react";
import asset from "../icons/asset.svg?react";
import audio from "../icons/audio.svg?react";
import bool from "../icons/bool.svg?react";
import dataframe from "../icons/dataframe.svg?react";
import dict from "../icons/dict.svg?react";
import _enum from "../icons/enum.svg?react"; // 'enum' is a reserved keyword
import file from "../icons/file.svg?react";
import float from "../icons/float.svg?react";
import folder from "../icons/folder.svg?react";
import image from "../icons/image.svg?react";
import int from "../icons/int.svg?react";
import list from "../icons/list.svg?react";
import model from "../icons/model.svg?react";
import str from "../icons/str.svg?react";
import tensor from "../icons/tensor.svg?react";
import text from "../icons/text.svg?react";
import thread from "../icons/thread.svg?react";
import thread_message from "../icons/thread_message.svg?react";
import union from "../icons/union.svg?react";
import video from "../icons/video.svg?react";
import database from "../icons/database.svg?react";
import task from "../icons/task.svg?react";

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
  texture: "#D946EF", // fuchsia 500 — images / textures / video
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
  str,
  tensor,
  text,
  message: thread_message,
  union,
  video,
  database,
  task,
  language_model: model,
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

/**
 * NODETOOL built‑in data types with SpectraNode colours applied.
 */
const NODETOOL_DATA_TYPES: DataType[] = [
  {
    value: "any",
    label: "Any",
    description: "Nodes using the TypeScript 'any' datatype",
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
    description: "No output type",
    color: "#A7B1BF", // neutral grey
    textColor: "dark",
    name: "",
    slug: "",
    namespace: "",
    icon: "NotType"
  },
  {
    value: "asset",
    label: "Asset",
    description: "Media files or documents",
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
    description: "Audio data",
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
    description: "Video data",
    color: colour("texture"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "Videocam"
  },
  {
    value: "bool",
    label: "Boolean",
    description: "True or false values",
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
    description: "A chunk of data from a chat message stream",
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
    description: "Structured data in a tabular format",
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
    description: "Document file",
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
    description: "Key‑Value pairs collection",
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
    description: "A set of named constants",
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
    description: "Uploaded files",
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
    description: "Real numbers with fractional parts",
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
    description: "Refers to a folder from the asset library",
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
    description: "Image data",
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
    description: "Whole numbers",
    color: colour("scalar"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "Numbers"
  },
  {
    value: "list",
    label: "List",
    description: "An ordered collection of items",
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
    description: "A sequence of characters",
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
    description: "Multi‑dimensional arrays",
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
    description: "Used for longer blocks of textual data",
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
    description: "Represents a value that could be one of several types",
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
    description: "Language model",
    color: colour("reference"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },
  {
    value: "message",
    label: "Message",
    description: "A Chat Message",
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
    description: "Tiny Autoencoder",
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
    description: "Database",
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
    description: "Used for agent tasks",
    color: colour("event"),
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "Task"
  }
];

let DATA_TYPES: DataType[] = [...NODETOOL_DATA_TYPES, ...COMFY_DATA_TYPES];

type IconProps = React.SVGProps<SVGSVGElement> & {
  containerStyle?: React.CSSProperties;
  bgStyle?: React.CSSProperties;
};

const iconStyles = (theme: Theme) => ({
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
  const foundItem = DATA_TYPES.find((item) => item.value === name);
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
  small: 16,
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
  const dataType = datatypeByName(name);
  const description = dataType?.description || "";
  const IconComponent = name
    ? iconMap[name] || iconMap["any"] || iconMap["notype"]
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
  const foundType = DATA_TYPES.find((dt) => dt.value === type);
  return foundType?.color || stc(type);
}

export function textColorForType(type: string): string {
  const foundType = DATA_TYPES.find((dt) => dt.value === type);
  return foundType?.textColor || "#eee";
}

export function descriptionForType(type: string): string {
  const foundType = DATA_TYPES.find((dt) => dt.value === type);
  return foundType?.description || "";
}

export function labelForType(type: string): string {
  const foundType = DATA_TYPES.find((dt) => dt.value === type);
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
