/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useCallback, useMemo } from "react";
import { List } from "@mui/material";
import RenderNamespaces from "./RenderNamespaces";
import useNodeMenuStore from "../../stores/NodeMenuStore";

type NamespaceTree = {
  [key: string]: {
    children: NamespaceTree;
    disabled: boolean;
    requiredKey?: string;
  };
};

interface NamespacePanelProps {
  namespaceTree: NamespaceTree;
}

const namespacePanelStyles = (theme: Theme) =>
  css({
    "&": {
      width: "200px",
      marginRight: "0.5em",
      marginLeft: "0.5em",
      position: "relative",
      transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)"
    },
    "&.collapsed": {
      width: 0,
      opacity: 0,
      visibility: "hidden",
      marginRight: "1em"
    },
    "& .namespace-list": {
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
      paddingLeft: "0.65em",
      borderRadius: "12px",
      border: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.action.hover,
      boxShadow: "inset 0 2px 4px rgba(0,0,0,0.1)"
    },
    "& .namespace-list::-webkit-scrollbar": { width: "6px" },
    "& .namespace-list::-webkit-scrollbar-track": { background: "transparent" },
    "& .namespace-list::-webkit-scrollbar-thumb": {
      backgroundColor: theme.vars.palette.action.disabledBackground,
      borderRadius: "8px"
    },
    "& .namespace-list::-webkit-scrollbar-thumb:hover": {
      backgroundColor: theme.vars.palette.action.disabled
    },
    "& .namespace-list-enabled": {
      flex: "1 1 auto",
      height: "fit-content",
      overflowY: "visible"
    },
    "& .namespace-list-disabled": {
      flex: "0 0 auto",
      height: "fit-content",
      overflowY: "visible",
      borderTop: `1px dashed ${theme.vars.palette.divider}`,
      marginTop: "0.75em",
      paddingTop: "0.5em",
      "& .namespace-item": {
        color: theme.vars.palette.text.disabled
      }
    },
    "& .namespaces": {
      display: "flex",
      flexDirection: "column",
      gap: "0"
    },
    "& .namespace-item": {
      color: theme.vars.palette.text.primary,
      textTransform: "capitalize",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      userSelect: "none"
    },
    "& .disabled .namespace-item": {
      color: theme.vars.palette.text.disabled
    },
    "& .namespaces .list-item": {
      cursor: "pointer",
      padding: "0.42em 0.95em",
      backgroundColor: "transparent",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmall,
      fontWeight: 400,
      lineHeight: 1.2,
      transition: "all 0.2s ease",
      overflow: "hidden",
      margin: "1px 2px",
      borderRadius: "0",
      borderLeft: "1px solid transparent"
    },
    "& .namespaces .list-item.disabled": {
      backgroundColor: "transparent",
      border: "none !important",
      color: theme.vars.palette.grey[200],
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    "& .list-item.firstDisabled": {
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      marginTop: "0.5em"
    },
    "& .namespaces .list-item:hover": {
      backgroundColor: theme.vars.palette.action.hover
    },
    "& .namespaces .list-item.expanded": {
      opacity: 1
    },
    "& .namespaces .list-item.collapsed": {
      maxHeight: "0",
      opacity: 0,
      padding: "0",
      width: "0",
      margin: "0",
      overflow: "hidden"
    },
    "& .namespaces .list-item.selected": {
      backgroundColor: "rgba(var(--palette-primary-mainChannel) / 0.15)",
      borderLeft: "1px solid var(--palette-primary-main)",
      fontWeight: 600,
      color: "var(--palette-primary-main)",
      boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
    },
    "& .namespaces .list-item.selected .namespace-item": {
      color: "var(--palette-primary-main)"
    },
    "& .namespaces .list-item.disabled.selected": {
      backgroundColor: theme.vars.palette.action.selected,
      border: "none"
    },
    "& .namespaces .list-item.highlighted": {
      borderLeft: `1px solid ${"var(--palette-primary-main)"}`
    },
    "& .namespaces .list-item.highlighted.selected .namespace-item": {
      color: "var(--palette-primary-main)"
    },
    "& .namespaces .sublist": {
      paddingLeft: "1em"
    }
  });

const NamespacePanel: React.FC<NamespacePanelProps> = ({ namespaceTree }) => {
  const theme = useTheme();
  const { searchTerm, selectedPath, setSelectedPath } = useNodeMenuStore(
    (state) => ({
      searchTerm: state.searchTerm,
      selectedPath: state.selectedPath,
      setSelectedPath: state.setSelectedPath
    })
  );

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

  const handleResetNamespacePath = useCallback(() => {
    setSelectedPath([]);
  }, [setSelectedPath]);

  return (
    <div
      css={namespacePanelStyles(theme)}
      className="namespace-panel-container"
    >
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
              {searchTerm.length > minSearchTermLength ? "All results" : "Home"}
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
  );
};

export default memo(NamespacePanel);
