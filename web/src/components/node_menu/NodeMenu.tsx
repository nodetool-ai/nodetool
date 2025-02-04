/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useEffect, useMemo, useRef } from "react";

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
import ThemeNodetool from "../themes/ThemeNodetool";
import useNamespaceTree from "../../hooks/useNamespaceTree";
import SearchInput from "../search/SearchInput";
import { useCombo } from "../../stores/KeyPressedStore";
import { isEqual } from "lodash";
import { useRenderLogger } from "../../hooks/useRenderLogger";

const treeStyles = (theme: any) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      height: "auto",
      maxHeight: "90vh",
      minHeight: "35vh",
      top: 50,
      left: 0,
      position: "absolute",
      overflow: "hidden",
      zIndex: 1300,
      border: `2px solid ${theme.palette.c_gray1}`,
      borderRadius: ".6em",
      outline: `2px solid ${theme.palette.c_gray4}`,
      backgroundColor: theme.palette.c_gray1
    },
    ".draggable-header": {
      borderRadius: "8px 8px 0 0",
      backgroundColor: theme.palette.c_gray2,
      width: "100%",
      minHeight: "30px",
      cursor: "grab",
      userSelect: "none",
      h4: {
        margin: "0",
        padding: "0.3em 0 0 1.25em",
        fontSize: theme.fontSizeNormal,
        color: theme.palette.c_gray6
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
        minWidth: "240px"
      }
    },
    ".close-button": {
      position: "absolute",
      top: "-2px",
      right: "5px",
      zIndex: 150,
      color: ThemeNodetool.palette.c_gray4
    },
    ".clear-namespace": {
      backgroundColor: theme.palette.c_gray2,
      color: theme.palette.c_gray4,
      margin: "0 0 0 .5em",
      padding: "0",
      border: "0",
      borderRadius: 0,
      boxShadow: "0 0",
      cursor: "pointer"
    },
    ".clear-namespace:hover": {
      backgroundColor: theme.palette.c_gray6
    },
    ".clear-namespace.disabled": {
      color: theme.palette.c_gray2,
      backgroundColor: theme.palette.c_gray1,
      cursor: "default",
      border: `1px solid ${theme.palette.c_gray2}`
    },
    "&.MuiPaper-root.MuiAccordion-root": {
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
      "&.MuiPaper-elevation, &.MuiPaper-elevation1": {
        backgroundColor: "transparent !important"
      },
      "&.Mui-expanded": {
        backgroundColor: "transparent !important"
      },
      "&.MuiAccordion-rounded": {
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

// Add performance timing
let menuOpenRequestTime: number | null = null;

const NodeMenu = memo(function NodeMenu({
  focusSearchInput = false
}: NodeMenuProps) {
  const nodeRef = useRef<HTMLDivElement>(null);

  // Only subscribe to minimal state when closed
  const isMenuOpen = useStoreWithEqualityFn(
    useNodeMenuStore,
    (state) => state.isMenuOpen,
    Object.is
  );

  // Use lazy initialization for the rest of the state
  const {
    closeNodeMenu,
    menuWidth,
    menuHeight,
    menuPosition,
    dropType,
    connectDirection,
    searchResults,
    selectedInputType,
    setSelectedInputType,
    selectedOutputType,
    setSelectedOutputType,
    searchTerm,
    setSearchTerm
  } = useStoreWithEqualityFn(
    useNodeMenuStore,
    (state) => ({
      closeNodeMenu: state.closeNodeMenu,
      menuWidth: state.menuWidth,
      menuHeight: state.menuHeight,
      menuPosition: state.menuPosition,
      dropType: state.dropType,
      connectDirection: state.connectDirection,
      searchResults: state.searchResults,
      selectedInputType: state.selectedInputType,
      setSelectedInputType: state.setSelectedInputType,
      selectedOutputType: state.selectedOutputType,
      setSelectedOutputType: state.setSelectedOutputType,
      searchTerm: state.searchTerm,
      setSearchTerm: state.setSearchTerm
    }),
    isEqual
  );

  const namespaceTree = useNamespaceTree();
  const memoizedStyles = useMemo(() => treeStyles(ThemeNodetool), []);

  useCombo(["Escape"], closeNodeMenu);
  useRenderLogger("NodeMenu", { isMenuOpen });

  // Start timing when menu opens
  useEffect(() => {
    if (isMenuOpen) {
      menuOpenRequestTime = performance.now();
    }
  }, [isMenuOpen]);

  // Log when menu is mounted and visible
  useEffect(() => {
    if (!isMenuOpen || !nodeRef.current) return;

    const startTime = menuOpenRequestTime || performance.now();
    console.log(
      `NodeMenu mount time: ${(performance.now() - startTime).toFixed(2)}ms`
    );

    requestAnimationFrame(() => {
      if (startTime) {
        console.log(
          `NodeMenu visual time: ${(performance.now() - startTime).toFixed(
            2
          )}ms`
        );
        menuOpenRequestTime = null;
      }
    });
  });

  // SET SELECTED TYPE FILTER
  useEffect(() => {
    if (!isMenuOpen) return;
    setSelectedInputType("");
    setSelectedOutputType("");
    if (connectDirection === "source" && dropType) {
      setSelectedInputType(dropType);
    }
    if (connectDirection === "target" && dropType) {
      setSelectedOutputType(dropType);
    }
  }, [
    isMenuOpen,
    dropType,
    connectDirection,
    setSelectedInputType,
    setSelectedOutputType
  ]);

  if (!isMenuOpen) return null;

  return (
    <Draggable
      bounds={{
        left: 0,
        right: window.innerWidth,
        top: 0,
        bottom: window.innerHeight
      }}
      nodeRef={nodeRef}
      defaultPosition={{ x: menuPosition.x, y: menuPosition.y }}
      handle=".draggable-header"
    >
      <Box
        ref={nodeRef}
        sx={{ minWidth: "600px", maxHeight: menuHeight }}
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
                width={200}
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
});

export default NodeMenu;
