/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { memo, useMemo } from "react";
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
import { isEqual } from "lodash";
import ThemeNodetool from "../themes/ThemeNodetool";

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
      margin: "1em 0 0 1em"
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
      overflowY: "auto",
      flexDirection: "row",
      alignItems: "stretch",
      gap: "2em",
      marginLeft: "0"
    },
    ".namespace-list": {
      overflowY: "scroll",
      overflowX: "hidden",
      maxHeight: "55vh",
      flexShrink: "1",
      minWidth: "200px",
      boxShadow: "inset 0 0 10px rgba(0, 0, 0, 0.4)",
      borderRadius: "8px",
      display: "flex",
      flexDirection: "column",
      gap: "0"
    },
    ".node-list": {
      paddingTop: "0",
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
      fontWeight: "300",
      margin: "0",
      padding: "0 2em 2em 0"
    },
    ".explanation h5": {
      color: theme.palette.c_hl1,
      marginBottom: "0.3em"
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
      padding: "0.25em 1em",
      borderRadius: "4px",
      backgroundColor: theme.palette.c_gray2,
      margin: "0 1em"
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
          fontSize: theme.fontSizeSmaller
        }
      }
    },
    ".node.hovered": {
      color: theme.palette.c_hl1
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
      borderBottom: `1px solid ${theme.palette.c_gray3}`,
      borderTop: `1px solid ${theme.palette.c_gray3}`,
      padding: ".5em 0",
      letterSpacing: "0.5px"
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
    ".namespaces .list-item": {
      cursor: "pointer",
      padding: ".4em .75em",
      backgroundColor: "transparent",
      borderLeft: `3px solid ${theme.palette.c_gray3}`,
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeNormal,
      fontWeight: "300",
      transition: "all 0.2s ease-in-out",
      maxHeight: "40px",
      overflow: "hidden",
      margin: "0",
      borderRadius: "0 4px 4px 0"
    },
    ".namespaces .list-item:hover": {
      backgroundColor: theme.palette.c_gray3,
      borderLeft: `3px solid ${theme.palette.c_hl1}`
    },
    ".namespaces .list-item.expanded": {
      maxHeight: "40px",
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
      color: theme.palette.c_black,
      borderLeft: `3px solid ${theme.palette.c_hl1}`,
      fontWeight: "500"
    },
    ".namespaces .list-item.highlighted": {
      borderLeft: `3px solid ${theme.palette.c_hl1}`
    },
    ".namespaces .sublist": {
      paddingLeft: "1em"
    }
  });

const NamespaceList: React.FC<NamespaceListProps> = ({
  namespaceTree,
  metadata
}) => {
  const {
    searchTerm,
    highlightedNamespaces,
    selectedPath,
    searchResults,
    hoveredNode,
    selectedInputType,
    selectedOutputType
  } = useNodeMenuStore((state) => ({
    searchTerm: state.searchTerm,
    highlightedNamespaces: state.highlightedNamespaces,
    selectedPath: state.selectedPath,
    searchResults: state.searchResults,
    hoveredNode: state.hoveredNode,
    selectedInputType: state.selectedInputType,
    selectedOutputType: state.selectedOutputType
  }));

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
          (selectedPathString === "" && searchTerm.length > 1) ||
          selectedInputType ||
          selectedOutputType ||
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
  }, [
    metadata,
    selectedPathString,
    searchTerm.length,
    selectedInputType,
    selectedOutputType
  ]);

  const renderNamespaces = useMemo(
    () => <RenderNamespaces tree={namespaceTree} />,
    [namespaceTree]
  );

  const renderNodes = useMemo(
    () => <RenderNodes nodes={currentNodes} />,
    [currentNodes]
  );

  const renderNodeInfo = useMemo(
    () => hoveredNode && <NodeInfo nodeMetadata={hoveredNode} />,
    [hoveredNode]
  );
  const memoizedStyles = useMemo(() => namespaceStyles(ThemeNodetool), []);

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
          </div>
        )}
      </Box>
    </div>
  );
};

export default memo(NamespaceList, isEqual);
