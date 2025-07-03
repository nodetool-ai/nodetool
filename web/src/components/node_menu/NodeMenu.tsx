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
      zIndex: 20000,
      border: `1px solid ${theme.palette.grey[500]}`,
      borderRadius: "12px",
      boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
      backgroundColor: theme.palette.grey[800]
    },
    ".draggable-header": {
      borderRadius: "12px 12px 0 0",
      backgroundColor: theme.palette.grey[600],
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
        color: theme.palette.grey[100]
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
      color: theme.palette.grey[200],
      width: "28px",
      height: "28px",
      padding: "2px",
      transition: "all 0.2s ease",
      "&:hover": {
        backgroundColor: "rgba(0, 0, 0, 0.04)",
        color: theme.palette.grey[100]
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
    setSearchTerm
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
      setSearchTerm: state.setSearchTerm
    }),
    isEqual
  );

  const namespaceTree = useNamespaceTree();
  const memoizedStyles = useMemo(() => treeStyles(ThemeNodetool), []);

  useCombo(["Escape"], closeNodeMenu);

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
};

export default memo(NodeMenu);
