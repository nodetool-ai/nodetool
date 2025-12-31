/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, Typography } from "@mui/material";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import { useFileDrop } from "../../hooks/handlers/useFileDrop";
import isEqual from "lodash/isEqual";
import { memo, useState, useCallback } from "react";
import { Asset } from "../../stores/ApiTypes";
import Model3DViewer from "../threed/Model3DViewer";

const styles = (theme: Theme) =>
  css({
    "& .property-label": {
      marginBottom: "5px"
    },
    ".dropzone": {
      minHeight: "100px",
      border: `2px dashed ${theme.vars.palette.grey[600]}`,
      borderRadius: "4px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      transition: "all 0.2s ease",
      backgroundColor: theme.vars.palette.grey[800],
      "&:hover": {
        borderColor: theme.vars.palette.primary.main,
        backgroundColor: theme.vars.palette.grey[700]
      },
      "&.drag-over": {
        borderColor: theme.vars.palette.primary.main,
        backgroundColor: theme.vars.palette.grey[700]
      },
      "&.has-model": {
        border: "none",
        minHeight: "200px"
      }
    },
    ".drop-text": {
      color: theme.vars.palette.grey[400],
      fontSize: theme.fontSizeSmall,
      textAlign: "center",
      marginTop: "8px"
    }
  });

const Model3DProperty = (props: PropertyProps) => {
  const id = `model3d-${props.property.name}-${props.propertyIndex}`;
  const theme = useTheme();
  const [isDragOver, setIsDragOver] = useState(false);

  // Get the current value
  const value = props.value as { uri?: string; type?: string } | undefined;
  const modelUri = value?.uri;

  const { onDrop, onDragOver } = useFileDrop({
    uploadAsset: true,
    onChangeAsset: (asset: Asset) =>
      props.onChange({ uri: asset.get_url || "", type: "model_3d" }),
    type: "all" // Accept all file types, we'll filter by extension
  });

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      onDragOver(e);
      setIsDragOver(true);
    },
    [onDragOver]
  );

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      // Check if the dropped file is a 3D model format
      const files = Array.from(e.dataTransfer?.files || []);
      const validExtensions = [".glb", ".gltf", ".obj", ".fbx"];
      const isValid = files.some((file) =>
        validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))
      );

      if (isValid || files.length === 0) {
        onDrop(e);
      } else {
        e.preventDefault();
        e.stopPropagation();
        // Could show a toast notification here
        console.warn("Invalid file type. Please drop a 3D model file (GLB, GLTF, OBJ, or FBX).");
      }
      setIsDragOver(false);
    },
    [onDrop]
  );

  // Determine format from URI
  const getFormat = (): "glb" | "gltf" | "obj" | "fbx" | string => {
    if (!modelUri) {
      return "glb";
    }
    const lowerUri = modelUri.toLowerCase();
    if (lowerUri.endsWith(".gltf")) {
      return "gltf";
    }
    if (lowerUri.endsWith(".obj")) {
      return "obj";
    }
    if (lowerUri.endsWith(".fbx")) {
      return "fbx";
    }
    return "glb";
  };

  return (
    <div className="model3d-property" css={styles(theme)}>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      <div
        className={`dropzone ${isDragOver ? "drag-over" : ""} ${modelUri ? "has-model" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {modelUri ? (
          <Model3DViewer
            source={modelUri}
            format={getFormat()}
            width="100%"
            height={180}
            controls={true}
            showGrid={true}
            autoRotate={false}
          />
        ) : (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: 2
            }}
          >
            <ViewInArIcon
              sx={{ fontSize: 32, color: theme.vars.palette.grey[500] }}
            />
            <Typography className="drop-text">
              Drop 3D model file
              <br />
              (GLB, GLTF)
            </Typography>
          </Box>
        )}
      </div>
    </div>
  );
};

export default memo(Model3DProperty, isEqual);
