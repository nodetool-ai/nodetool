/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useEffect, useRef } from "react";

// mui
import {
  IconButton,
  Box,
  Button,
  CircularProgress,
  Tooltip
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ErrorOutlineRounded from "@mui/icons-material/ErrorOutlineRounded";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { ExpandCircleDown } from "@mui/icons-material";

// components
import SearchComponent from "./SearchComponent";
import TypeFilter from "./TypeFilter";
import NamespaceList from "./NamespaceList";
// store
import useNodeMenuStore from "../../stores/NodeMenuStore";

// utils
import Draggable from "react-draggable";
import { TOOLTIP_ENTER_DELAY } from "../node/BaseNode";
// theme
import ThemeNodetool from "../themes/ThemeNodetool";
import useNamespaceTree from "../../hooks/useNamespaceTree";
import { useMetadata } from "../../serverState/useMetadata";

type NodeMenuProps = {
  focusSearchInput?: boolean;
};
export default function NodeMenu({ focusSearchInput }: NodeMenuProps) {
  const nodeRef = useRef(null);
  const {
    data: metadata,
    isLoading: metadataLoading,
    error: metadataError
  } = useMetadata();
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
    setSearchTerm,
    setMetadata,
    showNamespaceTree,
    toggleNamespaceTree
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
    setMetadata: state.setMetadata,
    showNamespaceTree: state.showNamespaceTree,
    toggleNamespaceTree: state.toggleNamespaceTree
  }));

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

  useEffect(() => {
    setMetadata(metadata?.metadata || []);
  }, [metadata, setMetadata]);

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
        padding: ".5em 1em 0"
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

  return isMenuOpen ? (
    <Draggable
      bounds={{
        left: 0,
        right: window.innerWidth,
        top: 50,
        bottom: window.innerHeight
      }}
      nodeRef={nodeRef}
      defaultPosition={{ x: menuPosition.x - 50, y: menuPosition.y - 100 }}
      handle=".draggable-header"
    >
      <Box
        sx={{ maxWidth: menuWidth, maxHeight: menuHeight }}
        className="floating-node-menu"
        css={treeStyles}
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
          {metadataLoading && (
            <CircularProgress
              size={20}
              sx={{
                position: "absolute",
                top: "3em",
                right: "1.5em"
              }}
            />
          )}
          {!!metadataError && (
            <ErrorOutlineRounded
              sx={{
                position: "absolute",
                top: "1.9em",
                right: "0.9em",
                color: ThemeNodetool.palette.error.main
              }}
            />
          )}
          <Box className="search-toolbar">
            <Tooltip
              title={showNamespaceTree ? "Hide namespaces" : "Show namespaces"}
              placement="bottom"
              enterDelay={TOOLTIP_ENTER_DELAY}
            >
              <Button className="toggle-tree" onClick={toggleNamespaceTree}>
                {showNamespaceTree ? <ExpandCircleDown /> : <ExpandMoreIcon />}
              </Button>
            </Tooltip>

            <SearchComponent
              focusSearchInput={true}
              focusOnTyping={true}
              placeholder="Search for nodes..."
              debounceTime={300}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
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
