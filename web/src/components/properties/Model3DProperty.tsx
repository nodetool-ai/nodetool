/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useAsset } from "../../serverState/useAsset";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import { memo, useState, useCallback } from "react";
import isEqual from "lodash/isEqual";
import { useNodes } from "../../contexts/NodeContext";
import { useFileDrop } from "../../hooks/handlers/useFileDrop";
import { Asset } from "../../stores/ApiTypes";
import { Button, TextField, Tooltip } from "@mui/material";
import AssetViewer from "../assets/AssetViewer";
import Model3DViewer from "../asset_viewer/Model3DViewer";

const styles = (theme: Theme) =>
  css({
    "& .property-label": {
      marginBottom: "5px"
    },
    ".drop-container": {
      position: "relative",
      width: "100%",
      marginTop: "-3px",
      display: "flex",
      flexDirection: "column",
      alignItems: "normal",
      gap: "0"
    },
    ".toggle-url-button": {
      position: "absolute",
      top: "-15px",
      right: "0",
      zIndex: 2,
      color: theme.vars.palette.grey[500],
      backgroundColor: "transparent",
      fontSize: "10px",
      fontWeight: 600,
      lineHeight: "1",
      height: "auto",
      minWidth: "unset",
      margin: "0",
      padding: "2px 4px",
      borderRadius: "4px",
      transition: "all 0.2s ease",
      "&:hover": {
        color: theme.vars.palette.primary.main,
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    ".url-input": {
      height: "1em",
      width: "calc(100% - 24px)",
      maxWidth: "120px",
      zIndex: 1,
      bottom: "0em",
      borderRadius: "0",
      backgroundColor: theme.vars.palette.grey[600],
      margin: "0 0 .5em 0",
      padding: ".2em .5em .1em .5em"
    },
    ".url-input input": {
      margin: 0,
      maxWidth: "230px",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeTiny,
      padding: "0"
    },
    ".url-input fieldset": {
      border: "0"
    },
    ".dropzone": {
      minHeight: "80px",
      width: "100%",
      border: "0",
      maxWidth: "none",
      textAlign: "center",
      transition: "all 0.2s ease",
      backgroundColor: theme.vars.palette.grey[800],
      borderRadius: "4px",
      cursor: "pointer",
      "&.drag-over": {
        backgroundColor: theme.vars.palette.grey[600],
        outline: `2px dashed ${theme.vars.palette.grey[100]}`,
        outlineOffset: "-2px"
      }
    },
    ".dropzone.dropped": {
      width: "100%",
      border: "0",
      maxWidth: "none",
      minHeight: "100px"
    },
    ".dropzone p": {
      textAlign: "center",
      padding: "1em",
      margin: 0
    },
    ".prop-drop": {
      fontSize: theme.fontSizeTiny,
      lineHeight: "1.1em",
      color: theme.vars.palette.grey[400]
    },
    ".model-preview": {
      width: "100%",
      height: "100px",
      position: "relative"
    }
  });

const Model3DProperty = (props: PropertyProps) => {
  const id = `model3d-${props.property.name}-${props.propertyIndex}`;
  const { asset, uri } = useAsset({ model3d: props.value });
  const theme = useTheme();

  const isConnected = useNodes((state) => {
    return state.edges.some(
      (edge) =>
        edge.target === props.nodeId &&
        edge.targetHandle === props.property.name
    );
  });

  const [showUrlInput, setShowUrlInput] = useState(false);
  const [openViewer, setOpenViewer] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const { onDrop, onDragOver } = useFileDrop({
    uploadAsset: true,
    onChangeAsset: (asset: Asset) =>
      props.onChange({ uri: asset.get_url || "", type: "model_3d" }),
    type: "all" // Accept all file types for 3D models (GLB, GLTF, OBJ, etc.)
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
      onDrop(e);
      setIsDragOver(false);
    },
    [onDrop]
  );

  const handleUrlChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      props.onChange({ uri: e.target.value, type: "model_3d" });
    },
    [props]
  );

  const handlePreviewClick = useCallback(() => {
    if (uri) {
      setOpenViewer(true);
    }
  }, [uri]);

  return (
    <div className="model3d-property" css={styles(theme)}>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      {!isConnected && (
        <div className="drop-container">
          {showUrlInput && (
            <TextField
              className="url-input nowheel nodrag"
              value={uri || ""}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              onChange={handleUrlChange}
              placeholder="Enter 3D model URL"
            />
          )}

          <Tooltip
            title={showUrlInput ? "Hide URL input" : "Show input to enter a URL"}
          >
            <Button
              className="toggle-url-button"
              variant="text"
              style={{
                opacity: showUrlInput ? 0.8 : 1
              }}
              onClick={() => setShowUrlInput(!showUrlInput)}
            >
              {showUrlInput ? "X" : "URL"}
            </Button>
          </Tooltip>

          <div
            className={`dropzone ${uri ? "dropped" : ""} ${
              isDragOver ? "drag-over" : ""
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={uri ? handlePreviewClick : undefined}
          >
            {uri ? (
              <div className="model-preview">
                <Model3DViewer url={uri} compact={true} onClick={handlePreviewClick} />
              </div>
            ) : (
              <p className="prop-drop">Drop 3D model (GLB, GLTF)</p>
            )}
          </div>

          <AssetViewer
            contentType="model/gltf-binary"
            asset={asset}
            url={uri}
            open={openViewer}
            onClose={() => setOpenViewer(false)}
          />
        </div>
      )}
    </div>
  );
};

export default memo(Model3DProperty, isEqual);
