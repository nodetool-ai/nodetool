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

const RenderNamespaces: React.FC<RenderNamespacesProps> = ({
  tree,
  currentPath = [],
  handleNamespaceClick
}) => {
  const { highlightedNamespaces, selectedPath, searchResults } =
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
        const expandedState = isExpanded ? "expanded" : "collapsed";

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
          expandedState,
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
    <div className="namespaces">
      {memoizedTree.map(
        ({
          namespace,
          newPath,
          expandedState,
          namespaceStyle,
          hasChildren
        }) => (
          <NamespaceItem
            key={newPath.join(".")}
            namespace={namespace}
            newPath={newPath}
            expandedState={expandedState}
            namespaceStyle={namespaceStyle}
            hasChildren={hasChildren}
            tree={tree}
            selectedPath={selectedPath}
            handleNamespaceClick={memoizedHandleClick}
          />
        )
      )}
    </div>
  );
};

export default React.memo(RenderNamespaces);
