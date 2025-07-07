/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

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

import { solarizedColors, monokaiColors } from "./data_type_colors";
import { COMFY_DATA_TYPES, comfyIconMap } from "./comfy_data_types";

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

// export function useDynamicSvgImport(iconName: string) {
//   const SvgIcon = iconMap[iconName] || Any;
//   return { SvgIcon };
// }

export interface DataType {
  value: string;
  label: string;
  namespace: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  textColor: "#fff" | "dark" | "var(--palette-action-active)";
  icon?: string;
}

// Update color values in DATA_TYPES
const NODETOOL_DATA_TYPES: DataType[] = [
  // Strictly matches TypeScript's `any` datatype only
  {
    value: "any",
    label: "Any",
    description: "Nodes using the TypeScript 'any' datatype",
    color: solarizedColors.base01,
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
    color: monokaiColors.white,
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
    color: monokaiColors.yellow,
    textColor: "dark",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "audio",
    label: "Audio",
    description: "Audio data",
    color: solarizedColors.violet,
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
    color: monokaiColors.green,
    textColor: "dark",
    name: "",
    slug: "",
    namespace: "",
    icon: "Videocam"
  },
  {
    value: "bool",
    label: "Boolean",
    description: "True or false values",
    color: solarizedColors.base03,
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "CheckBoxOutlineBlank"
  },
  {
    value: "dataframe",
    label: "Dataframe",
    description: "Structured data in a tabular format",
    color: solarizedColors.cyan,
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "TableChart"
  },
  {
    value: "dict",
    label: "Dictionary",
    description: "Key-Value pairs collection",
    color: monokaiColors.orange,
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
    color: solarizedColors.magenta,
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
    color: monokaiColors.yellow,
    textColor: "dark",
    name: "",
    slug: "",
    namespace: "",
    icon: "InsertDriveFile"
  },
  {
    value: "float",
    label: "Float",
    description: "Real numbers with fractional parts",
    color: solarizedColors.base01,
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
    color: solarizedColors.base00,
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
    color: solarizedColors.blue,
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
    color: solarizedColors.base02,
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
    color: monokaiColors.purple,
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
    color: solarizedColors.green,
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "Abc"
  },
  {
    value: "tensor",
    label: "Tensor",
    description: "Multi-dimensional arrays",
    color: monokaiColors.pink,
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
    color: solarizedColors.green,
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
    color: solarizedColors.violet,
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
    color: monokaiColors.blue,
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
    color: solarizedColors.blue,
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
    color: monokaiColors.yellow,
    textColor: "dark",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },
  {
    value: "database",
    label: "Database",
    description: "Database",
    color: solarizedColors.base2,
    textColor: "var(--palette-action-active)",
    name: "",
    slug: "",
    namespace: "",
    icon: "Database"
  },

  {
    value: "task",
    label: "Task",
    description: "used for agent tasks",
    color: solarizedColors.base2,
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

const iconStyles = (theme: any) => ({
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
}

export const IconForType = memo(function IconForType({
  iconName,
  containerStyle,
  bgStyle,
  svgProps,
  showTooltip = true
}: IconForTypeProps) {
  const theme = useTheme();
  const name = iconName?.replace("nodetool.", "") || "notype";
  const dataType = datatypeByName(name);
  const description = dataType?.description || "";
  const IconComponent = name
    ? iconMap[name] || iconMap["any"]
    : iconMap["notype"];

  return (
    <div css={iconStyles} style={containerStyle} className="icon-container">
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
                fontSize: theme.fontSizeNormal,
                fontFamily: theme.fontFamily1
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

DATA_TYPES.sort((a, b) => a.value.localeCompare(b.value));

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

DATA_TYPES = DATA_TYPES.map((node): DataType => {
  const { namespace, name, slug } = getNames(node.value);

  return {
    ...node,
    namespace,
    name,
    slug
  };
});

// add colors if not set and determine light or dark text color
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
