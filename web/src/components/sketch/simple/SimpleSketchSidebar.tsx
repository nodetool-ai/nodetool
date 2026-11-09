/**
 * SimpleSketchSidebar — Simple mode's right column: the layer list and the
 * active layer's prompt card. Expert mode's Layers, Properties, Color,
 * History and Canvas size panels stay out of view until the user switches.
 */

import React, { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/AddOutlined";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import RefreshIcon from "@mui/icons-material/Refresh";
import VisibilityIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOffOutlined";
import type { LayerWorkflowBinding } from "@nodetool-ai/image-editor";

import {
  BORDER_RADIUS,
  Box,
  Caption,
  EYEBROW,
  EditorButton,
  FlexColumn,
  FlexRow,
  ICON_SIZE,
  MagicGenerationFill,
  ResponsiveImage,
  SPACING,
  ScrollArea,
  SelectableListItem,
  Text,
  TextArea,
  ToolbarIconButton,
  getSpacingPx
} from "../../ui_primitives";
import { useSketchStore } from "../state/useSketchStore";
import { useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";
import { useDirectGenJob } from "../../../hooks/sketch/useDirectGenJob";
import { getDirectGenBlocker } from "../../../lib/sketch/directGenValidation";
import { useLayerDragDrop, type LayerDropPosition } from "../hooks/useLayerDragDrop";
import { getLayerDataImageUrl } from "../serialization";
import type { Layer } from "../types";

/** Width of the column beside the canvas, in px. */
export const SIMPLE_SIDEBAR_WIDTH = 300;

const THUMBNAIL_WIDTH = 56;
const THUMBNAIL_HEIGHT = 40;

const isRunning = (binding: LayerWorkflowBinding | undefined): boolean =>
  binding?.status === "queued" || binding?.status === "generating";

interface SimpleLayerRowProps {
  layer: Layer;
  active: boolean;
  generated: boolean;
  generating: boolean;
  dropPosition: LayerDropPosition | null;
  onSelect: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, layerId: string) => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>, layerId: string) => void;
  onDragEnd: () => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onTouchDrag: (event: React.PointerEvent<SVGSVGElement>, layerId: string) => void;
}

const SimpleLayerRow = memo(function SimpleLayerRow({
  layer,
  active,
  generated,
  generating,
  dropPosition,
  onSelect,
  onToggleVisibility,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  onTouchDrag
}: SimpleLayerRowProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const image = getLayerDataImageUrl(layer.data);
  const hidden = layer.visible === false;
  const visibilityLabel = hidden
    ? t("i18n-next4.sketch.simple.showLayer", { name: layer.name })
    : t("i18n-next4.sketch.simple.hideLayer", { name: layer.name });

  return (
    <SelectableListItem
      className="sketch-simple__layer"
      data-testid="sketch-simple-layer"
      data-sketch-layer-id={layer.id}
      selected={active}
      aria-label={layer.name}
      onClick={() => onSelect(layer.id)}
      draggable
      onDragStart={(event) => onDragStart(event, layer.id)}
      onDragOver={(event) => onDragOver(event, layer.id)}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
      paddingX={SPACING.sm}
      paddingY={SPACING.sm}
      gap={SPACING.md}
      sx={{
        border: `1px solid ${active ? theme.vars.palette.primary.main : theme.vars.palette.divider}`,
        borderRadius: BORDER_RADIUS.lg,
        cursor: "grab",
        boxShadow: dropPosition === "before" || dropPosition === "after"
          ? `inset 0 ${dropPosition === "before" ? "" : "-"}${getSpacingPx(SPACING.micro)} 0 ${theme.vars.palette.primary.main}`
          : undefined,
        backgroundColor: active
          ? `rgba(${theme.vars.palette.primary.mainChannel} / 0.12)`
          : theme.vars.palette.background.paper
      }}
    >
      <DragIndicatorIcon
        onPointerDown={(event) => onTouchDrag(event, layer.id)}
        onPointerMove={(event) => onTouchDrag(event, layer.id)}
        onPointerUp={(event) => onTouchDrag(event, layer.id)}
        onPointerCancel={(event) => onTouchDrag(event, layer.id)}
        onLostPointerCapture={(event) => onTouchDrag(event, layer.id)}
        sx={{
          fontSize: ICON_SIZE.sm,
          color: "text.secondary",
          flexShrink: 0,
          touchAction: "none"
        }}
      />
      <Box
        sx={{
          position: "relative",
          flexShrink: 0,
          width: THUMBNAIL_WIDTH,
          height: THUMBNAIL_HEIGHT,
          borderRadius: BORDER_RADIUS.md,
          overflow: "hidden",
          backgroundColor: theme.vars.palette.action.hover,
          opacity: hidden ? 0.4 : 1
        }}
      >
        {image && (
          <ResponsiveImage
            locator={image}
            preferThumbnail
            alt=""
            fit="contain"
            draggable={false}
            sx={{ width: "100%", height: "100%" }}
          />
        )}
        {generating && <MagicGenerationFill borderRadius={BORDER_RADIUS.md} />}
      </Box>
      <Text
        size="normal"
        weight={500}
        truncate
        color={hidden ? "secondary" : undefined}
        sx={{ flex: 1, minWidth: 0 }}
      >
        {layer.name}
      </Text>
      {generated && (
        <AutoAwesomeIcon
          aria-label={t("i18n-next4.sketch.simple.generatedLayer")}
          sx={{ fontSize: ICON_SIZE.sm, color: "primary.main", flexShrink: 0 }}
        />
      )}
      <ToolbarIconButton
        icon={hidden ? <VisibilityOffIcon /> : <VisibilityIcon />}
        tooltip={visibilityLabel}
        ariaLabel={visibilityLabel}
        nodrag={false}
        onClick={(event: React.MouseEvent) => {
          event.stopPropagation();
          onToggleVisibility(layer.id);
        }}
      />
    </SelectableListItem>
  );
});

interface LayerPromptCardProps {
  layer: Layer;
  binding: LayerWorkflowBinding;
  /** Omitted where Expert mode is unavailable (the mobile layout). */
  onOpenExpert?: () => void;
}

/** The active layer's prompt with one button to generate it again. */
const LayerPromptCard = memo(function LayerPromptCard({
  layer,
  binding,
  onOpenExpert
}: LayerPromptCardProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const patchBinding = useSketchSessionStore((s) => s.patchBinding);
  const { start, cancel } = useDirectGenJob();
  const workflowBound = !binding.kind || binding.kind === "workflow";
  const running = isRunning(binding);
  const prompt = binding.prompt ?? "";

  const blocker = getDirectGenBlocker(binding);

  return (
    <FlexColumn
      className="sketch-simple__prompt"
      data-testid="sketch-simple-prompt"
      gap={SPACING.md}
      sx={{
        p: SPACING.lg,
        border: `1px solid ${theme.vars.palette.divider}`,
        borderRadius: BORDER_RADIUS.lg,
        backgroundColor: theme.vars.palette.background.paper
      }}
    >
      <FlexRow align="center" gap={SPACING.xs} sx={{ color: "primary.main" }}>
        <AutoAwesomeIcon sx={{ fontSize: ICON_SIZE.sm }} />
        <Text size="small" weight={600} color="inherit">
          {t("i18n-next4.sketch.simple.layerPrompt")}
        </Text>
      </FlexRow>
      {workflowBound ? (
        <>
          <Caption color="secondary">
            {t("i18n-next4.sketch.simple.workflowLayer", { name: layer.name })}
          </Caption>
          {onOpenExpert && (
            <EditorButton size="small" variant="outlined" onClick={onOpenExpert}>
              {t("i18n-next4.sketch.simple.openInExpert")}
            </EditorButton>
          )}
        </>
      ) : (
        <>
          <TextArea
            value={prompt}
            onChange={(value) => patchBinding(layer.id, { prompt: value })}
            placeholder={t("screens4_25.sketch.directGen.promptPlaceholder")}
            aria-label={t("screens4_25.sketch.directGen.promptLabel")}
            minRows={2}
            maxRows={8}
          />
          {running ? (
            <EditorButton
              size="small"
              variant="text"
              color="inherit"
              onClick={() => cancel(layer.id)}
            >
              {t("screens4_25.sketch.directGen.cancel")}
            </EditorButton>
          ) : (
            <EditorButton
              size="small"
              variant="contained"
              startIcon={<RefreshIcon />}
              disabled={blocker !== null}
              disabledReason={blocker ? t(blocker.labelKey) : undefined}
              onClick={() => void start(layer.id)}
              data-testid="sketch-simple-regenerate"
            >
              {binding.currentAssetId
                ? t("i18n-next4.sketch.simple.regenerateLayer")
                : t("i18n-next4.sketch.simple.generateLayer")}
            </EditorButton>
          )}
          {binding.status === "failed" && (
            <Caption color="error">
              {t("screens4_25.sketch.directGen.generationFailed")}
            </Caption>
          )}
        </>
      )}
    </FlexColumn>
  );
});

export interface SimpleSketchSidebarProps {
  onToggleVisibility: (layerId: string) => void;
  onReorderLayers: (fromIndex: number, toIndex: number) => void;
  onAddLayer: () => void;
  /** Opens Expert mode. Omit it where Expert mode is unavailable. */
  onOpenExpert?: () => void;
  /** Fill a bottom sheet instead of drawing a fixed-width column. */
  sheet?: boolean;
}

export const SimpleSketchSidebar = memo(function SimpleSketchSidebar({
  onToggleVisibility,
  onReorderLayers,
  onAddLayer,
  onOpenExpert,
  sheet = false
}: SimpleSketchSidebarProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const layers = useSketchStore((s) => s.document.layers);
  const activeLayerId = useSketchStore((s) => s.document.activeLayerId);
  const setActiveLayer = useSketchStore((s) => s.setActiveLayer);
  const panelsHidden = useSketchStore((s) => s.panelsHidden);
  const bindings = useSketchSessionStore((s) => s.bindings);
  const { dropTarget, layerListRef, onDragStart, onDragOver, onDragEnd, onDrop, onTouchDrag } =
    useLayerDragDrop(layers, onReorderLayers);

  // Topmost first, as the canvas stacks them. Groups are Expert-mode
  // structure, so their children list flat here.
  const rows = useMemo(
    () => layers.filter((layer) => layer.type !== "group").reverse(),
    [layers]
  );
  const activeLayer = rows.find((layer) => layer.id === activeLayerId);
  const activeBinding = activeLayerId ? bindings[activeLayerId] : undefined;
  const handleSelect = useCallback(
    (layerId: string) => setActiveLayer(layerId),
    [setActiveLayer]
  );
  if (panelsHidden && !sheet) {
    return null;
  }

  return (
    <FlexColumn
      className="sketch-simple__sidebar"
      data-testid="sketch-simple-sidebar"
      gap={0}
      sx={
        sheet
          ? { minHeight: 0 }
          : {
              width: SIMPLE_SIDEBAR_WIDTH,
              flexShrink: 0,
              minHeight: 0,
              borderLeft: `1px solid ${theme.vars.palette.divider}`,
              backgroundColor: theme.vars.palette.background.default
            }
      }
    >
      <ScrollArea sx={{ flex: 1, minHeight: 0 }}>
        <FlexColumn gap={SPACING.lg} sx={{ p: SPACING.lg }}>
          <FlexRow align="center" justify="space-between">
            <Text size="small" weight={600} color="secondary" sx={EYEBROW}>
              {t("i18n-next4.sketch.layers")}
            </Text>
            <ToolbarIconButton
              icon={<AddIcon />}
              tooltip={t("i18n-next4.sketch.simple.newLayer")}
              ariaLabel={t("i18n-next4.sketch.simple.newLayer")}
              nodrag={false}
              onClick={onAddLayer}
              data-testid="sketch-simple-add-layer"
            />
          </FlexRow>
          <FlexColumn
            ref={layerListRef}
            gap={SPACING.md}
            role="list"
            aria-label={t("i18n-next4.sketch.layers")}
          >
            {rows.map((layer) => (
              <Box key={layer.id} role="listitem">
                <SimpleLayerRow
                  layer={layer}
                  active={layer.id === activeLayerId}
                  generated={bindings[layer.id] !== undefined}
                  generating={isRunning(bindings[layer.id])}
                  dropPosition={dropTarget?.layerId === layer.id ? dropTarget.position : null}
                  onSelect={handleSelect}
                  onToggleVisibility={onToggleVisibility}
                  onDragStart={onDragStart}
                  onDragOver={onDragOver}
                  onDragEnd={onDragEnd}
                  onDrop={onDrop}
                  onTouchDrag={onTouchDrag}
                />
              </Box>
            ))}
          </FlexColumn>
          {activeLayer && activeBinding && (
            <LayerPromptCard
              layer={activeLayer}
              binding={activeBinding}
              onOpenExpert={onOpenExpert}
            />
          )}
        </FlexColumn>
      </ScrollArea>
    </FlexColumn>
  );
});
