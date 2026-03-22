/** @jsxImportSource @emotion/react */
import React, { useCallback, useRef, useEffect, useMemo } from "react";
import { Box, Typography, CircularProgress, Alert, Divider } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useWorkflowManager } from "../../../contexts/WorkflowManagerContext";
import { useWorkflowAssets } from "../../../serverState/useWorkflowAssets";
import { Asset } from "../../../stores/ApiTypes";
import { useAssetGridStore } from "../../../stores/AssetGridStore";

import AssetGridContent from "../AssetGridContent";
import AssetViewer from "../AssetViewer";
import AssetDeleteConfirmation from "../AssetDeleteConfirmation";
import useResultsStore from "../../../stores/ResultsStore";
import WorkflowAssetToolbar from "./WorkflowAssetToolbar";
import { useSettingsStore } from "../../../stores/SettingsStore";

/**
 * WorkflowAssetPanelContent displays assets scoped to the current workflow.
 * 
 * This is a standalone version of WorkflowAssetPanel that doesn't require
 * dockview props, suitable for use in the left panel.
 * 
 * Features:
 * - Displays only assets associated with the current workflow
 * - Auto-refreshes when new results are received
 * - Reuses existing AssetGridContent for consistent UI
 */
const WorkflowAssetPanel: React.FC = () => {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const currentWorkflowId = useWorkflowManager((state) => state.currentWorkflowId);
  const openAsset = useAssetGridStore((state) => state.openAsset);
  const setOpenAsset = useAssetGridStore((state) => state.setOpenAsset);
  const selectedAssetIds = useAssetGridStore((state) => state.selectedAssetIds);

  // Subscribe to results store to detect new results
  const results = useResultsStore((state) => state.results);
  const outputResults = useResultsStore((state) => state.outputResults);

  const {
    assets,
    isLoading,
    error,
    refetch,
    uploadAsset,
    isUploading
  } = useWorkflowAssets(currentWorkflowId);

  // Get sorting preference from settings
  const assetsOrder = useSettingsStore((state) => state.settings.assetsOrder);

  // Sort assets based on the selected order
  const sortedAssets = useMemo(() => {
    if (!assets) {
      return [];
    }
    return [...assets].sort((a, b) => {
      if (assetsOrder === "name") {
        return a.name.localeCompare(b.name);
      } else if (assetsOrder === "date") {
        const dateA = new Date(a.created_at || "").getTime();
        const dateB = new Date(b.created_at || "").getTime();
        return dateB - dateA; // Newest first
      } else if (assetsOrder === "size") {
        const sizeA = a.size || 0;
        const sizeB = b.size || 0;
        return sizeB - sizeA; // Largest first
      }
      return 0;
    });
  }, [assets, assetsOrder]);

  // Track results for the current workflow and refetch when they change
  const prevResultsRef = useRef<{ results: typeof results; outputResults: typeof outputResults } | null>(null);

  // Memoize filtered results to avoid repeated filtering on every render
  const currentWorkflowResults = useMemo(() => {
    if (!currentWorkflowId) {return [];}
    return Object.keys(results).filter((key) => key.startsWith(currentWorkflowId));
  }, [results, currentWorkflowId]);

  const currentWorkflowOutputResults = useMemo(() => {
    if (!currentWorkflowId) {return [];}
    return Object.keys(outputResults).filter((key) => key.startsWith(currentWorkflowId));
  }, [outputResults, currentWorkflowId]);

  useEffect(() => {
    if (!currentWorkflowId) {
      return;
    }

    // Check if we have new results
    const prevResults = prevResultsRef.current;
    if (prevResults) {
      const prevWorkflowResults = Object.keys(prevResults.results).filter(
        (key) => key.startsWith(currentWorkflowId)
      );
      const prevWorkflowOutputResults = Object.keys(prevResults.outputResults).filter(
        (key) => key.startsWith(currentWorkflowId)
      );

      // If result count changed, refetch assets (new result likely created new asset)
      if (
        currentWorkflowResults.length !== prevWorkflowResults.length ||
        currentWorkflowOutputResults.length !== prevWorkflowOutputResults.length
      ) {
        // Debounce the refetch slightly to avoid too many requests
        const timeoutId = setTimeout(() => {
          refetch();
        }, 1000);

        return () => clearTimeout(timeoutId);
      }
    }

    prevResultsRef.current = { results, outputResults };
  }, [results, outputResults, currentWorkflowId, refetch, currentWorkflowResults, currentWorkflowOutputResults]);

  const handleDoubleClick = useCallback(
    (asset: Asset) => {
      // Double-click opens fullscreen viewer for all assets (including folders)
      // Use context menu "Open as Tab" to open in a tab instead
      setOpenAsset(asset);
    },
    [setOpenAsset]
  );

  const handleCloseViewer = useCallback(() => {
    setOpenAsset(null);
  }, [setOpenAsset]);

  // No workflow selected
  if (!currentWorkflowId) {
    return (
      <Box
        sx={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 3,
          backgroundColor: theme.vars.palette.c_editor_bg_color
        }}
      >
        <Typography variant="body2" color="text.secondary">
          No workflow selected
        </Typography>
      </Box>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <Box
        sx={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.vars.palette.c_editor_bg_color
        }}
      >
        <CircularProgress size={32} />
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Box
        sx={{
          height: "100%",
          p: 2,
          backgroundColor: theme.vars.palette.c_editor_bg_color
        }}
      >
        <Alert severity="error">
          Failed to load workflow assets: {error.message}
        </Alert>
      </Box>
    );
  }

  // Empty state
  if (!assets || assets.length === 0) {
    return (
      <Box
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          p: 3,
          backgroundColor: theme.vars.palette.c_editor_bg_color
        }}
      >
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          No assets for this workflow yet
        </Typography>
      </Box>
    );
  }

  // Assets display
  return (
    <Box
      ref={containerRef}
      sx={{
        height: "100%",
        overflow: "hidden",
        backgroundColor: theme.vars.palette.c_editor_bg_color,
        display: "flex",
        flexDirection: "column"
      }}
    >
      <WorkflowAssetToolbar
        assets={sortedAssets}
        onUpload={uploadAsset}
        _isUploading={isUploading}
      />
      <Divider />
      <Box sx={{ flex: 1, overflow: "hidden" }}>
        <AssetGridContent
          assets={sortedAssets}
          onDoubleClick={handleDoubleClick}
        />
      </Box>
      {/* Asset Viewer for double-click */}
      {openAsset && (
        <AssetViewer
          asset={openAsset}
          sortedAssets={sortedAssets}
          open={!!openAsset}
          onClose={handleCloseViewer}
        />
      )}
      {/* Delete confirmation dialog */}
      <AssetDeleteConfirmation assets={selectedAssetIds} />
    </Box>
  );
};

export default WorkflowAssetPanel;
