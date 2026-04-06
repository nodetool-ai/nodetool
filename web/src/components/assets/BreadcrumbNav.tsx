/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useMemo, useCallback } from "react";
import { Typography } from "@mui/material";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import HomeIcon from "@mui/icons-material/Home";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import useAssets from "../../serverState/useAssets";
import useAuth from "../../stores/useAuth";
import { FolderTree, AssetTreeNode } from "../../stores/AssetStore";

const styles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      alignItems: "center",
      gap: "0.1em",
      padding: "0.35em 0.5em",
      minHeight: "28px",
      overflow: "hidden"
    },
    ".breadcrumb-item": {
      display: "flex",
      alignItems: "center",
      gap: "0.1em",
      cursor: "pointer",
      color: theme.vars.palette.grey[400],
      fontSize: theme.fontSizeSmall,
      whiteSpace: "nowrap",
      transition: "color 0.15s",
      "&:hover": {
        color: theme.vars.palette.grey[0]
      }
    },
    ".breadcrumb-item.current": {
      color: theme.vars.palette.grey[100],
      fontWeight: 600,
      cursor: "default"
    },
    ".breadcrumb-separator": {
      color: theme.vars.palette.grey[600],
      fontSize: "1rem",
      flexShrink: 0
    },
    ".breadcrumb-home": {
      fontSize: "1rem",
      verticalAlign: "middle"
    }
  });

/**
 * Build the path from root to the current folder using the folder tree.
 */
function buildBreadcrumbPath(
  folderTree: FolderTree | undefined,
  currentFolderId: string | null,
  rootId: string
): Array<{ id: string; name: string }> {
  if (!folderTree || !currentFolderId) {
    return [{ id: rootId, name: "Assets" }];
  }

  // If we're at root, just show root
  if (currentFolderId === rootId) {
    return [{ id: rootId, name: "Assets" }];
  }

  // Build a lookup map from the tree
  const lookup = new Map<string, { name: string; parentId: string }>();

  const traverse = (nodes: AssetTreeNode[], parentId: string) => {
    for (const node of nodes) {
      lookup.set(node.id, { name: node.name, parentId });
      if (node.children) {
        traverse(node.children, node.id);
      }
    }
  };

  // folderTree values are root-level nodes
  const rootNodes = Object.values(folderTree) as AssetTreeNode[];
  traverse(rootNodes, rootId);

  // Walk up from current folder to root
  const path: Array<{ id: string; name: string }> = [];
  let nodeId: string | undefined = currentFolderId;

  while (nodeId && nodeId !== rootId) {
    const entry = lookup.get(nodeId);
    if (!entry) break;
    path.unshift({ id: nodeId, name: entry.name });
    nodeId = entry.parentId;
  }

  // Always prepend root
  path.unshift({ id: rootId, name: "Assets" });

  return path;
}

const BreadcrumbNav: React.FC = () => {
  const theme = useTheme();
  const currentFolderId = useAssetGridStore((state) => state.currentFolderId);
  const currentUser = useAuth((state) => state.user);
  const { folderTree, navigateToFolderId } = useAssets();

  const rootId = currentUser?.id ?? "root";

  const breadcrumbs = useMemo(
    () => buildBreadcrumbPath(folderTree, currentFolderId, rootId),
    [folderTree, currentFolderId, rootId]
  );

  const handleClick = useCallback(
    (folderId: string) => {
      if (folderId !== currentFolderId) {
        navigateToFolderId(folderId);
      }
    },
    [currentFolderId, navigateToFolderId]
  );

  if (breadcrumbs.length <= 1) {
    return null;
  }

  return (
    <div css={styles(theme)} className="breadcrumb-nav">
      {breadcrumbs.map((crumb, index) => {
        const isLast = index === breadcrumbs.length - 1;
        const isRoot = index === 0;

        return (
          <React.Fragment key={crumb.id}>
            {index > 0 && (
              <NavigateNextIcon className="breadcrumb-separator" />
            )}
            <Typography
              className={`breadcrumb-item ${isLast ? "current" : ""}`}
              onClick={() => !isLast && handleClick(crumb.id)}
              component="span"
            >
              {isRoot && <HomeIcon className="breadcrumb-home" />}
              {!isRoot && crumb.name}
            </Typography>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default memo(BreadcrumbNav);
