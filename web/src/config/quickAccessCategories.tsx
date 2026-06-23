/** @jsxImportSource @emotion/react */
/**
 * Left-panel sidebar (top-level) and node-browser sub-tabs.
 *
 *  - `LEFT_PANEL_TOP_LEVEL`: one icon per top-level view shown in
 *    the vertical rail.
 *  - `NODE_SUBCATEGORIES`: tile-grid sub-tabs nested inside the
 *    "Nodes" view. Each filters MetadataStore down to a node family. Media
 *    families are split into non-AI (processing/editing) and AI (model)
 *    variants — e.g. "Image" vs "Image AI".
 *
 * Order in each array drives display order.
 */
import type { ReactNode } from "react";
import AppsIcon from "@mui/icons-material/Apps";
import HistoryIcon from "@mui/icons-material/History";
import GridViewIcon from "@mui/icons-material/GridView";
import SettingsIcon from "@mui/icons-material/Settings";
import StarIcon from "@mui/icons-material/Star";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import ImageIcon from "@mui/icons-material/Image";
import MovieIcon from "@mui/icons-material/Movie";
import BrushOutlinedIcon from "@mui/icons-material/BrushOutlined";
import AudiotrackIcon from "@mui/icons-material/Audiotrack";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import LoginIcon from "@mui/icons-material/Login";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import HubIcon from "@mui/icons-material/Hub";
import PermMediaOutlinedIcon from "@mui/icons-material/PermMediaOutlined";

import type { NodeMetadata } from "../stores/ApiTypes";
import {
  getContentCardVariant,
  getPrimaryOutput
} from "../components/node_types/contentCardRegistry";
import { getRequiredSecretKeyForNamespace } from "../utils/nodeProvider";
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

const isImageOutput = primaryVariantIs("image", "image_mask");
const isVideoOutput = primaryVariantIs("video");
const isAudioOutput = primaryVariantIs("audio");
const is3dOutput = primaryVariantIs("model_3d");

/**
 * Treat a node as "AI" when it runs a model: either the backend marked it
 * generative (`auto_save_asset` — set on TextToImage/ImageToImage/Upscale/
 * RemoveBackground/Relight and the fal/kie/replicate factories) or it lives
 * under a provider namespace that requires an API key (fal, replicate, openai,
 * huggingface, elevenlabs, …). Everything else (Resize, Blur, Trim, Normalize,
 * color grading, mesh repair, …) is local, deterministic processing.
 */
const isAiNode = (m: NodeMetadata): boolean =>
  m.auto_save_asset === true ||
  getRequiredSecretKeyForNamespace(m.namespace) !== null;

/**
 * Top-level sidebar icons. Reduced from 12 → 5 by collapsing all node
 * tile-grids under a single "Nodes" entry with sub-tabs.
 */
export const LEFT_PANEL_TOP_LEVEL: readonly LeftPanelTopLevelCategory[] = [
  { id: "nodes", label: "Nodes", icon: <HubIcon /> },
  { id: "workflows", label: "Workflows", icon: <GridViewIcon /> },
  { id: "sketches", label: "Sketches", icon: <BrushOutlinedIcon /> },
  { id: "timelines", label: "Timelines", icon: <MovieIcon /> },
  { id: "settings", label: "Settings", icon: <SettingsIcon /> },
  { id: "history", label: "History", icon: <HistoryIcon /> },
  { id: "favorites", label: "Favorites", icon: <StarIcon /> },
  { id: "assets", label: "Assets", icon: <PermMediaOutlinedIcon /> },
  { id: "agent", label: "Agent", icon: <SmartToyOutlinedIcon /> }
];

/**
 * Node sub-tabs shown inside the Nodes view. Each entry filters
 * MetadataStore down to one family of nodes.
 */
export const NODE_SUBCATEGORIES: readonly NodeSubcategory[] = [
  {
    id: "all",
    label: "All",
    icon: <AppsIcon />,
    filter: () => true
  },
  {
    id: "io",
    label: "I/O",
    icon: <LoginIcon />,
    filter: (m) =>
      m.node_type.startsWith("nodetool.input.") ||
      m.node_type.startsWith("nodetool.output.")
  },
  {
    id: "image",
    label: "Image",
    icon: <ImageIcon />,
    filter: (m) => isImageOutput(m) && !isAiNode(m)
  },
  {
    id: "image-ai",
    label: "Image AI",
    icon: <AutoAwesomeIcon />,
    filter: (m) => isImageOutput(m) && isAiNode(m)
  },
  {
    id: "video",
    label: "Video",
    icon: <MovieIcon />,
    filter: (m) => isVideoOutput(m) && !isAiNode(m)
  },
  {
    id: "video-ai",
    label: "Video AI",
    icon: <AutoAwesomeIcon />,
    filter: (m) => isVideoOutput(m) && isAiNode(m)
  },
  {
    id: "audio",
    label: "Audio",
    icon: <AudiotrackIcon />,
    filter: (m) => isAudioOutput(m) && !isAiNode(m)
  },
  {
    id: "audio-ai",
    label: "Audio AI",
    icon: <AutoAwesomeIcon />,
    filter: (m) => isAudioOutput(m) && isAiNode(m)
  },
  {
    id: "3d-models",
    label: "3D",
    icon: <ViewInArIcon />,
    filter: is3dOutput
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
 * Filter all metadata down to the entries that belong to this sub-category.
 * Ordering and query matching are handled by the smart node ranker
 * (`rankSearchNodes`), so this only resolves category membership.
 */
export const filterNodesForCategory = (
  category: NodeSubcategory,
  all: NodeMetadata[]
): NodeMetadata[] => all.filter(category.filter);
