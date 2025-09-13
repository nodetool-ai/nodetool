/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useMemo, useRef, useEffect, useState } from "react";

// mui
import { IconButton, Box, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

// components
import TypeFilter from "./TypeFilter";
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
import { isEqual } from "lodash";

const treeStyles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      height: "auto",
      maxHeight: "90vh",
      minHeight: "35vh",
      top: 0,
      left: 0,
      position: "absolute",
      overflow: "hidden",
      zIndex: 20000,
      border: `1px solid ${theme.vars.palette.grey[500]}`,
      borderRadius: "12px",
      boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
      backgroundColor: theme.vars.palette.background.default
    },
    ".draggable-header": {
      borderRadius: "12px 12px 0 0",
      backgroundColor: theme.vars.palette.background.default,
      width: "100%",
      minHeight: "40px",
      cursor: "grab",
      userSelect: "none",
      display: "flex",
      alignItems: "center",
      h4: {
        margin: "0",
        padding: "0 0 0 1.25em",
        fontSize: theme.fontSizeNormal,
        fontWeight: 500,
        color: theme.vars.palette.grey[100]
      }
    },
    ".draggable-header:hover": {
      opacity: 0.95
    },
    ".node-menu-container": {
      borderRadius: "0 0 8px 8px",
      padding: ".5em 0px 1em .5em",
      width: "100%",
      maxHeight: "77vh",
      flexGrow: 1,
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)"
    },
    ".search-toolbar": {
      display: "flex",
      flexDirection: "row",
      alignItems: "flex-start",
      gap: "0.5em",
      minHeight: "40px",
      flexGrow: 0,
      overflow: "hidden",
      width: "100%",
      margin: 0,
      padding: ".5em 1em 0 .7em",
      ".search-input-container": {
        minWidth: "170px"
      }
    },
    ".close-button": {
      position: "absolute",
      top: "8px",
      right: "8px",
      zIndex: 150,
      color: theme.vars.palette.grey[200],
      width: "28px",
      height: "28px",
      padding: "2px",
      transition: "all 0.2s ease",
      "&:hover": {
        backgroundColor: "rgba(0, 0, 0, 0.04)",
        color: theme.vars.palette.grey[100]
      }
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
    setMenuSize
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
      setMenuSize: state.setMenuSize
    }),
    isEqual
  );

  const namespaceTree = useNamespaceTree();
  const theme = useTheme();
  const memoizedStyles = useMemo(() => treeStyles(theme), [theme]);

  useCombo(["Escape"], closeNodeMenu);

  // Ensure search is performed after menu opens with a preset term
  useEffect(() => {
    if (!isMenuOpen) return;
    if (!searchTerm || searchTerm.trim() === "") return;
    if (searchResults.length > 0) return;
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
    if (!isMenuOpen) return;
    const el = nodeRef.current;
    if (!el) return;
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
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
    console.debug("[NodeMenu] isMenuOpen=false; not rendering menu");
    return null;
  }

  return (
    <Draggable
      bounds={bounds}
      nodeRef={nodeRef}
      defaultPosition={{ x: menuPosition.x, y: menuPosition.y }}
      handle=".draggable-header"
    >
      <Box
        ref={nodeRef}
        sx={{ minWidth: "800px", maxHeight: menuHeight }}
        className="floating-node-menu"
        css={memoizedStyles}
      >
        <div className="draggable-header">
          <Typography className="title" variant="h4">
            Node Menu
          </Typography>

          <IconButton
            className="close-button"
            edge="end"
            size="small"
            color="inherit"
            onClick={closeNodeMenu}
            aria-label="close"
          >
            <CloseIcon />
          </IconButton>
        </div>
        <Box className="node-menu-container">
          <div className="main-content">
            <Box className="search-toolbar">
              <SearchInput
                focusSearchInput={focusSearchInput}
                focusOnTyping={true}
                placeholder="Search for nodes..."
                debounceTime={30}
                width={390}
                maxWidth={"400px"}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                onPressEscape={closeNodeMenu}
                searchResults={searchResults}
              />

              <TypeFilter
                selectedInputType={selectedInputType}
                selectedOutputType={selectedOutputType}
                setSelectedInputType={setSelectedInputType}
                setSelectedOutputType={setSelectedOutputType}
              />
            </Box>
            <NamespaceList
              namespaceTree={namespaceTree}
              metadata={searchResults}
            />
          </div>
        </Box>
      </Box>
    </Draggable>
  );
};

export default memo(NodeMenu);
