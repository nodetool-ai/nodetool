/**
 * LayerItem
 *
 * Renders an individual layer row within the layers panel, including
 * thumbnail, name (with inline rename), visibility, isolate, and
 * exposed input/output toggles. Supports drag-and-drop reordering.
 */

import React, { memo } from "react";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import FilterNoneIcon from "@mui/icons-material/FilterNone";
import InputIcon from "@mui/icons-material/Input";
import OutputIcon from "@mui/icons-material/Output";
import LinkIcon from "@mui/icons-material/Link";
import type { Layer } from "./types";
import { summarizeLayerImageReference } from "./types";
import { getLayerDataImageUrl } from "./serialization";

export interface LayerItemProps {
  layer: Layer;
  realIdx: number;
  isActive: boolean;
  isMask: boolean;
  isIsolated: boolean;
  isDragOver: boolean;
  editingLayerId: string | null;
  editName: string;
  onSelectLayer: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onToggleIsolateLayer: (layerId: string) => void;
  onToggleExposedInput: (layerId: string) => void;
  onToggleExposedOutput: (layerId: string) => void;
  onStartRename: (layerId: string, currentName: string) => void;
  onFinishRename: (layerId: string) => void;
  onEditNameChange: (value: string) => void;
  onCancelRename: () => void;
  onDragStart: (realIdx: number) => void;
  onDragOver: (e: React.DragEvent, realIdx: number) => void;
  onDragLeave: () => void;
  onDrop: (realIdx: number) => void;
  onDragEnd: () => void;
}

const LayerItem: React.FC<LayerItemProps> = ({
  layer,
  realIdx,
  isActive,
  isMask,
  isIsolated,
  isDragOver,
  editingLayerId,
  editName,
  onSelectLayer,
  onToggleVisibility,
  onToggleIsolateLayer,
  onToggleExposedInput,
  onToggleExposedOutput,
  onStartRename,
  onFinishRename,
  onEditNameChange,
  onCancelRename,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd
}) => {
  const thumbnailSrc = getLayerDataImageUrl(layer.data);

  return (
    <Box>
      <Box
        className={`layer-item${isActive ? " active" : ""}${isMask ? " mask-layer" : ""}${isIsolated ? " isolated" : ""}`}
        draggable
        onDragStart={() => onDragStart(realIdx)}
        onDragOver={(e) => onDragOver(e, realIdx)}
        onDragLeave={onDragLeave}
        onDrop={() => onDrop(realIdx)}
        onDragEnd={onDragEnd}
        onClick={() => onSelectLayer(layer.id)}
        sx={
          isDragOver
            ? {
                borderTop: "2px solid",
                borderTopColor: "primary.main"
              }
            : undefined
        }
      >
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisibility(layer.id);
          }}
          sx={{ padding: "2px" }}
        >
          {layer.visible ? (
            <VisibilityIcon sx={{ fontSize: "14px" }} />
          ) : (
            <VisibilityOffIcon sx={{ fontSize: "14px" }} />
          )}
        </IconButton>

        <Tooltip
          title={isIsolated ? "Show all layers" : "Solo this layer"}
          placement="top"
        >
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onToggleIsolateLayer(layer.id);
            }}
            sx={{
              padding: "2px",
              color: isIsolated ? "warning.main" : undefined,
              opacity: isIsolated ? 1 : 0.4,
              "&:hover": { opacity: 1 }
            }}
          >
            <FilterNoneIcon sx={{ fontSize: "12px" }} />
          </IconButton>
        </Tooltip>

        {/* Layer thumbnail preview */}
        {thumbnailSrc ? (
          <img
            className="layer-thumbnail"
            src={thumbnailSrc}
            alt={layer.name}
            draggable={false}
          />
        ) : (
          <Box className="layer-thumbnail-empty" />
        )}

        {editingLayerId === layer.id ? (
          <input
            value={editName}
            onChange={(e) => onEditNameChange(e.target.value)}
            onBlur={() => onFinishRename(layer.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onFinishRename(layer.id);
              }
              if (e.key === "Escape") {
                onCancelRename();
              }
            }}
            autoFocus
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              color: "inherit",
              fontSize: "inherit",
              outline: "none",
              padding: "0 2px"
            }}
          />
        ) : (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: "4px",
              minWidth: 0
            }}
          >
            {layer.imageReference ? (
              <Tooltip
                title={summarizeLayerImageReference(layer.imageReference)}
                placement="left"
              >
                <LinkIcon
                  sx={{
                    fontSize: "12px",
                    color: "info.light",
                    flexShrink: 0,
                    opacity: 0.85
                  }}
                />
              </Tooltip>
            ) : null}
            <Typography
              className="layer-name"
              onDoubleClick={() => onStartRename(layer.id, layer.name)}
              sx={{ minWidth: 0 }}
            >
              {layer.name}
              {isMask && " 🎭"}
              {layer.alphaLock && " 🔒"}
            </Typography>
          </Box>
        )}

        <Box sx={{ display: "flex", gap: 0, ml: "auto" }}>
          <Tooltip
            title={
              layer.exposedAsInput
                ? "Remove input handle"
                : "Expose as input"
            }
          >
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExposedInput(layer.id);
              }}
              sx={{
                padding: "1px",
                color: layer.exposedAsInput ? "info.main" : "grey.600",
                opacity: layer.exposedAsInput ? 1 : 0.5,
                "&:hover": { opacity: 1 }
              }}
            >
              <InputIcon sx={{ fontSize: "11px" }} />
            </IconButton>
          </Tooltip>
          <Tooltip
            title={
              layer.exposedAsOutput
                ? "Remove output handle"
                : "Expose as output"
            }
          >
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExposedOutput(layer.id);
              }}
              sx={{
                padding: "1px",
                color: layer.exposedAsOutput ? "success.main" : "grey.600",
                opacity: layer.exposedAsOutput ? 1 : 0.5,
                "&:hover": { opacity: 1 }
              }}
            >
              <OutputIcon sx={{ fontSize: "11px" }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    </Box>
  );
};

export default memo(LayerItem);
