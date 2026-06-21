/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";

import { Text, thinScrollbarStyles, MOTION, FONT_WEIGHT, BORDER_RADIUS } from "../ui_primitives";
import NodeLibraryRow from "./NodeLibraryRow";
import NodeInfo from "./NodeInfo";
import useMetadataStore from "../../stores/MetadataStore";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import usePendingNodeCreateStore from "../../stores/PendingNodeCreateStore";
import { useRecentNodesStore } from "../../stores/RecentNodesStore";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import { rankSearchNodes } from "../../utils/nodeSearch";
import {
  filterNodesForCategory,
  NODE_SUBCATEGORIES,
  getNodeSubcategory
} from "../../config/quickAccessCategories";
import type { NodeCategoryId } from "../../stores/PanelStore";
import type { NodeMetadata } from "../../stores/ApiTypes";

const ROW_HEIGHT = 36;

const styles = (theme: Theme, isMobile: boolean) =>
  css({
    "&.nl-root": {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      minHeight: 0,
      overflow: "hidden"
    },

    ".nl-header": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      padding: isMobile
        ? theme.spacing(0.5, 1, 1, 1)
        : theme.spacing(1.5, 1.5, 1, 1.5)
    },
    ".nl-title": {
      fontSize: "var(--fontSizeNormal)",
      fontWeight: FONT_WEIGHT.semibold,
      letterSpacing: "-0.01em",
      color: theme.vars.palette.text.primary
    },
    ".nl-count": {
      display: "inline-flex",
      alignItems: "center",
      padding: "1px 8px",
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: theme.vars.palette.action.selected,
      color: theme.vars.palette.text.secondary,
      fontSize: "var(--fontSizeSmall)",
      fontWeight: FONT_WEIGHT.medium,
      fontVariantNumeric: "tabular-nums"
    },

    ".nl-search": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      margin: theme.spacing(0, isMobile ? 1 : 1.5, 1, isMobile ? 1 : 1.5),
      padding: theme.spacing(1, 1),
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.divider}`,
      transition: `border-color ${MOTION.fast}`,
      "&:focus-within": {
        borderColor: theme.vars.palette.primary.main
      },
      "& .nl-search-icon": {
        fontSize: 17,
        color: theme.vars.palette.text.secondary,
        flexShrink: 0
      },
      "& input": {
        flex: 1,
        minWidth: 0,
        background: "transparent",
        border: "none",
        outline: "none",
        color: theme.vars.palette.text.primary,
        fontFamily: theme.fontFamily1,
        fontSize: theme.fontSizeNormal
      },
      "& .nl-search-clear": {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 2,
        border: "none",
        background: "transparent",
        borderRadius: BORDER_RADIUS.sm,
        color: theme.vars.palette.text.secondary,
        cursor: "pointer",
        "&:hover": { color: theme.vars.palette.text.primary },
        "& svg": { fontSize: 15 }
      }
    },

    ".nl-kbd": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1px 6px",
      height: "18px",
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: theme.vars.palette.action.hover,
      border: `1px solid ${theme.vars.palette.divider}`,
      color: theme.vars.palette.text.secondary,
      fontSize: "var(--fontSizeSmaller)",
      fontWeight: FONT_WEIGHT.semibold,
      lineHeight: 1,
      flexShrink: 0
    },

    ".nl-body": {
      display: "flex",
      flexDirection: "column",
      flex: 1,
      minHeight: 0,
      borderTop: `1px solid ${theme.vars.palette.divider}`
    },
    ".nl-browse": {
      display: "flex",
      flex: 1,
      minHeight: 0
    },
    ".nl-info": {
      flex: "0 0 200px",
      display: "flex",
      height: 200,
      overflow: "hidden",
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.paper,
      // NodeInfo pins its own width/maxHeight for the floating menu; here it
      // fills the width and scrolls within this fixed-height bottom strip, so
      // the node list above keeps the rest of the height.
      "& > div": {
        width: "100% !important",
        height: "200px !important",
        maxHeight: "200px !important",
        flex: 1,
        minHeight: 0
      }
    },
    ".nl-info-empty": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      padding: theme.spacing(3),
      color: theme.vars.palette.text.secondary,
      fontSize: "var(--fontSizeSmall)",
      lineHeight: 1.5
    },

    ".nl-rail": {
      width: isMobile ? "106px" : "120px",
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
      gap: "2px",
      padding: theme.spacing(1, 1),
      overflowY: "auto",
      borderRight: `1px solid ${theme.vars.palette.divider}`,
      ...thinScrollbarStyles(theme)
    },
    ".nl-cat": {
      position: "relative",
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      width: "100%",
      padding: theme.spacing(1, 1, 1, 1),
      border: "none",
      background: "transparent",
      borderRadius: BORDER_RADIUS.md,
      color: theme.vars.palette.text.secondary,
      fontSize: "var(--fontSizeSmall)",
      lineHeight: 1.2,
      textAlign: "left",
      cursor: "pointer",
      transition: `${MOTION.background}, color ${MOTION.fast}`,
      "& .nl-cat-icon": {
        display: "inline-flex",
        flexShrink: 0,
        "& svg": { fontSize: "var(--fontSizeBig)" }
      },
      "& .nl-cat-label": {
        flex: 1,
        minWidth: 0,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      },
      "& .nl-cat-count": {
        fontSize: "var(--fontSizeSmaller)",
        opacity: 0.7,
        fontVariantNumeric: "tabular-nums"
      },
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        color: theme.vars.palette.text.primary
      },
      "&.active": {
        backgroundColor: theme.vars.palette.action.selected,
        color: theme.vars.palette.text.primary,
        "& .nl-cat-icon svg": { color: theme.vars.palette.primary.main },
        "&::before": {
          content: '""',
          position: "absolute",
          left: 0,
          top: "22%",
          bottom: "22%",
          width: "2px",
          borderRadius: "0 2px 2px 0",
          backgroundColor: theme.vars.palette.primary.main
        }
      },
      "&:focus-visible": {
        outline: `2px solid ${theme.vars.palette.primary.main}`,
        outlineOffset: "-2px"
      }
    },

    ".nl-list": {
      flex: 1,
      minWidth: 0,
      overflowY: "auto",
      padding: theme.spacing(1, 1),
      ...thinScrollbarStyles(theme)
    },
    ".nl-empty": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      padding: theme.spacing(2),
      textAlign: "center",
      color: theme.vars.palette.text.secondary,
      fontSize: "var(--fontSizeNormal)"
    },

    ".nl-footer": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: theme.spacing(1, 1.5),
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      color: theme.vars.palette.text.secondary,
      fontSize: "var(--fontSizeSmall)"
    },
    ".nl-footer-hint": {
      display: "inline-flex",
      alignItems: "center",
      gap: theme.spacing(1)
    }
  });

interface NodeLibraryProps {
  activeSubcategory: NodeCategoryId;
  onSubcategoryChange: (id: NodeCategoryId) => void;
  isMobile?: boolean;
}

/**
 * Two-column node browser shown in the left panel's "Nodes" view: a category
 * rail with per-family counts on the left, and a filtered, virtualized node
 * list on the right. The search query filters within the active category;
 * "All" searches across every node.
 */
const NodeLibrary = memo<NodeLibraryProps>(
  ({ activeSubcategory, onSubcategoryChange, isMobile = false }) => {
    const theme = useTheme();
    const [query, setQuery] = useState("");
    const [hoveredType, setHoveredType] = useState<string | null>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const category =
      getNodeSubcategory(activeSubcategory) ?? NODE_SUBCATEGORIES[0];
    const metadataRecord = useMetadataStore((s) => s.metadata);

    const requestCreate = usePendingNodeCreateStore((s) => s.requestCreate);
    const setDragToCreate = useNodeMenuStore((state) => state.setDragToCreate);
    const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
    const clearDrag = useDragDropStore((s) => s.clearDrag);
    const recentNodes = useRecentNodesStore((s) => s.recentNodes);

    useEffect(() => {
      searchRef.current?.focus();
    }, []);

    const allNodes = useMemo(
      () => Object.values(metadataRecord),
      [metadataRecord]
    );

    const counts = useMemo(() => {
      const map = {} as Record<NodeCategoryId, number>;
      for (const sub of NODE_SUBCATEGORIES) {
        map[sub.id] = allNodes.filter(sub.filter).length;
      }
      return map;
    }, [allNodes]);

    const recentNodeTypes = useMemo(
      () => recentNodes.map((node) => node.nodeType),
      [recentNodes]
    );

    const categoryNodes = useMemo(
      () => filterNodesForCategory(category, allNodes),
      [category, allNodes]
    );

    // Smart ranking (prefix + BM25 + fuzzy matching, with recency and
    // quick-action boosts) — used even when the query is empty so the default
    // browse order surfaces recent and common nodes ahead of a flat list.
    const nodes = useMemo(
      () => rankSearchNodes(categoryNodes, query, recentNodeTypes),
      [categoryNodes, query, recentNodeTypes]
    );

    // The info box follows the hovered row; with nothing hovered it shows a
    // helper hint instead of details.
    const infoNode = useMemo(() => {
      if (!hoveredType) {
        return null;
      }
      return nodes.find((n) => n.node_type === hoveredType) ?? null;
    }, [nodes, hoveredType]);

    const virtualizer = useVirtualizer({
      count: nodes.length,
      getScrollElement: () => scrollRef.current,
      estimateSize: () => ROW_HEIGHT,
      overscan: theme.virtualScroll.overscan.small
    });

    const handleDragStart = useCallback(
      (node: NodeMetadata, event: React.DragEvent<HTMLDivElement>) => {
        setDragToCreate(true);
        serializeDragData(
          { type: "create-node", payload: node },
          event.dataTransfer
        );
        event.dataTransfer.effectAllowed = "copyMove";
        setActiveDrag({ type: "create-node", payload: node });
      },
      [setDragToCreate, setActiveDrag]
    );

    const handleDragEnd = useCallback(() => {
      setDragToCreate(false);
      clearDrag();
    }, [setDragToCreate, clearDrag]);

    const handleNodeClick = useCallback(
      (node: NodeMetadata) => requestCreate(node),
      [requestCreate]
    );

    const handleNodeHover = useCallback(
      (node: NodeMetadata) => setHoveredType(node.node_type),
      []
    );

    const handleListLeave = useCallback(() => setHoveredType(null), []);

    return (
      <div css={styles(theme, isMobile)} className="nl-root">
        <div className="nl-header">
          <Text className="nl-title" component="h2">
            Node library
          </Text>
          <span className="nl-count">{nodes.length}</span>
        </div>

        <div className="nl-search">
          <SearchIcon className="nl-search-icon" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search nodes…"
            aria-label="Search nodes"
          />
          {query && (
            <button
              type="button"
              className="nl-search-clear"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              <ClearIcon />
            </button>
          )}
        </div>

        <div className="nl-body">
          <div className="nl-browse">
            <nav className="nl-rail" role="tablist" aria-label="Node categories">
              {NODE_SUBCATEGORIES.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  role="tab"
                  aria-selected={activeSubcategory === sub.id}
                  className={`nl-cat ${activeSubcategory === sub.id ? "active" : ""}`}
                  onClick={() => onSubcategoryChange(sub.id)}
                >
                  <span className="nl-cat-icon">{sub.icon}</span>
                  <span className="nl-cat-label">{sub.label}</span>
                  <span className="nl-cat-count">{counts[sub.id] ?? 0}</span>
                </button>
              ))}
            </nav>

            {nodes.length === 0 ? (
              <div className="nl-list">
                <div className="nl-empty">No matching nodes</div>
              </div>
            ) : (
              <div
                className="nl-list"
                ref={scrollRef}
                onMouseLeave={handleListLeave}
              >
                <div
                  style={{
                    height: virtualizer.getTotalSize(),
                    width: "100%",
                    position: "relative"
                  }}
                >
                  {virtualizer.getVirtualItems().map((vi) => (
                    <div
                      key={vi.key}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: vi.size,
                        transform: `translateY(${vi.start}px)`
                      }}
                    >
                      <NodeLibraryRow
                        node={nodes[vi.index]}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onClick={handleNodeClick}
                        onHover={handleNodeHover}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="nl-info">
            {infoNode ? (
              <NodeInfo nodeMetadata={infoNode} showConnections={false} />
            ) : (
              <div className="nl-info-empty">
                <Text component="span">
                  Drag a node to place it on the workspace. Hover for details
                </Text>
              </div>
            )}
          </div>
        </div>

        <div className="nl-footer">
          <span>{category.label}</span>
          {!isMobile && (
            <span className="nl-footer-hint">
              <span className="nl-kbd">drag</span> to add
            </span>
          )}
        </div>
      </div>
    );
  }
);

NodeLibrary.displayName = "NodeLibrary";

export default NodeLibrary;
