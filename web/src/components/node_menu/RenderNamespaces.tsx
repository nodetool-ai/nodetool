/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useMemo, useCallback } from "react";
import ThemeNodes from "../themes/ThemeNodes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import NamespaceItem from "./NamespaceItem";
import { NamespaceTree } from "../../hooks/useNamespaceTree";

interface RenderNamespacesProps {
  tree: NamespaceTree;
  currentPath?: string[];
  handleNamespaceClick: (newPath: string[]) => void;
}

const namespaceStyles = (theme: any) =>
  css({
    ".list-item": {
      padding: "0.2em 0.8em",
      borderLeft: "1px solid #444",
      transition: "all 0.25s",

      p: {
        fontSize: theme.fontSizeSmall,
        fontFamily: "Inter"
      }
    },
    ".list-item.Mui-selected": {
      backgroundColor: theme.palette.c_hl1,
      color: theme.palette.c_black
    },
    ".list-item.Mui-selected p": {
      fontWeight: 600
    },
    ".sublist": {
      paddingLeft: "1em"
    },
    p: {
      fontFamily: "Inter"
    }
  });

const RenderNamespaces: React.FC<RenderNamespacesProps> = ({
  tree,
  currentPath = [],
  handleNamespaceClick
}) => {
  const { highlightedNamespaces, selectedPath, searchResults, searchTerm } =
    useNodeMenuStore((state) => ({
      highlightedNamespaces: state.highlightedNamespaces,
      selectedPath: state.selectedPath,
      searchResults: state.searchResults,
      searchTerm: state.searchTerm
    }));

  const memoizedTree = useMemo(
    () =>
      Object.keys(tree).map((namespace) => {
        const currentFullPath = [...currentPath, namespace].join(".");
        const isHighlighted = highlightedNamespaces.includes(currentFullPath);
        const isExpanded =
          currentPath.length > 0
            ? selectedPath.includes(currentPath[currentPath.length - 1])
            : true;
        const newPath = [...currentPath, namespace];
        const hasChildren = Object.keys(tree[namespace].children).length > 0;
        const state = isExpanded ? "expanded" : "collapsed";

        // Count search results for this namespace and its children
        const searchResultCount = searchResults.filter((result) =>
          result.namespace.startsWith(currentFullPath)
        ).length;

        const namespaceStyle =
          isHighlighted && searchResultCount > 0
            ? { borderLeft: `2px solid ${ThemeNodes.palette.c_hl1}` }
            : {};

        return {
          namespace,
          currentFullPath,
          isHighlighted: isHighlighted && searchResultCount > 0,
          isExpanded,
          newPath,
          hasChildren,
          state,
          namespaceStyle,
          searchResultCount
        };
      }),
    [tree, currentPath, highlightedNamespaces, selectedPath, searchResults]
  );

  const memoizedHandleClick = useCallback(
    (newPath: string[]) => {
      handleNamespaceClick(newPath);
    },
    [handleNamespaceClick]
  );

  return (
    <div className="namespaces" css={namespaceStyles}>
      {memoizedTree.map(
        ({
          namespace,
          newPath,
          state,
          namespaceStyle,
          hasChildren,
          searchResultCount
        }) => (
          <NamespaceItem
            key={newPath.join(".")}
            namespace={namespace}
            newPath={newPath}
            state={state}
            namespaceStyle={namespaceStyle}
            hasChildren={hasChildren}
            tree={tree}
            selectedPath={selectedPath}
            handleNamespaceClick={memoizedHandleClick}
            searchResultCount={searchResultCount}
            searchTerm={searchTerm}
          />
        )
      )}
    </div>
  );
};

export default React.memo(RenderNamespaces);
