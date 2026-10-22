/**
 * LayerItem
 *
 * Renders an individual layer row within the layers panel, including
 * thumbnail, isolate, name (with inline rename), visibility (right), and
 * exposed input/output indicators. Supports drag-and-drop reordering.
 * Group layers show an expand/collapse toggle and a folder icon.
 */

import React, { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";

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
import { useResolvedMediaUri } from "../../hooks/useResolvedMediaUri";
import {
  FlexColumn,
  FlexRow,
  StatusIndicator,
  Text,
  Tooltip,
  Box,
  BORDER_RADIUS,
  SPACING,
  FONT_SIZE_SANS,
  getSpacingPx,
  ToolbarIconButton,
  InlineEditableText,
  MagicGenerationFill,
  ResponsiveImage,
  TreeRow,
  ICON_SIZE
} from "../ui_primitives";
import type { LayerStatus } from "@nodetool-ai/image-editor";
import { LAYER_STATUS_MAP } from "./Inspector/layerStatusMapping";
import { isFunction } from "../../utils/typePredicates";

/** Where a dragged layer will be inserted relative to the drop target. */
export type DropPosition = "before" | "after" | "into" | null;

interface LayerItemProps {
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
  /** True only for the row being renamed — keeps other rows' memo stable while typing. */
  isEditing: boolean;
  /**
   * Live rename input value; empty string for rows not being edited. The
   * draft now lives in `InlineEditableText`, which mirrors it back through
   * `onEditNameChange` — the prop remains part of the panel's contract.
   */
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
  isEditing,
  editName: _editName,
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
  const { t } = useTranslation();
  // The panel still owns the draft name, so mirror each keystroke up before
  // the commit reads it.
  const handleFinishRename = useCallback(() => {
    onFinishRename(layer.id);
  }, [onFinishRename, layer.id]);

  const handleEditingChange = useCallback(
    (next: boolean) => {
      if (!next) {
        onCancelRename();
      }
    },
    [onCancelRename]
  );

  const isGroup = layer.type === "group";
  // Whether the layer has a thumbnail at all; `ResponsiveImage` resolves the
  // locator itself, since a raw `asset://` is not a path any <img> can load.
  const layerImage = isGroup ? null : getLayerDataImageUrl(layer.data);
  const thumbnailSrc = useResolvedMediaUri(layerImage) ?? null;
  const isLayerGenerating =
    bindingStatus === "queued" || bindingStatus === "generating";

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
      <TreeRow
        data-focus-id={`sketch-layer-${layer.id}`}
        className={rowClass}
        depth={depth}
        baseIndent={SPACING.none}
        indentStep={SPACING.xl}
        selected={isRowSelected || isPaintTarget}
        interactive
        role="button"
        tabIndex={0}
        aria-label={layer.name}
        aria-pressed={isRowSelected || isPaintTarget}
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
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            e.currentTarget.click();
          }
        }}
        sx={{
          pr: SPACING.xs,
          py: SPACING.xs,
          ...dropIndicatorSx
        }}
      >
        {/* Group expand/collapse toggle */}
        {isGroup ? (
          <ToolbarIconButton
            icon={layer.collapsed ? <ChevronRightIcon /> : <ExpandMoreIcon />}
            tooltip={layer.collapsed ? t("i18n-next52.sketch.layer.expandGroup") : t("i18n-next52.sketch.layer.collapseGroup")}
            onClick={(e) => {
              e.stopPropagation();
              onToggleGroupCollapsed?.(layer.id);
            }}
            nodrag={false}
            sx={{ flexShrink: 0 }}
          />
        ) : null}

        {/* Thumbnail or group folder icon */}
        {isGroup ? (
          layer.collapsed ? (
            <FolderOutlinedIcon
              sx={{
                fontSize: ICON_SIZE.sm,
                color: isPaintTarget ? "primary.contrastText" : "grey.500",
                flexShrink: 0,
                mr: getSpacingPx(SPACING.micro),
                opacity: isPaintTarget ? 1 : 0.9
              }}
            />
          ) : (
            <FolderOpenOutlinedIcon
              sx={{
                fontSize: ICON_SIZE.sm,
                color: isPaintTarget ? "primary.contrastText" : "grey.400",
                flexShrink: 0,
                mr: getSpacingPx(SPACING.micro),
                opacity: isPaintTarget ? 1 : 0.95
              }}
            />
          )
        ) : (
          <FlexRow
            className="layer-thumbnail-wrapper"
            sx={{ position: "relative", flexShrink: 0 }}
          >
            {thumbnailSrc ? (
              <ResponsiveImage
                className="layer-thumbnail"
                locator={layerImage}
                preferThumbnail
                alt={layer.name}
                fit="contain"
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
            {isLayerGenerating && (
              <MagicGenerationFill borderRadius={BORDER_RADIUS.xs} />
            )}
          </FlexRow>
        )}

        {!isGroup && (
          <ToolbarIconButton
            icon={<CenterFocusStrongIcon />}
            tooltip={isIsolated ? t("i18n-next52.sketch.layer.showAll") : t("i18n-next52.sketch.layer.solo")}
            tooltipPlacement="top"
            active={isIsolated}
            onClick={(e) => {
              e.stopPropagation();
              onToggleIsolateLayer(layer.id);
            }}
            nodrag={false}
            sx={{ flexShrink: 0 }}
          />
        )}

        {isEditing ? (
          <InlineEditableText
            ariaLabel={t("i18n-next52.sketch.layer.name")}
            value={layer.name}
            editing
            onDraftChange={onEditNameChange}
            onEditingChange={handleEditingChange}
            onCommit={handleFinishRename}
            onCancel={onCancelRename}
            sx={{ flex: 1, fontSize: "inherit" }}
          />
        ) : (
          <FlexColumn sx={{ flex: 1, minWidth: 0, gap: 0 }}>
            <FlexRow
              align="center"
              sx={{
                gap: SPACING.xs,
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
                      fontSize: ICON_SIZE.xs,
                      color: "info.light",
                      flexShrink: 0,
                      opacity: 0.85
                    }}
                  />
                </Tooltip>
              ) : null}
              {layer.alphaLock ? (
                <Tooltip
                  title={t("i18n-next52.sketch.layer.lockTransparency")}
                  placement="top"
                >
                  <LockIcon
                    sx={{
                      fontSize: ICON_SIZE.sm,
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
                  tooltip={t(`i18n-next52.sketch.statuses.${bindingStatus}`)}
                  size="small"
                />
              )}
            </FlexRow>
            {!isGroup && (
              <Text
                className="layer-sublabel"
                sx={{
                  fontSize: FONT_SIZE_SANS.caption,
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
              title={layer.exposedAsInput === false ? t("i18n-next52.sketch.layer.inputHidden") : ""}
              placement="left"
              disableHoverListener={layer.exposedAsInput !== false}
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
              title={layer.exposedAsOutput === false ? t("i18n-next52.sketch.layer.outputHidden") : ""}
              placement="left"
              disableHoverListener={layer.exposedAsOutput !== false}
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
          <ToolbarIconButton
            icon={layer.visible ? <VisibilityIcon /> : <VisibilityOffIcon />}
            tooltip={layer.visible ? t("i18n-next52.sketch.layer.hide") : t("i18n-next52.sketch.layer.show")}
            ariaLabel={`${layer.visible ? t("i18n-next52.sketch.layer.hide") : t("i18n-next52.sketch.layer.show")} ${layer.name}`}
            disableRipple
            nodrag={false}
            onPointerDown={(e) =>
              onVisibilityButtonMouseDown(e, layer.id)
            }
            onPointerEnter={(e) =>
              onVisibilityButtonMouseEnter(e, layer.id)
            }
            onPointerUp={(e) => {
              if (
                isFunction(e.currentTarget.hasPointerCapture) &&
                e.currentTarget.hasPointerCapture(e.pointerId)
              ) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
            }}
            onPointerCancel={(e) => {
              if (
                isFunction(e.currentTarget.hasPointerCapture) &&
                e.currentTarget.hasPointerCapture(e.pointerId)
              ) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
            }}
            onClick={(e) => onVisibilityButtonClick(e, layer.id)}
            sx={{ flexShrink: 0 }}
          />
        </Box>
      </TreeRow>
    </Box>
  );
};

export default memo(LayerItem);
