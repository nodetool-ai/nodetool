/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useEffect, useState, useCallback, useRef } from "react";

// mui
import {
  IconButton,
  Box,
  Button,
  CircularProgress,
  Tooltip
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ClearIcon from "@mui/icons-material/Clear";
import ErrorOutlineRounded from "@mui/icons-material/ErrorOutlineRounded";

// components
import SearchComponent from "./SearchComponent";
import TypeFilter from "./TypeFilter";
import KeyboardNavigation from "./KeyboardNavigation";
import NamespaceList from "./NamespaceList";
// store
import { NodeMetadata, TypeName } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";

// utils
import Draggable from "react-draggable";
import { filterDataByType } from "./typeFilterUtils";
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
  const [selectedInputType, setSelectedInputType] = useState("");
  const [selectedOutputType, setSelectedOutputType] = useState("");
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [metadataFilteredByTypes, setMetadataFilteredByTypes] = useState<
    NodeMetadata[]
  >([]);
  const {
    isMenuOpen,
    closeNodeMenu,
    menuWidth,
    menuHeight,
    menuPosition,
    dropType,
    connectDirection
  } = useNodeMenuStore();
  const {
    searchResults,
    setSearchResults,
    setHighlightedNamespaces,
    selectedPath,
    setSelectedPath
  } = useNodeMenuStore();

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
  }, [dropType, connectDirection]);

  // RESET TYPE FILTERS
  useEffect(() => {
    if (!isMenuOpen) {
      setSelectedInputType("");
      setSelectedOutputType("");
    }
  }, [isMenuOpen, dropType]);

  // FILTER DATA BASED ON SELECTED TYPES
  useEffect(() => {
    if (metadata === undefined) return;

    const filteredData = filterDataByType(
      metadata.metadata,
      selectedInputType as TypeName,
      selectedOutputType as TypeName
    );
    setMetadataFilteredByTypes(filteredData);
  }, [metadata, selectedInputType, selectedOutputType]);

  // KEYBOARD NAVIGATION
  <KeyboardNavigation activeNode={activeNode} setActiveNode={setActiveNode} />;

  // HANDLE SEARCH RESULT
  const handleSearchResult = useCallback(
    (filteredMetadata: NodeMetadata[]) => {
      setSearchResults(filteredMetadata);
      const newHighlightedNamespaces = new Set(
        filteredMetadata.flatMap((result) => {
          const parts = result.namespace.split(".");
          return parts.map((_, index) => parts.slice(0, index + 1).join("."));
        })
      );
      setHighlightedNamespaces([...newHighlightedNamespaces]);
    },
    [setSearchResults, setHighlightedNamespaces]
  );

  const treeStyles = (theme: any) =>
    css({
      "&": {
        height: "auto",
        maxHeight: "65vh",
        top: 0,
        left: 0,
        position: "fixed",
        overflow: "visible",
        borderRadius: 0,
        zIndex: 1300
      },
      ".draggable-header": {
        borderRadius: "8px 8px 0 0",
        backgroundColor: theme.palette.c_gray2,
        width: "100%",
        height: "30px",
        cursor: "grab",
        userSelect: "none"
      },
      ".draggable-header:hover": {
        backgroundColor: "#424242"
      },
      ".node-menu-container": {
        backgroundColor: theme.palette.c_gray1,
        borderRadius: "0 0 8px 8px",
        padding: ".5em 0px 1em .5em",
        width: "100%",
        maxHeight: "77vh",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)"
      },
      ".search-toolbar": {
        display: "flex",
        flexDirection: "row",
        alignItems: "flex-start",
        gap: "0.5em",
        overflow: "hidden",
        width: "100%",
        margin: 0,
        padding: ".5em 1em 0"
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
        sx={{ width: menuWidth, height: menuHeight }}
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
            <SearchComponent
              metadata={metadataFilteredByTypes}
              handleSearchResult={handleSearchResult}
              focusSearchInput={true}
              focusOnTyping={true}
              placeholder="Search for nodes..."
              debounceTime={20}
            />
            <Tooltip
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
            </Tooltip>

            <TypeFilter
              selectedInputType={selectedInputType}
              selectedOutputType={selectedOutputType}
              setSelectedInputType={setSelectedInputType}
              setSelectedOutputType={setSelectedOutputType}
            />
          </Box>
          <Box>
            {/* {searchResults.length > 0 && ( */}
            <NamespaceList
              namespaceTree={namespaceTree}
              metadata={searchResults}
              activeNode={activeNode || ""}
            />
          </Box>
        </Box>
      </Box>
    </Draggable>
  ) : (
    <></>
  );
}
