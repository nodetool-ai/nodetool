/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React from "react";
import { motion } from "framer-motion";
import { Box, ListItemButton, ListItemText, Typography } from "@mui/material";
import ThemeNodes from "../themes/ThemeNodes";
import useNodeMenuStore from "../../stores/NodeMenuStore";

interface NamespaceTree {
  [key: string]: {
    children: NamespaceTree;
  };
}

interface RenderNamespacesProps {
  tree: NamespaceTree;
  currentPath?: string[];
  handleNamespaceClick: (newPath: string[]) => void;
}

const namespaceStyles = (theme: any) =>
  css({
    ".list-item": {
      padding: "0.2em 0.8em",
      borderLeft: "1px solid #444",
      transition: "all 0.25s",

      p: {
        fontSize: "1em",
        fontFamily: "Inter"
      }
    },
    ".list-item.Mui-selected": {
      backgroundColor: theme.palette.c_hl1,
      color: theme.palette.c_black
    },
    ".list-item.Mui-selected p": {
      fontWeight: 600
    },
    ".sublist": {
      paddingLeft: "1em"
    },
    p: {
      fontFamily: "Inter"
    }
  });

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

function toPascalCase(input: string): string {
  return input.split("_").reduce((result, word, index) => {
    const add = word.toLowerCase();
    return result + (add[0].toUpperCase() + add.slice(1));
  }, "");
}

const RenderNamespaces: React.FC<RenderNamespacesProps> = ({
  tree,
  currentPath = [],
  handleNamespaceClick
}) => {
  const { highlightedNamespaces, selectedPath, activeNode } =
    useNodeMenuStore();

  return (
    <div className="namespaces" css={namespaceStyles}>
      {Object.keys(tree).map((namespace) => {
        const currentFullPath = [...currentPath, namespace].join(".");
        const isHighlighted = highlightedNamespaces.includes(currentFullPath);
        const isExpanded =
          currentPath.length > 0
            ? selectedPath.includes(currentPath[currentPath.length - 1])
            : true;
        const newPath = [...currentPath, namespace];
        const hasChildren = Object.keys(tree[namespace].children).length > 0;
        const state = isExpanded ? "expanded" : "collapsed";
        const namespaceStyle = isHighlighted
          ? { borderLeft: `2px solid ${ThemeNodes.palette.c_hl1}` }
          : {};
        return (
          <motion.div
            key={newPath.join(".")}
            initial="collapsed"
            animate={state}
            variants={listVariants}
          >
            <ListItemButton
              style={namespaceStyle}
              className={`list-item ${state}`}
              selected={
                selectedPath.join(".") === newPath.join(".") ||
                newPath.join(".").includes(activeNode || "---")
              }
              onClick={() => handleNamespaceClick(newPath)}
            >
              <ListItemText
                primary={
                  <>
                    <Typography fontSize="small">
                      {toPascalCase(namespace)}
                    </Typography>
                  </>
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
      })}
    </div>
  );
};
export default RenderNamespaces;
