/** @jsxImportSource @emotion/react */
import React, { useCallback, useRef, useEffect } from "react";
import { Box, Typography, CircularProgress, Alert, Button } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useWorkflowManager } from "../../../contexts/WorkflowManagerContext";
import { useWorkflowAssets } from "../../../serverState/useWorkflowAssets";
import { Asset } from "../../../stores/ApiTypes";
import { useAssetGridStore } from "../../../stores/AssetGridStore";
import AssetGridContent from "../AssetGridContent";
import useResultsStore from "../../../stores/ResultsStore";

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
  const setOpenAsset = useAssetGridStore((state) => state.setOpenAsset);

  // Subscribe to results store to detect new results
  const results = useResultsStore((state) => state.results);
  const outputResults = useResultsStore((state) => state.outputResults);

  const {
    assets,
    isLoading,
    error,
    refetch,
  } = useWorkflowAssets(currentWorkflowId);

  // Track results for the current workflow and refetch when they change
  const prevResultsRef = useRef<{ results: typeof results; outputResults: typeof outputResults } | null>(null);

  useEffect(() => {
    if (!currentWorkflowId) {
      return;
    }

    // Filter results for current workflow
    const currentWorkflowResults = Object.keys(results).filter(
      (key) => key.startsWith(currentWorkflowId)
    );
    const currentWorkflowOutputResults = Object.keys(outputResults).filter(
      (key) => key.startsWith(currentWorkflowId)
    );

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
  }, [results, outputResults, currentWorkflowId, refetch]);

  const handleDoubleClick = useCallback(
    (asset: Asset) => {
      setOpenAsset(asset);
    },
    [setOpenAsset]
  );

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
      <AssetGridContent
        assets={assets}
        onDoubleClick={handleDoubleClick}
      />
    </Box>
  );
};

export default WorkflowAssetPanel;
