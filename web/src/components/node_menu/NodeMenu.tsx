/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useMemo, useRef, useEffect, useState, useCallback } from "react";

// mui
import { Box } from "@mui/material";

// components
import TypeFilterChips from "./TypeFilterChips";
import NamespaceList from "./NamespaceList";
// store
import { useStoreWithEqualityFn } from "zustand/traditional";
import useNodeMenuStore from "../../stores/NodeMenuStore";

// utils
import Draggable from "react-draggable";
// theme
import useNamespaceTree from "../../hooks/useNamespaceTree";
import SearchInput from "../search/SearchInput";
import { useCombo } from "../../stores/KeyPressedStore";
import isEqual from "lodash/isEqual";
import { useCreateNode } from "../../hooks/useCreateNode";
import { FlexColumn, FlexRow } from "../ui_primitives";

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
      borderRadius: "16px",
      boxShadow: "0 24px 48px rgba(0, 0, 0, 0.05), 0 8px 16px rgba(0,0,0,0.02)",
      backgroundColor: theme.vars.palette.background.paper,
      backdropFilter: theme.vars.palette.glass.blur,
      transition:
        "background-color 0.2s ease-out, box-shadow 0.2s ease-out, border-color 0.2s ease-out",
      animation: "fadeIn 0.2s ease-out forwards"
    },
    "@keyframes fadeIn": {
      "0%": { opacity: 0 },
      "100%": { opacity: 1 }
    },
    ".draggable-header": {
      borderRadius: "16px 16px 0 0",
      backgroundColor: "transparent", // Let glass effect show through
      width: "100%",
      minHeight: "12px", // Minimal drag handle
      cursor: "grab",
      userSelect: "none"
    },
    ".draggable-header:active": {
      cursor: "grabbing"
    },
    ".node-menu-container": {
      borderRadius: "0 0 16px 16px",
      padding: "0.75em 0px 1em 0.75em",
      width: "100%",
      maxHeight: "77vh",
      flexGrow: 1
      // Removed inner shadow to keep it clean
    },
    ".search-input-container": {
      minWidth: "100%",
      flexGrow: 1
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
  const nodeRef = useRef<HTMLDivElement>(null);
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

  // Use lazy initialization for the rest of the state
  const {
    closeNodeMenu,
    menuHeight,
    menuPosition,
    searchResults,
    selectedInputType,
    setSelectedInputType,
    selectedOutputType,
    setSelectedOutputType,
    searchTerm,
    setSearchTerm,
    setMenuSize,
    moveSelectionUp,
    moveSelectionDown,
    getSelectedNode
  } = useStoreWithEqualityFn(
    useNodeMenuStore,
    (state) => ({
      closeNodeMenu: state.closeNodeMenu,
      menuHeight: state.menuHeight,
      menuPosition: state.menuPosition,
      searchResults: state.searchResults,
      selectedInputType: state.selectedInputType,
      setSelectedInputType: state.setSelectedInputType,
      selectedOutputType: state.selectedOutputType,
      setSelectedOutputType: state.setSelectedOutputType,
      searchTerm: state.searchTerm,
      setSearchTerm: state.setSearchTerm,
      setMenuSize: state.setMenuSize,
      moveSelectionUp: state.moveSelectionUp,
      moveSelectionDown: state.moveSelectionDown,
      getSelectedNode: state.getSelectedNode
    }),
    isEqual
  );

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
      const state: any = (useNodeMenuStore as any).getState?.();
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
    <Draggable
      bounds={bounds}
      nodeRef={nodeRef}
      defaultPosition={{ x: menuPosition.x, y: menuPosition.y }}
      handle=".draggable-header"
    >
      <FlexColumn
        ref={nodeRef}
        sx={{ minWidth: "980px", maxHeight: menuHeight }}
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
                gap={3}
                align="center"
                className="search-row"
                sx={{ marginLeft: "-3px" }}
              >
                <SearchInput
                  focusSearchInput={focusSearchInput}
                  focusOnTyping={true}
                  placeholder="Search for nodes..."
                  debounceTime={80}
                  width={300}
                  maxWidth={"300px"}
                  searchTerm={searchTerm}
                  onSearchChange={setSearchTerm}
                  onPressEscape={closeNodeMenu}
                  onPressArrowDown={handleArrowDown}
                  onPressArrowUp={handleArrowUp}
                  onPressEnter={handleEnter}
                  searchResults={searchResults}
                />
              </FlexRow>
              <TypeFilterChips
                selectedInputType={selectedInputType}
                selectedOutputType={selectedOutputType}
                setSelectedInputType={setSelectedInputType}
                setSelectedOutputType={setSelectedOutputType}
              />
            </FlexColumn>
            <NamespaceList
              namespaceTree={namespaceTree}
              metadata={searchResults}
            />
          </div>
        </Box>
      </FlexColumn>
    </Draggable>
  );
};

export default memo(NodeMenu);
