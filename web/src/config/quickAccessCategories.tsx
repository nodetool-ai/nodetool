/** @jsxImportSource @emotion/react */
/**
 * Quick-access sidebar categories (plan §7.3, §7.6).
 *
 * Each category is one icon in the left-rail. Categories are either:
 *  - "panel" — content rendered by an existing component (Search, History,
 *    Workflows, Assets).
 *  - "tile-grid" — filtered tile grid of nodes from MetadataStore (Image
 *    Models, Video Models, 3D Models, Quick access, Tools).
 *
 * Order in this array drives sidebar order.
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
import { IconForType } from "./data_types";

import type { NodeMetadata } from "../stores/ApiTypes";
import {
  getContentCardVariant,
  getPrimaryOutput
} from "../components/node_types/contentCardRegistry";

export type QuickAccessCategoryId =
  | "search"
  | "history"
  | "workflows"
  | "assets"
  | "io"
  | "image-models"
  | "video-models"
  | "audio-models"
  | "3d-models"
  | "agents"
  | "control-flow"
  | "tools";

export type QuickAccessCategoryKind = "panel" | "tile-grid";

export interface QuickAccessCategory {
  id: QuickAccessCategoryId;
  label: string;
  icon: ReactNode;
  kind: QuickAccessCategoryKind;
  /**
   * For `tile-grid` categories: predicate over node metadata that determines
   * whether the node appears in this category. Undefined for panel-kind.
   */
  filter?: (m: NodeMetadata) => boolean;
}

const primaryVariantIs =
  (...variants: string[]) =>
  (m: NodeMetadata): boolean => {
    const v = getContentCardVariant(getPrimaryOutput(m));
    return variants.includes(v);
  };

/**
 * Tools category (plan §7.3 row "Tools"): editing nodes (Levels, Crop,
 * Channels, Blur, Compositor, Painter, etc.). Mapped to existing base-nodes
 * editing primitives; bespoke bodies arrive in later PRs but the underlying
 * nodes already exist.
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
  "lib.image.filter.Invert",
  "lib.image.filter.ConvertToGrayscale",
  "lib.image.color_grading.Curves",
  "lib.image.color_grading.Exposure",
  "lib.image.color_grading.HSLAdjust",
  "lib.image.Mask"
]);

export const QUICK_ACCESS_CATEGORIES: readonly QuickAccessCategory[] = [
  {
    id: "search",
    label: "Search",
    icon: <SearchIcon />,
    kind: "panel"
  },
  {
    id: "history",
    label: "History",
    icon: <HistoryIcon />,
    kind: "panel"
  },
  {
    id: "workflows",
    label: "Workflows",
    icon: <GridViewIcon />,
    kind: "panel"
  },
  {
    id: "assets",
    label: "Assets",
    icon: <IconForType iconName="asset" showTooltip={false} iconSize="small" />,
    kind: "panel"
  },
  {
    id: "io",
    label: "Inputs / Outputs",
    icon: <LoginIcon />,
    kind: "tile-grid",
    filter: (m) =>
      m.node_type.startsWith("nodetool.input.") ||
      m.node_type.startsWith("nodetool.output.")
  },
  {
    id: "tools",
    label: "Tools",
    icon: <BuildIcon />,
    kind: "tile-grid",
    filter: (m) => TOOLS_NODE_TYPES.has(m.node_type)
  },
  {
    id: "image-models",
    label: "Image Models",
    icon: <ImageIcon />,
    kind: "tile-grid",
    filter: primaryVariantIs("image", "image_mask")
  },
  {
    id: "video-models",
    label: "Video Models",
    icon: <MovieIcon />,
    kind: "tile-grid",
    filter: primaryVariantIs("video")
  },
  {
    id: "audio-models",
    label: "Audio Models",
    icon: <AudiotrackIcon />,
    kind: "tile-grid",
    filter: primaryVariantIs("audio")
  },
  {
    id: "3d-models",
    label: "3D Models",
    icon: <ViewInArIcon />,
    kind: "tile-grid",
    filter: primaryVariantIs("model_3d")
  },
  {
    id: "agents",
    label: "Agents",
    icon: <SmartToyIcon />,
    kind: "tile-grid",
    filter: (m) => /(^|\.)agents\./.test(m.node_type)
  },
  {
    id: "control-flow",
    label: "Control Flow",
    icon: <CallSplitIcon />,
    kind: "tile-grid",
    filter: (m) => m.node_type.startsWith("nodetool.control.")
  }
];

export const getCategory = (
  id: QuickAccessCategoryId
): QuickAccessCategory | undefined =>
  QUICK_ACCESS_CATEGORIES.find((c) => c.id === id);

/**
 * Combined view of all curated `node_type` strings referenced by the
 * tile-grid categories — used by `useAuditCuratedCategories` to flag drift
 * between this config and the live node registry.
 */
export const CURATED_NODE_TYPES: ReadonlyMap<string, QuickAccessCategoryId[]> =
  (() => {
    const m = new Map<string, QuickAccessCategoryId[]>();
    const add = (set: ReadonlySet<string>, id: QuickAccessCategoryId) => {
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
 * Filter all metadata to the entries that should appear under this category.
 * Returns the list sorted by title. Panel-kind categories return [].
 */
export const filterNodesForCategory = (
  category: QuickAccessCategory,
  all: NodeMetadata[],
  query: string = ""
): NodeMetadata[] => {
  if (category.kind !== "tile-grid" || !category.filter) {
    return [];
  }
  const q = query.trim().toLowerCase();
  const matches = all.filter((m) => {
    if (!category.filter!(m)) {
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
  matches.sort((a, b) => a.title.localeCompare(b.title));
  return matches;
};
