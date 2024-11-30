/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useEffect, useMemo, useRef } from "react";

// mui
import { IconButton, Box } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

// components
import TypeFilter from "./TypeFilter";
import NamespaceList from "./NamespaceList";
// store
import useNodeMenuStore from "../../stores/NodeMenuStore";

// utils
import Draggable from "react-draggable";
// theme
import ThemeNodetool from "../themes/ThemeNodetool";
import useNamespaceTree from "../../hooks/useNamespaceTree";
import SearchInput from "../search/SearchInput";
import { useCombo } from "../../stores/KeyPressedStore";

const treeStyles = (theme: any) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      height: "auto",
      maxHeight: "70vh",
      minHeight: "65vh",
      top: 0,
      left: 0,
      position: "absolute",
      overflow: "hidden",
      zIndex: 1300,
      border: `2px solid ${theme.palette.c_gray1}`,
      borderRadius: ".6em",
      outline: `2px solid ${theme.palette.c_gray4}`
    },
    ".draggable-header": {
      borderRadius: "8px 8px 0 0",
      backgroundColor: theme.palette.c_gray2,
      width: "100%",
      minHeight: "30px",
      cursor: "grab",
      userSelect: "none"
    },
    ".draggable-header:hover": {
      opacity: 0.95
    },
    ".node-menu-container": {
      backgroundColor: theme.palette.c_gray1,
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
      padding: ".5em 1em 0",
      ".search-input-container": {
        minWidth: "240px"
      }
    },
    ".toggle-tree": {
      minWidth: "30px",
      height: "25px",
      margin: "0 0 0 -.5em",
      backgroundColor: theme.palette.c_gray1
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
    }
  });

type NodeMenuProps = {
  focusSearchInput?: boolean;
};
export default function NodeMenu({ focusSearchInput = false }: NodeMenuProps) {
  const nodeRef = useRef(null);
  const namespaceTree = useNamespaceTree();
  const {
    isMenuOpen,
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
  } = useNodeMenuStore((state) => ({
    isMenuOpen: state.isMenuOpen,
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
    setSearchTerm: state.setSearchTerm,
    setSelectedPath: state.setSelectedPath
  }));

  useCombo(["Escape"], closeNodeMenu);

  // SET SELECTED TYPE FILTER
  // dropping a handle from left or right side of a node
  useEffect(() => {
    setSelectedInputType("");
    setSelectedOutputType("");
    if (connectDirection === "source") {
      setSelectedInputType(dropType);
    }
    if (connectDirection === "target") {
      setSelectedOutputType(dropType);
    }
  }, [dropType, connectDirection, setSelectedInputType, setSelectedOutputType]);

  const memoizedStyles = useMemo(() => treeStyles(ThemeNodetool), []);

  return isMenuOpen ? (
    <Draggable
      bounds={{
        left: 0,
        right: window.innerWidth,
        top: 50,
        bottom: window.innerHeight
      }}
      nodeRef={nodeRef}
      defaultPosition={{ x: menuPosition.x, y: menuPosition.y }}
      handle=".draggable-header"
    >
      <Box
        sx={{ maxWidth: menuWidth, maxHeight: menuHeight }}
        className="floating-node-menu"
        css={memoizedStyles}
        ref={nodeRef}
      >
        <div className="draggable-header">
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
          <Box className="search-toolbar">
            <SearchInput
              focusSearchInput={focusSearchInput}
              focusOnTyping={true}
              placeholder="Search for nodes..."
              debounceTime={300}
              maxWidth={"400px"}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              onPressEscape={closeNodeMenu}
              searchResults={searchResults}
            />
            {/* <Tooltip
              title="Clear namespace selection"
              placement="bottom"
              enterDelay={TOOLTIP_ENTER_DELAY}
            >
              <Button
                className={`clear-namespace ${
                  selectedPath.length === 0 ? "disabled" : ""
                }`}
                onClick={() => setSelectedPath([])}
              >
                <ClearIcon />
              </Button>
            </Tooltip> */}

            <TypeFilter
              selectedInputType={selectedInputType}
              selectedOutputType={selectedOutputType}
              setSelectedInputType={setSelectedInputType}
              setSelectedOutputType={setSelectedOutputType}
            />
          </Box>
          <Box>
            <NamespaceList
              namespaceTree={namespaceTree}
              metadata={searchResults}
            />
          </Box>
        </Box>
      </Box>
    </Draggable>
  ) : (
    <></>
  );
}
