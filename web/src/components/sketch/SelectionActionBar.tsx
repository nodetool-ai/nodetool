/**
 * SelectionActionBar — floating contextual toolbar anchored to the active
 * selection (Photoshop-style). Appears below (or above, when near the bottom
 * edge) the selection's bounding box and surfaces the selection-driven
 * actions: an inline Inpaint form (prompt + model + run, using the selection as
 * a mask), Remove (clear masked pixels), and Refine edge (the existing
 * RefineSelectionPopover).
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
import { useTheme } from "@mui/material/styles";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import TuneIcon from "@mui/icons-material/Tune";

import { Box } from "@mui/material";

import {
  BORDER_RADIUS,
  CloseButton,
  EditorButton,
  FlexRow,
  LoadingSpinner,
  TextInput,
  Toast,
  Tooltip
} from "../ui_primitives";
import ImageModelSelect from "../properties/ImageModelSelect";
import type { ImageModelValue } from "../../stores/ApiTypes";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useSketchStore } from "./state";
import { useSketchSessionStore } from "../../stores/sketch/SketchSessionStore";
import { useSketchCanvasRefStore } from "../../stores/sketch/SketchCanvasRefStore";
import { useInpaintHere } from "../../hooks/sketch/useInpaintHere";
import { useDirectGenJob } from "../../hooks/sketch/useDirectGenJob";
import { getSelectionBounds } from "./selection";
import type { Point } from "./types";
import { SKETCH_Z_INDEX } from "./sketchStyles";
import { RefineSelectionPopover } from "./tool-settings-panels/refine-selection";

/** Gap in CSS px between the selection edge and the bar. */
const BAR_GAP = 12;
/** Keep the bar this far inside the container edges. */
const EDGE_MARGIN = 8;

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
  return { model: last?.model ?? "", provider: last?.provider ?? "" };
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

  const [prompt, setPrompt] = useState("");
  const [seed] = useState(seedModelFromBindings);
  const [model, setModel] = useState(seed.model);
  const [provider, setProvider] = useState(seed.provider);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleInpaint = useCallback(async () => {
    setGenerating(true);
    try {
      const result = await inpaintHere({
        prompt: prompt.trim(),
        provider,
        model
      });
      if (!result.ok) {
        switch (result.reason) {
          case "no-selection":
            setError("Make a selection first to inpaint.");
            break;
          case "no-document":
            setError("No image document is open.");
            break;
          case "no-canvas":
            setError("Canvas is not ready yet.");
            break;
          case "error":
            setError(result.message ?? "Inpaint failed.");
            break;
        }
        return;
      }
      await start(result.layerId);
      setPrompt("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Inpaint failed.");
    } finally {
      setGenerating(false);
    }
  }, [inpaintHere, start, prompt, provider, model]);

  const handleRemove = useCallback(() => {
    if (clearActiveLayer) {
      clearActiveLayer();
    }
  }, [clearActiveLayer]);

  const handleClose = useCallback(() => {
    setSelection(null);
  }, [setSelection]);

  const isBusy = inpaintBusy || generating;
  const inpaintDisabled = isBusy || !prompt.trim() || !model;

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

  return (
    <>
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
          whiteSpace: "nowrap"
        }}
        // Stop pointer-down from reaching the canvas so clicking the bar never
        // starts a stroke / new selection on the tool underneath.
        onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
      >
        {/* Inline inpaint: prompt + model + run, using the selection as a mask. */}
        <TextInput
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Replace selection with…"
          compact
          aria-label="Inpaint prompt"
          data-testid="sketch-selection-inpaint-prompt"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !inpaintDisabled) {
              e.preventDefault();
              void handleInpaint();
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
            task="image_to_image"
            onChange={handleModelChange}
          />
        </Box>

        <Tooltip
          title="Inpaint — regenerate the selected region using your prompt and the selection as a mask."
          delay={TOOLTIP_ENTER_DELAY}
          placement={placeAbove ? "top" : "bottom"}
        >
          <span>
            <EditorButton
              variant="contained"
              size="small"
              onClick={() => void handleInpaint()}
              disabled={inpaintDisabled}
              startIcon={
                isBusy ? (
                  <LoadingSpinner inline size={14} color="inherit" />
                ) : (
                  <AutoAwesomeIcon fontSize="small" />
                )
              }
              data-testid="sketch-selection-inpaint"
            >
              Inpaint
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

        <Tooltip
          title="Refine edge — feather, smooth, grow / shrink, or border the selection."
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
            Refine edge
          </EditorButton>
        </Tooltip>

        <CloseButton
          tooltip="Dismiss selection"
          tooltipPlacement={placeAbove ? "top" : "bottom"}
          onClick={handleClose}
          buttonSize="small"
          className="sketch-selection-close"
        />
      </FlexRow>

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
