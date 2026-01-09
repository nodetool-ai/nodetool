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

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

export function migrateDockviewLayout(
  layout: SerializedDockview
): SerializedDockview {
  const next = deepClone(layout);

  // 1) Rename legacy view id "examples" -> "templates"
  if ((next as any).panels && (next as any).panels.examples) {
    const examplesPanel = (next as any).panels.examples;
    delete (next as any).panels.examples;
    (next as any).panels.templates = {
      ...examplesPanel,
      id: "templates",
      contentComponent: "templates"
    };
  }

  // 2) Ensure required panels exist
  next.panels = next.panels || ({} as any);
  const ensurePanel = (panelId: string) => {
    if (!(next.panels as any)[panelId]) {
      (next.panels as any)[panelId] = {
        id: panelId,
        contentComponent: panelId,
        title: panelId
      };
    }
  };
  ["templates", "workflows", "recent-chats", "chat"].forEach(ensurePanel);

  // 3) Walk grid tree and fix view ids to match panels; remap legacy ids
  const panelIds = new Set(Object.keys(next.panels as any));

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
      data: node.data.map((child) => fixNode(child as any)) as any
    } as BranchNode;
  };

  if (next.grid && (next.grid as any).root) {
    (next.grid as any).root = fixNode((next.grid as any).root as any) as any;
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
