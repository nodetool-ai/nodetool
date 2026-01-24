/** @jsxImportSource @emotion/react */
import React, { useCallback, useRef, useState } from "react";
import { IDockviewPanelProps } from "dockview";
import { Box, Typography, CircularProgress, Alert, Button } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useWorkflowManager } from "../../../contexts/WorkflowManagerContext";
import { useWorkflowAssets } from "../../../serverState/useWorkflowAssets";
import { Asset } from "../../../stores/ApiTypes";
import { useAssetGridStore } from "../../../stores/AssetGridStore";
import AssetGridContent from "../AssetGridContent";
import FileUploadButton from "../../buttons/FileUploadButton";
import RefreshIcon from "@mui/icons-material/Refresh";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";

export interface WorkflowAssetPanelParams {
  isHorizontal?: boolean;
  itemSpacing?: number;
}

/**
 * WorkflowAssetPanel displays assets scoped to the current workflow.
 * 
 * Features:
 * - Displays only assets associated with the current workflow
 * - Upload button automatically sets workflow_id
 * - Refresh to reload workflow assets
 * - Reuses existing AssetGridContent for consistent UI
 */
const WorkflowAssetPanel: React.FC<
  IDockviewPanelProps<WorkflowAssetPanelParams>
> = (props) => {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const { currentWorkflowId } = useWorkflowManager();
  const setOpenAsset = useAssetGridStore((state) => state.setOpenAsset);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const {
    assets,
    isLoading,
    error,
    refetch,
    uploadAsset,
    isUploading
  } = useWorkflowAssets(currentWorkflowId);

  const handleDoubleClick = useCallback(
    (asset: Asset) => {
      setOpenAsset(asset);
    },
    [setOpenAsset]
  );

  const handleFileSelect = useCallback(
    (file: File) => {
      setUploadProgress(0);
      uploadAsset(
        { file, onProgress: setUploadProgress },
        {
          onSuccess: () => {
            setUploadProgress(null);
          },
          onError: () => {
            setUploadProgress(null);
          }
        }
      );
    },
    [uploadAsset]
  );

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const isHorizontal = props.params?.isHorizontal;
  const itemSpacing = props.params?.itemSpacing;

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
        <Button
          onClick={handleRefresh}
          startIcon={<RefreshIcon />}
          sx={{ mt: 2 }}
        >
          Retry
        </Button>
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
        <CloudUploadIcon
          sx={{ fontSize: 64, color: "text.secondary", mb: 2, opacity: 0.5 }}
        />
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          No assets for this workflow yet
        </Typography>
        <FileUploadButton
          onFileSelect={handleFileSelect}
          disabled={isUploading}
        />
        {uploadProgress !== null && (
          <Box sx={{ mt: 2, width: "200px" }}>
            <CircularProgress
              variant="determinate"
              value={uploadProgress}
              size={24}
            />
            <Typography variant="caption" sx={{ ml: 1 }}>
              {Math.round(uploadProgress)}%
            </Typography>
          </Box>
        )}
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
      {/* Header with upload and refresh */}
      <Box
        sx={{
          display: "flex",
          gap: 1,
          p: 1,
          borderBottom: `1px solid ${theme.vars.palette.divider}`
        }}
      >
        <FileUploadButton
          onFileSelect={handleFileSelect}
          disabled={isUploading}
          size="small"
        />
        <Button
          onClick={handleRefresh}
          startIcon={<RefreshIcon />}
          size="small"
          disabled={isLoading}
        >
          Refresh
        </Button>
        {uploadProgress !== null && (
          <Box sx={{ display: "flex", alignItems: "center", ml: "auto" }}>
            <CircularProgress
              variant="determinate"
              value={uploadProgress}
              size={20}
            />
            <Typography variant="caption" sx={{ ml: 1 }}>
              {Math.round(uploadProgress)}%
            </Typography>
          </Box>
        )}
      </Box>

      {/* Asset grid */}
      <Box sx={{ flex: 1, overflow: "hidden" }}>
        <AssetGridContent
          assets={assets}
          isHorizontal={isHorizontal}
          itemSpacing={itemSpacing}
          onDoubleClick={handleDoubleClick}
        />
      </Box>
    </Box>
  );
};

export default WorkflowAssetPanel;
