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
  const {
    selectedPath,
    allSearchMatches,
    searchTerm,
    selectedInputType,
    selectedOutputType,
    selectedProviderType
  } = useNodeMenuStore((state) => ({
    highlightedNamespaces: state.highlightedNamespaces,
    selectedPath: state.selectedPath,
    allSearchMatches: state.allSearchMatches,
    searchTerm: state.searchTerm,
    selectedInputType: state.selectedInputType,
    selectedOutputType: state.selectedOutputType,
    selectedProviderType: state.selectedProviderType
  }));

  const minSearchTermLength = useMemo(() => {
    if (!searchTerm) {return 1;}
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

  const hasActiveTypeFilter = Boolean(
    selectedInputType || selectedOutputType || selectedProviderType !== "all"
  );

  const shouldHighlightByFilter = hasEffectiveSearchTerm || hasActiveTypeFilter;

  const matchingNamespaces = useMemo(() => {
    const matching = new Set<string>();
    allSearchMatches.forEach((result) => {
      const resultPath = result.namespace.split(".");
      const namespaceAtCurrentDepth = resultPath[currentPath.length];
      if (namespaceAtCurrentDepth) {
        matching.add(namespaceAtCurrentDepth);
      }
    });
    return matching;
  }, [allSearchMatches, currentPath.length]);

  const memoizedTree = useMemo(
    () =>
      Object.keys(tree)
        .sort((a, b) => {
          const aKind = tree[a].providerKind;
          const bKind = tree[b].providerKind;
          if (aKind !== bKind) {
            // Local namespaces first, API namespaces after
            return aKind === "local" ? -1 : 1;
          }
          return a.localeCompare(b);
        })
        .map((namespace) => {
        const currentFullPath = [...currentPath, namespace].join(".");
        const isExpanded =
          currentPath.length > 0
            ? selectedPath.includes(currentPath[currentPath.length - 1])
            : true;
        const isSelected = selectedPath.join(".") === currentFullPath;
        const path = [...currentPath, namespace];
        const hasChildren = Object.keys(tree[namespace].children).length > 0;

        const isHighlighted =
          shouldHighlightByFilter && matchingNamespaces.has(namespace);

        return {
          path,
          namespace,
          currentFullPath,
          isHighlighted,
          isExpanded,
          isSelected,
          hasChildren
        };
      }),
    [
      tree,
      currentPath,
      selectedPath,
      matchingNamespaces,
      shouldHighlightByFilter
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
