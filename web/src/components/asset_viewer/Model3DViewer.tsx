/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React from "react";
import { Typography } from "@mui/material";
import { Asset } from "../../stores/ApiTypes";
import Model3DViewer from "../threed/Model3DViewer";

interface Model3DViewerAssetProps {
  asset?: Asset;
  url?: string;
}

const styles = (theme: Theme) =>
  css({
    "&": {
      width: "100%",
      height: "calc(100% - 120px)",
      overflow: "hidden",
      margin: "0",
      position: "relative",
      pointerEvents: "all"
    },
    ".model-info": {
      position: "absolute",
      bottom: "0",
      right: "1em",
      zIndex: 1000
    },
    ".model-info p": {
      fontSize: theme.fontSizeSmall,
      textAlign: "right",
      color: theme.vars.palette.grey[100],
      textShadow: "0 0 4px rgba(0,0,0,0.9)"
    }
  });

/**
 * Model3DViewerAsset - Asset viewer component for 3D models
 *
 * Used in the asset explorer to display 3D model assets with full viewer controls.
 */
const Model3DViewerAsset: React.FC<Model3DViewerAssetProps> = ({
  asset,
  url
}) => {
  const theme = useTheme();
  const viewerStyles = styles(theme);

  const modelUrl = asset?.get_url || url;

  // Determine format from content type or file extension
  const getFormat = (): "glb" | "gltf" | "obj" | "fbx" | string => {
    const contentType = asset?.content_type || "";
    const filename = asset?.name || url || "";

    if (contentType.includes("gltf-binary") || filename.endsWith(".glb")) {
      return "glb";
    }
    if (contentType.includes("gltf") || filename.endsWith(".gltf")) {
      return "gltf";
    }
    if (contentType.includes("obj") || filename.endsWith(".obj")) {
      return "obj";
    }
    if (contentType.includes("fbx") || filename.endsWith(".fbx")) {
      return "fbx";
    }
    return "glb"; // Default to GLB
  };

  if (!modelUrl) {
    return (
      <div css={viewerStyles} className="model3d-viewer">
        <Typography
          sx={{ color: "white", textAlign: "center", paddingTop: 4 }}
        >
          No 3D model to display
        </Typography>
      </div>
    );
  }

  return (
    <div css={viewerStyles} className="model3d-viewer">
      <div className="model-info">
        {asset?.name && (
          <Typography variant="body2">{asset.name}</Typography>
        )}
      </div>
      <Model3DViewer
        source={modelUrl}
        format={getFormat()}
        width="100%"
        height="100%"
        controls={true}
        showGrid={true}
      />
    </div>
  );
};

export default Model3DViewerAsset;
