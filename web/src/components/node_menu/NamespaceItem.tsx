import React, { useCallback } from "react";
import { ListItem } from "@mui/material";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import RenderNamespaces from "./RenderNamespaces";
import { NamespaceTree } from "../../hooks/useNamespaceTree";
import NamespaceIcon from "./NamespaceIcon";

interface NamespaceItemProps {
  namespace: string;
  path: string[];
  isExpanded: boolean;
  isSelected: boolean;
  isHighlighted: boolean;
  hasChildren: boolean;
  tree: NamespaceTree;
}

const formatNamespaceLabel = (value: string): string => {
  const normalized = value.replaceAll("_", " ");
  if (normalized.toLowerCase() === "openai") {
    return "OpenAI";
  }
  return normalized;
};

const NamespaceItem: React.FC<NamespaceItemProps> = ({
  namespace,
  path,
  isExpanded,
  isSelected,
  isHighlighted,
  hasChildren,
  tree
}) => {
  const setSelectedPath = useNodeMenuStore((state) => state.setSelectedPath);

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

  const isTopLevel = path.length === 1;

  return (
    <>
      <ListItem
        className={`list-item ${isExpanded ? "expanded" : "collapsed"} ${
          isSelected ? "selected" : ""
        } ${isHighlighted ? "highlighted" : "no-highlight"}`}
        onClick={handleClick}
      >
        <div className="namespace-item">
          {isTopLevel && <NamespaceIcon namespace={namespace} />}
          <span className="namespace-label">
            {formatNamespaceLabel(namespace)}
          </span>
        </div>
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
