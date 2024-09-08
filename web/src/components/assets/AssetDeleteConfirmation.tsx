/** @jsxImportSource @emotion/react */
import React, { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Button,
  Typography,
  CircularProgress,
  List,
  ListItemText,
  Collapse,
  ListItemButton,
  ListItemIcon
} from "@mui/material";
import {
  ExpandLess,
  ExpandMore,
  Folder,
  InsertDriveFile
} from "@mui/icons-material";
import { Asset } from "../../stores/ApiTypes";
import { useAssetStore } from "../../stores/AssetStore";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useAssetDeletion } from "../../serverState/useAssetDeletion";
import { useAssets } from "../../serverState/useAssets";
import ThemeNodetool from "../themes/ThemeNodetool";

interface AssetDeleteConfirmationProps {
  assets: string[];
}

interface AssetTreeNode extends Asset {
  children: AssetTreeNode[];
  totalAssets: number;
}

const AssetDeleteConfirmation: React.FC<AssetDeleteConfirmationProps> = ({
  assets
}) => {
  const [assetTree, setAssetTree] = useState<AssetTreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalAssets, setTotalAssets] = useState(0);
  const [closedFolders, setClosedFolders] = useState<string[]>([]);
  const dialogOpen = useAssetGridStore((state) => state.deleteDialogOpen);
  const setDialogOpen = useAssetGridStore((state) => state.setDeleteDialogOpen);
  const { mutation } = useAssetDeletion();
  const { refetchAssetsAndFolders } = useAssets();
  const getAsset = useAssetStore((state) => state.get);
  const getAllAssetsInFolder = useAssetStore(
    (state) => state.getAllAssetsInFolder
  );

  const buildAssetTree = useCallback(
    async (assetId: string): Promise<AssetTreeNode | null> => {
      const asset = await getAsset(assetId);
      if (!asset) return null;

      const node: AssetTreeNode = { ...asset, children: [], totalAssets: 1 };

      if (asset.content_type === "folder") {
        const children = await getAllAssetsInFolder(asset.id);
        node.children = (
          await Promise.all(children.map((child) => buildAssetTree(child.id)))
        ).filter((child): child is AssetTreeNode => child !== null);

        node.totalAssets =
          1 + node.children.reduce((sum, child) => sum + child.totalAssets, 0);
      }

      return node;
    },
    [getAsset, getAllAssetsInFolder]
  );

  useEffect(() => {
    const fetchAssetTree = async () => {
      setIsLoading(true);
      const tree = await Promise.all(assets.map(buildAssetTree));
      const filteredTree = tree.filter(
        (node): node is AssetTreeNode => node !== null
      );
      setAssetTree(filteredTree);

      const total = filteredTree.reduce(
        (sum, node) => sum + node.totalAssets,
        0
      );
      setTotalAssets(total);

      setIsLoading(false);
    };

    if (dialogOpen) {
      fetchAssetTree();
    }
  }, [assets, dialogOpen, buildAssetTree]);

  const executeDeletion = useCallback(async () => {
    try {
      const response = await mutation.mutateAsync(assets);
      if (response === undefined) {
        console.error("Received undefined response from server");
      } else {
        if (typeof response === "object" && response !== null) {
          console.log(
            "Deleted asset IDs:",
            (response as any).deleted_asset_ids
          );
        }
      }
      setDialogOpen(false);
      await refetchAssetsAndFolders();
    } catch (error) {
      if (error instanceof Error) {
        console.error("Execute deletion error:", error.message);
      }
    }
  }, [mutation, assets, setDialogOpen, refetchAssetsAndFolders]);

  const toggleFolder = (assetId: string) => {
    setClosedFolders((prev: string[]) => {
      if (prev.includes(assetId)) {
        return prev.filter((id: string) => id !== assetId);
      } else {
        return [...prev, assetId];
      }
    });
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
      <List dense disablePadding>
        {sortedNodes.map((node) => (
          <React.Fragment key={node.id}>
            <ListItemButton
              onClick={() =>
                node.content_type === "folder" && toggleFolder(node.id)
              }
              style={{ paddingLeft: `${depth * 16}px` }}
            >
              <ListItemIcon>
                {node.content_type === "folder" ? (
                  <Folder />
                ) : (
                  <InsertDriveFile />
                )}
              </ListItemIcon>
              <ListItemText primary={node.name} />
              {node.content_type === "folder" && (
                <>
                  {closedFolders.includes(node.id) ? (
                    <ExpandMore />
                  ) : (
                    <ExpandLess />
                  )}
                  <Typography variant="body2" color="textSecondary">
                    ({node.totalAssets} items)
                  </Typography>
                </>
              )}
            </ListItemButton>
            {node.content_type === "folder" && (
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

  return (
    <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
      <DialogTitle>
        {isLoading
          ? "Preparing to delete..."
          : `Delete ${assets.length > 1 ? assets.length + " items" : "folder"}${
              totalAssets > assets.length
                ? ` containing ${totalAssets} assets?`
                : "?"
            }`}
      </DialogTitle>
      <DialogContent>
        {isLoading ? (
          <CircularProgress />
        ) : (
          <>
            <Typography
              style={{
                color: ThemeNodetool.palette.c_warning,
                marginBottom: "1em"
              }}
            >
              The following items will be deleted:
            </Typography>
            {renderAssetTree(assetTree)}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
        <Button onClick={executeDeletion} disabled={isLoading} color="error">
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AssetDeleteConfirmation;
