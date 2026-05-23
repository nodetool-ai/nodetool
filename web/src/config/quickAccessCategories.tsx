/** @jsxImportSource @emotion/react */
/**
 * Left-panel sidebar (top-level) and node-browser sub-tabs.
 *
 *  - `LEFT_PANEL_TOP_LEVEL` (5 entries): one icon per top-level view shown in
 *    the vertical rail.
 *  - `NODE_SUBCATEGORIES` (8 entries): tile-grid sub-tabs nested inside the
 *    "Nodes" view. Each filters MetadataStore down to a node family.
 *
 * Order in each array drives display order.
 */
import type { ReactNode } from "react";
import SearchIcon from "@mui/icons-material/Search";
import HistoryIcon from "@mui/icons-material/History";
import GridViewIcon from "@mui/icons-material/GridView";
import ImageIcon from "@mui/icons-material/Image";
import MovieIcon from "@mui/icons-material/Movie";
import AudiotrackIcon from "@mui/icons-material/Audiotrack";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import BuildIcon from "@mui/icons-material/Build";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import LoginIcon from "@mui/icons-material/Login";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import HubIcon from "@mui/icons-material/Hub";
import { IconForType } from "./data_types";

import type { NodeMetadata } from "../stores/ApiTypes";
import {
  getContentCardVariant,
  getPrimaryOutput
} from "../components/node_types/contentCardRegistry";
import type { LeftPanelView, NodeCategoryId } from "../stores/PanelStore";

export interface LeftPanelTopLevelCategory {
  id: LeftPanelView;
  label: string;
  icon: ReactNode;
}

export interface NodeSubcategory {
  id: NodeCategoryId;
  label: string;
  icon: ReactNode;
  filter: (m: NodeMetadata) => boolean;
}

const primaryVariantIs =
  (...variants: string[]) =>
  (m: NodeMetadata): boolean => {
    const v = getContentCardVariant(getPrimaryOutput(m));
    return variants.includes(v);
  };

/**
 * Tools sub-category: editing primitives (Levels, Crop, Channels, Blur,
 * Compositor, Painter, etc.) mapped to existing base-nodes.
 */
const TOOLS_NODE_TYPES = new Set<string>([
  "nodetool.image.Resize",
  "nodetool.image.Crop",
  "nodetool.image.Scale",
  "nodetool.image.Fit",
  "nodetool.image.Paste",
  "nodetool.image.Blur",
  "nodetool.image.Channels",
  "nodetool.image.RotateAndFlip",
  "nodetool.image.Levels",
  "nodetool.image.Compositor",
  "nodetool.image.Painter",
  "nodetool.image.Upscale",
  "nodetool.image.RemoveBackground",
  "nodetool.image.Relight",
  "nodetool.image.Vectorize",
  "lib.image.filter.Invert",
  "lib.image.filter.ConvertToGrayscale",
  "lib.image.color_grading.Curves",
  "lib.image.color_grading.Exposure",
  "lib.image.color_grading.HSLAdjust",
  "lib.image.Mask"
]);

const POPULAR_MODELS_2026: readonly string[] = [
  // Image
  "fal.text_to_image.NanoBananaPro",
  "fal.text_to_image.GptImage2",
  "fal.text_to_image.Imagen4PreviewUltra",
  "fal.text_to_image.FluxV1Pro",
  "fal.text_to_image.FluxDev",
  "fal.text_to_image.BytedanceSeedreamV45TextToImage",
  "fal.text_to_image.QwenImage",
  "fal.text_to_image.RecraftV3",
  "fal.text_to_image.StableDiffusionV35Large",
  "fal.image_to_image.NanoBananaProEdit",
  // Video
  "fal.text_to_video.Veo31",
  "fal.text_to_video.Sora2TextToVideo",
  "fal.text_to_video.KlingVideoV26ProTextToVideo",
  "fal.text_to_video.SeeDanceV15ProTextToVideo",
  "fal.text_to_video.MinimaxHailuo23ProTextToVideo",
  "fal.text_to_video.WanV26TextToVideo",
  // Audio
  "fal.text_to_speech.ElevenlabsTtsTurboV25",
  "fal.text_to_speech.MinimaxSpeech26Hd",
  "fal.text_to_speech.MinimaxSpeech26Turbo"
];

const POPULAR_MODEL_RANK: ReadonlyMap<string, number> = new Map(
  POPULAR_MODELS_2026.map((nodeType, index) => [nodeType, index])
);

/**
 * Top-level sidebar icons. Reduced from 12 → 5 by collapsing all node
 * tile-grids under a single "Nodes" entry with sub-tabs.
 */
export const LEFT_PANEL_TOP_LEVEL: readonly LeftPanelTopLevelCategory[] = [
  { id: "search", label: "Search", icon: <SearchIcon /> },
  { id: "workflows", label: "Workflows", icon: <GridViewIcon /> },
  { id: "history", label: "History", icon: <HistoryIcon /> },
  {
    id: "assets",
    label: "Assets",
    icon: <IconForType iconName="asset" showTooltip={false} iconSize="small" />
  },
  { id: "nodes", label: "Nodes", icon: <HubIcon /> }
];

/**
 * Node sub-tabs shown inside the Nodes view. Each entry filters
 * MetadataStore down to one family of nodes.
 */
export const NODE_SUBCATEGORIES: readonly NodeSubcategory[] = [
  {
    id: "io",
    label: "Inputs / Outputs",
    icon: <LoginIcon />,
    filter: (m) =>
      m.node_type.startsWith("nodetool.input.") ||
      m.node_type.startsWith("nodetool.output.")
  },
  {
    id: "tools",
    label: "Tools",
    icon: <BuildIcon />,
    filter: (m) => TOOLS_NODE_TYPES.has(m.node_type)
  },
  {
    id: "image-models",
    label: "Image",
    icon: <ImageIcon />,
    filter: primaryVariantIs("image", "image_mask")
  },
  {
    id: "video-models",
    label: "Video",
    icon: <MovieIcon />,
    filter: primaryVariantIs("video")
  },
  {
    id: "audio-models",
    label: "Audio",
    icon: <AudiotrackIcon />,
    filter: primaryVariantIs("audio")
  },
  {
    id: "3d-models",
    label: "3D",
    icon: <ViewInArIcon />,
    filter: primaryVariantIs("model_3d")
  },
  {
    id: "agents",
    label: "Agents",
    icon: <SmartToyIcon />,
    filter: (m) => /(^|\.)agents\./.test(m.node_type)
  },
  {
    id: "control-flow",
    label: "Control",
    icon: <CallSplitIcon />,
    filter: (m) => m.node_type.startsWith("nodetool.control.")
  }
];

export const getTopLevelCategory = (
  id: LeftPanelView
): LeftPanelTopLevelCategory | undefined =>
  LEFT_PANEL_TOP_LEVEL.find((c) => c.id === id);

export const getNodeSubcategory = (
  id: NodeCategoryId
): NodeSubcategory | undefined =>
  NODE_SUBCATEGORIES.find((c) => c.id === id);

/**
 * Combined view of all curated `node_type` strings referenced by
 * sub-categories — used by `useAuditCuratedCategories` to flag drift
 * between this config and the live node registry.
 */
export const CURATED_NODE_TYPES: ReadonlyMap<string, NodeCategoryId[]> =
  (() => {
    const m = new Map<string, NodeCategoryId[]>();
    const add = (set: ReadonlySet<string>, id: NodeCategoryId) => {
      for (const t of set) {
        const arr = m.get(t) ?? [];
        arr.push(id);
        m.set(t, arr);
      }
    };
    add(TOOLS_NODE_TYPES, "tools");
    return m;
  })();

/**
 * Filter all metadata to the entries that should appear under this
 * sub-category. Returns the list sorted with first-party nodes first,
 * then curated popular models, then alphabetical.
 */
export const filterNodesForCategory = (
  category: NodeSubcategory,
  all: NodeMetadata[],
  query: string = ""
): NodeMetadata[] => {
  const q = query.trim().toLowerCase();
  const matches = all.filter((m) => {
    if (!category.filter(m)) {
      return false;
    }
    if (!q) {
      return true;
    }
    return (
      m.title.toLowerCase().includes(q) ||
      m.node_type.toLowerCase().includes(q) ||
      m.namespace.toLowerCase().includes(q)
    );
  });

  if (q) {
    matches.sort((a, b) => a.title.localeCompare(b.title));
    return matches;
  }

  const tierOf = (m: NodeMetadata): number => {
    if (m.node_type.startsWith("nodetool.")) {
      return 0;
    }
    return POPULAR_MODEL_RANK.has(m.node_type) ? 1 : 2;
  };

  matches.sort((a, b) => {
    const tierA = tierOf(a);
    const tierB = tierOf(b);
    if (tierA !== tierB) {
      return tierA - tierB;
    }
    if (tierA === 1) {
      return POPULAR_MODEL_RANK.get(a.node_type)! -
        POPULAR_MODEL_RANK.get(b.node_type)!;
    }
    return a.title.localeCompare(b.title);
  });
  return matches;
};
