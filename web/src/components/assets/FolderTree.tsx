/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useEffect, useState } from "react";
import { Box, Button } from "@mui/material";
import { SimpleTreeView } from "@mui/x-tree-view/SimpleTreeView";
import { TreeItem } from "@mui/x-tree-view/TreeItem";
import { useAssetStore } from "../../stores/AssetStore";
import log from "loglevel";

interface FolderNode {
  id: string;
  name: string;
  parent_id: string | null;
  children: FolderNode[];
}

interface FolderTreeProps {
  folder?: FolderNode;
  onSelect: (id: string) => void;
  sortBy?: "name" | "updated_at";
}

const styles = (theme: any) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-start",
      height: "100%",
      padding: ".5em 0 0",
      backgroundColor: theme.palette.grey[600],
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
          backgroundColor: theme.palette.grey[500]
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
      backgroundColor: theme.palette.grey[600],
      padding: ".25em",
      height: "1.5em"
    }
  });

const FolderTree: React.FC<FolderTreeProps> = ({
  onSelect,
  sortBy = "name"
}) => {
  const loadFolderTree = useAssetStore((state) => state.loadFolderTree);
  const [folderTree, setFolderTree] = useState<Record<string, FolderNode>>({});
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  useEffect(() => {
    const fetchFolderTree = async () => {
      const tree = await loadFolderTree(sortBy);
      setFolderTree(tree);
      setExpandedItems(Object.keys(tree));
    };
    fetchFolderTree();
  }, [loadFolderTree, sortBy]);

  const renderTree = (node: FolderNode): React.ReactNode => {
    const handleOnSelect = (event: React.MouseEvent, node: FolderNode) => {
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
    <Box className="folder-tree" css={styles}>
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
