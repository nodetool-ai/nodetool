/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
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
import QuickActionTiles from "./QuickActionTiles";
import RecentNodesTiles from "./RecentNodesTiles";
import isEqual from "lodash/isEqual";
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
      gap: "2px",
      overflowY: "auto",
      minWidth: "200px",
      width: "100%",
      boxSizing: "border-box",
      height: "100%",
      maxHeight: "calc(min(750px, 80vh))",
      paddingRight: "0.75em",
      paddingLeft: "0.75em",
      borderRadius: "12px",
      // Glassmorphic list container
      border: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.action.hover,
      boxShadow: "inset 0 2px 4px rgba(0,0,0,0.1)"
    },
    ".namespace-list::-webkit-scrollbar": { width: "6px" },
    ".namespace-list::-webkit-scrollbar-track": { background: "transparent" },
    ".namespace-list::-webkit-scrollbar-thumb": {
      backgroundColor: theme.vars.palette.action.disabledBackground,
      borderRadius: "8px"
    },
    ".namespace-list::-webkit-scrollbar-thumb:hover": {
      backgroundColor: theme.vars.palette.action.disabled
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
      borderTop: `1px dashed ${theme.vars.palette.divider}`,
      marginTop: "0.75em",
      paddingTop: "0.5em",
      ".namespace-item": {
        color: theme.vars.palette.text.disabled
      }
    },
    ".node-list": {
      height: "100%",
      maxHeight: "750px",
      width: "320px",
      flex: "0 1 auto",
      backgroundColor: "transparent",
      transition: "max-width 0.35s ease, width 0.35s ease",
      overflowX: "hidden",
      overflowY: "auto",
      padding: "0 0.5em"
    },
    ".node-list::-webkit-scrollbar": { width: "6px" },
    ".node-list::-webkit-scrollbar-track": { background: "transparent" },
    ".node-list::-webkit-scrollbar-thumb": {
      backgroundColor: theme.vars.palette.action.disabledBackground,
      borderRadius: "8px"
    },
    ".node-list::-webkit-scrollbar-thumb:hover": {
      backgroundColor: theme.vars.palette.action.disabled
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
      color: theme.vars.palette.text.primary,
      cursor: "default",
      display: "flex",
      alignItems: "center",
      gap: "0.25em",
      fontSize: theme.fontSizeNormal,
      padding: "0.25em .75em .2em .75em",
      borderRadius: "6px",
      backgroundColor: theme.vars.palette.action.hover,
      margin: "1em .5em 0 0",
      border: `1px solid ${theme.vars.palette.divider}`
    },
    ".result-info span": {
      color: "var(--palette-primary-main)",
      fontWeight: "500"
    },
    ".result-label": {
      color: `${theme.vars.palette.text.secondary} !important`,
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
      backgroundColor: "transparent",
      padding: "0"
    },
    ".node": {
      display: "flex",
      alignItems: "center",
      margin: "8px 0",
      padding: "8px",
      borderRadius: "8px",
      cursor: "pointer",
      transition: "all 0.2s ease",
      border: "1px solid transparent",
      minHeight: "48px",
      ".node-button": {
        padding: "4px 8px",
        flexGrow: 1,
        borderRadius: "6px",
        "&:hover": {
          backgroundColor: "transparent"
        },
        "& .MuiTypography-root": {
          fontSize: "1rem",
          fontWeight: 500,
          color: theme.vars.palette.text.primary
        }
      },
      ".icon-bg": {
        backgroundColor: "transparent !important"
      },
      ".icon-bg svg": {
        color: theme.vars.palette.text.secondary
      }
    },
    ".node:hover": {
      backgroundColor: theme.vars.palette.action.hover,
      border: `1px solid ${theme.vars.palette.divider}`,
      transform: "translateX(2px)"
    },
    ".node.focused": {
      color: "var(--palette-primary-main)",
      backgroundColor: "rgba(var(--palette-primary-mainChannel) / 0.1)",
      borderRadius: "8px",
      border: "1px solid rgba(var(--palette-primary-mainChannel) / 0.2)",
      boxShadow: "0 2px 8px rgba(0,0,0,0.2)"
    },
    ".namespace-text": {
      color: theme.vars.palette.text.secondary,
      fontWeight: 600,
      fontSize: "0.85rem",
      padding: ".8em 0 .4em 0",
      margin: "1.5em 0 .8em 0",
      letterSpacing: "0.8px",
      wordBreak: "break-word",
      userSelect: "none",
      pointerEvents: "none",
      textTransform: "uppercase"
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
      color: theme.vars.palette.text.primary,
      textTransform: "capitalize",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      userSelect: "none"
    },
    ".disabled .namespace-item": {
      color: theme.vars.palette.text.disabled
    },
    ".namespaces .list-item": {
      cursor: "pointer",
      padding: ".75em 1em",
      backgroundColor: "transparent",
      fontFamily: theme.fontFamily1,
      fontSize: "0.9rem",
      fontWeight: 400,
      transition: "all 0.2s ease",
      overflow: "hidden",
      margin: "2px",
      borderRadius: "8px",
      borderLeft: "3px solid transparent"
    },
    ".namespaces .list-item.disabled": {
      backgroundColor: "transparent",
      border: "none !important",
      color: theme.vars.palette.grey[200],
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    ".list-item.firstDisabled": {
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      marginTop: "0.5em"
    },
    ".namespaces .list-item:hover": {
      backgroundColor: theme.vars.palette.action.hover,
      paddingLeft: "1.1em",
      transform: "translateX(2px)"
    },
    ".namespaces .list-item.expanded": {
      opacity: 1
    },
    ".namespaces .list-item.collapsed": {
      maxHeight: "0",
      opacity: 0,
      padding: "0",
      width: "0",
      margin: "0", // Ensure no margin when collapsed
      overflow: "hidden"
    },
    ".namespaces .list-item.selected": {
      backgroundColor: "rgba(var(--palette-primary-mainChannel) / 0.15)",
      borderLeft: "3px solid var(--palette-primary-main)",
      fontWeight: 600,
      color: "var(--palette-primary-main)",
      boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
    },
    ".namespaces .list-item.selected .namespace-item": {
      color: "var(--palette-primary-main)"
    },
    ".namespaces .list-item.disabled.selected": {
      backgroundColor: theme.vars.palette.action.selected,
      border: "none"
    },
    ".namespaces .list-item.highlighted": {
      borderLeft: `3px solid ${"var(--palette-primary-main)"}`
    },
    ".namespaces .list-item.highlighted.selected .namespace-item": {
      color: "var(--palette-primary-main)"
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
        color: theme.vars.palette.text.disabled
      },
    "&.has-search-results .no-highlight": {
      pointerEvents: "none"
    },
    ".namespace-panel-container": {
      position: "relative",
      transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
      width: "270px",
      marginRight: "0.5em",
      marginLeft: "0.75em",
      "&.collapsed": {
        width: 0,
        opacity: 0,
        visibility: "hidden",
        marginRight: "1em"
      }
    },
    ".node-info-container": {
      width: "300px",
      backgroundColor: "transparent",
      borderLeft: `1px solid ${theme.vars.palette.divider}`,
      paddingLeft: "0.5em"
    },
    ".toggle-panel-button": {
      position: "absolute",
      left: 0,
      top: 0,
      height: "100%",
      width: "28px",
      zIndex: 1,
      backgroundColor: "transparent",
      border: "none",
      borderRadius: "0 6px 6px 0",
      cursor: "pointer",
      color: theme.vars.palette.grey[0],
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "background-color 0.18s ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      },
      "&:focus-visible": {
        outline: `2px solid ${theme.vars.palette.primary.main}`,
        outlineOffset: -2
      },
      "& svg": {
        color: theme.vars.palette.text.secondary,
        transition: "transform 0.25s ease-in-out"
      },
      "&.collapsed svg": {
        transform: "rotate(180deg)"
      }
    },
    ".node-packs-info .MuiButton-root": {
      textTransform: "none",
      borderRadius: "8px",
      padding: "6px 10px",
      borderColor: theme.vars.palette.divider,
      color: theme.vars.palette.text.secondary,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        borderColor: theme.vars.palette.text.secondary
      }
    },
    ".quick-action-tiles-container": {
      flex: "1 1 auto",
      minWidth: "300px",
      backgroundColor: "transparent",
      borderLeft: `1px solid ${theme.vars.palette.divider}`,
      marginLeft: "0.5em",
      overflowY: "auto"
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
  const openPacksPanel = useCallback(() => {
    window.api.showPackageManager();
  }, []);

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
      ) : null}
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
          <div style={{ color: "var(--palette-text-primary)", fontSize: "1.25em" }}>
            {selectedPathString && (
              <div>Current namespace: {searchResults?.length} nodes</div>
            )}
            {searchTerm.length > minSearchTermLength ? (
              <>
                <div>Total search matches: {allSearchMatches.length}</div>
                <div
                  style={{
                    fontSize: "0.8em",
                    color: "var(--palette-text-secondary)",
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
                    color: "var(--palette-text-secondary)",
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
  const theme = useTheme();
  const {
    searchTerm,
    selectedPath,
    searchResults,
    allSearchMatches,
    hoveredNode,
    selectedInputType,
    selectedOutputType,
    setSelectedPath
  } = useNodeMenuStore((state) => ({
    searchTerm: state.searchTerm,
    selectedPath: state.selectedPath,
    searchResults: state.searchResults,
    allSearchMatches: state.allSearchMatches,
    hoveredNode: state.hoveredNode,
    selectedInputType: state.selectedInputType,
    selectedOutputType: state.selectedOutputType,
    setSelectedPath: state.setSelectedPath
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

  const handleResetNamespacePath = useCallback(() => {
    setSelectedPath([]);
  }, [setSelectedPath]);

  return (
    <div
      css={namespaceStyles(theme)}
      className={
        (searchTerm.length > minSearchTermLength ||
          selectedInputType ||
          selectedOutputType) &&
        searchResults.length > 0
          ? "has-search-results"
          : "no-search-results"
      }
    >
      <Box className="list-box">
        <div className={`namespace-panel-container`} id="namespace-panel">
          <List className="namespace-list">
            <div className="namespaces">
              <div
                className={`list-item ${selectedPathString ? "" : "selected"}`}
                onClick={handleResetNamespacePath}
                role="button"
                tabIndex={0}
                title={
                  searchTerm.length > minSearchTermLength
                    ? "Show all results"
                    : "Home"
                }
              >
                <div className="namespace-item">
                  {searchTerm.length > minSearchTermLength
                    ? "All results"
                    : "Home"}
                </div>
              </div>
            </div>
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
          <>
            <NoSelectionContent
              searchTerm={searchTerm}
              selectedPathString={selectedPathString}
              minSearchTermLength={minSearchTermLength}
            />
            <div className="quick-action-tiles-container">
              <RecentNodesTiles />
              <QuickActionTiles />
            </div>
          </>
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
