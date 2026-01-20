/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useEffect, useState, useCallback, useMemo, memo } from "react";
import {
  CircularProgress,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  Typography,
  Box
} from "@mui/material";
import { ExpandLess, ExpandMore } from "@mui/icons-material";
import { useAssetStore } from "../../stores/AssetStore";
import { Asset } from "../../stores/ApiTypes";
import log from "loglevel";
import { IconForType } from "../../config/data_types";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

const styles = (_theme: Theme) =>
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
  const theme = useTheme();
  const [assetTree, setAssetTree] = useState<AssetTreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [closedFolders, setClosedFolders] = useState<string[]>([]);
  const getAssetsRecursive = useAssetStore((state) => state.getAssetsRecursive);

  const icons = useMemo(() => ({
    folder: <IconForType iconName="folder" />,
    image: <IconForType iconName="image" />,
    audio: <IconForType iconName="audio" />,
    video: <IconForType iconName="video" />,
    text: <IconForType iconName="text" />,
    pdf: <IconForType iconName="pdf" />,
    word: <IconForType iconName="word" />,
    excel: <IconForType iconName="excel" />,
    powerpoint: <IconForType iconName="powerpoint" />,
    zip: <IconForType iconName="zip" />,
    unknown: <IconForType iconName="unknown" />
  }), []);

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
        log.error("Error fetching asset tree:", error);
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

  const toggleFolder = useCallback((assetId: string) => {
    setClosedFolders((prev) => {
      if (prev.includes(assetId)) {
        return prev.filter((id) => id !== assetId);
      } else {
        return [...prev, assetId];
      }
    });
  }, []);

  const getFileIcon = useCallback((contentType: string) => {
    switch (contentType) {
      case "folder":
        return icons.folder;
      default:
        if (contentType.includes("image")) {
          return icons.image;
        } else if (contentType.includes("audio")) {
          return icons.audio;
        } else if (contentType.includes("video")) {
          return icons.video;
        } else if (contentType.includes("text")) {
          return icons.text;
        } else if (contentType.includes("pdf")) {
          return icons.pdf;
        } else if (
          contentType.includes("word") ||
          contentType.includes("document")
        ) {
          return icons.word;
        } else if (
          contentType.includes("sheet") ||
          contentType.includes("excel")
        ) {
          return icons.excel;
        } else if (
          contentType.includes("presentation") ||
          contentType.includes("powerpoint")
        ) {
          return icons.powerpoint;
        } else if (
          contentType.includes("zip") ||
          contentType.includes("compressed")
        ) {
          return icons.zip;
        } else {
          return icons.unknown;
        }
    }
  }, [icons]);

  const sortNodes = useCallback((nodes: AssetTreeNode[]): AssetTreeNode[] => {
    return [...nodes].sort((a, b) => {
      if (a.content_type === "folder" && b.content_type !== "folder") {
        return -1;
      }
      if (a.content_type !== "folder" && b.content_type === "folder") {
        return 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, []);

  const sortedAssetTree = useMemo(() => sortNodes(assetTree), [assetTree, sortNodes]);

  const renderAssetTree = useCallback((nodes: AssetTreeNode[], depth = 0) => {
    return (
      <List
        className="asset-tree"
        dense
        disablePadding
        sx={{ backgroundColor: "transparent" }}
      >
        {nodes.map((node) => (
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
                    color: theme.vars.palette.grey[100],
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
  }, [closedFolders, toggleFolder, getFileIcon, theme]);

  if (isLoading) {
    return <CircularProgress />;
  }

  return assetTree.length > 0 ? (
    <Box className="asset-tree" css={styles(theme)}>
      {renderAssetTree(sortedAssetTree)}
    </Box>
  ) : (
    <Typography variant="body1">No assets found</Typography>
  );
};

export default memo(AssetTree);
