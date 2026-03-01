import React, { useCallback } from "react";
import { ListItem } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import RenderNamespaces from "./RenderNamespaces";
import { NamespaceTree } from "../../hooks/useNamespaceTree";

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
  const setSelectedPath = useNodeMenuStore((state) => state.setSelectedPath);
  const providerKind = tree[namespace].providerKind;

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
        <div
          className="namespace-item"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            width: "100%"
          }}
        >
          <span>{namespace.replaceAll("_", " ")}</span>
          <span
            style={{
              fontSize: "0.62rem",
              lineHeight: 1.1,
              padding: "1px 5px",
              borderRadius: "8px",
              letterSpacing: "0.25px",
              border: "1px solid currentColor",
              color:
                providerKind === "api"
                  ? theme.vars.palette.c_provider_api
                  : theme.vars.palette.c_provider_local
            }}
          >
            {providerKind === "api" ? "API" : "Local"}
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
