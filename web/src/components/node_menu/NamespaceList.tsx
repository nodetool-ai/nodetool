/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { memo, useCallback, useMemo } from "react";
import { Box, List, Tooltip, Typography } from "@mui/material";
import { NodeMetadata } from "../../stores/ApiTypes";
import RenderNamespaces from "./RenderNamespaces";
import RenderNodes from "./RenderNodes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY,
  TOOLTIP_LEAVE_DELAY
} from "../../config/constants";
import NodeInfo from "./NodeInfo";
import { isEqual } from "lodash";
import ThemeNodetool from "../themes/ThemeNodetool";

type NamespaceTree = {
  [key: string]: {
    children: NamespaceTree;
    disabled: boolean;
    requiredKey?: string;
  };
};

interface NamespaceListProps {
  namespaceTree: NamespaceTree;
  metadata: NodeMetadata[];
  inPanel?: boolean;
}

const namespaceStyles = (theme: any, inPanel: boolean) =>
  css({
    "&": {
      margin: "1em 0 0 1em",
      height: inPanel ? "100%" : "60vh",
      display: "flex",
      flexDirection: "column",
      marginTop: inPanel ? "-32px" : "0"
    },
    ".header": {
      display: "flex",
      minHeight: "30px",
      alignItems: "center",
      flexDirection: "row",
      margin: "0 1em .5em 1em",
      justifyContent: "flex-end"
    },
    ".clear-namespace": {
      padding: "0",
      width: ".5em",
      height: "1em",
      color: theme.palette.c_gray4
    },
    ".list-box": {
      display: "flex",
      flexDirection: "row",
      alignItems: "stretch",
      marginLeft: "0",
      width: "100%",
      flex: "1 1 auto",
      minHeight: 0
    },
    ".namespace-list": {
      display: "flex",
      flexDirection: "column",
      gap: "0",
      overflowY: "auto",
      width: "fit-content",
      height: "fit-content",
      maxHeight: inPanel ? "85vh" : "680px",
      paddingRight: inPanel ? ".5em" : "1em",
      paddingBottom: "3em",
      marginRight: ".5em",
      minWidth: inPanel ? "120px" : "100px",
      boxShadow: "inset 0 0 10px rgba(0, 0, 0, 0.4)",
      borderRadius: "8px"
    },
    ".namespace-list-enabled": {
      flex: "1 1 auto",
      height: "fit-content",
      overflowY: "visible"
    },
    ".namespace-list-disabled": {
      flex: "0 0 auto",
      height: "fit-content",
      overflowY: "visible",
      borderTop: `1px solid ${theme.palette.c_gray0}`,
      marginTop: "0.5em",
      paddingTop: "0.5em",
      ".namespace-item": {
        color: theme.palette.c_gray5
      }
    },
    ".node-list": {
      padding: "0 1em 1em .5em",
      marginRight: ".5em",
      height: "100%",
      maxHeight: inPanel ? "85vh" : "750px",
      width: "fit-content",
      paddingRight: "1em",
      minWidth: "220px",
      flex: "0 1 auto",
      backgroundColor: "transparent",
      transition: "max-width 1s ease-out, width 1s ease-out",
      overflowX: "hidden",
      overflowY: "auto"
    },
    ".no-selection": {
      maxWidth: "400px",
      display: "flex",
      flexDirection: "column",
      color: theme.palette.c_white,
      fontFamily: theme.fontFamily1,
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
      color: theme.palette.c_gray5,
      fontWeight: "300",
      margin: "0",
      padding: "0 2em 2em 0"
    },
    ".explanation h5": {
      color: theme.palette.c_hl1,
      margin: " 0 0 0.3em",
      padding: "0",
      fontSize: theme.fontSizeNormal,
      fontWeight: "300"
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
      cursor: "default",
      display: "flex",
      alignItems: "center",
      gap: "0.25em",
      fontSize: theme.fontSizeNormal,
      padding: "0.25em .5em .2em .5em",
      borderRadius: "4px",
      backgroundColor: theme.palette.c_gray2,
      margin: "0 .5em"
    },
    ".result-info span": {
      color: theme.palette.c_hl1,
      fontWeight: "500"
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
      flexDirection: "column",
      backgroundColor: "transparent"
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
        flexGrow: 1,
        "& .MuiTypography-root": {
          fontSize: theme.fontSizeSmall
        }
      },
      ".icon-bg": {
        backgroundColor: "transparent !important"
      },
      ".icon-bg svg": {
        color: theme.palette.c_gray4
      }
    },
    ".node:hover": {
      backgroundColor: theme.palette.c_gray2
    },
    ".node.focused": {
      color: theme.palette.c_hl1,
      backgroundColor: theme.palette.c_gray2,
      borderRadius: "3px",
      boxShadow: "inset 1px 1px 2px #00000044"
    },
    ".namespace-text": {
      color: theme.palette.c_gray4,
      fontWeight: "500",
      fontSize: "75%",
      borderTop: `1px solid ${theme.palette.c_gray2}`,
      padding: ".5em 0 0 0",
      margin: "1em 0 .5em 0",
      letterSpacing: "0.5px",
      wordBreak: "break-word"
    },
    ".info-button": {
      marginLeft: "auto"
    },
    ".node-info:hover": {
      color: theme.palette.c_hl1
    },
    ".node-info": {
      cursor: "pointer",
      marginLeft: "auto",
      display: "flex",
      alignItems: "center"
    },
    ".namespaces": {
      display: "flex",
      flexDirection: "column",
      gap: "0"
    },
    ".namespace-item": {
      color: theme.palette.c_white,
      textTransform: "capitalize"
    },
    ".disabled .namespace-item": {
      color: theme.palette.c_gray4
    },
    ".namespaces .list-item": {
      cursor: "pointer",
      padding: ".3em .75em",
      backgroundColor: "transparent",
      borderLeft: `3px solid ${theme.palette.c_gray3}`,
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmall,
      fontWeight: "300",
      transition: "all 0.2s ease-in-out",
      overflow: "hidden",
      margin: "0",
      borderRadius: "0 4px 4px 0"
    },
    ".namespaces .list-item.disabled": {
      backgroundColor: "transparent",
      border: "none !important",
      // borderLeft: `3px solid ${theme.palette.c_gray3}`,
      color: theme.palette.c_gray5,
      "&:hover": {
        backgroundColor: theme.palette.c_gray2
        // borderLeft: `3px solid ${theme.palette.c_gray3}`
      }
    },
    ".list-item.firstDisabled": {
      borderTop: `1px solid ${theme.palette.c_gray5}`,
      marginTop: "0.5em"
    },
    ".namespaces .list-item:hover": {
      backgroundColor: theme.palette.c_gray3,
      borderLeft: `3px solid ${theme.palette.c_hl1}`
    },
    ".namespaces .list-item.expanded": {
      opacity: 1
    },
    ".namespaces .list-item.collapsed": {
      maxHeight: "0",
      opacity: 0,
      padding: "0",
      width: "0",
      overflow: "hidden"
    },
    ".namespaces .list-item.selected": {
      backgroundColor: theme.palette.c_hl1,
      borderLeft: `3px solid ${theme.palette.c_hl1}`,
      fontWeight: "500"
    },
    ".namespaces .list-item.selected .namespace-item": {
      color: theme.palette.c_black
    },
    ".namespaces .list-item.disabled.selected": {
      backgroundColor: theme.palette.c_gray2,
      border: "none"
    },
    ".namespaces .list-item.highlighted": {
      borderLeft: `3px solid ${theme.palette.c_hl1}`
    },
    ".namespaces .list-item.highlighted.selected .namespace-item": {
      color: theme.palette.c_black
    },
    ".namespaces .sublist": {
      paddingLeft: "1em"
    },
    ".api-key-warning": {
      color: theme.palette.c_gray5,
      fontSize: theme.fontSizeSmall,
      margin: "0.5em 0"
    }
  });

const NamespaceList: React.FC<NamespaceListProps> = ({
  namespaceTree,
  metadata,
  inPanel = false
}) => {
  const {
    searchTerm,
    highlightedNamespaces,
    selectedPath,
    searchResults,
    hoveredNode,
    setHoveredNode,
    selectedInputType,
    selectedOutputType
  } = useNodeMenuStore((state) => ({
    searchTerm: state.searchTerm,
    highlightedNamespaces: state.highlightedNamespaces,
    selectedPath: state.selectedPath,
    searchResults: state.searchResults,
    hoveredNode: state.hoveredNode,
    setHoveredNode: state.setHoveredNode,
    selectedInputType: state.selectedInputType,
    selectedOutputType: state.selectedOutputType
  }));

  const selectedPathString = useMemo(
    () => selectedPath.join("."),
    [selectedPath]
  );

  const closeNodeInfo = useCallback(() => {
    setHoveredNode(null);
  }, [setHoveredNode]);

  const { enabledTree, disabledTree } = useMemo(() => {
    const enabled: NamespaceTree = {};
    const disabled: NamespaceTree = {};

    Object.entries(namespaceTree).forEach(([key, value]) => {
      // Check if the root namespace is disabled
      const isRootDisabled = value.disabled;
      if (isRootDisabled) {
        disabled[key] = value;
      } else {
        enabled[key] = value;
      }
    });

    return { enabledTree: enabled, disabledTree: disabled };
  }, [namespaceTree]);

  const filterNodes = useCallback(
    (nodes: NodeMetadata[]) => {
      if (!nodes) return [];

      const filteredNodes = nodes
        .filter((node) => {
          // When searching or filtering by types, show all matching nodes
          if (
            searchTerm.length > 1 ||
            selectedInputType ||
            selectedOutputType
          ) {
            return searchResults.some(
              (result) =>
                result.title === node.title &&
                result.namespace === node.namespace
            );
          }

          // Otherwise filter by namespace selection
          const isExactMatch = node.namespace === selectedPathString;
          const isDirectChild =
            node.namespace.startsWith(selectedPathString + ".") &&
            node.namespace.split(".").length ===
              selectedPathString.split(".").length + 1;
          const isRootNamespace = !selectedPathString.includes(".");
          const isDescendant = node.namespace.startsWith(
            selectedPathString + "."
          );

          return (
            isExactMatch || isDirectChild || (isRootNamespace && isDescendant)
          );
        })
        .sort((a, b) => {
          const namespaceComparison = a.namespace.localeCompare(b.namespace);
          return namespaceComparison !== 0
            ? namespaceComparison
            : a.title.localeCompare(b.title);
        });

      return filteredNodes;
    },
    [
      selectedPathString,
      searchTerm.length,
      selectedInputType,
      selectedOutputType,
      searchResults
    ]
  );

  const currentNodes = useMemo(() => {
    const nodes = filterNodes(metadata);
    return nodes;
  }, [metadata, filterNodes]);

  const renderNamespaces = useMemo(
    () => (
      <>
        <div className="namespace-list-enabled">
          <RenderNamespaces tree={enabledTree} />
        </div>
        <div className="namespace-list-disabled">
          <RenderNamespaces tree={disabledTree} />
        </div>
      </>
    ),
    [enabledTree, disabledTree]
  );

  const renderNodes = useMemo(
    () => <RenderNodes nodes={currentNodes} />,
    [currentNodes]
  );

  const renderNodeInfo = useMemo(
    () =>
      hoveredNode && (
        <NodeInfo
          nodeMetadata={hoveredNode}
          onClose={closeNodeInfo}
          inPanel={inPanel}
        />
      ),
    [hoveredNode]
  );
  const memoizedStyles = useMemo(
    () => namespaceStyles(ThemeNodetool, inPanel),
    [inPanel]
  );

  return (
    <div css={memoizedStyles}>
      <Box className="header">
        <Tooltip
          title={
            <span style={{ color: "#eee", fontSize: "1.25em" }}>
              Showing nodes found:
              <br />
              Selected namespace / Total results
            </span>
          }
          enterDelay={TOOLTIP_ENTER_DELAY}
          leaveDelay={TOOLTIP_LEAVE_DELAY}
          enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
          placement="bottom"
        >
          <Typography className="result-info">
            <span>{currentNodes?.length}</span> /{" "}
            <span>{searchResults.length}</span>
          </Typography>
        </Tooltip>
      </Box>

      <Box className="list-box">
        <List className="namespace-list">{renderNamespaces}</List>
        {currentNodes && currentNodes.length > 0 ? (
          <>
            <List className="node-list">{renderNodes}</List>
            {renderNodeInfo}
          </>
        ) : searchTerm.length > 0 ? (
          <div className="no-selection">
            <p>
              {selectedPathString ? (
                <>
                  Nothing found in this namespace for
                  <strong className="highlighted-text">
                    {" "}
                    &quot;{searchTerm}&quot;
                  </strong>
                </>
              ) : (
                <>
                  Nothing found for
                  <strong className="highlighted-text">
                    {" "}
                    &quot;{searchTerm}&quot;
                  </strong>
                </>
              )}
            </p>
            <ul className="no-results">
              {selectedPathString && (
                <li>
                  click on <span className="highlighted">highlighted </span>
                  namespaces to find results.
                </li>
              )}
              <li>just start typing to enter a new search term</li>
              <li>clear search by clicking the clear button</li>
            </ul>
            <Typography variant="h4" sx={{ margin: "1em 0 0 0" }}>
              Let us know what's missing
            </Typography>
            <p>
              We're always looking to improve Nodetool and welcome any
              suggestions!
            </p>
            <ul className="no-results">
              <li>
                Join our{" "}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    window.open(
                      "https://discord.gg/WmQTWZRcYE",
                      "_blank",
                      "noopener,noreferrer"
                    );
                  }}
                  style={{ color: "#61dafb" }}
                >
                  Discord
                </a>
              </li>
              <li>
                Join the{" "}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    window.open(
                      "https://forum.nodetool.ai",
                      "_blank",
                      "noopener,noreferrer"
                    );
                  }}
                  style={{ color: "#61dafb" }}
                >
                  Nodetool Forum
                </a>
              </li>
            </ul>
          </div>
        ) : (
          <div className="no-selection">
            <div className="explanation">
              <h5>Browse & Add Nodes</h5>
              <ul>
                <li>
                  Browse through available nodes by selecting namespaces from
                  the menu on the left
                </li>
                <li>
                  Add nodes to your workflow by:
                  <ul>
                    <li>Clicking on the desired node</li>
                    <li>Or dragging it directly onto the canvas</li>
                  </ul>
                </li>
              </ul>
            </div>
          </div>
        )}
      </Box>
    </div>
  );
};

export default memo(NamespaceList, isEqual);
