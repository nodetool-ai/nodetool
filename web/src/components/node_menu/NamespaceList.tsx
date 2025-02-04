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
import useMetadataStore from "../../stores/MetadataStore";
import { KeyboardArrowLeft } from "@mui/icons-material";

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
}

const namespaceStyles = (theme: any) =>
  css({
    "&": {
      margin: "1em 0",
      height: "60vh",
      display: "flex",
      flexDirection: "column",
      marginTop: "20px"
    },
    ".info-box": {
      position: "absolute",
      right: "0",
      bottom: "0",
      minHeight: "30px",
      alignItems: "center",
      flexDirection: "row",
      margin: "0 1em .5em ",
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
      margin: "0",
      width: "100%",
      flex: "1 1 auto",
      minHeight: 0
    },
    ".namespace-list": {
      display: "flex",
      flexDirection: "column",
      gap: "0",
      overflowY: "auto",
      minWidth: "150px",
      maxWidth: "200px",
      width: "fit-content",
      height: "fit-content",
      maxHeight: "calc(min(750px, 50vh))",
      paddingRight: "1em",
      paddingLeft: "1em",
      // paddingBottom: "3em",
      marginRight: ".5em",
      boxShadow: "inset 0 0 4px rgba(0, 0, 0, 0.2)",
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
      // padding: "0 1em 1em .5em",
      // marginRight: ".5em",
      height: "100%",
      maxHeight: "750px",
      width: "250px",
      flex: "0 1 auto",
      backgroundColor: "transparent",
      transition: "max-width 1s ease-out, width 1s ease-out",
      overflowX: "hidden",
      overflowY: "auto"
    },
    ".no-selection": {
      maxWidth: "200px",
      flexDirection: "column",
      color: theme.palette.c_white,
      fontFamily: theme.fontFamily1,
      wordSpacing: "0",
      padding: "0 1em",
      margin: 0,
      alignItems: "stretch",
      gap: "1em",
      opacity: 0,
      animation: "fadeIn 0.4s ease-in forwards",
      animationDelay: ".5s",
      visibility: "hidden",
      overflow: "hidden"
      // textWrap: "nowrap"
    },
    "@keyframes fadeIn": {
      from: {
        visibility: "visible",
        display: "flex",
        maxWidth: "400px",
        opacity: 0
      },
      to: {
        visibility: "visible",
        display: "flex",
        maxWidth: "400px",
        opacity: 1
      }
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
      padding: "0.25em .75em .2em .75em",
      borderRadius: "4px",
      backgroundColor: theme.palette.c_gray2,
      margin: "1em .5em 0 0"
    },
    ".result-info span": {
      color: theme.palette.c_hl1,
      fontWeight: "500"
    },
    ".result-label": {
      color: `${theme.palette.c_gray4} !important`,
      fontSize: "0.8em",
      fontWeight: "400",
      marginLeft: "0.5em",
      userSelect: "none"
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
      minWidth: "200px",
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
      wordBreak: "break-word",
      userSelect: "none",
      pointerEvents: "none"
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
      textTransform: "capitalize",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      userSelect: "none"
    },
    ".disabled .namespace-item": {
      color: theme.palette.c_gray4
    },
    ".namespaces .list-item": {
      cursor: "pointer",
      padding: ".3em .75em",
      backgroundColor: "transparent",
      borderLeft: `3px solid ${theme.palette.c_gray1}`,
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
    },
    "&.has-search-results .namespace-list-enabled .no-highlight .namespace-item":
      {
        color: theme.palette.c_gray5
      },
    "&.has-search-results .no-highlight": {
      pointerEvents: "none"
    },
    ".namespace-panel-container": {
      position: "relative",
      transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
      width: "200px",
      "&.collapsed": {
        width: 0,
        opacity: 0,
        visibility: "hidden",
        marginRight: "1em"
      }
    },
    ".node-info-container": {
      width: "300px"
    },
    ".toggle-panel-button": {
      position: "absolute",
      left: "0",
      top: "0",
      height: "100%",
      zIndex: 1,
      backgroundColor: "transparent",
      border: "none",
      borderRadius: "0 4px 4px 0",
      padding: "0",
      cursor: "pointer",
      color: theme.palette.c_white,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      "&:hover": {
        backgroundColor: "rgba(255, 255, 255, 0.05)"
      },
      "& svg": {
        color: "rgba(255, 255, 255, 0.5)",
        transition: "transform 0.3s ease-in-out"
      },
      "&.collapsed svg": {
        transform: "rotate(180deg)"
      }
    }
  });

const NoSelectionContent = memo(function NoSelectionContent({
  searchTerm,
  selectedPathString,
  minSearchTermLength
}: {
  searchTerm: string;
  selectedPathString: string;
  minSearchTermLength: number;
}) {
  return (
    <div className="no-selection">
      {searchTerm.length > minSearchTermLength ? (
        <>
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
        </>
      ) : (
        <div className="explanation">
          <h5>Node Search</h5>
          <ul>
            <li>
              Browse through available nodes by selecting namespaces from the
              menu on the left
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
      )}
      <Typography variant="h4" sx={{ margin: "1em 0 0 0" }}>
        Let us know what's missing
      </Typography>
      <p>
        We're always looking to improve Nodetool and welcome any suggestions!
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
  );
});

const InfoBox = memo(function InfoBox({
  searchTerm,
  minSearchTermLength,
  selectedPathString,
  currentNodes,
  searchResults,
  allSearchMatches,
  metadata,
  totalNodes
}: {
  searchTerm: string;
  minSearchTermLength: number;
  selectedPathString: string;
  currentNodes: NodeMetadata[];
  searchResults: NodeMetadata[];
  allSearchMatches: NodeMetadata[];
  metadata: NodeMetadata[];
  totalNodes: number;
}) {
  return (
    <Box className="info-box">
      <Tooltip
        title={
          <div style={{ color: "#eee", fontSize: "1.25em" }}>
            {selectedPathString && (
              <div>Current namespace: {currentNodes?.length} nodes</div>
            )}
            {searchTerm.length > minSearchTermLength ? (
              <>
                <div>Total search matches: {allSearchMatches.length}</div>
                <div
                  style={{
                    fontSize: "0.8em",
                    color: "#aaa",
                    marginTop: "0.5em"
                  }}
                ></div>
              </>
            ) : (
              <>
                <div>Total available: {totalNodes} nodes</div>
                <div
                  style={{
                    fontSize: "0.8em",
                    color: "#aaa",
                    marginTop: "0.5em"
                  }}
                ></div>
              </>
            )}
          </div>
        }
        enterDelay={TOOLTIP_ENTER_DELAY}
        leaveDelay={TOOLTIP_LEAVE_DELAY}
        enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
        placement="bottom"
      >
        <Typography className="result-info">
          {searchTerm.length > minSearchTermLength ? (
            <>
              <span>
                {searchTerm.length > minSearchTermLength
                  ? searchResults.length
                  : currentNodes?.length}
              </span>{" "}
              /{" "}
              <span>
                {searchTerm.length > minSearchTermLength
                  ? allSearchMatches.length
                  : metadata.length}
              </span>
            </>
          ) : (
            <span>{selectedPathString ? currentNodes.length : totalNodes}</span>
          )}
          <span className="result-label">nodes</span>
        </Typography>
      </Tooltip>
    </Box>
  );
});

const NamespaceList: React.FC<NamespaceListProps> = ({
  namespaceTree,
  metadata
}) => {
  const {
    searchTerm,
    selectedPath,
    searchResults,
    allSearchMatches,
    hoveredNode,
    getCurrentNodes
  } = useNodeMenuStore((state) => ({
    searchTerm: state.searchTerm,
    highlightedNamespaces: state.highlightedNamespaces,
    selectedPath: state.selectedPath,
    searchResults: state.searchResults,
    allSearchMatches: state.allSearchMatches,
    hoveredNode: state.hoveredNode,
    selectedInputType: state.selectedInputType,
    selectedOutputType: state.selectedOutputType,
    getCurrentNodes: state.getCurrentNodes
  }));

  const selectedPathString = useMemo(
    () => selectedPath.join("."),
    [selectedPath]
  );

  const minSearchTermLength =
    searchTerm.includes("+") ||
    searchTerm.includes("-") ||
    searchTerm.includes("*") ||
    searchTerm.includes("/")
      ? 0
      : 1;

  const { enabledTree, disabledTree } = useMemo(() => {
    const enabled: NamespaceTree = {};
    const disabled: NamespaceTree = {};

    Object.entries(namespaceTree).forEach(([key, value]) => {
      const isRootDisabled = value.disabled;
      if (isRootDisabled) {
        disabled[key] = value;
      } else {
        enabled[key] = value;
      }
    });

    return { enabledTree: enabled, disabledTree: disabled };
  }, [namespaceTree]);

  const currentNodes = useMemo(() => {
    const nodes = getCurrentNodes();
    return nodes;
  }, [metadata, getCurrentNodes]);

  const totalNodes = useMetadataStore((state) => state.getAllMetadata()).length;

  const [isPanelCollapsed, setIsPanelCollapsed] = React.useState(false);

  const togglePanel = useCallback(() => {
    setIsPanelCollapsed((prev) => !prev);
  }, []);

  return (
    <div
      css={namespaceStyles}
      className={
        searchTerm.length > minSearchTermLength && searchResults.length > 1
          ? "has-search-results"
          : "no-search-results"
      }
    >
      <button
        className={`toggle-panel-button ${isPanelCollapsed ? "collapsed" : ""}`}
        onClick={togglePanel}
        title={isPanelCollapsed ? "Show namespaces" : "Hide namespaces"}
      >
        <KeyboardArrowLeft />
      </button>
      <Box className="list-box">
        <div
          className={`namespace-panel-container ${
            isPanelCollapsed ? "collapsed" : ""
          }`}
        >
          <List className="namespace-list">
            <div className="namespace-list-enabled">
              <RenderNamespaces tree={enabledTree} />
            </div>
            <div className="namespace-list-disabled">
              <RenderNamespaces tree={disabledTree} />
            </div>
          </List>
        </div>
        {currentNodes && currentNodes.length > 0 ? (
          <>
            <List className="node-list">
              <RenderNodes nodes={currentNodes} />
            </List>
            <div className="node-info-container">
              {hoveredNode && <NodeInfo nodeMetadata={hoveredNode} />}
            </div>
          </>
        ) : (
          <NoSelectionContent
            searchTerm={searchTerm}
            selectedPathString={selectedPathString}
            minSearchTermLength={minSearchTermLength}
          />
        )}
      </Box>
      <InfoBox
        searchTerm={searchTerm}
        minSearchTermLength={minSearchTermLength}
        selectedPathString={selectedPathString}
        currentNodes={currentNodes}
        searchResults={searchResults}
        allSearchMatches={allSearchMatches}
        metadata={metadata}
        totalNodes={totalNodes}
      />
    </div>
  );
};

export default memo(NamespaceList, isEqual);
