/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useCallback, useMemo } from "react";
import { Box, List, Typography, Button } from "@mui/material";
import { NodeMetadata } from "../../stores/ApiTypes";
import NamespacePanel from "./NamespacePanel";
import RenderNodes from "./RenderNodes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import NodeInfo from "./NodeInfo";
import QuickActionTiles from "./QuickActionTiles";
import RecentNodesTiles from "./RecentNodesTiles";
import FavoritesTiles from "./FavoritesTiles";
import isEqual from "lodash/isEqual";
import useMetadataStore from "../../stores/MetadataStore";
import { AddCircleOutline } from "@mui/icons-material";

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
      fontSize: theme.fontSizeSmall,
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
      overflow: "hidden"
    },
    ".node-list": {
      height: "100%",
      maxHeight: "750px",
      flex: "1 1 0",
      minWidth: "320px",
      backgroundColor: "transparent",
      transition: "max-width 0.35s ease, width 0.35s ease",
      overflowX: "hidden",
      overflowY: "auto",
      padding: "0 0.35em"
    },
    ".node-list.expanded": {
      width: "100%",
      maxWidth: "none"
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
    "&.home-layout .no-selection": {
      display: "none"
    },
    "&.home-layout .quick-action-tiles-container": {
      flex: "1 1 auto",
      minWidth: 0
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
      padding: "0.25em .75em .2em 0",
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
      borderLeft: `1px solid ${"var(--palette-primary-main)"}`
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
      margin: "2px 0",
      padding: "0",
      borderRadius: "8px",
      cursor: "pointer",
      transition: "all 0.2s ease",
      border: "1px solid transparent",
      ".node-button": {
        padding: "2px 4px",
        flexGrow: 1,
        borderRadius: "6px",
        minHeight: "24px",
        "&:hover": {
          backgroundColor: "transparent"
        },
        "& .MuiTypography-root": {
          fontSize: "0.9rem",
          fontWeight: 500,
          lineHeight: 1.2,
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
      border: `1px solid ${theme.vars.palette.divider}`
    },
    ".node.focused": {
      color: "var(--palette-primary-main)",
      backgroundColor: "rgba(var(--palette-primary-mainChannel) / 0.1)",
      borderRadius: "8px",
      border: "1px solid rgba(var(--palette-primary-mainChannel) / 0.2)",
      boxShadow: "0 2px 8px rgba(0,0,0,0.2)"
    },
    ".namespace-text": {
      color: "var(--palette-grey-500)",
      fontWeight: 300,
      fontSize: "0.8rem",
      lineHeight: 1.15,
      padding: "0.4em 0 0 0",
      margin: "0.5em 0 0 0",
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
    ".node-info-container": {
      flex: "0 0 36%",
      width: "36%",
      minWidth: "340px",
      maxWidth: "560px",
      backgroundColor: "transparent",
      borderLeft: `1px solid ${theme.vars.palette.divider}`,
      paddingLeft: "0.5em",
      overflow: "hidden"
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
  // Build contextual message
  const buildContextMessage = () => {
    if (searchTerm.length > minSearchTermLength) {
      const matchCount = searchResults.length;
      const totalMatches = allSearchMatches.length;
      if (selectedPathString) {
        return `${matchCount} results in ${selectedPathString} • ${totalMatches} total match '${searchTerm}'`;
      }
      return `${matchCount} results • Showing most relevant for '${searchTerm}'`;
    }
    if (selectedPathString) {
      return `${searchResults.length} nodes in ${selectedPathString}`;
    }
    return `${totalNodes} nodes available`;
  };

  return (
    <Box className="info-box">
      <Typography className="result-info" sx={{ fontSize: "0.8rem" }}>
        {buildContextMessage()}
      </Typography>
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

  const totalNodes = useMemo(() => {
    return Object.values(allMetadata).length;
  }, [allMetadata]);

  const isHomeLayout = !(
    selectedPathString ||
    searchTerm ||
    selectedInputType ||
    selectedOutputType
  );

  return (
    <div
      css={namespaceStyles(theme)}
      className={`${
        (searchTerm.length > minSearchTermLength ||
          selectedInputType ||
          selectedOutputType) &&
        searchResults.length > 0
          ? "has-search-results"
          : "no-search-results"
      } ${isHomeLayout ? "home-layout" : ""}`}
    >
      <Box className="list-box">
        <NamespacePanel namespaceTree={namespaceTree} />
        {selectedPathString ||
        searchTerm ||
        selectedInputType ||
        selectedOutputType ? (
          <>
            <List className={`node-list ${searchTerm ? "expanded" : ""}`}>
              <RenderNodes nodes={searchResults} />
            </List>
            {/* Only show NodeInfo when not searching */}
            {!searchTerm && (
              <div className="node-info-container">
                {hoveredNode && <NodeInfo nodeMetadata={hoveredNode} />}
              </div>
            )}
          </>
        ) : (
          <>
            <NoSelectionContent
              searchTerm={searchTerm}
              selectedPathString={selectedPathString}
              minSearchTermLength={minSearchTermLength}
            />
            <div className="quick-action-tiles-container">
              <FavoritesTiles />
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
