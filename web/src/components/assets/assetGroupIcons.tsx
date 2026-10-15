import React from "react";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import AudiotrackOutlinedIcon from "@mui/icons-material/AudiotrackOutlined";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import type { SvgIconProps } from "@mui/material/SvgIcon";
import type { AssetGroupKey } from "./assetGridUtils";

const GROUP_ICONS: Record<AssetGroupKey, React.ComponentType<SvgIconProps>> = {
  image: ImageOutlinedIcon,
  video: VideocamOutlinedIcon,
  audio: AudiotrackOutlinedIcon,
  model_3d: ViewInArOutlinedIcon,
  text: DescriptionOutlinedIcon,
  application: ArticleOutlinedIcon,
  other: InsertDriveFileOutlinedIcon
};

/** The icon for an asset type group, shared by group headers and type chips. */
export const AssetGroupIcon: React.FC<
  { group: string } & Omit<SvgIconProps, "children">
> = ({ group, ...props }) => {
  const Icon = GROUP_ICONS[group as AssetGroupKey] ?? InsertDriveFileOutlinedIcon;
  return <Icon {...props} />;
};
