/**
 * LayerItem
 *
 * Renders an individual layer row within the layers panel, including
 * thumbnail, isolate, name (with inline rename), visibility (right), and
 * exposed input/output indicators. Supports drag-and-drop reordering.
 * Group layers show an expand/collapse toggle and a folder icon.
 */

import React, { memo } from "react";
import { IconButton } from "@mui/material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import LinkIcon from "@mui/icons-material/Link";
import LockIcon from "@mui/icons-material/Lock";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import type { Layer } from "./types";
import { summarizeLayerImageReference } from "./types";
import { getLayerDataImageUrl } from "./serialization";
import { resolveAssetUri } from "../node/output/hooks";
import {
  SKETCH_FONT,
  SKETCH_SPACING,
  SKETCH_TOOLTIP_DELAY_MS
} from "./sketchStyles";
import {
  FlexColumn,
  FlexRow,
  StatusIndicator,
  Text,
  Tooltip,
  Box,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import type { LayerStatus } from "@nodetool-ai/image-editor";
import { LAYER_STATUS_MAP } from "./Inspector/layerStatusMapping";

/** Base left padding for the layer row (px). 0 so the thumbnail sits flush
 *  with the row's left edge — the row background should not stick out past it. */
const BASE_PADDING = 0;
/** Additional left padding per nesting depth level (px). */
const DEPTH_INDENT = 20;

/** Group rows: override MUI IconButton default min touch target so rows stay compact. */
const GROUP_LAYER_ICON_BUTTON_SX = {
  padding: getSpacingPx(SPACING.micro),
  minWidth: 26,
  minHeight: 26,
  flexShrink: 0
} as const;

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
  onVisibilityButtonMouseDown: (
    e: React.PointerEvent<HTMLButtonElement>,
    layerId: string
  ) => void;
  onVisibilityButtonMouseEnter: (
    e: React.PointerEvent<HTMLButtonElement>,
    layerId: string
  ) => void;
  onVisibilityButtonClick: (
    e: React.MouseEvent<HTMLButtonElement>,
    layerId: string
  ) => void;
  onToggleIsolateLayer: (layerId: string) => void;
  onToggleExposedInput: (layerId: string) => void;
  onToggleExposedOutput: (layerId: string) => void;
  onContextMenu: (e: React.MouseEvent, layerId: string) => void;
  /**
   * Ctrl/Cmd + click on the thumbnail loads the layer alpha as a selection.
   * Adding Shift unions it with the current selection instead of replacing.
   */
  onThumbnailCtrlClick?: (layerId: string, mode: "replace" | "add") => void;
  onStartRename: (layerId: string, currentName: string) => void;
  onFinishRename: (layerId: string) => void;
  onEditNameChange: (value: string) => void;
  onCancelRename: () => void;
  onDragStart: (e: React.DragEvent, realIdx: number) => void;
  onDragOver: (e: React.DragEvent, realIdx: number) => void;
  onDrop: (realIdx: number, e: React.DragEvent) => void;
  onDragEnd: () => void;
  onToggleGroupCollapsed?: (groupId: string) => void;
  /**
   * Generation lifecycle status for layers backed by a workflow binding.
   * Omitted (undefined) for plain painted / mask / group rows so they render
   * with no status badge.
   */
  bindingStatus?: LayerStatus;
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
  onVisibilityButtonMouseDown,
  onVisibilityButtonMouseEnter,
  onVisibilityButtonClick,
  onToggleIsolateLayer,
  onToggleExposedInput: _onToggleExposedInput,
  onToggleExposedOutput: _onToggleExposedOutput,
  onContextMenu,
  onThumbnailCtrlClick,
  onStartRename,
  onFinishRename,
  onEditNameChange,
  onCancelRename,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onToggleGroupCollapsed,
  bindingStatus
}) => {
  const isGroup = layer.type === "group";
  // Resolve the image ref to a fetchable URL — a raw `asset://` scheme is
  // blocked by the page CSP when set directly as an <img src>.
  const layerImage = isGroup ? null : getLayerDataImageUrl(layer.data);
  const thumbnailSrc = layerImage ? resolveAssetUri(layerImage) : null;

  // Mockup-style sub-label under the name: blend mode + opacity (or MASK).
  const opacityPct = Math.round(layer.opacity * 100);
  const blendLabel = (layer.blendMode ?? "normal")
    .replace(/[-_]/g, " ")
    .toUpperCase();
  const layerSublabel = isMask
    ? `MASK · ${opacityPct}%`
    : `${blendLabel} · ${opacityPct}%`;
  const rowClass =
    `layer-item${isPaintTarget ? " active" : ""}` +
    `${isMask ? " mask-layer" : ""}` +
    `${isIsolated ? " isolated" : ""}` +
    `${isGroup ? " group-layer" : ""}` +
    `${layer.alphaLock ? " alpha-lock" : ""}` +
    `${layer.visible === false ? " layer-hidden" : ""}` +
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
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu(e, layer.id);
        }}
        onDragStart={(e) => {
          const t = e.target as HTMLElement;
          if (t.closest("button")) {
            e.preventDefault();
            return;
          }
          onDragStart(e, realIdx);
        }}
        onDragOver={(e) => onDragOver(e, realIdx)}
        onDrop={(e) => onDrop(realIdx, e)}
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
            aria-label={layer.collapsed ? "Expand group" : "Collapse group"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleGroupCollapsed?.(layer.id);
            }}
            sx={GROUP_LAYER_ICON_BUTTON_SX}
          >
            {layer.collapsed ? (
              <ChevronRightIcon sx={{ fontSize: "var(--fontSizeNormal)" }} />
            ) : (
              <ExpandMoreIcon sx={{ fontSize: "var(--fontSizeNormal)" }} />
            )}
          </IconButton>
        ) : null}

        {/* Thumbnail or group folder icon */}
        {isGroup ? (
          layer.collapsed ? (
            <FolderOutlinedIcon
              sx={{
                fontSize: "var(--fontSizeNormal)",
                color: isPaintTarget ? "primary.contrastText" : "grey.500",
                flexShrink: 0,
                mr: getSpacingPx(SPACING.micro),
                opacity: isPaintTarget ? 1 : 0.9
              }}
            />
          ) : (
            <FolderOpenOutlinedIcon
              sx={{
                fontSize: "var(--fontSizeNormal)",
                color: isPaintTarget ? "primary.contrastText" : "grey.400",
                flexShrink: 0,
                mr: getSpacingPx(SPACING.micro),
                opacity: isPaintTarget ? 1 : 0.95
              }}
            />
          )
        ) : thumbnailSrc ? (
          <img
            className="layer-thumbnail"
            src={thumbnailSrc}
            alt={layer.name}
            draggable={false}
            onClick={(e) => {
              if (e.ctrlKey || e.metaKey) {
                e.stopPropagation();
                onThumbnailCtrlClick?.(
                  layer.id,
                  e.shiftKey ? "add" : "replace"
                );
              }
            }}
          />
        ) : (
          <Box className="layer-thumbnail-empty" />
        )}

        {!isGroup && (
          <Tooltip
            title={isIsolated ? "Show all layers" : "Solo this layer"}
            placement="top"
            enterDelay={SKETCH_TOOLTIP_DELAY_MS}
            enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}
          >
            <IconButton
              size="small"
              aria-label={isIsolated ? "Show all layers" : "Solo this layer"}
              onClick={(e) => {
                e.stopPropagation();
                onToggleIsolateLayer(layer.id);
              }}
              sx={{
                padding: SKETCH_SPACING.sm,
                flexShrink: 0,
                color: isIsolated ? "warning.main" : "grey.500",
                opacity: isIsolated ? 1 : 0.75,
                "&:hover": {
                  opacity: 1,
                  color: isIsolated ? "warning.main" : "grey.300"
                }
              }}
            >
              <CenterFocusStrongIcon sx={{ fontSize: "var(--fontSizeBig)" }} />
            </IconButton>
          </Tooltip>
        )}

        {editingLayerId === layer.id ? (
          <input
            aria-label="Layer name"
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
              padding: `0 ${getSpacingPx(SPACING.micro)}`
            }}
          />
        ) : (
          <FlexColumn sx={{ flex: 1, minWidth: 0, gap: 0 }}>
            <FlexRow
              align="center"
              sx={{
                gap: SKETCH_SPACING.sm,
                minWidth: 0
              }}
            >
              {layer.imageReference ? (
                <Tooltip
                  title={summarizeLayerImageReference(layer.imageReference)}
                  placement="left"
                  enterDelay={SKETCH_TOOLTIP_DELAY_MS}
                  enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}
                >
                  <LinkIcon
                    sx={{
                      fontSize: "var(--fontSizeSmall)",
                      color: "info.light",
                      flexShrink: 0,
                      opacity: 0.85
                    }}
                  />
                </Tooltip>
              ) : null}
              {layer.alphaLock ? (
                <Tooltip
                  title="Lock transparency"
                  placement="top"
                  enterDelay={SKETCH_TOOLTIP_DELAY_MS}
                  enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}
                >
                  <LockIcon
                    sx={{
                      fontSize: "var(--fontSizeNormal)",
                      color: "info.main",
                      flexShrink: 0,
                      opacity: 0.95
                    }}
                  />
                </Tooltip>
              ) : null}
              <Text
                className="layer-name"
                onDoubleClick={() => onStartRename(layer.id, layer.name)}
                sx={{ minWidth: 0 }}
              >
                {layer.name}
              </Text>
              {bindingStatus && (
                <StatusIndicator
                  className="layer-status-badge"
                  status={LAYER_STATUS_MAP[bindingStatus].status}
                  pulse={LAYER_STATUS_MAP[bindingStatus].pulse}
                  tooltip={LAYER_STATUS_MAP[bindingStatus].label}
                  size="small"
                />
              )}
            </FlexRow>
            {!isGroup && (
              <Text
                className="layer-sublabel"
                sx={{
                  fontSize: SKETCH_FONT.xs,
                  color: "text.secondary",
                  lineHeight: 1.1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }}
              >
                {layerSublabel}
              </Text>
            )}
          </FlexColumn>
        )}

        {/* I/O indicator dots: visible only when input or output is hidden */}
        {!isGroup && (
          <FlexColumn
            align="center"
            justify="center"
            sx={{
              gap: 1,
              flexShrink: 0,
              width: 10,
              ml: getSpacingPx(SPACING.micro)
            }}
          >
            <Tooltip
              title={layer.exposedAsInput === false ? "Input hidden" : ""}
              placement="left"
              disableHoverListener={layer.exposedAsInput !== false}
              enterDelay={SKETCH_TOOLTIP_DELAY_MS}
              enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}
            >
              <Box
                sx={{
                  width: 5,
                  height: 5,
                  borderRadius: BORDER_RADIUS.circle,
                  bgcolor:
                    layer.exposedAsInput === false
                      ? "info.main"
                      : "transparent",
                  flexShrink: 0
                }}
              />
            </Tooltip>
            <Tooltip
              title={layer.exposedAsOutput === false ? "Output hidden" : ""}
              placement="left"
              disableHoverListener={layer.exposedAsOutput !== false}
              enterDelay={SKETCH_TOOLTIP_DELAY_MS}
              enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}
            >
              <Box
                sx={{
                  width: 5,
                  height: 5,
                  borderRadius: BORDER_RADIUS.circle,
                  bgcolor:
                    layer.exposedAsOutput === false
                      ? "success.main"
                      : "transparent",
                  flexShrink: 0
                }}
              />
            </Tooltip>
          </FlexColumn>
        )}

        {/* Discrete cell mirrors thumbnail column — see `.layer-visibility-cell` in panel styles */}
        <Box className="layer-visibility-cell">
          <IconButton
            size="small"
            disableRipple
            aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`}
            onPointerDown={(e) =>
              onVisibilityButtonMouseDown(e, layer.id)
            }
            onPointerEnter={(e) =>
              onVisibilityButtonMouseEnter(e, layer.id)
            }
            onPointerUp={(e) => {
              if (
                typeof e.currentTarget.hasPointerCapture === "function" &&
                e.currentTarget.hasPointerCapture(e.pointerId)
              ) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
            }}
            onPointerCancel={(e) => {
              if (
                typeof e.currentTarget.hasPointerCapture === "function" &&
                e.currentTarget.hasPointerCapture(e.pointerId)
              ) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
            }}
            onClick={(e) => onVisibilityButtonClick(e, layer.id)}
            sx={isGroup ? GROUP_LAYER_ICON_BUTTON_SX : { flexShrink: 0 }}
          >
            {layer.visible ? (
              <VisibilityIcon
                sx={{ fontSize: isGroup ? "0.9rem" : "1.125rem" }}
              />
            ) : (
              <VisibilityOffIcon
                sx={{
                  fontSize: isGroup ? "0.9rem" : "1.125rem",
                  opacity: 0.65
                }}
              />
            )}
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
};

export default memo(LayerItem);
