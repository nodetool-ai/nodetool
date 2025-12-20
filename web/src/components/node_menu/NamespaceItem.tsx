import React, { useCallback } from "react";
import { ListItem } from "@mui/material";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import RenderNamespaces from "./RenderNamespaces";
import { NamespaceTree } from "../../hooks/useNamespaceTree";
import isEqual from "lodash/isEqual";

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
  isSelected,
  isHighlighted,
  hasChildren,
  tree
}) => {
  const { setSelectedPath } = useNodeMenuStore();

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLLIElement>) => {
      e.stopPropagation();
      if (isSelected) {
        return;
      }
      setSelectedPath(path);
    },
    [isSelected, path, setSelectedPath]
  );

  return (
    <>
      <ListItem
        className={`list-item ${isExpanded ? "expanded" : "collapsed"} ${
          isSelected ? "selected" : ""
        } ${isHighlighted ? "highlighted" : "no-highlight"}`}
        onClick={handleClick}
      >
        <div className="namespace-item">{namespace.replaceAll("_", " ")}</div>
      </ListItem>
      {hasChildren && isExpanded && (
        <div className="sublist">
          <RenderNamespaces
            tree={tree[namespace].children}
            currentPath={path}
          />
        </div>
      )}
    </>
  );
};

export default React.memo(NamespaceItem);
