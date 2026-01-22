import React, { Suspense, lazy, memo } from "react";
import { Box, CircularProgress } from "@mui/material";

const Model3DViewer = lazy(() =>
  import("../../asset_viewer/Model3DViewer").then(module => ({ default: module.Model3DViewer }))
);

interface LazyModel3DViewerProps {
  url: string;
  compact?: boolean;
  onClick?: () => void;
}

const LazyModel3DViewer: React.FC<LazyModel3DViewerProps> = ({ url, compact, onClick }) => {
  return (
    <Suspense fallback={
      <Box sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "action.hover",
        borderRadius: 1
      }}>
        <CircularProgress size={24} />
      </Box>
    }>
      <Model3DViewer url={url} compact={compact} onClick={onClick} />
    </Suspense>
  );
};

export default memo(LazyModel3DViewer);
