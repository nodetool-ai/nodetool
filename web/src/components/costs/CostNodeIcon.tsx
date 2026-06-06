/**
 * Maps a node category to the small glyph shown in the leading icon tile of
 * each cost table row.
 */
import React from "react";
import SubjectIcon from "@mui/icons-material/Subject";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import ImageIcon from "@mui/icons-material/Image";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import ScatterPlotIcon from "@mui/icons-material/ScatterPlot";
import type { SvgIconProps } from "@mui/material/SvgIcon";

import type { NodeCategory } from "./costsData";

const ICONS: Record<NodeCategory, React.ComponentType<SvgIconProps>> = {
  text: SubjectIcon,
  audio: GraphicEqIcon,
  image: ImageIcon,
  upscale: OpenInFullIcon,
  background: ContentCutIcon,
  llm: ChatBubbleOutlineIcon,
  embedding: ScatterPlotIcon
};

export const CostNodeIcon: React.FC<
  { category: NodeCategory } & SvgIconProps
> = ({ category, ...props }) => {
  const Icon = ICONS[category] ?? SubjectIcon;
  return <Icon {...props} />;
};
