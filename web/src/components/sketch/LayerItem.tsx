/**
 * LayerItem
 *
 * Renders an individual layer row within the layers panel, including
 * thumbnail, name (with inline rename), visibility, isolate, and
 * exposed input/output toggles. Supports drag-and-drop reordering.
 * Group layers show an expand/collapse toggle and a folder icon.
 */

import React, { memo } from "react";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import FilterNoneIcon from "@mui/icons-material/FilterNone";
import InputIcon from "@mui/icons-material/Input";
import OutputIcon from "@mui/icons-material/Output";
import LinkIcon from "@mui/icons-material/Link";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import FolderIcon from "@mui/icons-material/Folder";
import type { Layer } from "./types";
import { summarizeLayerImageReference } from "./types";
import { getLayerDataImageUrl } from "./serialization";

export interface LayerItemProps {
  layer: Layer;
  realIdx: number;
  depth?: number;
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
  onToggleGroupCollapsed?: (groupId: string) => void;
}

const LayerItem: React.FC<LayerItemProps> = ({
  layer,
  realIdx,
  depth = 0,
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
  onDragEnd,
  onToggleGroupCollapsed
}) => {
  const isGroup = layer.type === "group";
  const thumbnailSrc = isGroup ? null : getLayerDataImageUrl(layer.data);

  return (
    <Box>
      <Box
        className={`layer-item${isActive ? " active" : ""}${isMask ? " mask-layer" : ""}${isIsolated ? " isolated" : ""}${isGroup ? " group-layer" : ""}`}
        draggable
        onDragStart={(e) => {
          const t = e.target as HTMLElement;
          if (t.closest("button")) {
            e.preventDefault();
            return;
          }
          onDragStart(realIdx);
        }}
        onDragOver={(e) => onDragOver(e, realIdx)}
        onDragLeave={onDragLeave}
        onDrop={() => onDrop(realIdx)}
        onDragEnd={onDragEnd}
        onClick={() => onSelectLayer(layer.id)}
        sx={{
          pl: `${8 + depth * 16}px`,
          ...(isDragOver
            ? {
                borderTop: "2px solid",
                borderTopColor: "primary.main"
              }
            : {})
        }}
      >
        {/* Group expand/collapse toggle */}
        {isGroup ? (
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onToggleGroupCollapsed?.(layer.id);
            }}
            sx={{ padding: "2px", flexShrink: 0 }}
          >
            {layer.collapsed ? (
              <ChevronRightIcon sx={{ fontSize: "1rem" }} />
            ) : (
              <ExpandMoreIcon sx={{ fontSize: "1rem" }} />
            )}
          </IconButton>
        ) : null}

        {/* Thumbnail or group folder icon */}
        {isGroup ? (
          <FolderIcon
            sx={{
              fontSize: "1.25rem",
              color: isActive ? "primary.contrastText" : "grey.400",
              flexShrink: 0,
              mr: "2px"
            }}
          />
        ) : thumbnailSrc ? (
          <img
            className="layer-thumbnail"
            src={thumbnailSrc}
            alt={layer.name}
            draggable={false}
          />
        ) : (
          <Box className="layer-thumbnail-empty" />
        )}

        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisibility(layer.id);
          }}
          sx={{ padding: "4px", flexShrink: 0 }}
        >
          {layer.visible ? (
            <VisibilityIcon sx={{ fontSize: "1.125rem" }} />
          ) : (
            <VisibilityOffIcon sx={{ fontSize: "1.125rem", opacity: 0.65 }} />
          )}
        </IconButton>

        {!isGroup && (
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
                padding: "4px",
                flexShrink: 0,
                color: isIsolated ? "warning.main" : "grey.500",
                opacity: isIsolated ? 1 : 0.75,
                "&:hover": { opacity: 1, color: isIsolated ? "warning.main" : "grey.300" }
              }}
            >
              <FilterNoneIcon sx={{ fontSize: "1rem" }} />
            </IconButton>
          </Tooltip>
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
              {layer.alphaLock && " 🔒"}
            </Typography>
          </Box>
        )}

        {/* I/O toggles only for non-group layers */}
        {!isGroup && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
              gap: 0.25,
              ml: "auto",
              pl: 0.5
            }}
          >
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
                  padding: "4px",
                  color: layer.exposedAsInput ? "info.main" : "grey.400",
                  opacity: layer.exposedAsInput ? 1 : 0.88,
                  "&:hover": {
                    opacity: 1,
                    color: layer.exposedAsInput ? "info.light" : "grey.200",
                    bgcolor: "action.hover"
                  }
                }}
              >
                <InputIcon sx={{ fontSize: "1.0625rem" }} />
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
                  padding: "4px",
                  color: layer.exposedAsOutput ? "success.main" : "grey.400",
                  opacity: layer.exposedAsOutput ? 1 : 0.88,
                  "&:hover": {
                    opacity: 1,
                    color: layer.exposedAsOutput ? "success.light" : "grey.200",
                    bgcolor: "action.hover"
                  }
                }}
              >
                <OutputIcon sx={{ fontSize: "1.0625rem" }} />
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default memo(LayerItem);
