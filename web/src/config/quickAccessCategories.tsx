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
import type { DocsTopic } from "./docsLinks";
import AppsIcon from "@mui/icons-material/Apps";
import HistoryIcon from "@mui/icons-material/History";
import GridViewIcon from "@mui/icons-material/GridView";
import SettingsIcon from "@mui/icons-material/Settings";
import StarIcon from "@mui/icons-material/Star";
import ImageIcon from "@mui/icons-material/Image";
import MovieIcon from "@mui/icons-material/Movie";
import BrushOutlinedIcon from "@mui/icons-material/BrushOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import DashboardCustomizeOutlinedIcon from "@mui/icons-material/DashboardCustomizeOutlined";
import DataObjectOutlinedIcon from "@mui/icons-material/DataObjectOutlined";
import RecordVoiceOverOutlinedIcon from "@mui/icons-material/RecordVoiceOverOutlined";
import AudiotrackIcon from "@mui/icons-material/Audiotrack";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import LoginIcon from "@mui/icons-material/Login";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import HubIcon from "@mui/icons-material/Hub";
import PermMediaOutlinedIcon from "@mui/icons-material/PermMediaOutlined";
import CollectionsOutlinedIcon from "@mui/icons-material/CollectionsOutlined";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";

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
  description: string;
  docsTopic: DocsTopic;
  icon: ReactNode;
}

export interface LeftPanelGroup {
  id: string;
  placement: "top" | "bottom";
  categories: readonly LeftPanelTopLevelCategory[];
}

interface NodeSubcategory {
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
const LEFT_PANEL_CATEGORY_BY_ID: Readonly<
  Record<LeftPanelView, LeftPanelTopLevelCategory>
> = {
  nodes: {
    id: "nodes",
    label: "Nodes",
    description: "Browse, search, and add nodes to the current workflow.",
    docsTopic: "nodes",
    icon: <HubIcon />
  },
  favorites: {
    id: "favorites",
    label: "Favorites",
    description: "Find nodes that you saved as favorites.",
    docsTopic: "nodes",
    icon: <StarIcon />
  },
  history: {
    id: "history",
    label: "History",
    description: "Reuse nodes that you added recently.",
    docsTopic: "nodes",
    icon: <HistoryIcon />
  },
  settings: {
    id: "settings",
    label: "Settings",
    description: "Edit settings for the current workflow.",
    docsTopic: "workflows",
    icon: <SettingsIcon />
  },
  workflows: {
    id: "workflows",
    label: "Workflows",
    description: "Open, create, and manage workflows.",
    docsTopic: "workflows",
    icon: <GridViewIcon />
  },
  apps: {
    id: "apps",
    label: "Apps",
    description: "Build and open user-facing apps from workflows.",
    docsTopic: "apps",
    icon: <DashboardCustomizeOutlinedIcon />
  },
  chats: {
    id: "chats",
    label: "Chats",
    description: "Open and create saved AI conversations.",
    docsTopic: "chat",
    icon: <ForumOutlinedIcon />
  },
  sketches: {
    id: "sketches",
    label: "Sketches",
    description: "Open and create free-form visual sketches.",
    docsTopic: "sketches",
    icon: <BrushOutlinedIcon />
  },
  scripts: {
    id: "scripts",
    label: "Scripts",
    description: "Create and manage narrative or production scripts.",
    docsTopic: "scripts",
    icon: <RecordVoiceOverOutlinedIcon />
  },
  storyboards: {
    id: "storyboards",
    label: "Storyboards",
    description: "Plan sequences as ordered visual scenes.",
    docsTopic: "storyboards",
    icon: <DashboardOutlinedIcon />
  },
  timelines: {
    id: "timelines",
    label: "Timelines",
    description: "Arrange media and events over time.",
    docsTopic: "timelines",
    icon: <MovieIcon />
  },
  jsscripts: {
    id: "jsscripts",
    label: "JS Scripts",
    description: "Create and manage reusable JavaScript code.",
    docsTopic: "scripts",
    icon: <DataObjectOutlinedIcon />
  },
  assets: {
    id: "assets",
    label: "Assets",
    description: "Browse assets available in the current context.",
    docsTopic: "assets",
    icon: <PermMediaOutlinedIcon />
  },
  library: {
    id: "library",
    label: "Library",
    description: "Browse all assets in the global library.",
    docsTopic: "assets",
    icon: <CollectionsOutlinedIcon />
  }
};

export const WORKFLOW_OUTPUT_DESCRIPTION =
  "Browse assets created by the current workflow.";

export const LEFT_PANEL_GROUPS: readonly LeftPanelGroup[] = [
  {
    id: "workflow-tools",
    placement: "top",
    categories: [
      LEFT_PANEL_CATEGORY_BY_ID.nodes,
      LEFT_PANEL_CATEGORY_BY_ID.favorites,
      LEFT_PANEL_CATEGORY_BY_ID.history,
      LEFT_PANEL_CATEGORY_BY_ID.settings
    ]
  },
  {
    id: "main-objects",
    placement: "top",
    categories: [
      LEFT_PANEL_CATEGORY_BY_ID.workflows,
      LEFT_PANEL_CATEGORY_BY_ID.apps,
      LEFT_PANEL_CATEGORY_BY_ID.chats
    ]
  },
  {
    id: "editors",
    placement: "top",
    categories: [
      LEFT_PANEL_CATEGORY_BY_ID.sketches,
      LEFT_PANEL_CATEGORY_BY_ID.scripts,
      LEFT_PANEL_CATEGORY_BY_ID.storyboards,
      LEFT_PANEL_CATEGORY_BY_ID.timelines,
      LEFT_PANEL_CATEGORY_BY_ID.jsscripts
    ]
  },
  {
    id: "resources",
    placement: "bottom",
    categories: [
      LEFT_PANEL_CATEGORY_BY_ID.assets,
      LEFT_PANEL_CATEGORY_BY_ID.library
    ]
  }
];

/** Flat form used by lookup and mobile code that does not need group metadata. */
export const LEFT_PANEL_TOP_LEVEL: readonly LeftPanelTopLevelCategory[] =
  LEFT_PANEL_GROUPS.flatMap((group) => group.categories);

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
): LeftPanelTopLevelCategory => LEFT_PANEL_CATEGORY_BY_ID[id];

export const getNodeSubcategory = (
  id: NodeCategoryId
): NodeSubcategory | undefined => NODE_SUBCATEGORIES.find((c) => c.id === id);

/**
 * Filter all metadata down to the entries that belong to this sub-category.
 * Ordering and query matching are handled by the smart node ranker
 * (`rankSearchNodes`), so this only resolves category membership.
 */
export const filterNodesForCategory = (
  category: NodeSubcategory,
  all: NodeMetadata[]
): NodeMetadata[] => all.filter(category.filter);
