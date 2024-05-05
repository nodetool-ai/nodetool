import React, { useCallback, useEffect } from "react";
import { useCreateNode } from "../../hooks/useCreateNode";
import useNodeMenuStore from "../../stores/NodeMenuStore";

interface KeyboardNavigationProps {
  activeNode: string | null;
  setActiveNode: (nodeType: string | null) => void;
}

const KeyboardNavigation: React.FC<KeyboardNavigationProps> = ({
  activeNode,
  setActiveNode
}) => {
  const handleCreateNode = useCreateNode();
  const { searchResults } = useNodeMenuStore();
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const index = activeNode
        ? searchResults.findIndex((node) => node.node_type === activeNode)
        : 0;
      if (e.key === "Enter" && activeNode) {
        const node = searchResults.find(
          (node) => node.node_type === activeNode
        );
        if (node) {
          handleCreateNode(node);
        }
      } else if (e.key === "ArrowDown" || e.key === "Tab") {
        e.preventDefault();
        setActiveNode(
          searchResults[(index + 1) % searchResults.length]?.node_type
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveNode(
          index <= 0
            ? searchResults[searchResults.length - 1]?.node_type
            : searchResults[index - 1]?.node_type
        );
      }
    },
    [activeNode, searchResults, handleCreateNode, setActiveNode]
  );

  useEffect(() => {
    const element = document.querySelector(".floating-node-menu");
    if (element) {
      element.addEventListener("keydown", handleKeyDown as any);
    }
    return () => {
      if (element) {
        element.removeEventListener("keydown", handleKeyDown as any);
      }
    };
  }, [handleKeyDown]);

  return null;
};

export default KeyboardNavigation;
