/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useEffect, useState, useCallback } from "react";
import {
  CircularProgress,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  Typography
} from "@mui/material";
import { ExpandLess, ExpandMore } from "@mui/icons-material";
import { useAssetStore } from "../../stores/AssetStore";
import { Asset } from "../../stores/ApiTypes";
import { devError } from "../../utils/DevLog";
import { IconForType } from "../../config/data_types";
import ThemeNodetool from "../themes/ThemeNodetool";

const styles = (theme: any) =>
  css({
    "&": { paddingBottom: "3em" }
  });

interface AssetTreeProps {
  folderId: string;
  onTotalAssetsCalculated: (total: number) => void;
  onLoading: (isLoading: boolean) => void;
}

interface AssetTreeNode extends Asset {
  children?: AssetTreeNode[];
  totalAssets: number;
}

const AssetTree: React.FC<AssetTreeProps> = ({
  folderId,
  onTotalAssetsCalculated,
  onLoading
}) => {
  const [assetTree, setAssetTree] = useState<AssetTreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [closedFolders, setClosedFolders] = useState<string[]>([]);
  const getAssetsRecursive = useAssetStore((state) => state.getAssetsRecursive);
  const folderIcon = <IconForType iconName="folder" />;
  const imageIcon = <IconForType iconName="image" />;
  const audioIcon = <IconForType iconName="audio" />;
  const videoIcon = <IconForType iconName="video" />;
  const textIcon = <IconForType iconName="text" />;
  const pdfIcon = <IconForType iconName="pdf" />;
  const wordIcon = <IconForType iconName="word" />;
  const excelIcon = <IconForType iconName="excel" />;
  const powerpointIcon = <IconForType iconName="powerpoint" />;
  const zipIcon = <IconForType iconName="zip" />;
  const unknownIcon = <IconForType iconName="unknown" />;

  const calculateTotalAssets = useCallback((node: Asset): number => {
    if (node.content_type === "folder" && (node as AssetTreeNode).children) {
      return (
        1 +
        (node as AssetTreeNode).children!.reduce(
          (sum, child) => sum + calculateTotalAssets(child),
          0
        )
      );
    }
    return 1;
  }, []);

  useEffect(() => {
    const fetchAssetTree = async () => {
      setIsLoading(true);
      onLoading(true);
      try {
        const result = await getAssetsRecursive(folderId);
        const treeWithTotals: AssetTreeNode[] = result.map((node) => ({
          ...node,
          totalAssets: calculateTotalAssets(node),
          children: (node as AssetTreeNode).children?.map((child) => ({
            ...child,
            totalAssets: calculateTotalAssets(child)
          }))
        }));
        setAssetTree(treeWithTotals);
        const total = treeWithTotals.reduce(
          (sum, node) => sum + node.totalAssets,
          0
        );
        onTotalAssetsCalculated(total);
      } catch (error) {
        devError("Error fetching asset tree:", error);
        setAssetTree([]);
        onTotalAssetsCalculated(0);
      } finally {
        setIsLoading(false);
        onLoading(false);
      }
    };

    fetchAssetTree();
  }, [
    folderId,
    getAssetsRecursive,
    calculateTotalAssets,
    onTotalAssetsCalculated,
    onLoading
  ]);

  const toggleFolder = (assetId: string) => {
    setClosedFolders((prev) => {
      if (prev.includes(assetId)) {
        return prev.filter((id) => id !== assetId);
      } else {
        return [...prev, assetId];
      }
    });
  };

  const getFileIcon = (contentType: string) => {
    switch (contentType) {
      case "folder":
        return folderIcon;
      default:
        if (contentType.includes("image")) {
          return imageIcon;
        } else if (contentType.includes("audio")) {
          return audioIcon;
        } else if (contentType.includes("video")) {
          return videoIcon;
        } else if (contentType.includes("text")) {
          return textIcon;
        } else if (contentType.includes("pdf")) {
          return pdfIcon;
        } else if (
          contentType.includes("word") ||
          contentType.includes("document")
        ) {
          return wordIcon;
        } else if (
          contentType.includes("sheet") ||
          contentType.includes("excel")
        ) {
          return excelIcon;
        } else if (
          contentType.includes("presentation") ||
          contentType.includes("powerpoint")
        ) {
          return powerpointIcon;
        } else if (
          contentType.includes("zip") ||
          contentType.includes("compressed")
        ) {
          return zipIcon;
        } else {
          return unknownIcon;
        }
    }
  };

  const renderAssetTree = (nodes: AssetTreeNode[], depth = 0) => {
    const sortedNodes = [...nodes].sort((a, b) => {
      if (a.content_type === "folder" && b.content_type !== "folder") {
        return -1;
      }
      if (a.content_type !== "folder" && b.content_type === "folder") {
        return 1;
      }
      return a.name.localeCompare(b.name);
    });

    return (
      <List
        className="asset-tree"
        dense
        disablePadding
        sx={{ backgroundColor: "transparent" }}
      >
        {sortedNodes.map((node) => (
          <React.Fragment key={node.id}>
            <ListItemButton
              onClick={() =>
                node.content_type === "folder" && toggleFolder(node.id)
              }
              style={{ paddingLeft: `${depth * 16}px` }}
            >
              <ListItemIcon
                sx={{
                  minWidth: "1em",
                  paddingRight: ".5em",
                  "& > *": {
                    color: ThemeNodetool.palette.c_gray6,
                    width: "1em",
                    height: "1em"
                  }
                }}
              >
                {getFileIcon(node.content_type)}
              </ListItemIcon>
              <ListItemText primary={node.name} />
              {node.content_type === "folder" &&
                node.children &&
                node.children.length > 0 && (
                  <>
                    {closedFolders.includes(node.id) ? (
                      <ExpandMore />
                    ) : (
                      <ExpandLess />
                    )}
                    <Typography variant="body2" color="textSecondary">
                      ({node.totalAssets - 1} items)
                    </Typography>
                  </>
                )}
            </ListItemButton>
            {node.content_type === "folder" && node.children && (
              <Collapse
                in={!closedFolders.includes(node.id)}
                timeout="auto"
                unmountOnExit
              >
                {renderAssetTree(node.children, depth + 1)}
              </Collapse>
            )}
          </React.Fragment>
        ))}
      </List>
    );
  };

  if (isLoading) {
    return <CircularProgress />;
  }

  return assetTree.length > 0 ? (
    <div className="asset-tree" css={styles}>
      {renderAssetTree(assetTree)}
    </div>
  ) : (
    <Typography variant="body1">No assets found</Typography>
  );
};

export default AssetTree;
