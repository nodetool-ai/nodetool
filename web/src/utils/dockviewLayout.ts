import { DockviewApi, SerializedDockview } from "dockview";
import { defaultLayout } from "../config/defaultLayouts";

type LeafNode = {
  type: "leaf";
  data: {
    views: string[];
    activeView: string;
    id: string;
  };
  size?: number;
};

type BranchNode = {
  type: "branch";
  data: Array<LeafNode | BranchNode>;
  size?: number;
};

// Typed view of the panels and grid internals we need to manipulate
type PanelsMap = Record<string, object>;
type SerializedGrid = { root?: LeafNode | BranchNode };

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

export function migrateDockviewLayout(
  layout: SerializedDockview
): SerializedDockview {
  const next = deepClone(layout);
  const panels = next.panels as PanelsMap;

  // 1) Rename legacy view id "examples" -> "templates"
  if (panels && "examples" in panels) {
    const examplesPanel = panels["examples"];
    delete panels["examples"];
    panels["templates"] = {
      ...examplesPanel,
      id: "templates",
      contentComponent: "templates"
    };
  }

  // 2) Ensure required panels exist
  next.panels = next.panels || ({} as typeof next.panels);
  const panelsMap = next.panels as PanelsMap;
  const ensurePanel = (panelId: string) => {
    if (!panelsMap[panelId]) {
      panelsMap[panelId] = {
        id: panelId,
        contentComponent: panelId,
        title: panelId
      };
    }
  };
  ["templates", "workflows", "recent-chats", "chat"].forEach(ensurePanel);

  // 3) Walk grid tree and fix view ids to match panels; remap legacy ids
  const panelIds = new Set(Object.keys(next.panels as PanelsMap));

  const fixNode = (node: LeafNode | BranchNode): LeafNode | BranchNode => {
    if (node.type === "leaf") {
      const updatedViews = node.data.views.map((v) =>
        v === "examples" ? "templates" : v
      );
      const filteredViews = updatedViews.filter((v) => panelIds.has(v));

      // Ensure at least one valid view remains
      if (filteredViews.length === 0) {
        const fallbackPanel =
          ["templates", "workflows"].find((panelId) => panelIds.has(panelId)) ||
          Array.from(panelIds)[0];
        if (fallbackPanel) {
          filteredViews.push(fallbackPanel);
        }
      }

      let activeView =
        updatedViews.includes(node.data.activeView) && panelIds.has(node.data.activeView)
          ? node.data.activeView
          : filteredViews[0];
      if (!activeView && filteredViews.length > 0) {
        [activeView] = filteredViews;
      }

      return {
        ...node,
        data: {
          ...node.data,
          views: filteredViews,
          activeView
        }
      };
    }

    return {
      ...node,
      data: node.data.map((child) => fixNode(child))
    } as BranchNode;
  };

  const grid = next.grid as SerializedGrid | undefined;
  if (grid?.root) {
    grid.root = fixNode(grid.root);
  }

  return next;
}

export function applyDockviewLayoutSafely(
  api: DockviewApi,
  layout: SerializedDockview
): void {
  try {
    const migrated = migrateDockviewLayout(layout);
    api.fromJSON(migrated);
  } catch (_err) {
    // Fallback to default if anything goes wrong
    try {
      api.fromJSON(defaultLayout);
    } catch (_) {
      // no-op
    }
  }
}
