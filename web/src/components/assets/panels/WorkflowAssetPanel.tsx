/** @jsxImportSource @emotion/react */
import React, { useCallback, useRef, useEffect, useMemo } from "react";
import { Box } from "@mui/material";
import { AlertBanner, Text, FlexRow, FlexColumn, LoadingSpinner, Divider } from "../../ui_primitives";
import { useTheme } from "@mui/material/styles";
import { useWorkflowManager } from "../../../contexts/WorkflowManagerContext";
import { useWorkflowAssets } from "../../../serverState/useWorkflowAssets";
import { Asset } from "../../../stores/ApiTypes";
import { useAssetGridStore } from "../../../stores/AssetGridStore";

import AssetGridContent from "../AssetGridContent";
import AssetViewer from "../AssetViewer";
import AssetDeleteConfirmation from "../AssetDeleteConfirmation";
import useResultsStore from "../../../stores/ResultsStore";
import { shallow } from "zustand/shallow";
import WorkflowAssetToolbar from "./WorkflowAssetToolbar";
import { useSettingsStore } from "../../../stores/SettingsStore";
import { getAssetCategory } from "../assetGridUtils";

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
  const { results, outputResults } = useResultsStore(
    (state) => ({ results: state.results, outputResults: state.outputResults }),
    shallow
  );

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
  const typeFilter = useAssetGridStore((state) => state.typeFilter);

  // Sort + filter assets based on user selection
  const sortedAssets = useMemo(() => {
    if (!assets) {
      return [];
    }
    const filtered =
      typeFilter === "all"
        ? assets
        : assets.filter(
            (a) => getAssetCategory(a.content_type || "") === typeFilter
          );
    return [...filtered].sort((a, b) => {
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
  }, [assets, assetsOrder, typeFilter]);

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
      <FlexRow
        align="center"
        justify="center"
        fullWidth
        sx={{
          height: "100%",
          p: 3,
          backgroundColor: theme.vars.palette.c_editor_bg_color
        }}
      >
        <Text size="small" color="secondary">
          No workflow selected
        </Text>
      </FlexRow>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <FlexRow
        align="center"
        justify="center"
        sx={{
          height: "100%",
          backgroundColor: theme.vars.palette.c_editor_bg_color
        }}
      >
        <LoadingSpinner size="medium" />
      </FlexRow>
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
        <AlertBanner severity="error">
          Failed to load workflow assets: {error.message}
        </AlertBanner>
      </Box>
    );
  }

  // Empty state
  if (!assets || assets.length === 0) {
    return (
      <FlexColumn
        align="center"
        justify="center"
        sx={{
          height: "100%",
          p: 3,
          backgroundColor: theme.vars.palette.c_editor_bg_color
        }}
      >
        <Text color="secondary" sx={{ mb: 2 }}>
          No assets for this workflow yet
        </Text>
      </FlexColumn>
    );
  }

  // Assets display
  return (
    <FlexColumn
      ref={containerRef}
      sx={{
        height: "100%",
        overflow: "hidden",
        backgroundColor: theme.vars.palette.c_editor_bg_color
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
    </FlexColumn>
  );
};

export default WorkflowAssetPanel;
