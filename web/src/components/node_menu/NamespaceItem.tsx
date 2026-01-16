import React, { useCallback } from "react";
import { ListItem, SvgIcon } from "@mui/material";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import RenderNamespaces from "./RenderNamespaces";
import { NamespaceTree } from "../../hooks/useNamespaceTree";
import { getNamespaceIcon } from "../../utils/namespaceIcons";
import { useTheme } from "@mui/material/styles";

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
  const theme = useTheme();
  const { setSelectedPath } = useNodeMenuStore();

  const fullPath = path.join(".");
  const IconConfig = getNamespaceIcon(fullPath);
  const IconComponent = IconConfig.icon;

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

  const iconColor = isSelected
    ? "var(--palette-primary-main)"
    : isHighlighted
      ? "var(--palette-primary-main)"
      : theme.vars.palette.text.secondary;

  return (
    <>
      <ListItem
        className={`list-item ${isExpanded ? "expanded" : "collapsed"} ${
          isSelected ? "selected" : ""
        } ${isHighlighted ? "highlighted" : "no-highlight"}`}
        onClick={handleClick}
      >
        <SvgIcon
          component={IconComponent}
          sx={{
            mr: 1,
            fontSize: "1.1rem",
            color: iconColor
          }}
        />
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
