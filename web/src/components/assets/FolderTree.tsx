/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useEffect, useState } from "react";
import { Box, Button } from "@mui/material";
import { SimpleTreeView } from "@mui/x-tree-view/SimpleTreeView";
import { TreeItem } from "@mui/x-tree-view/TreeItem";
import { useAssetStore, type AssetTreeNode } from "../../stores/AssetStore";
import log from "loglevel";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

interface FolderTreeProps {
  folder?: AssetTreeNode;
  onSelect: (id: string) => void;
  sortBy?: "name" | "updated_at";
}

const styles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-start",
      height: "100%",
      padding: ".5em 0 0",
      backgroundColor: theme.vars.palette.grey[600],
      fontFamily: theme.fontFamily1
    },
    ".tree-view": {
      height: "100%",
      overflowY: "auto"
    },
    ".tree-item": {
      "& .MuiTreeItem-content": {
        display: "flex",
        alignItems: "flex-start",
        padding: ".25em",
        "&:hover": {
          backgroundColor: theme.vars.palette.grey[500]
        }
      },
      "& svg": {
        color: "var(--palette-primary-main)",
        marginTop: ".25em"
      },
      "& .MuiTreeItem-label": {
        fontFamily: theme.fontFamily1
      }
    },
    button: {
      position: "absolute",
      right: 0,
      color: "var(--palette-primary-main)",
      backgroundColor: theme.vars.palette.grey[600],
      padding: ".25em",
      height: "1.5em"
    }
  });

const FolderTree: React.FC<FolderTreeProps> = ({
  onSelect,
  sortBy = "name"
}) => {
  const theme = useTheme();
  const loadFolderTree = useAssetStore((state) => state.loadFolderTree);
  const [folderTree, setFolderTree] = useState<Record<string, AssetTreeNode>>(
    {}
  );
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  useEffect(() => {
    const fetchFolderTree = async () => {
      const tree = await loadFolderTree(sortBy);
      setFolderTree(tree);
      setExpandedItems(Object.keys(tree));
    };
    fetchFolderTree();
  }, [loadFolderTree, sortBy]);

  const renderTree = (node: AssetTreeNode): React.ReactNode => {
    const handleOnSelect = (
      event: React.MouseEvent,
      node: AssetTreeNode
    ) => {
      event.stopPropagation();
      onSelect(node.id);
    };

    if (!node.id) {
      log.error("Node with undefined id found:", node);
      return null;
    }

    return (
      <TreeItem
        className="tree-item"
        key={node.id}
        itemId={node.id}
        label={
          <div>
            {node.name}
            <Button onClick={(e) => handleOnSelect(e, node)}>&gt;</Button>
          </div>
        }
      >
        {Array.isArray(node.children)
          ? node.children.map((childNode) => renderTree(childNode))
          : null}
      </TreeItem>
    );
  };

  return (
    <Box className="folder-tree" css={styles(theme)}>
      <SimpleTreeView
        className="tree-view"
        expandedItems={expandedItems}
        onExpandedItemsChange={(event, nodeIds) => setExpandedItems(nodeIds)}
      >
        {Object.values(folderTree).map((rootFolder) =>
          rootFolder.id ? renderTree(rootFolder) : null
        )}
      </SimpleTreeView>
    </Box>
  );
};

export default FolderTree;
