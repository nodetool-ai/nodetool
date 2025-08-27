/** @jsxImportSource @emotion/react */
import React from "react";
import { Tooltip } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../config/constants";
import { memo } from "react";
import { isEqual } from "lodash";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

// icons
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
// import thread from "../icons/thread.svg?react";
import thread_message from "../icons/thread_message.svg?react";
import union from "../icons/union.svg?react";
import video from "../icons/video.svg?react";
import database from "../icons/database.svg?react";
import task from "../icons/task.svg?react";

import { COMFY_DATA_TYPES, comfyIconMap } from "./comfy_data_types";
import {
  getLuminance as getLuminanceUtil,
  hexToRgb as hexToRgbUtil,
  parseOklch as parseOklchUtil,
  generateOKLCHFromSlug
} from "../utils/ColorUtils";

// SpectraNode category palette removed in favor of OKLCH generator

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
  category?: Category;
  /**
   * Core tone for this type as a CSS color string (OKLCH).
   * (Light / dark variants are derived in CSS).
   */
  color: string;
  /**
   * Text color derived from background contrast (e.g., from OKLCH lightness).
   */
  textColor: string;
  icon?: string;
}

const OKLCH_SPREAD_DEG = 16; // maximum hue deviation around the category anchor
const OKLCH_C_JITTER = 0.025; // chroma jitter amplitude for subtle within-category variation
const OKLCH_L_JITTER = 0.02; // lightness jitter amplitude to avoid banding while staying uniform
const OKLCH_EXECUTION_L_JITTER = 0.015; // smaller L jitter for neutral/execution types
const OKLCH_L_MIN = 0.58; // lower bound for lightness
const OKLCH_L_MAX = 0.88; // upper bound for lightness
const OKLCH_C_MIN = 0.06; // lower bound for chroma
const OKLCH_C_MAX = 0.22; // upper bound for chroma

/**
 * Manual color overrides for specific datatypes (stable, human-picked).
 * Values must be valid OKLCH strings.
 */
const COLOR_OVERRIDES: Record<string, string> = {
  any: "oklch(0.75 0.03 250)",
  notype: "oklch(0.65 0 0)"
};

export type Category =
  | "scalar"
  | "boolean"
  | "vector"
  | "matrix"
  | "spatial"
  | "texture"
  | "textual"
  | "collection"
  | "reference"
  | "event"
  | "audio"
  | "execution"
  | "comfy";

const CATEGORY_ANCHORS: Record<
  Category,
  {
    H: number;
    C: number;
    baseL?: number;
  }
> = {
  scalar: { H: 200, C: 0.14, baseL: 0.72 },
  boolean: { H: 150, C: 0.14, baseL: 0.72 },
  vector: { H: 220, C: 0.14, baseL: 0.72 },
  matrix: { H: 270, C: 0.16, baseL: 0.72 },
  spatial: { H: 120, C: 0.12, baseL: 0.72 },
  texture: { H: 320, C: 0.18, baseL: 0.72 },
  textual: { H: 70, C: 0.14, baseL: 0.72 },
  collection: { H: 95, C: 0.1, baseL: 0.72 },
  reference: { H: 250, C: 0.18, baseL: 0.72 },
  event: { H: 25, C: 0.18, baseL: 0.72 },
  audio: { H: 210, C: 0.14, baseL: 0.72 },
  comfy: { H: 180, C: 0.14, baseL: 0.72 },
  execution: {
    H: 0,
    C: 0.0,
    baseL: 0.62
  }
};

import { NODETOOL_DATA_TYPES } from "./nodetool_data_types";

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
    ? iconMap[name] || iconMap["any"] || iconMap["notype"]
    : iconMap["notype"];

  return (
    <div
      css={iconStyles(theme)}
      style={containerStyle}
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
  if (foundType?.color) return foundType.color;
  const { slug, name } = getNames(type);
  const overrideColor =
    COLOR_OVERRIDES[type] || COLOR_OVERRIDES[slug] || COLOR_OVERRIDES[name];
  // Generate with same category/rails as initialization for consistent results
  const category = foundType?.category as Category | undefined;
  const opts = category
    ? {
        anchorH: CATEGORY_ANCHORS[category]?.H,
        anchorC: CATEGORY_ANCHORS[category]?.C,
        baseL: CATEGORY_ANCHORS[category]?.baseL,
        spreadDeg: OKLCH_SPREAD_DEG,
        cJitter: OKLCH_C_JITTER,
        lJitter: OKLCH_L_JITTER,
        lMin: OKLCH_L_MIN,
        lMax: OKLCH_L_MAX,
        cMin: OKLCH_C_MIN,
        cMax: OKLCH_C_MAX
      }
    : undefined;
  return overrideColor || generateOKLCHFromSlug(slug, opts);
}

export function textColorForType(type: string): string {
  const foundType = DATA_TYPES.find((dt) => dt.value === type);
  return foundType?.textColor || "#eee";
}

export function descriptionForType(type: string): string {
  // Helper used by UI surfaces (e.g., Help/DataTypesList) to render descriptions
  const foundType = DATA_TYPES.find((dt) => dt.value === type);
  return foundType?.description || "";
}

export function labelForType(type: string): string {
  // Helper used by UI surfaces to render human‑readable labels
  const foundType = DATA_TYPES.find((dt) => dt.value === type);
  return foundType?.label || "";
}

// Alphabetical ordering for ease of lookup
DATA_TYPES.sort((a, b) => a.value.localeCompare(b.value));

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

export const CATEGORY_ORDER: Category[] = [
  "scalar",
  "boolean",
  "vector",
  "matrix",
  "spatial",
  "texture",
  "textual",
  "collection",
  "reference",
  "event",
  "audio",
  "comfy",
  "execution"
];

export function categoryForType(value: string): Category | "other" {
  return "other";
}

DATA_TYPES = DATA_TYPES.map((type: any) => {
  const { namespace, name, slug } = getNames(type.value);
  const overrideColor =
    COLOR_OVERRIDES[type.value] ||
    COLOR_OVERRIDES[slug] ||
    COLOR_OVERRIDES[name];
  const category = (type.category as Category | undefined) ?? undefined;
  const opts = category
    ? {
        anchorH: CATEGORY_ANCHORS[category]?.H,
        anchorC: CATEGORY_ANCHORS[category]?.C,
        baseL: CATEGORY_ANCHORS[category]?.baseL,
        spreadDeg: OKLCH_SPREAD_DEG,
        cJitter: OKLCH_C_JITTER,
        lJitter: OKLCH_L_JITTER,
        lMin: OKLCH_L_MIN,
        lMax: OKLCH_L_MAX,
        cMin: OKLCH_C_MIN,
        cMax: OKLCH_C_MAX
      }
    : undefined;
  const color: string = overrideColor || generateOKLCHFromSlug(slug, opts);

  let textColor = "#eee";
  const oklch = parseOklchUtil(color);
  if (oklch) {
    // Use OKLCH lightness directly for contrast decision
    textColor = oklch.l > 0.7 ? "#111" : "#eee";
  } else {
    const rgbColor = hexToRgbUtil(color);
    const luminance = rgbColor ? getLuminanceUtil(rgbColor) : 0;
    textColor = luminance > 0.4 ? "#111" : "#eee";
  }

  return {
    ...type,
    color,
    textColor,
    namespace,
    name,
    slug
  };
});

if (typeof document !== "undefined") {
  DATA_TYPES.forEach((type) => {
    const overrideColor =
      COLOR_OVERRIDES[type.value] ||
      COLOR_OVERRIDES[type.slug] ||
      COLOR_OVERRIDES[type.name];
    const category = (type.category as Category | undefined) ?? undefined;
    const opts = category
      ? {
          anchorH: CATEGORY_ANCHORS[category]?.H,
          anchorC: CATEGORY_ANCHORS[category]?.C,
          baseL: CATEGORY_ANCHORS[category]?.baseL,
          spreadDeg: OKLCH_SPREAD_DEG,
          cJitter: OKLCH_C_JITTER,
          lJitter: OKLCH_L_JITTER,
          lMin: OKLCH_L_MIN,
          lMax: OKLCH_L_MAX,
          cMin: OKLCH_C_MIN,
          cMax: OKLCH_C_MAX
        }
      : undefined;
    const color: string =
      overrideColor || generateOKLCHFromSlug(type.slug, opts);
    document.documentElement.style.setProperty(`--c_${type.slug}`, color);
    document.documentElement.style.setProperty(
      `--c_${type.slug}_text`,
      type.textColor
    );
  });
}

export { DATA_TYPES };
