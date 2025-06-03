/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { Tooltip } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../config/constants";
import ThemeNodetool from "../components/themes/ThemeNodetool";
import { memo } from "react";
import { isEqual } from "lodash";

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

import comfy_taesd from "../icons/comfy_taesd.svg?react";
import comfy_clip from "../icons/comfy_clip.svg?react";
import comfy_clip_vision from "../icons/comfy_clip_vision.svg?react";
import comfy_clip_vision_output from "../icons/comfy_clip_vision_output.svg?react";
import comfy_conditioning from "../icons/comfy_conditioning.svg?react";
import comfy_control_net from "../icons/comfy_control_net.svg?react";
import comfy_embeds from "../icons/comfy_embeds.svg?react";
import comfy_gligen from "../icons/comfy_gligen.svg?react";
import comfy_image_tensor from "../icons/comfy_image_tensor.svg?react";
import comfy_insight_face from "../icons/comfy_insight_face.svg?react";
import comfy_ip_adapter from "../icons/comfy_ip_adapter.svg?react";
import comfy_latent from "../icons/comfy_latent.svg?react";
import comfy_mask from "../icons/comfy_mask.svg?react";
import comfy_sampler from "../icons/comfy_sampler.svg?react";
import comfy_sigmas from "../icons/comfy_sigmas.svg?react";
import comfy_style_model from "../icons/comfy_style_model.svg?react";
import comfy_unet from "../icons/comfy_unet.svg?react";
import comfy_vae from "../icons/comfy_vae.svg?react";

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
  "comfy.taesd": comfy_taesd,
  "comfy.clip": comfy_clip,
  "comfy.clip_vision": comfy_clip_vision,
  "comfy.clip_vision_output": comfy_clip_vision_output,
  "comfy.conditioning": comfy_conditioning,
  "comfy.control_net": comfy_control_net,
  "comfy.embeds": comfy_embeds,
  "comfy.gligen": comfy_gligen,
  "comfy.image_tensor": comfy_image_tensor,
  "comfy.insight_face": comfy_insight_face,
  "comfy.ip_adapter": comfy_ip_adapter,
  "comfy.latent": comfy_latent,
  "comfy.mask": comfy_mask,
  "comfy.sampler": comfy_sampler,
  "comfy.sigmas": comfy_sigmas,
  "comfy.style_model": comfy_style_model,
  "comfy.unet": comfy_unet,
  "comfy.vae": comfy_vae
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
  textColor: "#fff" | "dark";
  icon?: string;
}

// Add color theme constants
const solarizedColors = {
  base03: "#002b36",
  base02: "#073642",
  base01: "#586e75",
  base00: "#657b83",
  base0: "#839496",
  base1: "#93a1a1",
  base2: "#eee8d5",
  base3: "#fdf6e3",
  yellow: "#b58900",
  orange: "#cb4b16",
  magenta: "#d33682",
  violet: "#6c71c4",
  blue: "#268bd2",
  cyan: "#2aa198",
  green: "#859900"
} as const;

const monokaiColors = {
  background: "#2e2e2e",
  comments: "#797979",
  white: "#d6d6d6",
  yellow: "#e5b567",
  green: "#b4d273",
  orange: "#e87d3e",
  purple: "#9e86c8",
  pink: "#b05279",
  blue: "#6c99bb"
} as const;

// Update color values in DATA_TYPES
let DATA_TYPES: DataType[] = [
  {
    value: "any",
    label: "Any Type",
    description: "A generic datatype, accepting any kind of value",
    color: solarizedColors.base0,
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
    textColor: "#fff",
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
    textColor: "#fff",
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
    textColor: "#fff",
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
    textColor: "#fff",
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
    textColor: "#fff",
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
    textColor: "#fff",
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
    textColor: "#fff",
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
    textColor: "#fff",
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
    textColor: "#fff",
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
    textColor: "#fff",
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
    textColor: "#fff",
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
    textColor: "#fff",
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
    textColor: "#fff",
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
    textColor: "#fff",
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
    textColor: "#fff",
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
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "Message"
  },

  {
    value: "comfy.embeds",
    label: "Comfy Embeddings",
    description: "Vectors that map text to a continuous space",
    color: monokaiColors.purple,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "comfy.mask",
    label: "Comfy Mask",
    description: "Image masks",
    color: solarizedColors.base01,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "comfy.sigmas",
    label: "Comfy Sigmas",
    description: "Used for Comfy Advanced KSampler",
    color: monokaiColors.comments,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "comfy.unet",
    label: "Comfy Model",
    description: "Neural network architecture",
    color: monokaiColors.blue,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },
  {
    value: "comfy.image_tensor",
    label: "Comfy Image",
    description: "Tensor representation of an image",
    color: solarizedColors.blue,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "Image"
  },
  {
    value: "comfy.clip",
    label: "Comfy CLIP",
    description: "Model used for CLIP Text Encode",
    color: monokaiColors.yellow,
    textColor: "dark",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },
  {
    value: "comfy.conditioning",
    label: "comfy.Conditioning",
    description: "Diffusion model conditioning",
    color: solarizedColors.orange,
    textColor: "dark",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },

  {
    value: "comfy.sampler",
    label: "Comfy Sampler",
    description: "Sampler to denoise latent images",
    color: monokaiColors.green,
    textColor: "dark",
    name: "",
    slug: "",
    namespace: "",
    icon: "Functions"
  },

  {
    value: "comfy.control_net",
    label: "Comfy Control Net",
    description: "Guiding models",
    color: solarizedColors.cyan,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "Functions"
  },
  {
    value: "comfy.vae",
    label: "Comfy Variational Autoencoder",
    description: "Variational Autoencoder",
    color: monokaiColors.orange,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },

  {
    value: "comfy.latent",
    label: "Comfy Latent",
    description: "Intermediate representations",
    color: monokaiColors.pink,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },

  {
    value: "comfy.clip_vision",
    label: "Comfy CLIP Vision",
    description: "Visual processing component",
    color: solarizedColors.blue,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },

  {
    value: "comfy.clip_vision_output",
    label: "Comfy CLIP Vision Output",
    description: "CLIP model output",
    color: solarizedColors.violet,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "Image"
  },

  {
    value: "comfy.gligen",
    label: "Comfy GLIGEN",
    description: "Regional prompts",
    color: monokaiColors.purple,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "Functions"
  },
  {
    value: "comfy.ip_adapter",
    label: "Comfy IP Adapter",
    description: "Multimodal image generation",
    color: solarizedColors.magenta,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },
  {
    value: "comfy.insight_face",
    label: "Comfy Insight Face",
    description: "Face analysis",
    color: monokaiColors.blue,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },
  {
    value: "comfy.style_model",
    label: "Comfy Style Model",
    description: "Style application model",
    color: solarizedColors.green,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
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
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "Database"
  }
];

type IconProps = React.SVGProps<SVGSVGElement> & {
  containerStyle?: React.CSSProperties;
  bgStyle?: React.CSSProperties;
};

const iconStyles = (theme: any) => ({
  "&": {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    position: "relative"
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
    height: "100%",
    maxWidth: "100%",
    maxHeight: "100%"
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
                color: "#fff",
                display: "block",
                fontSize: ThemeNodetool.fontSizeNormal,
                fontFamily: ThemeNodetool.fontFamily1
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
