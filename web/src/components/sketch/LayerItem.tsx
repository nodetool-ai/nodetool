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
import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import LoginIcon from "@mui/icons-material/Login";
import LogoutIcon from "@mui/icons-material/Logout";
import LinkIcon from "@mui/icons-material/Link";
import LockIcon from "@mui/icons-material/Lock";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import FolderIcon from "@mui/icons-material/Folder";
import type { Layer } from "./types";
import { summarizeLayerImageReference } from "./types";
import { getLayerDataImageUrl } from "./serialization";

/** Base left padding for the layer row (px). */
const BASE_PADDING = 8;
/** Additional left padding per nesting depth level (px). */
const DEPTH_INDENT = 20;

/** Where a dragged layer will be inserted relative to the drop target. */
export type DropPosition = "before" | "after" | "into" | null;

export interface LayerItemProps {
  layer: Layer;
  realIdx: number;
  depth?: number;
  /** Layer that receives paint and tool edits. */
  isPaintTarget: boolean;
  /** Highlight row (multi-select or single active). */
  isRowSelected: boolean;
  isMask: boolean;
  isIsolated: boolean;
  dropPosition: DropPosition;
  editingLayerId: string | null;
  editName: string;
  onLayerRowPointerDown: (e: React.PointerEvent, layerId: string) => void;
  onLayerRowClick: (e: React.MouseEvent, layerId: string) => void;
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
  isPaintTarget,
  isRowSelected,
  isMask,
  isIsolated,
  dropPosition,
  editingLayerId,
  editName,
  onLayerRowPointerDown,
  onLayerRowClick,
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
  const rowClass =
    `layer-item${isPaintTarget ? " active" : ""}` +
    `${isMask ? " mask-layer" : ""}` +
    `${isIsolated ? " isolated" : ""}` +
    `${isGroup ? " group-layer" : ""}` +
    `${layer.alphaLock ? " alpha-lock" : ""}` +
    `${isRowSelected && !isPaintTarget ? " selected-secondary" : ""}`;

  const dropIndicatorSx = (() => {
    switch (dropPosition) {
      case "before":
        return { borderTop: "2px solid", borderTopColor: "primary.main" };
      case "after":
        return { borderBottom: "2px solid", borderBottomColor: "primary.main" };
      case "into":
        return {
          outline: "2px solid",
          outlineColor: "primary.main",
          outlineOffset: "-2px"
        };
      default:
        return {};
    }
  })();

  return (
    <Box>
      <Box
        className={rowClass}
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
        onPointerDown={(e) => onLayerRowPointerDown(e, layer.id)}
        onClick={(e) => onLayerRowClick(e, layer.id)}
        sx={{
          pl: `${BASE_PADDING + depth * DEPTH_INDENT}px`,
          ...dropIndicatorSx
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
              color: isPaintTarget ? "primary.contrastText" : "grey.400",
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
              <CenterFocusStrongIcon sx={{ fontSize: "1.125rem" }} />
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
            {layer.alphaLock ? (
              <Tooltip title="Lock transparency" placement="top">
                <LockIcon
                  sx={{
                    fontSize: "1rem",
                    color: "info.main",
                    flexShrink: 0,
                    opacity: 0.95
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
            </Typography>
          </Box>
        )}

        {/* I/O toggles: stacked, full row height (in / out flow) */}
        {!isGroup && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignSelf: "stretch",
              flexShrink: 0,
              width: 30,
              minHeight: 0,
              ml: "auto",
              pl: 0.5,
              my: "-2px"
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
                  flex: 1,
                  minHeight: 0,
                  width: "100%",
                  py: 0,
                  borderRadius: "4px 4px 0 0",
                  color: layer.exposedAsInput ? "info.main" : "grey.400",
                  opacity: layer.exposedAsInput ? 1 : 0.88,
                  "&:hover": {
                    opacity: 1,
                    color: layer.exposedAsInput ? "info.light" : "grey.200",
                    bgcolor: "action.hover"
                  }
                }}
              >
                <LoginIcon sx={{ fontSize: "1rem" }} />
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
                  flex: 1,
                  minHeight: 0,
                  width: "100%",
                  py: 0,
                  borderRadius: "0 0 4px 4px",
                  color: layer.exposedAsOutput ? "success.main" : "grey.400",
                  opacity: layer.exposedAsOutput ? 1 : 0.88,
                  "&:hover": {
                    opacity: 1,
                    color: layer.exposedAsOutput ? "success.light" : "grey.200",
                    bgcolor: "action.hover"
                  }
                }}
              >
                <LogoutIcon sx={{ fontSize: "1rem" }} />
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default memo(LayerItem);
