/**
 * The Sketch Pad's working parts — the half that pulls in the sketch editor, so
 * `SketchPadWidget` can keep it out of the bundle of every app without a pad.
 *
 * Everything below the toolbar is the sketch editor: `useEditorSession` owns
 * the session (history, layers, stroke lifecycle, export), `SketchCanvasPane`
 * is the same canvas the editor mounts, and the four tools are the editor's own
 * definitions. What the pad adds is the binding — each committed change
 * flattens the document to a PNG and writes `{type: "image", uri}`, the value
 * an Image Input writes — so a workflow reads a drawing the way it reads an
 * uploaded photo.
 *
 * The full `SketchEditor` deliberately does not mount here. Its layers panel,
 * assistant, generation popover and workflow-freshness check all belong to a
 * document that lives in the library; a pad's drawing lives in the app's state
 * and nowhere else.
 */
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import RedoIcon from "@mui/icons-material/Redo";
import UndoIcon from "@mui/icons-material/Undo";

import {
  Box,
  Caption,
  FlexColumn,
  FlexRow,
  IconButton,
  Slider,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  BORDER_RADIUS,
  SPACING
} from "../../ui_primitives";
import {
  SketchCanvasPane,
  SKETCH_PRESET_SWATCHES,
  getToolDefinition,
  useColorIntentRouter,
  useEditorSession,
  useResolvedToolSettings,
  useSketchStore,
  useToolChromeActions,
  type SketchTool
} from "../../sketch";
import { SketchProvider } from "../../../stores/sketch/SketchInstance";
import { useWidgetRuntime } from "./useWidgetRuntime";
import type { SketchPadWidgetProps } from "./SketchPadWidget";
import {
  createSketchPadDocument,
  padInkColor,
  sketchPadImageUri,
  sketchPadValue
} from "./sketchPadDocument";
import {
  clampPadSide,
  DEFAULT_PAD_HEIGHT,
  DEFAULT_PAD_WIDTH,
  type SketchPadBackground
} from "./sketchPadOptions";

/** The pad's tools: paint, erase, flood-fill. Nothing that needs a layer stack. */
const PAD_TOOLS: readonly SketchTool[] = ["brush", "pencil", "eraser", "fill"];

/** Fill has no radius, so the size slider only follows the other three. */
const SIZED_TOOLS: readonly SketchTool[] = ["brush", "pencil", "eraser"];

const MIN_STROKE_SIZE = 1;
const MAX_STROKE_SIZE = 96;

/**
 * How long after a committed change the pad flattens. An undo restores layer
 * pixels from a PNG snapshot, which the canvas decodes asynchronously, so
 * reading the composite in the same tick can catch the pre-undo image.
 */
const FLATTEN_DELAY_MS = 200;

const SWATCH_SIZE = 16;
const SIZE_SLIDER_WIDTH = 96;

const swatchStyles = (color: string, selected: boolean) => ({
  width: SWATCH_SIZE,
  height: SWATCH_SIZE,
  padding: 0,
  borderRadius: BORDER_RADIUS.circle,
  backgroundColor: color,
  border: "2px solid",
  borderColor: selected ? "primary.main" : "divider",
  "&:hover": { backgroundColor: color, borderColor: "primary.light" }
});

interface PadToolbarProps {
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
}

/**
 * Tool, color and size, read straight off the sketch store — the same
 * subscriptions the editor's own tool rail makes, minus the tools a pad has no
 * layer stack for.
 */
const PadToolbar: React.FC<PadToolbarProps> = ({ onUndo, onRedo, onClear }) => {
  const activeTool = useSketchStore((s) => s.activeTool);
  const canUndo = useSketchStore((s) => s.canUndo());
  const canRedo = useSketchStore((s) => s.canRedo());
  const setActiveTool = useSketchStore((s) => s.setActiveTool);
  const foregroundColor = useSketchStore((s) => s.foregroundColor);
  const setColor = useColorIntentRouter();
  const toolSettings = useResolvedToolSettings();
  const { setBrushSettings, setPencilSettings, setEraserSettings } =
    useToolChromeActions();

  const size =
    activeTool === "eraser"
      ? toolSettings.eraser.size
      : activeTool === "pencil"
        ? toolSettings.pencil.size
        : toolSettings.brush.size;

  const setSize = (next: number) => {
    if (activeTool === "eraser") {
      setEraserSettings({ size: next });
    } else if (activeTool === "pencil") {
      setPencilSettings({ size: next });
    } else {
      setBrushSettings({ size: next });
    }
  };

  return (
    <FlexRow
      align="center"
      gap={SPACING.sm}
      sx={{
        flexWrap: "wrap",
        px: SPACING.sm,
        py: SPACING.xs,
        borderBottom: "1px solid",
        borderColor: "divider"
      }}
    >
      <ToggleButtonGroup
        exclusive
        size="small"
        value={activeTool}
        onChange={(_, tool) => {
          if (tool) setActiveTool(tool as SketchTool);
        }}
      >
        {PAD_TOOLS.map((tool) => {
          const { label, Icon } = getToolDefinition(tool);
          return (
            <ToggleButton key={tool} value={tool} aria-label={label}>
              <Tooltip title={label}>
                <Icon fontSize="small" />
              </Tooltip>
            </ToggleButton>
          );
        })}
      </ToggleButtonGroup>

      <FlexRow align="center" gap={SPACING.xs} sx={{ flexWrap: "wrap" }}>
        {SKETCH_PRESET_SWATCHES.map((color) => (
          <IconButton
            key={color}
            aria-label={`Color ${color}`}
            onClick={() => setColor(color)}
            sx={swatchStyles(color, foregroundColor === color)}
          />
        ))}
      </FlexRow>

      {SIZED_TOOLS.includes(activeTool) ? (
        <Slider
          aria-label="Stroke size"
          size="small"
          value={size}
          min={MIN_STROKE_SIZE}
          max={MAX_STROKE_SIZE}
          valueLabelDisplay="auto"
          onChange={(_, next) =>
            setSize(Array.isArray(next) ? next[0] : next)
          }
          sx={{ width: SIZE_SLIDER_WIDTH, mx: SPACING.sm }}
        />
      ) : null}

      <FlexRow align="center" gap={SPACING.xs} sx={{ marginLeft: "auto" }}>
        <Tooltip title="Undo">
          <span>
            <IconButton
              size="small"
              aria-label="Undo"
              disabled={!canUndo}
              onClick={onUndo}
            >
              <UndoIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Redo">
          <span>
            <IconButton
              size="small"
              aria-label="Redo"
              disabled={!canRedo}
              onClick={onRedo}
            >
              <RedoIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Clear">
          <IconButton size="small" aria-label="Clear" onClick={onClear}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </FlexRow>
    </FlexRow>
  );
};

const PadSurface: React.FC<SketchPadWidgetProps> = (props) => {
  const { value, setValue, emit, designMode } = useWidgetRuntime({
    id: props.id,
    bindingMode: "write",
    binding: props.binding,
    events: props.events
  });

  const width = clampPadSide(props.width, DEFAULT_PAD_WIDTH);
  const height = clampPadSide(props.height, DEFAULT_PAD_HEIGHT);
  const background: SketchPadBackground =
    props.background === "transparent" ? "transparent" : "white";

  // Only what the binding held when the pad mounted seeds the canvas: the
  // values it writes from then on are its own output, and re-seeding from them
  // would rebuild the document under the user's hand mid-drawing.
  const seedRef = useRef<string | null>(sketchPadImageUri(value));
  const initialDocument = useMemo(
    () =>
      createSketchPadDocument({
        width,
        height,
        background,
        image: seedRef.current
      }),
    [width, height, background]
  );

  const interactive = !designMode && !props.disabled;

  const handleExportImage = useCallback(
    (dataUrl: string) => {
      if (!dataUrl) return;
      setValue(sketchPadValue(dataUrl));
      // A finished stroke is both the live change and the settled value, so a
      // pad drives "live" and "on release" pacing alike.
      emit("change");
      emit("change", "commit");
    },
    [setValue, emit]
  );

  const session = useEditorSession({
    initialDocument,
    onExportImage: handleExportImage
  });
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Nothing reaches the binding until the user acts on the pad. A pad that
  // published its blank canvas on mount would fire its change event — and any
  // run wired to it — before anyone touched the app.
  const flattenTimer = useRef<number | null>(null);
  const scheduleFlatten = useCallback(() => {
    if (flattenTimer.current !== null) {
      window.clearTimeout(flattenTimer.current);
    }
    flattenTimer.current = window.setTimeout(() => {
      flattenTimer.current = null;
      sessionRef.current.canvasActions.syncSketchOutputsNow();
    }, FLATTEN_DELAY_MS);
  }, []);
  useEffect(
    () => () => {
      if (flattenTimer.current !== null) {
        window.clearTimeout(flattenTimer.current);
      }
    },
    []
  );

  const handleStrokeEnd = useCallback<typeof session.canvasActions.handleStrokeEnd>(
    (layerId, data, committedBounds, options) => {
      sessionRef.current.canvasActions.handleStrokeEnd(
        layerId,
        data,
        committedBounds,
        options
      );
      scheduleFlatten();
    },
    [scheduleFlatten]
  );

  const handleUndo = useCallback(() => {
    sessionRef.current.handleUndo();
    scheduleFlatten();
  }, [scheduleFlatten]);

  const handleRedo = useCallback(() => {
    sessionRef.current.handleRedo();
    scheduleFlatten();
  }, [scheduleFlatten]);

  const handleClear = useCallback(() => {
    sessionRef.current.canvasActions.handleClearLayer();
    scheduleFlatten();
  }, [scheduleFlatten]);

  const canvasReady = session.canvasReady;

  // The pad's box is smaller than its canvas more often than not, so start at
  // the zoom that shows the whole thing.
  useEffect(() => {
    if (!canvasReady) return;
    const frame = window.requestAnimationFrame(() => {
      sessionRef.current.canvasActions.handleZoomFit();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [canvasReady, width, height]);

  // The document seeds each tool's own color; the foreground swatch is separate
  // store state, so point it at the same ink.
  const setForegroundColor = useSketchStore((s) => s.setForegroundColor);
  useEffect(() => {
    setForegroundColor(padInkColor(background));
  }, [background, setForegroundColor]);

  return (
    <FlexColumn gap={SPACING.micro} fullWidth>
      {props.label ? <Caption color="secondary">{props.label}</Caption> : null}
      <FlexColumn
        fullWidth
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: BORDER_RADIUS.md,
          overflow: "hidden",
          opacity: props.disabled ? 0.6 : 1
        }}
      >
        <PadToolbar
          onUndo={handleUndo}
          onRedo={handleRedo}
          onClear={handleClear}
        />
        <Box
          sx={{
            position: "relative",
            width: "100%",
            height,
            // In the builder the canvas would capture the pointer the editor
            // needs for selecting and dragging the widget.
            pointerEvents: interactive ? "auto" : "none"
          }}
        >
          <SketchCanvasPane
            canvasReady={session.canvasReady}
            canvasRef={session.canvasRef}
            document={session.document}
            activeTool={session.activeTool}
            interactionTool={session.interactionTool}
            onZoomChange={session.canvasStore.setZoom}
            onPanChange={session.canvasStore.setPan}
            onStrokeStart={session.canvasActions.handleStrokeStart}
            onStrokeEnd={handleStrokeEnd}
            onCanvasLeave={session.canvasActions.flushLayerThumbnailsWhenIdle}
            onLayerTransformChange={
              session.canvasActions.handleCommitLayerTransform
            }
            onLayerContentBoundsChange={session.layerStore.setLayerContentBounds}
            onBrushSizeChange={session.colorActions.handleBrushSizeChange}
            onEyedropperPick={session.colorActions.handleEyedropperPick}
            segmentation={session.segmentation}
          />
        </Box>
      </FlexColumn>
    </FlexColumn>
  );
};

/**
 * Each pad owns an isolated bundle of sketch stores, so two pads in one app
 * keep separate documents, histories and viewports.
 */
export const SketchPadSurface: React.FC<SketchPadWidgetProps> = (props) => (
  <SketchProvider>
    <PadSurface {...props} />
  </SketchProvider>
);

export default SketchPadSurface;
