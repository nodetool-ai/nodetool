/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import stc from "string-to-color";

// import {
//   Abc, // For text or descriptions
//   DataObject, // Generic icon for data-related types
//   Description, // For text or descriptions
//   Image, // For images
//   Audiotrack, // For audio
//   Videocam, // For video
//   CheckBoxOutlineBlank, // For boolean (true/false)
//   TableChart, // For structured d
//   List, // For lists or collections
//   ShortText, // For strings
//   Functions, // For mathematical or computational concepts
//   Folder, // For folders
//   InsertDriveFile, // For files
//   Message, // For messages
//   Memory, // For technical, computing resources
//   Numbers, // For numbers
//   ModelTraining, // For machine learning models
//   TextSnippet, // For longer text blocks
//   MergeType, // For unions or combined types
//   QuestionMark // Fallback or generic icon for undefined types
// } from "@mui/icons-material";

// Import statements for each icon
import any from "../icons/any.svg?react";
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
import { Tooltip } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../components/node/BaseNode";
import ThemeNodetool from "../components/themes/ThemeNodetool";
// import comfy_taesd from "../icons/comfy.taesd.svg?react";
// import comfy_clip from "../icons/comfy.clip.svg?react";
// import comfy_clip_vision from "../icons/comfy.clip_vision.svg?react";
// import comfy_clip_vision_output from "../icons/comfy.clip_vision_output.svg?react";
// import comfy_conditioning from "../icons/comfy.conditioning.svg?react";
// import comfy_control_net from "../icons/comfy.control_net.svg?react";
// import comfy_embeds from "../icons/comfy.embeds.svg?react";
// import comfy_gligen from "../icons/comfy.gligen.svg?react";
// import comfy_image_tensor from "../icons/comfy.image_tensor.svg?react";
// import comfy_insight_face from "../icons/comfy.insight_face.svg?react";
// import comfy_ip_adapter from "../icons/comfy.ip_adapter.svg?react";
// import comfy_latent from "../icons/comfy.latent.svg?react";
// import comfy_mask from "../icons/comfy.mask.svg?react";
// import comfy_sampler from "../icons/comfy.sampler.svg?react";
// import comfy_sigmas from "../icons/comfy.sigmas.svg?react";
// import comfy_style_model from "../icons/comfy.style_model.svg?react";
// import comfy_unet from "../icons/comfy.unet.svg?react";
// import comfy_vae from "../icons/comfy.vae.svg?react";

// Mapping of icon names to their respective imports
const iconMap: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
  any,
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
  thread,
  thread_message,
  union,
  video
  // "comfy.taesd": comfy_taesd,
  // "comfy.clip": comfy_clip,
  // "comfy.clip_vision": comfy_clip_vision,
  // "comfy.clip_vision_output": comfy_clip_vision_output,
  // "comfy.conditioning": comfy_conditioning,
  // "comfy.control_net": comfy_control_net,
  // "comfy.embeds": comfy_embeds,
  // "comfy.gligen": comfy_gligen,
  // "comfy.image_tensor": comfy_image_tensor,
  // "comfy.insight_face": comfy_insight_face,
  // "comfy.ip_adapter": comfy_ip_adapter,
  // "comfy.latent": comfy_latent,
  // "comfy.mask": comfy_mask,
  // "comfy.sampler": comfy_sampler,
  // "comfy.sigmas": comfy_sigmas,
  // "comfy.style_model": comfy_style_model,
  // "comfy.unet": comfy_unet,
  // "comfy.vae": comfy_vae
};

export { iconMap };

// export function useDynamicSvgImport(iconName: string) {
//   const SvgIcon = iconMap[iconName] || Any;
//   return { SvgIcon };
// }

interface DataType {
  value: string;
  label: string;
  namespace: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  textColor: "#eee" | "dark";
  icon?: string;
}

let DATA_TYPES: DataType[] = [
  {
    value: "any",
    label: "Any Type",
    description: "A generic datatype, accepting any kind of value",
    color: "#FFFFFF",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "QuestionMark"
  },
  {
    value: "asset",
    label: "Asset",
    description: "Media files or documents",
    color: "#E6DB69",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "audio",
    label: "Audio",
    description: "Audio data",
    color: "#9250e1",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "Audiotrack"
  },
  {
    value: "video",
    label: "Video",
    description: "Video data",
    color: "#BCF60C",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "Videocam"
  },
  {
    value: "bool",
    label: "Boolean",
    description: "True or false values",
    color: "#09152C",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "CheckBoxOutlineBlank"
  },
  {
    value: "dataframe",
    label: "Dataframe",
    description: "Structured data in a tabular format",
    color: "#AAFFC3",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "TableChart"
  },
  {
    value: "dict",
    label: "Dictionary",
    description: "Key-Value pairs collection",
    color: "#FFD8B1",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "List"
  },
  {
    value: "enum",
    label: "Enumeration",
    description:
      "A set of named constants, representing a choice from a defined set - used for dropdown menus",
    color: "#F54F31",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "ShortText"
  },
  {
    value: "file",
    label: "File",
    description: "Uploaded files",
    color: "#FFC63D",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "InsertDriveFile"
  },
  {
    value: "float",
    label: "Float",
    description: "Real numbers with fractional parts",
    // color: "#747D82",
    color: "#acb8bf",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "Numbers"
  },
  {
    value: "folder",
    label: "Folder",
    description: "Refers to a folder from the asset library",
    color: "#B9AF8A",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "Folder"
  },
  {
    value: "image",
    label: "Image",
    description: "Image data",
    color: "#64B5F6",
    // color: "#36B1BF",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "Image"
  },
  {
    value: "int",
    label: "Integer",
    description: "Whole numbers",
    color: "#3B3F42",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "Numbers"
  },
  {
    value: "list",
    label: "List",
    description: "An ordered collection of items, allowing duplicates",
    color: "#E6BEFF",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "List"
  },
  {
    value: "str",
    label: "String",
    description: "A sequence of characters, representing textual data",
    color: "#12620B",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "Abc"
  },
  {
    value: "tensor",
    label: "Tensor",
    description: "Multi-dimensional arrays",
    color: "#C331ED",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "text",
    label: "Text",
    description:
      "Used for longer blocks of textual data, distinct from simple strings",
    color: "#248809",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "TextSnippet"
  },
  {
    value: "union",
    label: "Union",
    description: "Represents a value that could be one of several types",
    color: "#7B5353",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "MergeType"
  },
  {
    value: "model",
    label: "Model",
    description: "Machine learning model",
    // color: "#B39DDB",
    color: "#800061",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },
  {
    value: "thread",
    label: "Thread",
    description: "LLM Message Thread",
    color: "#3B1EBF",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "Message"
  },
  {
    value: "thread_message",
    label: "Thread Message",
    description: "A single message within an LLM Thread",
    color: "#4D39D7",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "Message"
  },

  {
    value: "comfy.embeds",
    label: "Comfy Embeddings",
    description:
      "Vectors that map text to a continuous space, used in Stable Diffusion",
    color: "",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "comfy.mask",
    label: "Comfy Mask",
    description:
      "Image masks, used to specify regions of interest or to filter out unwanted areas of an image",
    color: "#81C784",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "comfy.sigmas",
    label: "Comfy Sigmas",
    description: "Used for Comfy Advanced KSampler",
    color: "",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "comfy.unet",
    label: "Comfy Model",
    description:
      "A convolutional neural network architecture for image segmentation and denoising",
    color: "#B39DDB",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },
  {
    value: "comfy.image_tensor",
    label: "Comfy Image",
    description:
      "A tensor representation of an image, used in Stable Diffusion",
    color: "",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "Image"
  },
  {
    value: "comfy.clip",
    label: "Comfy CLIP",
    description: "Model used for CLIP Text Encode",
    color: "#FFD500",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },
  {
    value: "comfy.conditioning",
    label: "comfy.Conditioning",
    description:
      "In ComfyUI, conditionings guide diffusion models based on initial text prompts",
    color: "#FFA931",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },

  {
    value: "comfy.sampler",
    label: "Comfy Sampler",
    description: "Sampler to denoise latent images",
    color: "",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "Functions"
  },

  {
    value: "comfy.control_net",
    label: "Comfy Control Net",
    description: "Guiding models for Stable Diffusion",
    color: "#6EE7B7",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "Functions"
  },
  {
    value: "comfy.vae",
    label: "Comfy Variational Autoencoder",
    description: "Variational Autoencoder for Stable Diffusion",
    color: "#FF6E6E",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },

  {
    value: "comfy.latent",
    label: "Comfy Latent",
    description:
      "Intermediate representations of images in a compact, encoded form, used in Stable Diffusion",
    color: "#FF9CF9",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },

  {
    value: "comfy.clip_vision",
    label: "Comfy CLIP Vision",
    description:
      "The visual processing component of the CLIP model, used in Stable Diffusion to interpret and manipulate images in alignment with textual data",
    color: "#A8DADC",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },

  {
    value: "comfy.clip_vision_output",
    label: "Comfy CLIP Vision Output",
    description:
      "The output from the CLIP model's vision component, used in Stable Diffusion to align generated images with textual descriptions",
    color: "#ad7452",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "Image"
  },

  {
    value: "comfy.gligen",
    label: "Comfy GLIGEN",
    description: "Regional prompts for Stable Diffusion",
    color: "",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "Functions"
  },
  {
    value: "comfy.ip_adapter",
    label: "Comfy IP Adapter",
    description:
      "Multimodal image generation similar to ControlNet, but with a different architecture and training process",
    color: "",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },
  {
    value: "comfy.insight_face",
    label: "Comfy Insight Face",
    description:
      "2D and 3D face analysis, including recognition, detection, and alignment",
    color: "",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },
  {
    value: "comfy.style_model",
    label: "Comfy Style Model",
    description:
      "A model that applies a style to an image, used in Stable Diffusion",
    color: "#C2FFAE",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },
  {
    value: "taesd",
    label: "TAESD",
    description:
      "Tiny Autoencoder for Stable Diffusion previews, a lightweight alternative to VAE",
    color: "#DCC274",
    textColor: "#eee",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
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
    alignItems: "center"
  },
  ".icon-bg": {
    width: "100%",
    height: "100%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: "4px"
  }
});

export function datatypeByName(name: string) {
  const foundItem = DATA_TYPES.find((item) => item.value === name);
  return foundItem || null;
}

export function iconForType(
  iconName: string,
  props?: IconProps,
  showTooltip = true
) {
  const name = iconName.replace("nodetool.", "");
  const description = datatypeByName(name)?.description || "";
  const IconComponent = iconMap[name] || iconMap["any"];
  const { containerStyle, bgStyle, ...svgProps } = props || {};

  return (
    <div css={iconStyles} style={containerStyle} className="icon-container">
      <Tooltip
        enterDelay={TOOLTIP_ENTER_DELAY}
        title={
          showTooltip ? (
            <span
              style={{
                textAlign: "left",
                // backgroundColor: ThemeNodetool.palette.c_gray1,
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
}

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
