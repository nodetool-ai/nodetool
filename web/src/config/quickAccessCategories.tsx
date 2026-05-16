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
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import BoltIcon from "@mui/icons-material/Bolt";
import BuildIcon from "@mui/icons-material/Build";
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
  | "image-models"
  | "video-models"
  | "3d-models"
  | "quick-access"
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
 * Quick-access entries (plan §7.3 row "Quick access"): "Prompt, Import,
 * Export, Preview, Import Model, Import LoRA — useful primitives". Resolved
 * to the actual node_types present in the registry.
 */
const QUICK_ACCESS_NODE_TYPES = new Set<string>([
  "nodetool.agents.Agent",
  "nodetool.input.StringInput",
  "nodetool.input.ImageInput",
  "nodetool.input.IntegerInput",
  "nodetool.input.FloatInput",
  "nodetool.output.Output",
  "nodetool.workflows.base_node.Preview",
  "nodetool.image.LoadImageFile",
  "nodetool.image.LoadImageAssets",
  "nodetool.image.SaveImage"
]);

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
  "lib.image.filter.Invert",
  "lib.image.filter.ConvertToGrayscale",
  "lib.image.color_grading.Curves",
  "lib.image.color_grading.Exposure",
  "lib.image.color_grading.HSLAdjust",
  "lib.image.Composite",
  "lib.image.Blend"
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
    id: "3d-models",
    label: "3D Models",
    icon: <ViewInArIcon />,
    kind: "tile-grid",
    filter: primaryVariantIs("model_3d")
  },
  {
    id: "quick-access",
    label: "Quick access",
    icon: <BoltIcon />,
    kind: "tile-grid",
    filter: (m) => QUICK_ACCESS_NODE_TYPES.has(m.node_type)
  },
  {
    id: "tools",
    label: "Tools",
    icon: <BuildIcon />,
    kind: "tile-grid",
    filter: (m) => TOOLS_NODE_TYPES.has(m.node_type)
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
    add(QUICK_ACCESS_NODE_TYPES, "quick-access");
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
