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
  const { highlightedNamespaces, selectedPath, allSearchMatches, searchTerm } =
    useNodeMenuStore((state) => ({
      highlightedNamespaces: state.highlightedNamespaces,
      selectedPath: state.selectedPath,
      allSearchMatches: state.allSearchMatches,
      searchTerm: state.searchTerm
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

  const isSearchTermPresentAndEffective = Boolean(
    searchTerm && searchTerm.length >= minSearchTermLength
  );

  const memoizedTree = useMemo(
    () =>
      Object.keys(tree).map((namespace) => {
        const currentFullPath = [...currentPath, namespace].join(".");
        const initialIsHighlightedBasedOnStore =
          highlightedNamespaces.includes(currentFullPath);
        const isExpanded =
          currentPath.length > 0
            ? selectedPath.includes(currentPath[currentPath.length - 1])
            : true;
        const isSelectedForNamespaceItem =
          selectedPath.join(".") === currentFullPath;
        const path = [...currentPath, namespace];
        const hasChildren = Object.keys(tree[namespace].children).length > 0;

        const searchResultCount = allSearchMatches.filter((result) =>
          result.namespace.startsWith(currentFullPath)
        ).length;

        const itemMatchesSearchHighlightCriteria =
          initialIsHighlightedBasedOnStore && searchResultCount > 0;

        const highlightDueToActiveSearch =
          isSearchTermPresentAndEffective && itemMatchesSearchHighlightCriteria;

        // Condition for an item being related to the selected path (ancestor, self, or descendant)
        // This applies when NO search term is active.
        const selectedPathString = selectedPath.join(".");
        const isRelatedToSelectedPath =
          selectedPath.length > 0 &&
          (selectedPathString.startsWith(currentFullPath) || // current is ancestor or self
            currentFullPath.startsWith(selectedPathString)); // current is descendant or self

        const highlightDueToSelectionHierarchy =
          !isSearchTermPresentAndEffective && isRelatedToSelectedPath;

        const finalIsHighlightedPropForChild =
          highlightDueToActiveSearch || highlightDueToSelectionHierarchy;

        if (process.env.NODE_ENV === "development") {
          console.log(
            `RenderNamespaces: path='${currentFullPath}', isSearchActive=${isSearchTermPresentAndEffective}, initialStoreHighlight=${initialIsHighlightedBasedOnStore}, searchCount=${searchResultCount}, itemMatchesSearchCriteria=${itemMatchesSearchHighlightCriteria}, highlightDueToSearch=${highlightDueToActiveSearch}, isPartOfSelectedHierarchy=${isRelatedToSelectedPath}, highlightDueToSelection=${highlightDueToSelectionHierarchy}, finalPropValue=${finalIsHighlightedPropForChild}`
          );
          if (
            currentPath.length === 0 &&
            Object.keys(tree).indexOf(namespace) === 0
          ) {
            console.log("RenderNamespaces: searchTerm from store:", searchTerm);
            console.log(
              "RenderNamespaces: calculated minSearchTermLength:",
              minSearchTermLength
            );
            console.log(
              "RenderNamespaces: selectedPath from store:",
              JSON.stringify(selectedPath)
            );
            console.log(
              "RenderNamespaces: highlightedNamespaces from store:",
              JSON.stringify(highlightedNamespaces)
            );
            console.log(
              "RenderNamespaces: allSearchMatches (first 3):",
              allSearchMatches.slice(0, 3).map((m) => ({ ns: m.namespace }))
            );
          }
        }

        return {
          path,
          namespace,
          currentFullPath,
          isHighlighted: finalIsHighlightedPropForChild,
          isExpanded,
          isSelected: isSelectedForNamespaceItem,
          hasChildren
        };
      }),
    [
      tree,
      currentPath,
      highlightedNamespaces,
      selectedPath,
      allSearchMatches,
      searchTerm,
      isSearchTermPresentAndEffective,
      minSearchTermLength
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
