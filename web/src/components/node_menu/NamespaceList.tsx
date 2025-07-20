/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import React, { memo, useCallback, useMemo } from "react";
import { Box, List, Tooltip, Typography, Button } from "@mui/material";
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
import { KeyboardArrowLeft, AddCircleOutline } from "@mui/icons-material";
import { usePanelStore } from "../../stores/PanelStore";

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

const namespaceStyles = (theme: Theme) =>
  css({
    "&": {
      margin: "1em 0",
      height: "60vh",
      display: "flex",
      flexDirection: "column",
      marginTop: "20px",
      overflow: "auto"
    },
    "& h4": {
      fontSize: "1em",
      color: "var(--palette-primary-main)"
    },
    ".info-box": {
      position: "absolute",
      right: "0",
      bottom: "0",
      minHeight: "30px",
      alignItems: "center",
      flexDirection: "column",
      margin: "0 1em .5em ",
      justifyContent: "flex-start"
    },
    ".node-packs-info": {
      textAlign: "right",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      width: "100%"
    },
    ".list-box": {
      display: "flex",
      flexDirection: "row",
      alignItems: "stretch",
      margin: "0",
      width: "100%",
      flex: "1 1 auto",
      minHeight: 0,
      overflow: "auto"
    },
    ".namespace-list": {
      display: "flex",
      flexDirection: "column",
      gap: "0",
      overflowY: "auto",
      minWidth: "200px",
      width: "100%",
      boxSizing: "border-box",
      height: "100%",
      maxHeight: "calc(min(750px, 80vh))",
      paddingRight: "1em",
      paddingLeft: "1em",
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
      borderTop: `1px solid ${theme.vars.palette.grey[900]}`,
      marginTop: "0.5em",
      paddingTop: "0.5em",
      ".namespace-item": {
        color: theme.vars.palette.grey[200]
      }
    },
    ".node-list": {
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
      color: theme.vars.palette.grey[0],
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
      color: theme.vars.palette.grey[200],
      fontWeight: "300",
      margin: "0",
      padding: "0 2em 2em 0"
    },
    ".explanation h5": {
      color: "var(--palette-primary-main)",
      margin: " 0 0 0.3em",
      padding: "0",
      fontWeight: "300"
    },
    ".explanation ul": {
      listStyleType: "square",
      paddingInlineStart: "1em",
      margin: 0,
      "& li": {
        margin: "0.25em 0",
        padding: "0"
      }
    },
    ".result-info": {
      color: theme.vars.palette.grey[0],
      cursor: "default",
      display: "flex",
      alignItems: "center",
      gap: "0.25em",
      fontSize: theme.fontSizeNormal,
      padding: "0.25em .75em .2em .75em",
      borderRadius: "4px",
      backgroundColor: theme.vars.palette.grey[600],
      margin: "1em .5em 0 0"
    },
    ".result-info span": {
      color: "var(--palette-primary-main)",
      fontWeight: "500"
    },
    ".result-label": {
      color: `${theme.vars.palette.grey[400]} !important`,
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
      padding: "0 0 0 2em",
      margin: "0",
      fontSize: "0.8em",
      color: theme.vars.palette.grey[200]
    },
    h6: {
      color: theme.vars.palette.grey[400]
    },
    ".highlighted": {
      paddingLeft: ".25em",
      marginLeft: ".1em",
      borderLeft: `2px solid ${"var(--palette-primary-main)"}`
    },
    ".highlighted-text": {
      color: "var(--palette-primary-main)"
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
        "&:hover": {
          backgroundColor: "var(--palette-grey-800)"
        },
        "& .MuiTypography-root": {
          fontSize: theme.fontSizeSmall
        }
      },
      ".icon-bg": {
        backgroundColor: "transparent !important"
      },
      ".icon-bg svg": {
        color: theme.vars.palette.grey[400]
      }
    },
    ".node:hover": {
      backgroundColor: theme.vars.palette.grey[800]
    },
    ".node.focused": {
      color: "var(--palette-primary-main)",
      backgroundColor: theme.vars.palette.grey[800],
      borderRadius: "3px",
      boxShadow: "inset 1px 1px 2px #00000044"
    },
    ".namespace-text": {
      color: theme.vars.palette.grey[400],
      fontWeight: "500",
      fontSize: "75%",
      borderTop: `1px solid ${theme.vars.palette.grey[600]}`,
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
      color: "var(--palette-primary-main)"
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
      color: theme.vars.palette.grey[0],
      textTransform: "capitalize",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      userSelect: "none"
    },
    ".disabled .namespace-item": {
      color: theme.vars.palette.grey[400]
    },
    ".namespaces .list-item": {
      cursor: "pointer",
      padding: ".3em .75em",
      backgroundColor: "transparent",
      borderLeft: `3px solid ${theme.vars.palette.grey[800]}`,
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
      color: theme.vars.palette.grey[200],
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[600]
      }
    },
    ".list-item.firstDisabled": {
      borderTop: `1px solid ${theme.vars.palette.grey[200]}`,
      marginTop: "0.5em"
    },
    ".namespaces .list-item:hover": {
      backgroundColor: theme.vars.palette.grey[500],
      borderLeft: `3px solid ${"var(--palette-primary-main)"}`
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
      backgroundColor: "var(--palette-primary-main)",
      borderLeft: `3px solid ${"var(--palette-primary-main)"}`,
      fontWeight: "500"
    },
    ".namespaces .list-item.selected .namespace-item": {
      color: theme.vars.palette.grey[1000]
    },
    ".namespaces .list-item.disabled.selected": {
      backgroundColor: theme.vars.palette.grey[600],
      border: "none"
    },
    ".namespaces .list-item.highlighted": {
      borderLeft: `3px solid ${"var(--palette-primary-main)"}`
    },
    ".namespaces .list-item.highlighted.selected .namespace-item": {
      color: theme.vars.palette.grey[1000]
    },
    ".namespaces .sublist": {
      paddingLeft: "1em"
    },
    ".api-key-warning": {
      color: theme.vars.palette.grey[200],
      fontSize: theme.fontSizeSmall,
      margin: "0.5em 0"
    },
    "&.has-search-results .namespace-list-enabled .no-highlight .namespace-item":
      {
        color: theme.vars.palette.grey[200]
      },
    "&.has-search-results .no-highlight": {
      pointerEvents: "none"
    },
    ".namespace-panel-container": {
      position: "relative",
      transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
      width: "270px",
      marginRight: "0.5em",
      "&.collapsed": {
        width: 0,
        opacity: 0,
        visibility: "hidden",
        marginRight: "1em"
      }
    },
    ".node-info-container": {
      width: "300px",
      backgroundColor: "transparent"
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
      cursor: "pointer",
      color: theme.vars.palette.grey[0],
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
  const handleViewChange = usePanelStore((state) => state.handleViewChange);

  const openPacksPanel = useCallback(() => {
    handleViewChange("packs");
  }, [handleViewChange]);

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
          <h4>Node Search</h4>
          <p>
            Browse through available nodes by selecting namespaces from the menu
            on the left
          </p>
          <p>Add nodes to your workflow by:</p>
          <ul>
            <li>Clicking on the desired node</li>
            <li>Or dragging it directly onto the canvas</li>
          </ul>
        </div>
      )}
      <div className="node-packs-info">
        <Button
          startIcon={<AddCircleOutline />}
          size="small"
          variant="outlined"
          onClick={openPacksPanel}
          style={{
            marginTop: "0.5em",
            marginBottom: "0.5em",
            textTransform: "none",
            lineHeight: "1.5",
            padding: "15px"
          }}
        >
          Install additional node packs
        </Button>
      </div>

      <Typography variant="h6">Let us know what&apos;s missing</Typography>
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
  searchResults,
  allSearchMatches,
  metadata,
  totalNodes
}: {
  searchTerm: string;
  minSearchTermLength: number;
  selectedPathString: string;
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
              <div>Current namespace: {searchResults?.length} nodes</div>
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
              <span>{searchResults.length}</span> /{" "}
              <span>
                {searchTerm.length > minSearchTermLength
                  ? allSearchMatches.length
                  : metadata.length}
              </span>
            </>
          ) : (
            <span>
              {selectedPathString ? searchResults.length : totalNodes}
            </span>
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
    selectedInputType,
    selectedOutputType
  } = useNodeMenuStore((state) => ({
    searchTerm: state.searchTerm,
    selectedPath: state.selectedPath,
    searchResults: state.searchResults,
    allSearchMatches: state.allSearchMatches,
    hoveredNode: state.hoveredNode,
    selectedInputType: state.selectedInputType,
    selectedOutputType: state.selectedOutputType
  }));

  const allMetadata = useMetadataStore((state) => state.metadata);

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

  const totalNodes = useMemo(() => {
    return Object.values(allMetadata).length;
  }, [allMetadata]);

  const [isPanelCollapsed, setIsPanelCollapsed] = React.useState(false);

  const togglePanel = useCallback(() => {
    setIsPanelCollapsed((prev) => !prev);
  }, []);

  return (
    <div
      css={namespaceStyles}
      className={
        (searchTerm.length > minSearchTermLength ||
          selectedInputType ||
          selectedOutputType) &&
        searchResults.length > 0
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
        {selectedPathString ||
        searchTerm ||
        selectedInputType ||
        selectedOutputType ? (
          <>
            <List className="node-list">
              <RenderNodes nodes={searchResults} />
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
        searchResults={searchResults}
        allSearchMatches={allSearchMatches}
        metadata={metadata}
        totalNodes={totalNodes}
      />
    </div>
  );
};

export default memo(NamespaceList, isEqual);
