import React, { useMemo } from "react";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import NamespaceItem from "./NamespaceItem";
import { NamespaceTree } from "../../hooks/useNamespaceTree";

interface RenderNamespacesProps {
  tree: NamespaceTree;
  currentPath?: string[];
}

const RenderNamespaces: React.FC<RenderNamespacesProps> = ({
  tree,
  currentPath = []
}) => {
  const DEBUG_SEARCH = false;
  const {
    selectedPath,
    allSearchMatches,
    searchTerm,
    selectedInputType,
    selectedOutputType
  } = useNodeMenuStore((state) => ({
    highlightedNamespaces: state.highlightedNamespaces,
    selectedPath: state.selectedPath,
    allSearchMatches: state.allSearchMatches,
    searchTerm: state.searchTerm,
    selectedInputType: state.selectedInputType,
    selectedOutputType: state.selectedOutputType
  }));

  const minSearchTermLength = useMemo(() => {
    if (!searchTerm) return 1;
    return searchTerm.includes("+") ||
      searchTerm.includes("-") ||
      searchTerm.includes("*") ||
      searchTerm.includes("/")
      ? 0
      : 1;
  }, [searchTerm]);

  const hasEffectiveSearchTerm = Boolean(
    searchTerm && searchTerm.length >= minSearchTermLength
  );

  const hasActiveTypeFilter = Boolean(selectedInputType || selectedOutputType);

  const shouldHighlightByFilter = hasEffectiveSearchTerm || hasActiveTypeFilter;

  const memoizedTree = useMemo(
    () =>
      Object.keys(tree).map((namespace) => {
        const currentFullPath = [...currentPath, namespace].join(".");
        const isExpanded =
          currentPath.length > 0
            ? selectedPath.includes(currentPath[currentPath.length - 1])
            : true;
        const isSelected = selectedPath.join(".") === currentFullPath;
        const path = [...currentPath, namespace];
        const hasChildren = Object.keys(tree[namespace].children).length > 0;

        const searchResultCount = allSearchMatches.filter((result) => {
          const resultPath = result.namespace.split(".");
          return (
            resultPath.slice(0, currentPath.length + 1).join(".") ===
            currentFullPath
          );
        }).length;

        const highlightDueToActiveSearch =
          shouldHighlightByFilter && searchResultCount > 0;

        const finalIsHighlightedPropForChild = highlightDueToActiveSearch;

        if (
          (import.meta as any).env?.NODE_ENV === "development" &&
          DEBUG_SEARCH
        ) {
          console.log(
            `RenderNamespaces: path='${currentFullPath}', isSearchActive=${shouldHighlightByFilter}, searchCount=${searchResultCount}, highlightDueToSearch=${highlightDueToActiveSearch}, finalPropValue=${finalIsHighlightedPropForChild}`
          );
        }
        return {
          path,
          namespace,
          currentFullPath,
          isHighlighted: finalIsHighlightedPropForChild,
          isExpanded,
          isSelected,
          hasChildren
        };
      }),
    [
      tree,
      currentPath,
      selectedPath,
      allSearchMatches,
      shouldHighlightByFilter,
      DEBUG_SEARCH
    ]
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
