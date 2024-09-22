import React from "react";
import { motion } from "framer-motion";
import { ListItemButton, ListItemText, Typography, Box } from "@mui/material";
import { NamespaceTree } from "../../hooks/useNamespaceTree";
import RenderNamespaces from "./RenderNamespaces";
import ThemeNodes from "../themes/ThemeNodes";

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
  newPath: string[];
  state: string;
  namespaceStyle: React.CSSProperties;
  hasChildren: boolean;
  tree: NamespaceTree;
  selectedPath: string[];
  handleNamespaceClick: (newPath: string[]) => void;
  searchResultCount: number;
  searchTerm: string;
}

const listVariants = {
  expanded: {
    p: {
      fontFamily: "Inter"
    },
    maxHeight: "200vh",
    opacity: 1,
    transition: {
      when: "beforeChildren",
      staggerChildren: 0.1,
      ease: "easeIn",
      duration: 0
    }
  },
  collapsed: {
    p: {
      fontFamily: "Inter"
    },
    maxHeight: 0,
    opacity: 0,
    transition: {
      when: "afterChildren",
      ease: "easeOut",
      duration: 0
    }
  }
};

const NamespaceItem: React.FC<NamespaceItemProps> = ({
  namespace,
  newPath,
  state,
  namespaceStyle,
  hasChildren,
  tree,
  selectedPath,
  handleNamespaceClick,
  searchResultCount,
  searchTerm
}) => {
  return (
    <motion.div initial="collapsed" animate={state} variants={listVariants}>
      <ListItemButton
        style={namespaceStyle}
        className={`list-item ${state}`}
        selected={selectedPath.join(".") === newPath.join(".")}
        onClick={() => handleNamespaceClick(newPath)}
      >
        <ListItemText
          primary={
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems="center"
            >
              <Typography fontSize="small">
                {toPascalCase(namespace)}
              </Typography>
              {searchTerm && searchResultCount > 0 && (
                <Typography fontSize="small" color={ThemeNodes.palette.c_gray3}>
                  {searchResultCount}
                </Typography>
              )}
            </Box>
          }
        />
      </ListItemButton>
      {hasChildren && (
        <Box className="sublist">
          <RenderNamespaces
            tree={tree[namespace].children}
            currentPath={newPath}
            handleNamespaceClick={handleNamespaceClick}
          />
        </Box>
      )}
    </motion.div>
  );
};

export default React.memo(NamespaceItem);
