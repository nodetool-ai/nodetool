/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useCallback, useMemo } from "react";
import { List, Typography } from "@mui/material";
import RenderNamespaces from "./RenderNamespaces";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { NamespaceTree } from "../../hooks/useNamespaceTree";

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
      gap: 0,
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
    "& .namespace-section-title": {
      fontSize: theme.fontSizeSmaller,
      textTransform: "uppercase",
      color: theme.vars.palette.text.secondary,
      padding: "1em 0 .25em .75em",
      margin: 0,
      userSelect: "none"
    },
    "& .namespace-section-title.providers": {
      marginTop: ".5em"
    },
    "& .namespace-list-local": {
      flex: "0 0 auto",
      height: "fit-content",
      overflowY: "visible",
      marginBottom: 0,
      paddingBottom: 0
    },
    "& .namespace-list-providers": {
      flex: "0 0 auto",
      height: "fit-content",
      overflowY: "visible",
      borderTop: "none",
      marginTop: 0,
      paddingTop: 0
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
      padding: "0.4em 0.5em",
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
  const selectedProviderType = useNodeMenuStore(
    (state) => state.selectedProviderType
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

  const filteredTree = useMemo(() => {
    if (selectedProviderType === "all") {
      return namespaceTree;
    }

    const filterByProvider = (tree: NamespaceTree): NamespaceTree => {
      return Object.entries(tree).reduce<NamespaceTree>((acc, [key, node]) => {
        const children = filterByProvider(node.children);
        if (node.providerKind === selectedProviderType) {
          acc[key] = {
            ...node,
            children
          };
        }
        return acc;
      }, {});
    };

    return filterByProvider(namespaceTree);
  }, [namespaceTree, selectedProviderType]);

  const { localTree, providerTree } = useMemo(() => {
    const local: NamespaceTree = {};
    const providers: NamespaceTree = {};
    Object.entries(filteredTree).forEach(([key, value]) => {
      if (value.providerKind === "local") {
        local[key] = value;
      } else {
        providers[key] = value;
      }
    });

    return { localTree: local, providerTree: providers };
  }, [filteredTree]);

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
        {Object.keys(localTree).length > 0 && (
          <>
            <Typography className="namespace-section-title">Local</Typography>
            <div className="namespace-list-local">
              <RenderNamespaces tree={localTree} />
            </div>
          </>
        )}
        {Object.keys(providerTree).length > 0 && (
          <>
            <Typography className="namespace-section-title providers">
              Providers
            </Typography>
            <div className="namespace-list-providers">
              <RenderNamespaces tree={providerTree} />
            </div>
          </>
        )}
      </List>
    </div>
  );
};

export default memo(NamespacePanel);
