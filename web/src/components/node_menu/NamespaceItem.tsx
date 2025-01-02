import React, { memo, useCallback, useMemo } from "react";
import { Box } from "@mui/material";
import { NamespaceTree } from "../../hooks/useNamespaceTree";
import RenderNamespaces from "./RenderNamespaces";
import { isEqual } from "lodash";
import useNodeMenuStore from "../../stores/NodeMenuStore";

function toPascalCase(input: string): string {
  return input.split("_").reduce((result, word, index) => {
    const add = word.toLowerCase();
    return (
      result + (index === 0 ? "" : " ") + add[0].toUpperCase() + add.slice(1)
    );
  }, "");
}
interface NamespaceItemProps {
  namespace: string;
  path: string[];
  isExpanded: boolean;
  isSelected: boolean;
  isHighlighted: boolean;
  hasChildren: boolean;
  tree: NamespaceTree;
}

const NamespaceItem: React.FC<NamespaceItemProps> = ({
  namespace,
  path,
  isExpanded,
  hasChildren,
  tree,
  isSelected,
  isHighlighted
}) => {
  const { setHoveredNode, selectedPath, setSelectedPath } = useNodeMenuStore(
    (state) => ({
      setHoveredNode: state.setHoveredNode,
      selectedPath: state.selectedPath,
      setSelectedPath: state.setSelectedPath
    })
  );

  const handleNamespaceClick = useCallback(() => {
    setHoveredNode(null);
    if (isSelected) {
      setSelectedPath(path.slice(0, -1));
    } else {
      setSelectedPath(path);
    }
  }, [setHoveredNode, setSelectedPath, path, isSelected]);

  const isDisabled = tree[namespace]?.disabled;
  const isFirstDisabled = tree[namespace]?.firstDisabled;

  return (
    <div>
      <div
        className={`list-item ${isExpanded ? "expanded" : "collapsed"} ${
          isSelected ? "selected" : ""
        } ${isHighlighted ? "highlighted" : ""} ${
          isDisabled ? "disabled" : ""
        } ${isFirstDisabled ? "firstDisabled" : ""}`}
        onMouseDown={handleNamespaceClick}
      >
        <div className="namespace-item">{toPascalCase(namespace)}</div>
      </div>
      {hasChildren && isExpanded && (
        <div className="sublist">
          <RenderNamespaces
            tree={tree[namespace].children}
            currentPath={path}
          />
        </div>
      )}
    </div>
  );
};

export default memo(NamespaceItem, isEqual);
