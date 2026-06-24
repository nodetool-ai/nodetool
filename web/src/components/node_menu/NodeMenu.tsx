/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useMemo, useEffect, useState, useCallback } from "react";

// mui

// components
import TypeFilterChips from "./TypeFilterChips";
import NamespaceList from "./NamespaceList";
// store
import { useStoreWithEqualityFn } from "zustand/traditional";
import useNodeMenuStore, {
  type NodeMenuStore
} from "../../stores/NodeMenuStore";

// utils
import { useDraggable } from "../../hooks/useDraggable";
import { useResizable } from "../../hooks/useResizable";
// theme
import useNamespaceTree from "../../hooks/useNamespaceTree";
import SearchInput from "../search/SearchInput";
import { useCombo } from "../../stores/KeyPressedStore";
import { useCreateNode } from "../../hooks/useCreateNode";
import {
  FlexColumn,
  FlexRow,
  Box,
  BORDER_RADIUS,
  MOTION,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import { useShallow } from "zustand/react/shallow";

const treeStyles = (theme: Theme) =>
  css({
    "&": {
      height: "auto",
      maxHeight: "90vh",
      minHeight: "35vh",
      top: 0,
      left: 0,
      position: "absolute",
      overflow: "hidden",
      zIndex: 20000,
      // Glassmorphism container
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.xxl,
      boxShadow: "0 24px 48px rgba(0, 0, 0, 0.05), 0 8px 16px rgba(0,0,0,0.02)",
      backgroundColor: theme.vars.palette.background.paper,
      backdropFilter: theme.vars.palette.glass.blur,
      transition: `background-color ${MOTION.fast}, box-shadow ${MOTION.fast}, border-color ${MOTION.normal}`,
      animation: `fadeIn ${MOTION.fast} forwards`
    },
    "@keyframes fadeIn": {
      "0%": { opacity: 0 },
      "100%": { opacity: 1 }
    },
    ".draggable-header": {
      borderRadius: `${BORDER_RADIUS.xxl} ${BORDER_RADIUS.xxl} 0 0`,
      backgroundColor: theme.vars.palette.background.paper,
      width: "100%",
      minHeight: "1.5em",
      cursor: "grab",
      userSelect: "none"
    },
    ".draggable-header:active": {
      cursor: "grabbing"
    },
    // Resize handles (top-left anchored): right edge, bottom edge, corner.
    ".nm-resize": {
      position: "absolute",
      zIndex: 30,
      touchAction: "none"
    },
    ".nm-resize-right": {
      top: "40px",
      bottom: "12px",
      right: 0,
      width: "7px",
      cursor: "ew-resize"
    },
    ".nm-resize-bottom": {
      left: 0,
      right: "12px",
      bottom: 0,
      height: "7px",
      cursor: "ns-resize"
    },
    ".nm-resize-corner": {
      right: 0,
      bottom: 0,
      width: "16px",
      height: "16px",
      cursor: "nwse-resize"
    },
    ".node-menu-container": {
      borderRadius: `0 0 ${BORDER_RADIUS.xxl} ${BORDER_RADIUS.xxl}`,
      padding: "0.45em 0px 0.75em 0.75em",
      width: "100%",
      maxHeight: "77vh",
      flexGrow: 1
      // Removed inner shadow to keep it clean
    },
    ".search-input-container": {
      minWidth: 0,
      flexGrow: 0
    },
    "& .MuiPaper-root.MuiAccordion-root": {
      backgroundColor: "transparent !important",
      boxShadow: "none !important",
      "--Paper-overlay": "0 !important",
      "&:before": {
        display: "none"
      },
      "& .MuiAccordionDetails-root": {
        backgroundColor: "transparent !important",
        padding: "0 0 1em 0"
      },
      "& .MuiPaper-elevation, .MuiPaper-elevation1": {
        backgroundColor: "transparent !important"
      },
      "& .Mui-expanded": {
        backgroundColor: "transparent !important"
      },
      "& .MuiAccordion-rounded": {
        backgroundColor: "transparent !important"
      }
    },
    ".MuiAccordionSummary-root": {
      padding: 0,
      minHeight: "unset",
      "& .MuiAccordionSummary-content": {
        margin: 0
      }
    }
  });

type NodeMenuProps = {
  focusSearchInput?: boolean;
};

const NodeMenu = ({ focusSearchInput = false }: NodeMenuProps) => {
  const [bounds, setBounds] = useState({
    left: 0,
    right: 0,
    top: 0,
    bottom: 0
  });
  const BOTTOM_SAFE_MARGIN = 50;

  // Only subscribe to minimal state when closed
  const isMenuOpen = useStoreWithEqualityFn(
    useNodeMenuStore,
    (state) => state.isMenuOpen,
    Object.is
  );

  const {
    menuHeight,
    menuPosition,
    searchResults,
    selectedInputType,
    selectedOutputType,
    searchTerm,
    closeNodeMenu,
    setSelectedInputType,
    setSelectedOutputType,
    setSearchTerm,
    setMenuSize,
    menuUserSize,
    setMenuUserSize,
    moveSelectionUp,
    moveSelectionDown,
    getSelectedNode
  } = useNodeMenuStore(
    useShallow((state) => ({
      menuHeight: state.menuHeight,
      menuPosition: state.menuPosition,
      menuUserSize: state.menuUserSize,
      setMenuUserSize: state.setMenuUserSize,
      searchResults: state.searchResults,
      selectedInputType: state.selectedInputType,
      selectedOutputType: state.selectedOutputType,
      searchTerm: state.searchTerm,
      closeNodeMenu: state.closeNodeMenu,
      setSelectedInputType: state.setSelectedInputType,
      setSelectedOutputType: state.setSelectedOutputType,
      setSearchTerm: state.setSearchTerm,
      setMenuSize: state.setMenuSize,
      moveSelectionUp: state.moveSelectionUp,
      moveSelectionDown: state.moveSelectionDown,
      getSelectedNode: state.getSelectedNode
    }))
  );

  // Draggable menu via its header. `useDraggable` owns the transform and clamps
  // to the viewport bounds; the drag position is intentionally not persisted
  // (the menu reopens at `menuPosition`).
  const nodeRef = useDraggable<HTMLDivElement>({
    handle: ".draggable-header",
    bounds,
    defaultPosition: { x: menuPosition.x, y: menuPosition.y }
  });

  // Resize from the right / bottom / corner (top-left stays anchored). The
  // final size is persisted so it sticks across reopens within the session.
  const startResize = useResizable(nodeRef, {
    minWidth: 560,
    minHeight: 360,
    maxHeight:
      typeof window !== "undefined" ? window.innerHeight * 0.9 : undefined,
    onResizeEnd: setMenuUserSize
  });

  const namespaceTree = useNamespaceTree();
  const theme = useTheme();
  const memoizedStyles = useMemo(() => treeStyles(theme), [theme]);

  // Hook for creating nodes
  const handleCreateNode = useCreateNode();

  // Keyboard navigation handlers
  const handleArrowDown = useCallback(() => {
    moveSelectionDown();
  }, [moveSelectionDown]);

  const handleArrowUp = useCallback(() => {
    moveSelectionUp();
  }, [moveSelectionUp]);

  const handleEnter = useCallback(() => {
    const selectedNode = getSelectedNode();
    if (selectedNode) {
      handleCreateNode(selectedNode);
    }
  }, [getSelectedNode, handleCreateNode]);

  useCombo(["Escape"], closeNodeMenu);

  // Ensure search is performed after menu opens with a preset term
  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }
    if (!searchTerm || searchTerm.trim() === "") {
      return;
    }
    if (searchResults.length > 0) {
      return;
    }
    try {
      const state = useNodeMenuStore.getState() as NodeMenuStore | undefined;
      // Do not clear selectedPath here; just perform search with current path
      state?.performSearch?.(searchTerm);
    } catch (error) {
      console.error("Error performing search:", error);
    }
  }, [isMenuOpen, searchTerm, searchResults.length]);

  // Keep the draggable bounds within the viewport, accounting for element size
  useEffect(() => {
    const updateBounds = () => {
      const el = nodeRef.current;
      const width = el?.offsetWidth ?? 0;
      const height = el?.offsetHeight ?? 0;
      if (width && height) {
        setMenuSize(width, height);
      }
      const right = Math.max(0, window.innerWidth - width);
      const bottom = Math.max(
        0,
        window.innerHeight - height - BOTTOM_SAFE_MARGIN
      );
      setBounds({ left: 0, top: 0, right, bottom });
    };
    updateBounds();
    window.addEventListener("resize", updateBounds);
    return () => window.removeEventListener("resize", updateBounds);
  }, [isMenuOpen, setMenuSize]);

  // If initial position clips right/bottom, correct after mount using measured size
  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }
    const el = nodeRef.current;
    if (!el) {
      return;
    }
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      return;
    }
    const maxX = Math.max(0, window.innerWidth - width - 10);
    const maxY = Math.max(
      0,
      window.innerHeight - height - 10 - BOTTOM_SAFE_MARGIN
    );
    const correctedX = Math.min(menuPosition.x, maxX);
    const correctedY = Math.min(menuPosition.y, maxY);
    if (correctedX !== menuPosition.x || correctedY !== menuPosition.y) {
      // Imperatively move the draggable node to corrected position
      el.style.transform = `translate(${correctedX}px, ${correctedY}px)`;
    }
  }, [isMenuOpen, menuPosition.x, menuPosition.y]);

  if (!isMenuOpen) {
    return null;
  }

  return (
    <FlexColumn
      ref={nodeRef}
      sx={{
        width: menuUserSize?.width ?? 980,
        minWidth: 0,
        height: menuUserSize?.height,
        maxHeight: menuUserSize ? undefined : menuHeight
      }}
      className="floating-node-menu"
      css={memoizedStyles}
    >
      <FlexRow
        className="draggable-header"
        align="center"
        justify="flex-end"
      ></FlexRow>
      <Box className="node-menu-container">
        <div className="main-content">
          <FlexColumn
            gap={1}
            className="search-toolbar"
            sx={{
              flexGrow: 0,
              overflow: "visible",
              width: "100%",
              margin: 0,
              padding: "0 1em 0 0.5em"
            }}
          >
            <FlexRow
              gap={1.5}
              align="center"
              className="search-row"
              sx={{ marginLeft: `-${getSpacingPx(SPACING.xs)}`, width: "100%" }} // was -3px
            >
              <SearchInput
                focusSearchInput={focusSearchInput}
                focusOnTyping={false}
                placeholder="Search for nodes..."
                debounceTime={80}
                width={300}
                maxWidth={"300px"}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                onPressEscape={closeNodeMenu}
                onPressSpaceWhenEmpty={closeNodeMenu}
                onPressArrowDown={handleArrowDown}
                onPressArrowUp={handleArrowUp}
                onPressEnter={handleEnter}
                searchResults={searchResults}
              />
              <div
                style={{ marginLeft: "0.75em", flex: "1 1 auto", minWidth: 0 }}
              >
                <TypeFilterChips
                  selectedInputType={selectedInputType}
                  selectedOutputType={selectedOutputType}
                  setSelectedInputType={setSelectedInputType}
                  setSelectedOutputType={setSelectedOutputType}
                />
              </div>
            </FlexRow>
          </FlexColumn>
          <NamespaceList
            namespaceTree={namespaceTree}
            metadata={searchResults}
          />
        </div>
      </Box>
      <div
        className="nm-resize nm-resize-right"
        onPointerDown={startResize("right")}
        aria-hidden
      />
      <div
        className="nm-resize nm-resize-bottom"
        onPointerDown={startResize("bottom")}
        aria-hidden
      />
      <div
        className="nm-resize nm-resize-corner"
        onPointerDown={startResize("bottom-right")}
        aria-hidden
      />
    </FlexColumn>
  );
};

export default memo(NodeMenu);
