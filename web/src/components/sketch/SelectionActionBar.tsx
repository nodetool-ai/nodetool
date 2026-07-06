/**
 * SelectionActionBar — floating contextual toolbar anchored to the active
 * selection (Photoshop-style). Appears below (or above, when near the bottom
 * edge) the selection's bounding box and surfaces the selection-driven
 * actions: an Edit/Inpaint mode toggle with an inline form (prompt + model +
 * run) — Edit runs image-to-image on the whole frame, Inpaint regenerates only
 * the selected region using the selection as a mask — plus Remove (clear masked
 * pixels) and Refine edge (the existing RefineSelectionPopover). The model
 * picker filters to the chosen mode's models (inpainting vs image-to-image).
 *
 * Mounted inside SketchCanvasPresentation next to the TransformGizmo so it
 * shares the canvas container and stays viewport-aware (zoom / pan). Like the
 * gizmo, it subscribes to the store directly rather than taking props.
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject
} from "react";
import { keyframes } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import TuneIcon from "@mui/icons-material/Tune";

import {
  BORDER_RADIUS,
  CloseButton,
  EditorButton,
  FlexRow,
  LoadingSpinner,
  MOTION,
  reducedMotion,
  TextInput,
  Toast,
  Tooltip,
  Box
} from "../ui_primitives";
import ImageModelSelect from "../properties/ImageModelSelect";
import type { ImageModelValue } from "../../stores/ApiTypes";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useSketchStore } from "./state";
import { useSketchSessionStore } from "../../stores/sketch/SketchSessionStore";
import { getRememberedModel } from "../../stores/lastModelStore";
import { useSketchCanvasRefStore } from "../../stores/sketch/SketchCanvasRefStore";
import {
  useInpaintHere,
  type SelectionGenMode
} from "../../hooks/sketch/useInpaintHere";
import { useDirectGenJob } from "../../hooks/sketch/useDirectGenJob";
import { getSelectionBounds } from "./selection";
import type { Point } from "./types";
import { SKETCH_Z_INDEX } from "./sketchStyles";
import { RefineSelectionPopover } from "./tool-settings-panels/refine-selection";

/** Gap in CSS px between the selection edge and the bar. */
const BAR_GAP = 12;
/** Keep the bar this far inside the container edges. */
const EDGE_MARGIN = 8;

/**
 * Calm breathing pulse for the in-progress "generating" treatment, shared by
 * the action bar and the selection region so both read with the same motion
 * while a generation is in flight.
 */
const generatingPulse = keyframes`
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
`;

interface SelectionActionBarProps {
  containerRef: RefObject<HTMLDivElement | null>;
}

/** Most recent direct-gen binding's model, to seed the inpaint picker. */
function seedModelFromBindings(): { model: string; provider: string } {
  const bindings = Object.values(useSketchSessionStore.getState().bindings);
  const last = bindings
    .filter(
      (b) =>
        b.kind === "text-to-image" ||
        b.kind === "image-to-image" ||
        b.kind === "inpaint"
    )
    .pop();
  // Fall back to the cross-session remembered image model.
  const remembered = getRememberedModel("image");
  return {
    model: last?.model ?? remembered?.model ?? "",
    provider: last?.provider ?? remembered?.provider ?? ""
  };
}

/** Document-space point → container CSS px (mirrors TransformGizmo.docToCss). */
function docToCss(
  docX: number,
  docY: number,
  docW: number,
  docH: number,
  zoom: number,
  pan: Point,
  containerW: number,
  containerH: number
): Point {
  return {
    x: (docX - docW / 2) * zoom + containerW / 2 + pan.x,
    y: (docY - docH / 2) * zoom + containerH / 2 + pan.y
  };
}

const SelectionActionBarInner: React.FC<SelectionActionBarProps> = ({
  containerRef
}) => {
  const theme = useTheme();

  const selection = useSketchStore((s) => s.selection);
  const hasActiveSelection = useSketchStore((s) => s.hasActiveSelection);
  const isDrawing = useSketchStore((s) => s.isDrawing);
  const activeTool = useSketchStore((s) => s.activeTool);
  const setSelection = useSketchStore((s) => s.setSelection);
  const zoom = useSketchStore((s) => s.zoom);
  const pan = useSketchStore((s) => s.pan);
  const docW = useSketchStore((s) => s.document.canvas.width);
  const docH = useSketchStore((s) => s.document.canvas.height);

  const selectSettings = useSketchStore((s) => s.toolSettings.select);
  const setSelectSettings = useSketchStore((s) => s.setSelectSettings);
  const featherCurrentSelection = useSketchStore(
    (s) => s.featherCurrentSelection
  );
  const smoothCurrentSelectionBorders = useSketchStore(
    (s) => s.smoothCurrentSelectionBorders
  );
  const convertSelectionToBorderOutline = useSketchStore(
    (s) => s.convertSelectionToBorderOutline
  );

  // Only a bound editor session (which sets documentId and registers the
  // clearActiveLayer getter) can run the AI/remove actions. Gate on it so the
  // bar never shows in node/preview contexts without a backing document.
  const documentId = useSketchSessionStore((s) => s.documentId);
  const clearActiveLayer = useSketchCanvasRefStore((s) => s.clearActiveLayer);

  const { inpaintHere, isBusy: inpaintBusy } = useInpaintHere();
  const { start } = useDirectGenJob();

  const [mode, setMode] = useState<SelectionGenMode>("inpaint");
  const [prompt, setPrompt] = useState("");
  const [seed] = useState(seedModelFromBindings);
  const [model, setModel] = useState(seed.model);
  const [provider, setProvider] = useState(seed.provider);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // start() resolves as soon as the RPC is sent — the actual generation runs
  // for seconds afterwards and only surfaces through the binding status. Track
  // the kicked-off layer so the in-progress treatment lasts the whole job.
  const [jobLayerId, setJobLayerId] = useState<string | null>(null);
  const jobStatus = useSketchSessionStore((s) =>
    jobLayerId ? s.bindings[jobLayerId]?.status : undefined
  );
  const jobRunning = jobStatus === "queued" || jobStatus === "generating";

  const [refineOpen, setRefineOpen] = useState(false);
  const refineAnchorRef = useRef<HTMLButtonElement | null>(null);

  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      setContainerSize({
        w: entry.contentRect.width,
        h: entry.contentRect.height
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  const handleModelChange = useCallback((v: ImageModelValue) => {
    setModel(v.id);
    setProvider(v.provider);
  }, []);

  // Switching mode changes which models qualify (inpainting vs image-to-image),
  // so drop the current pick and let the user choose one valid for the new mode.
  const handleModeChange = useCallback(
    (next: SelectionGenMode) => {
      if (next === mode) return;
      setMode(next);
      setModel("");
      setProvider("");
      // Mask refinement only applies to inpaint; close it when leaving.
      if (next !== "inpaint") setRefineOpen(false);
    },
    [mode]
  );

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const result = await inpaintHere({
        prompt: prompt.trim(),
        provider,
        model,
        mode
      });
      if (!result.ok) {
        setJobLayerId(null);
        switch (result.reason) {
          case "no-selection":
            setError("Make a selection first.");
            break;
          case "no-document":
            setError("No image document is open.");
            break;
          case "no-canvas":
            setError("Canvas is not ready yet.");
            break;
          case "error":
            setError(result.message ?? "Generation failed.");
            break;
        }
        return;
      }
      setJobLayerId(result.layerId);
      await start(result.layerId);
      setPrompt("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
  }, [inpaintHere, start, prompt, provider, model, mode]);

  const handleRemove = useCallback(() => {
    if (clearActiveLayer) {
      clearActiveLayer();
    }
  }, [clearActiveLayer]);

  const handleClose = useCallback(() => {
    setSelection(null);
  }, [setSelection]);

  // inpaintBusy: composite/mask upload. generating: the start() await window.
  // jobRunning: the backend job, the long part. Any of them = in progress.
  const isBusy = inpaintBusy || generating || jobRunning;
  const generateDisabled = isBusy || !prompt.trim() || !model;

  // ── Visibility gate ──────────────────────────────────────────────────────
  const bounds =
    selection && hasActiveSelection ? getSelectionBounds(selection) : null;
  const ready =
    !!documentId &&
    hasActiveSelection &&
    !isDrawing &&
    activeTool !== "transform" &&
    containerSize.w > 0 &&
    containerSize.h > 0 &&
    !!bounds;

  // The refine popover keeps the selection live; don't unmount the bar (and
  // thus the anchor) while it's open even if a refine op momentarily empties
  // the mask. Bail only when there's genuinely nothing to show.
  if (!ready && !refineOpen) {
    return null;
  }

  // Anchor at the bottom-center of the selection bbox; flip above when the
  // selection sits low in the viewport so the bar stays on-screen.
  let leftCss = containerSize.w / 2;
  let topCss = containerSize.h / 2;
  let placeAbove = false;
  if (bounds) {
    const bottomMid = docToCss(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height,
      docW,
      docH,
      zoom,
      pan,
      containerSize.w,
      containerSize.h
    );
    const topMid = docToCss(
      bounds.x + bounds.width / 2,
      bounds.y,
      docW,
      docH,
      zoom,
      pan,
      containerSize.w,
      containerSize.h
    );
    placeAbove = bottomMid.y > containerSize.h - 64;
    leftCss = Math.min(
      Math.max(bottomMid.x, EDGE_MARGIN),
      containerSize.w - EDGE_MARGIN
    );
    topCss = placeAbove ? topMid.y - BAR_GAP : bottomMid.y + BAR_GAP;
  }

  // Bounding box of the selection in container CSS px, used to anchor the
  // in-progress glow over the region being generated.
  let regionStyle: { left: number; top: number; width: number; height: number } | null =
    null;
  if (bounds) {
    const topLeft = docToCss(
      bounds.x,
      bounds.y,
      docW,
      docH,
      zoom,
      pan,
      containerSize.w,
      containerSize.h
    );
    regionStyle = {
      left: topLeft.x,
      top: topLeft.y,
      width: bounds.width * zoom,
      height: bounds.height * zoom
    };
  }

  // Gently pulsing glow ring shared by the action bar and the selection region
  // while a generation is in flight. Reduced motion holds it at a steady glow.
  const ch = theme.vars.palette.primary.mainChannel;
  const generatingRing = {
    content: '""',
    position: "absolute" as const,
    inset: "-2px",
    borderRadius: "inherit",
    border: `1.5px solid rgba(${ch} / 0.9)`,
    boxShadow: `0 0 12px rgba(${ch} / 0.5)`,
    animation: `${generatingPulse} ${MOTION.pulse} infinite`,
    pointerEvents: "none",
    ...reducedMotion({ animation: "none", opacity: 0.7 })
  };

  return (
    <>
      {/* In-progress glow over the region being generated. Sits above the
          marching-ants overlay (which still outlines the exact selection) and
          just below the action bar. */}
      {isBusy && regionStyle && (
        <Box
          aria-hidden
          className="sketch-selection-processing"
          data-testid="sketch-selection-processing"
          sx={{
            position: "absolute",
            left: regionStyle.left,
            top: regionStyle.top,
            width: regionStyle.width,
            height: regionStyle.height,
            minWidth: 8,
            minHeight: 8,
            pointerEvents: "none",
            zIndex: SKETCH_Z_INDEX.overlay + 4,
            borderRadius: BORDER_RADIUS.sm,
            backgroundColor: `rgba(${ch} / 0.1)`,
            boxShadow: `inset 0 0 0 1px rgba(${ch} / 0.45)`,
            "&::after": generatingRing
          }}
        />
      )}
      <FlexRow
        className="sketch-selection-action-bar"
        data-testid="sketch-selection-action-bar"
        align="center"
        gap={0.5}
        sx={{
          position: "absolute",
          left: leftCss,
          top: topCss,
          transform: `translate(-50%, ${placeAbove ? "-100%" : "0"})`,
          zIndex: SKETCH_Z_INDEX.overlay + 5,
          pointerEvents: "auto",
          padding: theme.spacing(0.5),
          borderRadius: BORDER_RADIUS.md,
          backgroundColor: theme.vars.palette.grey[900],
          border: `1px solid ${theme.vars.palette.grey[700]}`,
          boxShadow: theme.shadows[6],
          whiteSpace: "nowrap",
          // Glowing rotating border while a generation is running. zIndex -1
          // keeps it behind the opaque bar so only the outset frame shows.
          ...(isBusy && {
            "&::after": { ...generatingRing, zIndex: -1 }
          })
        }}
        // Stop pointer-down from reaching the canvas so clicking the bar never
        // starts a stroke / new selection on the tool underneath.
        onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
      >
        {/* Mode toggle: Edit (image-to-image, no mask) vs Inpaint (selection
            as a mask). The picked mode drives the model filter and the run. */}
        <FlexRow gap={0} sx={{ flexShrink: 0, mr: 0.5 }}>
          <Tooltip
            title="Edit — transform the whole frame from your prompt (image-to-image, no mask)."
            delay={TOOLTIP_ENTER_DELAY}
            placement={placeAbove ? "top" : "bottom"}
          >
            <EditorButton
              variant={mode === "edit" ? "contained" : "outlined"}
              size="small"
              onClick={() => handleModeChange("edit")}
              data-testid="sketch-selection-mode-edit"
            >
              Edit
            </EditorButton>
          </Tooltip>
          <Tooltip
            title="Inpaint — regenerate only the selected region, using the selection as a mask."
            delay={TOOLTIP_ENTER_DELAY}
            placement={placeAbove ? "top" : "bottom"}
          >
            <EditorButton
              variant={mode === "inpaint" ? "contained" : "outlined"}
              size="small"
              onClick={() => handleModeChange("inpaint")}
              data-testid="sketch-selection-mode-inpaint"
            >
              Inpaint
            </EditorButton>
          </Tooltip>
        </FlexRow>

        {/* Inline prompt + model + run for the selected mode. */}
        <TextInput
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            mode === "inpaint"
              ? "Replace selection with…"
              : "Describe the edit…"
          }
          compact
          aria-label={mode === "inpaint" ? "Inpaint prompt" : "Edit prompt"}
          data-testid="sketch-selection-inpaint-prompt"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !generateDisabled) {
              e.preventDefault();
              void handleGenerate();
            }
          }}
          slotProps={{
            input: {
              startAdornment: (
                <AutoAwesomeIcon
                  fontSize="small"
                  sx={{ mr: 0.5, color: theme.vars.palette.primary.main }}
                />
              )
            }
          }}
          sx={{ width: 280 }}
        />

        <Box sx={{ width: 120, flexShrink: 0 }}>
          <ImageModelSelect
            value={model}
            task={mode === "inpaint" ? "inpainting" : "image_to_image"}
            onChange={handleModelChange}
          />
        </Box>

        <Tooltip
          title={
            mode === "inpaint"
              ? "Inpaint — regenerate the selected region using your prompt and the selection as a mask."
              : "Edit — transform the whole frame from your prompt."
          }
          delay={TOOLTIP_ENTER_DELAY}
          placement={placeAbove ? "top" : "bottom"}
        >
          <span>
            <EditorButton
              variant="contained"
              size="small"
              onClick={() => void handleGenerate()}
              disabled={generateDisabled}
              startIcon={
                isBusy ? (
                  <LoadingSpinner inline size={14} color="inherit" />
                ) : (
                  <AutoAwesomeIcon fontSize="small" />
                )
              }
              data-testid="sketch-selection-generate"
            >
              {mode === "inpaint" ? "Inpaint" : "Edit"}
            </EditorButton>
          </span>
        </Tooltip>

        <Tooltip
          title="Remove — clear the selected pixels from the active layer."
          delay={TOOLTIP_ENTER_DELAY}
          placement={placeAbove ? "top" : "bottom"}
        >
          <span>
            <EditorButton
              variant="outlined"
              size="small"
              onClick={handleRemove}
              disabled={!clearActiveLayer}
              startIcon={<DeleteOutlineIcon fontSize="small" />}
              data-testid="sketch-selection-remove"
            >
              Remove
            </EditorButton>
          </span>
        </Tooltip>

        {/* Mask options: shaping the selection only affects inpainting (the
            selection is the mask). Edit mode runs on the whole frame, so hide
            them there. */}
        {mode === "inpaint" && (
          <Tooltip
            title="Refine mask — feather, smooth, grow / shrink, or border the selection used for inpainting."
            delay={TOOLTIP_ENTER_DELAY}
            placement={placeAbove ? "top" : "bottom"}
          >
            <EditorButton
              ref={refineAnchorRef}
              variant="outlined"
              size="small"
              onClick={() => setRefineOpen((v) => !v)}
              startIcon={<TuneIcon fontSize="small" />}
              data-testid="sketch-selection-refine-edge"
            >
              Refine mask
            </EditorButton>
          </Tooltip>
        )}

        <CloseButton
          tooltip="Dismiss selection"
          tooltipPlacement={placeAbove ? "top" : "bottom"}
          onClick={handleClose}
          buttonSize="small"
          className="sketch-selection-close"
        />
      </FlexRow>

      {mode === "inpaint" && (
        <RefineSelectionPopover
          open={refineOpen}
          anchorEl={refineAnchorRef.current}
          onClose={() => setRefineOpen(false)}
          settings={selectSettings}
          onChange={setSelectSettings}
          onFeatherSelection={() => void featherCurrentSelection()}
          onSmoothSelectionBorders={() => void smoothCurrentSelectionBorders()}
          onConvertSelectionToBorder={convertSelectionToBorderOutline}
        />
      )}

      <Toast
        open={error !== null}
        message={error ?? ""}
        severity="warning"
        onClose={() => setError(null)}
        vertical="top"
        horizontal="center"
      />
    </>
  );
};

export const SelectionActionBar = memo(SelectionActionBarInner);
SelectionActionBar.displayName = "SelectionActionBar";

export default SelectionActionBar;
