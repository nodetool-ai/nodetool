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

import { Text, thinScrollbarStyles } from "../ui_primitives";
import NodeLibraryRow from "./NodeLibraryRow";
import NodeInfo from "./NodeInfo";
import useMetadataStore from "../../stores/MetadataStore";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import usePendingNodeCreateStore from "../../stores/PendingNodeCreateStore";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import {
  filterNodesForCategory,
  NODE_SUBCATEGORIES,
  getNodeSubcategory
} from "../../config/quickAccessCategories";
import type { NodeCategoryId } from "../../stores/PanelStore";
import type { NodeMetadata } from "../../stores/ApiTypes";

const ROW_HEIGHT = 36;

const isMacPlatform =
  typeof navigator !== "undefined" && /mac/i.test(navigator.platform);

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
      fontSize: "1rem",
      fontWeight: 600,
      letterSpacing: "-0.01em",
      color: theme.vars.palette.text.primary
    },
    ".nl-count": {
      display: "inline-flex",
      alignItems: "center",
      padding: "1px 7px",
      borderRadius: "var(--rounded-sm)",
      backgroundColor: theme.vars.palette.action.selected,
      color: theme.vars.palette.text.secondary,
      fontSize: "0.72rem",
      fontWeight: 500,
      fontVariantNumeric: "tabular-nums"
    },

    ".nl-search": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.75),
      margin: theme.spacing(0, isMobile ? 1 : 1.5, 1, isMobile ? 1 : 1.5),
      padding: theme.spacing(0.75, 1),
      borderRadius: "var(--rounded-md)",
      backgroundColor: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.divider}`,
      transition: "border-color 120ms ease",
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
        borderRadius: "var(--rounded-sm)",
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
      borderRadius: "var(--rounded-sm)",
      backgroundColor: theme.vars.palette.action.hover,
      border: `1px solid ${theme.vars.palette.divider}`,
      color: theme.vars.palette.text.secondary,
      fontSize: "0.68rem",
      fontWeight: 600,
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
      flex: "0 0 auto",
      display: "flex",
      maxHeight: 200,
      overflow: "hidden",
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.paper,
      // NodeInfo pins its own width/maxHeight for the floating menu; here it
      // fills the width and scrolls within this compact bottom strip, so the
      // node list above keeps the rest of the height.
      "& > div": {
        width: "100% !important",
        maxHeight: "200px !important",
        flex: 1,
        minHeight: 0
      }
    },

    ".nl-rail": {
      width: isMobile ? "106px" : "120px",
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
      gap: "2px",
      padding: theme.spacing(1, 0.75),
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
      padding: theme.spacing(0.75, 1, 0.75, 1.25),
      border: "none",
      background: "transparent",
      borderRadius: "var(--rounded-md)",
      color: theme.vars.palette.text.secondary,
      fontSize: "0.8rem",
      lineHeight: 1.2,
      textAlign: "left",
      cursor: "pointer",
      transition: "background-color 140ms ease, color 140ms ease",
      "& .nl-cat-icon": {
        display: "inline-flex",
        flexShrink: 0,
        "& svg": { fontSize: "1.05rem" }
      },
      "& .nl-cat-label": {
        flex: 1,
        minWidth: 0,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      },
      "& .nl-cat-count": {
        fontSize: "0.7rem",
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
      padding: theme.spacing(1, 0.75),
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
      fontSize: "0.85rem"
    },

    ".nl-footer": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: theme.spacing(1, 1.5),
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      color: theme.vars.palette.text.secondary,
      fontSize: "0.75rem"
    },
    ".nl-footer-hint": {
      display: "inline-flex",
      alignItems: "center",
      gap: theme.spacing(0.75)
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

    useEffect(() => {
      searchRef.current?.focus();
    }, []);

    // ⌘K / Ctrl+K jumps focus back to the node search.
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
          e.preventDefault();
          searchRef.current?.focus();
          searchRef.current?.select();
        }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
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

    const nodes = useMemo(
      () => filterNodesForCategory(category, allNodes, query),
      [category, allNodes, query]
    );

    // The info box follows the hovered row; it falls back to the first result
    // so the bottom half is populated as soon as a category has nodes.
    const infoNode = useMemo(() => {
      if (nodes.length === 0) {
        return null;
      }
      return (
        (hoveredType && nodes.find((n) => n.node_type === hoveredType)) ||
        nodes[0]
      );
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
          {query ? (
            <button
              type="button"
              className="nl-search-clear"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              <ClearIcon />
            </button>
          ) : (
            !isMobile && (
              <span className="nl-kbd" aria-hidden>
                {isMacPlatform ? "⌘K" : "Ctrl K"}
              </span>
            )
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
              <div className="nl-list" ref={scrollRef}>
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

          {infoNode && (
            <div className="nl-info">
              <NodeInfo nodeMetadata={infoNode} showConnections={false} />
            </div>
          )}
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
