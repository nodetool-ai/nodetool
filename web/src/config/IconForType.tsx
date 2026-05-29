/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import isEqual from "fast-deep-equal";
import { Tooltip } from "../components/ui_primitives";
import { TOOLTIP_ENTER_DELAY } from "../config/constants";
import { datatypeByName, normalizeTypeName } from "./data_types";

// icons
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

import { comfyIconMap } from "./comfy_data_types";

// Mapping of icon names to their respective imports
const iconMap: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
  any,
  notype,
  asset,
  audio,
  bool,
  bytes: file,
  chunk,
  collection: database,
  dataframe,
  dict,
  enum: _enum,
  embedding_model: tensor,
  file,
  float,
  font: documentIcon,
  folder,
  image,
  image_size: language_model,
  int,
  list,
  model,
  model_ref: model,
  language_model,
  llama_cpp_model: language_model,
  llama_model: language_model,
  mistral_model: language_model,
  image_model,
  model_3d_model: model_3d,
  none: notype,
  str,
  tensor,
  text,
  message: thread_message,
  torch_tensor: tensor,
  tts_model: audio,
  asr_model: audio,
  video_model: video,
  union,
  video,
  "tjs.cached": language_model,
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

type IconProps = React.SVGProps<SVGSVGElement> & {
  containerStyle?: React.CSSProperties;
  bgStyle?: React.CSSProperties;
};

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
    borderRadius: "var(--rounded-sm)"
  },
  "& svg": {
    width: "100%",
    height: "100%"
  }
});

/** SVG React icon key — supports tjs.* → tjs.cached. */
function svgIconComponentKey(normalizedBaseName: string): string {
  if (iconMap[normalizedBaseName]) {
    return normalizedBaseName;
  }
  if (
    normalizedBaseName.startsWith("tjs.") &&
    normalizedBaseName !== "tjs.cached" &&
    iconMap["tjs.cached"]
  ) {
    return "tjs.cached";
  }
  return normalizedBaseName;
}

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
  const svgKey = normalizedName
    ? svgIconComponentKey(normalizedName)
    : "notype";
  const IconComponent =
    svgKey && iconMap[svgKey]
      ? iconMap[svgKey]
      : iconMap["any"] || iconMap["notype"];
  const resolvedSize = `${ICON_SIZE_MAP[iconSize] ?? ICON_SIZE_MAP.normal}px`;

  const iconInner = (
    <div className="icon-bg" style={bgStyle}>
      <IconComponent {...svgProps} />
    </div>
  );

  if (!showTooltip) {
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
        {iconInner}
      </div>
    );
  }

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
        }
        placement="top"
      >
        {iconInner}
      </Tooltip>
    </div>
  );
},
isEqual);
