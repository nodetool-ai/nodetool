import React, { useMemo } from "react";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import NamespaceItem from "./NamespaceItem";
import { NamespaceTree } from "../../hooks/useNamespaceTree";
import { isEqual } from "lodash";

interface RenderNamespacesProps {
  tree: NamespaceTree;
  currentPath?: string[];
}

const RenderNamespaces: React.FC<RenderNamespacesProps> = ({
  tree,
  currentPath = []
}) => {
  const { highlightedNamespaces, selectedPath, allSearchMatches } =
    useNodeMenuStore((state) => ({
      highlightedNamespaces: state.highlightedNamespaces,
      selectedPath: state.selectedPath,
      allSearchMatches: state.allSearchMatches
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
        const isSelected = selectedPath.join(".") === currentFullPath;
        const path = [...currentPath, namespace];
        const hasChildren = Object.keys(tree[namespace].children).length > 0;

        // Count search results for this namespace and its children using allSearchMatches
        const searchResultCount = allSearchMatches.filter((result) =>
          result.namespace.startsWith(currentFullPath)
        ).length;

        return {
          path,
          namespace,
          currentFullPath,
          isHighlighted: isHighlighted && searchResultCount > 0,
          isExpanded,
          isSelected,
          hasChildren,
          searchResultCount
        };
      }),
    [tree, currentPath, highlightedNamespaces, selectedPath, allSearchMatches]
  );

  return (
    <div className="namespaces">
      {memoizedTree.map(
        ({
          namespace,
          path,
          isExpanded,
          isSelected,
          isHighlighted,
          hasChildren
        }) => (
          <NamespaceItem
            key={path.join(".")}
            path={path}
            namespace={namespace}
            isExpanded={isExpanded}
            isSelected={isSelected}
            isHighlighted={isHighlighted}
            hasChildren={hasChildren}
            tree={tree}
          />
        )
      )}
    </div>
  );
};

export default React.memo(RenderNamespaces);
