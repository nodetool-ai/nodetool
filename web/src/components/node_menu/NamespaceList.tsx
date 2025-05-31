/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

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
import { KeyboardArrowLeft } from "@mui/icons-material";

import NoSelectionContent from "./subcomponents/NoSelectionContent";
import InfoBox from "./subcomponents/InfoBox";

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
      marginTop: "20px",
      overflow: "auto"
    },
    "& h4": {
      fontSize: "1em",
      color: theme.palette.c_hl1
    },
    ".info-box": {
      position: "absolute",
      right: "0",
      bottom: "0",
      minHeight: "30px",
      alignItems: "center",
      flexDirection: "column",
      margin: "0 1em .5em ",
      justifyContent: "flex-end"
    },
    ".node-packs-info": {
      textAlign: "right",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
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
      borderTop: `1px solid ${theme.palette.c_gray0}`,
      marginTop: "0.5em",
      paddingTop: "0.5em",
      ".namespace-item": {
        color: theme.palette.c_gray5
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
      color: theme.palette.c_gray5,
      fontWeight: "300",
      margin: "0",
      padding: "0 2em 2em 0"
    },
    ".explanation h5": {
      color: theme.palette.c_hl1,
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
      padding: "0 0 0 2em",
      margin: "0",
      fontSize: "0.8em",
      color: theme.palette.c_gray5
    },
    h6: {
      color: theme.palette.c_gray4
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
        color: theme.palette.c_gray4
      }
    },
    ".node:hover": {
      backgroundColor: theme.palette.c_gray1
    },
    ".node.focused": {
      color: theme.palette.c_hl1,
      backgroundColor: theme.palette.c_gray1,
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
      color: theme.palette.c_gray5,
      "&:hover": {
        backgroundColor: theme.palette.c_gray2
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


const NamespaceList: React.FC<NamespaceListProps> = ({
  namespaceTree,
  metadata
}) => {
  const {
    searchTerm,
    selectedPath,
    searchResults,
    allSearchMatches,
    hoveredNode
  } = useNodeMenuStore((state) => ({
    searchTerm: state.searchTerm,
    selectedPath: state.selectedPath,
    searchResults: state.searchResults,
    allSearchMatches: state.allSearchMatches,
    hoveredNode: state.hoveredNode
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
        {selectedPathString || searchTerm ? (
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
