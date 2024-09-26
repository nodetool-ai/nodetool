/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useCallback, useMemo } from "react";
import { Box, List, Tooltip, Typography } from "@mui/material";
import { NodeMetadata } from "../../stores/ApiTypes";
import RenderNamespaces from "./RenderNamespaces";
import RenderNodes from "./RenderNodes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY,
  TOOLTIP_LEAVE_DELAY
} from "../node/BaseNode";
import NodeInfo from "./NodeInfo";

type NamespaceTree = Record<
  string,
  {
    children: NamespaceTree;
  }
>;

interface NamespaceListProps {
  namespaceTree: NamespaceTree;
  metadata: NodeMetadata[];
}

const namespaceStyles = (theme: any) =>
  css({
    "&": {
      // maxHeight: "65vh"
    },
    ".header": {
      display: "flex",
      minHeight: "30px",
      alignItems: "center",
      flexDirection: "row",
      margin: "0 1em .5em 1em"
    },
    ".clear-namespace": {
      padding: "0 ",
      width: ".5em",
      height: "1em",
      color: theme.palette.c_gray4
    },
    ".list-box": {
      display: "flex",
      overflowY: "auto",
      flexDirection: "row",
      alignItems: "stretch",
      gap: "1em",
      marginLeft: "1em"
    },
    ".namespace-list": {
      overflowY: "scroll",
      overflowX: "hidden",
      maxHeight: "55vh",
      minWidth: "220px",
      flexShrink: "1"
    },
    ".node-list": {
      maxHeight: "55vh",
      minWidth: "300px",
      paddingRight: ".5em",
      paddingBottom: "1em",
      flex: "0 1 auto",
      transition: "max-width 1s ease-out, width 1s ease-out",
      overflowX: "hidden",
      overflowY: "scroll"
    },
    ".no-selection": {
      display: "flex",
      flexDirection: "column",
      color: theme.palette.c_white,
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeNormal,
      wordSpacing: "0",
      padding: "0 1em",
      margin: 0,
      alignItems: "stretch",
      gap: "1em"
    },
    ".explanation": {
      overflowY: "scroll",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeNormal,
      margin: "0",
      padding: "0 2em 2em 0"
    },
    ".explanation h5": {
      color: theme.palette.c_hl1,
      marginBottom: "0.3em"
    },
    ".explanation p": {
      fontSize: theme.fontSizeNormal
    },
    ".explanation ul": {
      listStyleType: "square",
      paddingInlineStart: "1em",
      margin: 0,
      "& li": {
        fontFamily: theme.fontFamily1,
        fontSize: theme.fontSizeNormal,
        margin: "0.25em 0",
        padding: "0"
      }
    },
    ".result-info": {
      color: theme.palette.c_white,
      cursor: "default"
    },
    ".result-info span": {
      color: theme.palette.c_gray6
    },
    ".no-selection p": {
      margin: "0",
      padding: "0 0 .5em 0"
    },
    ".no-results": {
      padding: "0 0 0 1em",
      margin: 0
    },
    ".highlighted": {
      paddingLeft: ".25em",
      marginLeft: ".1em",
      borderLeft: `2px solid ${theme.palette.c_hl1}`
    },
    ".highlighted-text": {
      color: theme.palette.c_hl1
    },
    ".nodes": {
      display: "flex",
      flexDirection: "column"
    },
    ".node": {
      display: "flex",
      alignItems: "center",
      margin: "0",
      padding: "0.025em",
      borderRadius: "3px",
      cursor: "pointer",
      ".node-button": {
        padding: ".1em .5em",
        "& .MuiTypography-root": {
          fontSize: theme.fontSizeSmall
        }
      }
    },
    ".node.hovered": {
      color: theme.palette.c_hl1
    },
    ".namespace-text": {
      color: theme.palette.c_gray6,
      fontWeight: "normal",
      borderBottom: `1px solid ${theme.palette.c_gray3}`,
      borderTop: `1px solid ${theme.palette.c_gray3}`,
      padding: ".25em 0",
      margin: "1em 0 .5em"
    },
    ".node-info:hover": {
      color: theme.palette.c_hl1
    }
  });

const NamespaceList: React.FC<NamespaceListProps> = React.memo(
  ({ namespaceTree, metadata }) => {
    const {
      searchTerm,
      highlightedNamespaces,
      selectedPath,
      setSelectedPath,
      searchResults,
      hoveredNode,
      setHoveredNode,
      showNamespaceTree
    } = useNodeMenuStore((state) => ({
      searchTerm: state.searchTerm,
      highlightedNamespaces: state.highlightedNamespaces,
      selectedPath: state.selectedPath,
      setSelectedPath: state.setSelectedPath,
      searchResults: state.searchResults,
      hoveredNode: state.hoveredNode,
      setHoveredNode: state.setHoveredNode,
      showNamespaceTree: state.showNamespaceTree
    }));

    const handleNamespaceClick = useCallback(
      (namespacePath: string[]) => {
        setHoveredNode(null);
        setSelectedPath(
          selectedPath.join(".") === namespacePath.join(".")
            ? selectedPath.slice(0, -1)
            : namespacePath
        );
      },
      [setHoveredNode, setSelectedPath, selectedPath]
    );

    const selectedPathString = useMemo(
      () => selectedPath.join("."),
      [selectedPath]
    );

    const currentNodes = useMemo(() => {
      if (!metadata) return [];

      return metadata
        .filter((node) => {
          const startsWithPath = node.namespace.startsWith(
            selectedPathString + "."
          );
          return (
            (selectedPathString === "" && searchTerm !== "") ||
            node.namespace === selectedPathString ||
            startsWithPath
          );
        })
        .sort((a, b) => {
          const namespaceComparison = a.namespace.localeCompare(b.namespace);
          return namespaceComparison !== 0
            ? namespaceComparison
            : a.title.localeCompare(b.title);
        });
    }, [metadata, selectedPathString, searchTerm]);

    const renderNamespaces = useMemo(
      () => (
        <RenderNamespaces
          tree={namespaceTree}
          handleNamespaceClick={handleNamespaceClick}
        />
      ),
      [namespaceTree, handleNamespaceClick]
    );

    const renderNodes = useMemo(
      () => <RenderNodes nodes={currentNodes} />,
      [currentNodes]
    );

    const renderNodeInfo = useMemo(
      () => hoveredNode && <NodeInfo nodeMetadata={hoveredNode} />,
      [hoveredNode]
    );

    return (
      <div css={namespaceStyles}>
        <Box className="header">
          <Tooltip
            title={
              <span
                style={{
                  color: "#eee",
                  fontSize: "1.25em"
                }}
              >
                showing the amount of nodes found: <br />
                [in selected namespace | total search results]
              </span>
            }
            enterDelay={TOOLTIP_ENTER_DELAY}
            leaveDelay={TOOLTIP_LEAVE_DELAY}
            enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
            placement="bottom"
          >
            <Typography className="result-info">
              <span>
                [{currentNodes?.length} | {searchResults.length}]
              </span>
            </Typography>
          </Tooltip>
        </Box>

        <Box className="list-box">
          <List
            className="namespace-list"
            sx={{ display: showNamespaceTree ? "block" : "none" }}
          >
            {renderNamespaces}
          </List>
          {currentNodes && currentNodes.length > 0 ? (
            <>
              <List className="node-list">{renderNodes}</List>
              {renderNodeInfo}
            </>
          ) : searchTerm.length > 0 && highlightedNamespaces.length > 0 ? (
            <div className="no-selection">
              <p>
                Nothing found in this namespace for
                <strong className="highlighted-text">
                  {" "}
                  &quot;{searchTerm}&quot;
                </strong>
              </p>
              <ul className="no-results">
                <li>
                  click on <span className="highlighted">highlighted </span>
                  namespaces to find results.
                </li>
                <li>just start typing to enter a new search term</li>
              </ul>
            </div>
          ) : (
            <div className="no-selection">
              <div className="explanation">
                <Typography variant="h5" style={{ marginTop: 0 }}>
                  Browse Nodes
                </Typography>
                <ul>
                  <li>Click on the namespaces to the left</li>
                </ul>

                <Typography variant="h5">Search Nodes</Typography>
                <ul>
                  <li>Type in the search bar to search for nodes.</li>
                </ul>

                <Typography variant="h5">Create Nodes</Typography>
                <ul>
                  <li>Click on a node</li>
                  <li>Drag nodes on canvas</li>
                </ul>
              </div>
              <List className="node-info">
                <Typography className="node-title"></Typography>
              </List>
            </div>
          )}
        </Box>
      </div>
    );
  }
);

NamespaceList.displayName = "NamespaceList";

export default NamespaceList;
