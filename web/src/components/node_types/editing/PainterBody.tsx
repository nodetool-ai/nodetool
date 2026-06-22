/** @jsxImportSource @emotion/react */
/**
 * PainterBody — bespoke body for `nodetool.image.Painter` (plan §9.E9, PR 17).
 *
 * Self-contained paint-on-image surface. The Painter node persists its
 * painted state as a base64 PNG in the `mask_data` property; the
 * backend decodes that and emits it on the `mask` output.
 *
 * Layout:
 *   ┌────────────────────────────────────┬─ side toolbar ─┐
 *   │  source image + paint canvas       │  size · op · col│
 *   │  (full-bleed, paintable)           │  brush / eraser │
 *   └────────────────────────────────────┴─────────────────┘
 *   bottom: undo · redo · background fade · clear
 *
 * The paint canvas is sized to the source image's natural dimensions
 * (or a 512×512 placeholder when no image is connected). All strokes
 * happen in source-pixel space so the resulting mask aligns with the
 * downstream pipeline. Pointer coordinates are mapped via the rendered
 * canvas's bounding rect.
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import BrushIcon from "@mui/icons-material/Brush";
import SvgIcon, { type SvgIconProps } from "@mui/material/SvgIcon";

// Inline SVG so we don't depend on an icon-set that ships an eraser glyph.
// Stylized rubber/wedge eraser at the standard 24px MUI viewBox.
const EraserIcon = (props: SvgIconProps) => (
  <SvgIcon {...props}>
    <path d="M16.24 3.56l4.24 4.24a2 2 0 0 1 0 2.83l-9.9 9.9a2 2 0 0 1-2.83 0l-4.24-4.24a2 2 0 0 1 0-2.83l9.9-9.9a2 2 0 0 1 2.83 0zM6.71 14.12l3.18 3.18 3.18-3.18-3.18-3.18-3.18 3.18zM3 21h18v-2H3v2z" />
  </SvgIcon>
);
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import RestartAltIcon from "@mui/icons-material/RestartAlt";

import {
  FlexColumn,
  FlexRow,
  ToggleGroup,
  ToggleOption,
  ToolbarIconButton,
  BORDER_RADIUS,
  MOTION
} from "../../ui_primitives";
import HandleColumn from "../../node/HandleColumn";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";
import NumberInput from "../../inputs/NumberInput";

import type { NodeMetadata, Image } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { useUpstreamValue } from "../../../hooks/nodes/useNodeIO";
import { useBespokePropertyWriter } from "../../../hooks/nodes/useBespokePropertyWriter";
import { useAssetUpload } from "../../../serverState/useAssetUpload";
import { useAsset } from "../../../serverState/useAsset";
import type { Asset } from "../../../stores/ApiTypes";
import { resolveExposedInputNames } from "../../../utils/exposedInputs";
import { asImageRef, isRawRgbaRef } from "../../../utils/imageRef";
import { rawRgbaToPngDataUrl } from "../../../lib/workflow/materializeBrowserOutputs";
import { createImageUrl } from "../../../utils/imageUtils";
import { resolveAssetUri } from "../../node/output/hooks";
import { PAINTER_NODE_TYPE } from "../../../constants/nodeTypes";

// Max number of undo states retained. Keeps memory bounded; older
// states are dropped from the front of the queue.
const MAX_HISTORY = 30;

const DEFAULT_CANVAS_SIZE = 512;
const DEFAULT_BRUSH_SIZE = 24;
const DEFAULT_BRUSH_OPACITY = 1;
const DEFAULT_COLOR = "#ffffff";
const DEFAULT_BG_FADE = 1;

type Tool = "brush" | "eraser";

interface ImageRefLike {
  uri?: string;
  width?: number;
  height?: number;
  data?: unknown;
}

const styles = (theme: Theme) =>
  css({
    "&.painter-body": {
      position: "relative",
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.5),
      padding: theme.spacing(0.5),
      minHeight: 0
    },
    ".paint-row": {
      flex: "1 1 auto",
      minHeight: 200,
      display: "flex",
      gap: theme.spacing(0.5),
      // Canvas is now full-bleed — no side toolbar column.
      width: "100%",
      // HandleColumn lives here (sibling of `.paint-area`, not inside it) so
      // `.paint-area { overflow: hidden }` doesn't clip the protruding
      // handles at their negative-`left` position.
      position: "relative",
      "& > .handle-column": {
        top: 0,
        bottom: 0,
        left: 0
      }
    },
    ".paint-area": {
      flex: "1 1 auto",
      // Default `min-height: auto` on flex items prevents shrinking below
      // content height; explicit 0 lets max-height constraints on children
      // actually scale the canvas down at small node heights.
      minWidth: 0,
      minHeight: 0,
      position: "relative",
      borderRadius: BORDER_RADIUS.sm,
      overflow: "hidden",
      // Solid letterbox around the canvas — distinguishes "outside the
      // paintable area" from the canvas itself, which carries the checker.
      backgroundColor: theme.vars.palette.grey[800],
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      containerType: "size"
    },
    ".paint-stage": {
      position: "relative",
      // `aspectRatio` + `width`/`height` min(cqw,cqh) inline styles shrink the
      // stage to fit `.paint-area` without distortion when the node is resized
      // in either dimension. Plain `width: 100%` + `max-height: 100%` breaks
      // aspect ratio under height constraints — canvases stretch but `<img
      // object-fit: contain>` does not.
      display: "block",
      minWidth: 0,
      minHeight: 0,
      // Checker pattern only on the canvas footprint, so transparent
      // regions of the paint canvas read as "unpainted".
      backgroundColor: theme.vars.palette.grey[900],
      backgroundImage: `linear-gradient(45deg, ${theme.vars.palette.grey[800]} 25%, transparent 25%),
        linear-gradient(-45deg, ${theme.vars.palette.grey[800]} 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, ${theme.vars.palette.grey[800]} 75%),
        linear-gradient(-45deg, transparent 75%, ${theme.vars.palette.grey[800]} 75%)`,
      backgroundSize: "12px 12px",
      backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0",
      "& img.source": {
        // Fill the aspect-ratio'd stage. `object-fit: contain` keeps the
        // image's aspect ratio inside the box — since `canvas_width/height`
        // sync to the image on drop, the box already matches the image's
        // ratio, so contain just sits flush.
        display: "block",
        width: "100%",
        height: "100%",
        objectFit: "contain",
        userSelect: "none",
        pointerEvents: "none"
      },
      "& canvas.paint": {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        touchAction: "none"
      },
      /*
       * Live stroke buffer: stacked above the committed paint canvas, receives
       * pointer events, painted at full alpha. Its CSS `opacity` shows the
       * stroke at its target brush opacity during draw; on pointerup the
       * buffer is composited onto the main canvas in one drawImage with the
       * correct globalAlpha + globalCompositeOperation, then cleared.
       * Single-composite avoids alpha accumulation at segment overlaps.
       */
      "& canvas.paint-buffer": {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        cursor: "none",
        touchAction: "none",
        pointerEvents: "auto"
      },
      /*
       * Brush cursor: a thin-outlined circle that follows the pointer over
       * the paint area, sized to match `brushSize` in CSS pixels. Position
       * and size are mutated imperatively so high-frequency pointer moves
       * don't trigger React re-renders.
       */
      "& .brush-cursor": {
        position: "absolute",
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        borderRadius: BORDER_RADIUS.circle,
        border: `1px solid ${theme.vars.palette.common.white}`,
        outline: `1px solid ${theme.vars.palette.common.black}`,
        // Initial transform — overwritten by `updateBrushCursor` per-move.
        // Using transform (not left/top) keeps moves on the composite path.
        transform: "translate(0, 0) translate(-50%, -50%)",
        pointerEvents: "none",
        opacity: 0,
        transition: MOTION.opacity,
        // `will-change: transform` hints the browser to give this its own
        // GPU layer up front so per-move transform writes don't churn.
        willChange: "transform",
        zIndex: 2
      }
    },
    /* Two-row weavy-style bottom toolbar:
       row 1: brush/eraser/color | undo/redo/clear
       row 2: size | opacity | background-opacity */
    ".bottom-toolbar": {
      flex: "0 0 auto",
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1),
      padding: theme.spacing(1),
      margin: theme.spacing(0.5, 0),
      borderRadius: BORDER_RADIUS.sm,
      background: theme.vars.palette.action.hover,
      border: `1px solid ${theme.vars.palette.divider}`,
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller
    },
    ".bottom-row": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.5)
    },
    /* Row 2 sliders: equal-width tracks so the three numeric fields align. */
    ".sliders-row .slider-field": {
      flex: "1 1 0",
      minWidth: 0
    },
    /* Row 1: pushes the undo/redo/clear cluster to the right edge so the
       left group (tools + color) hugs the start. */
    ".tools-row .row-spacer": {
      flex: "1 1 auto"
    },
    /* Canvas dimensions row: Width + Height share the full row, half each. */
    ".canvas-row .dim-field": {
      flex: "1 1 0",
      minWidth: 0
    },
    /* Color picker rendered as a larger square swatch so it visually pairs
       with the bigger tool icons in row 1. */
    ".color-input": {
      width: 36,
      height: 36,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.sm,
      padding: 0,
      background: "transparent",
      cursor: "pointer",
      flex: "0 0 auto"
    },
    ".tool-toggle .MuiToggleButton-root": {
      padding: theme.spacing(0.5, 1),
      "& svg": { fontSize: 22 }
    },
    /* History cluster (undo/redo/clear) styled as proper buttons: the
       background separates them from the surrounding toolbar tint so they
       read as actionable rather than just hoverable. */
    ".tools-row .toolbar-icon-button": {
      backgroundColor: theme.vars.palette.action.selected,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.sm,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.focus
      }
    },
    ".outputs-row": {
      flex: "0 0 auto"
    },
    /*
     * Collapsed strip: hide the toolbar and canvas stage, shrink the
     * `.paint-row` / `.paint-area` to zero. We can't `display: none` the
     * whole `.painter-body` because `<HandleColumn>` is mounted *inside*
     * `.paint-area`; killing that subtree would unmount the handles and
     * orphan any connected edges. Keep the frame alive at 0 height so the
     * handle column still resolves its absolute position against the strip.
     * (Mirrors the `.preview-area` pattern in `collapsed.css`.)
     */
    ".node-body.collapsed &.painter-body": {
      height: 0,
      minHeight: 0,
      padding: 0,
      margin: 0,
      gap: 0,
      overflow: "visible",
      "& > .bottom-toolbar, & .paint-stage": {
        display: "none"
      },
      "& .paint-row, & .paint-area": {
        height: 0,
        minHeight: 0,
        padding: 0,
        margin: 0,
        background: "none",
        border: "none",
        overflow: "visible",
        flex: "none"
      }
    }
  });

export interface PainterBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const PainterBodyInner: React.FC<PainterBodyProps> = ({
  id,
  nodeType,
  nodeMetadata,
  data,
  workflowId,
  status,
  isOutputNode
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  // Source image to paint on: upstream edge value if wired, otherwise the
  // constant set via the Inspector.
  const inputValue = useUpstreamValue(
    workflowId,
    id,
    "image",
    data.properties?.image
  );
  const sourceImage: ImageRefLike | undefined = useMemo(
    () => asImageRef(inputValue),
    [inputValue]
  );
  const imageProp = useMemo(
    () =>
      inputValue && typeof inputValue === "object"
        ? (inputValue as Image)
        : undefined,
    [inputValue]
  );
  const { uri: assetUri } = useAsset({ image: imageProp });

  // Blob URL lifecycle: revoke previous URL on change / unmount.
  const blobUrlRef = useRef<string | null>(null);
  const sourceSrc = useMemo(() => {
    if (!sourceImage && !assetUri) {
      return undefined;
    }
    // Raw-RGBA upstream → encode via canvas; createImageUrl below would treat
    // the bytes as an encoded image and produce an undecodable blob.
    if (isRawRgbaRef(sourceImage)) {
      return (
        rawRgbaToPngDataUrl(
          sourceImage.data,
          sourceImage.width,
          sourceImage.height
        ) || undefined
      );
    }
    const uriCandidate =
      sourceImage?.uri && sourceImage.uri.length > 0
        ? sourceImage.uri
        : assetUri;
    const result = createImageUrl(
      uriCandidate || sourceImage?.data != null
        ? {
            uri: uriCandidate,
            data: sourceImage?.data as string | Uint8Array | number[] | undefined
          }
        : undefined,
      blobUrlRef.current
    );
    blobUrlRef.current = result.blobUrl;
    return result.url ? resolveAssetUri(result.url) : undefined;
  }, [sourceImage, assetUri]);
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [sourceSrc]);

  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (sourceImage?.width && sourceImage?.height) {
      setImgDims({ w: sourceImage.width, h: sourceImage.height });
    }
  }, [sourceImage?.width, sourceImage?.height]);

  const onSourceLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const el = e.currentTarget;
      if (el.naturalWidth > 0 && el.naturalHeight > 0) {
        setImgDims({ w: el.naturalWidth, h: el.naturalHeight });
      }
    },
    []
  );

  const onSourceError = useCallback(() => {
    setImgDims(null);
  }, []);

  // Canvas resolution priority: source-image dims → user-configured
  // `canvas_width` / `canvas_height` props → DEFAULT_CANVAS_SIZE. The user
  // props let painting work standalone (no image connected) at a known size,
  // and get overwritten when an image is dropped (see onAreaDrop).
  // Reads `data.properties` directly: the local `props` alias is defined
  // further down the function body and would TDZ-error if referenced here.
  const rawCanvasWidth = data.properties?.canvas_width;
  const rawCanvasHeight = data.properties?.canvas_height;
  const configuredW =
    typeof rawCanvasWidth === "number" && rawCanvasWidth > 0
      ? rawCanvasWidth
      : DEFAULT_CANVAS_SIZE;
  const configuredH =
    typeof rawCanvasHeight === "number" && rawCanvasHeight > 0
      ? rawCanvasHeight
      : DEFAULT_CANVAS_SIZE;
  const canvasW = imgDims?.w ?? configuredW;
  const canvasH = imgDims?.h ?? configuredH;

  const paintStageStyle = useMemo(
    (): React.CSSProperties => ({
      aspectRatio: `${canvasW} / ${canvasH}`,
      width: `min(100cqw, calc(100cqh * ${canvasW} / ${canvasH}))`,
      height: `min(100cqh, calc(100cqw * ${canvasH} / ${canvasW}))`
    }),
    [canvasW, canvasH]
  );

  // ── Tool state ───────────────────────────────────────────────────
  // Rehydrate from persisted node properties on mount.
  const props = data.properties ?? {};
  const [tool, setTool] = useState<Tool>("brush");
  const [brushSize, setBrushSize] = useState<number>(
    typeof props.brush_size === "number" ? props.brush_size : DEFAULT_BRUSH_SIZE
  );
  const [brushOpacity, setBrushOpacity] = useState<number>(
    typeof props.brush_opacity === "number" ? props.brush_opacity : DEFAULT_BRUSH_OPACITY
  );
  const [color, setColor] = useState<string>(
    typeof props.brush_color === "string" ? props.brush_color : DEFAULT_COLOR
  );
  const [bgFade, setBgFade] = useState<number>(
    typeof props.bg_fade === "number" ? props.bg_fade : DEFAULT_BG_FADE
  );

  // ── Paint canvas + history ───────────────────────────────────────
  // Two canvases:
  //   canvasRef       — persistent, committed strokes only.
  //   bufferRef       — live overlay for the in-flight stroke. Painted at
  //                     alpha=1; CSS opacity shows the target brush opacity.
  //                     On pointerup the buffer is composited onto the main
  //                     canvas in a single drawImage so overlaps don't stack
  //                     alpha. Pointer events are bound to the buffer.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bufferRef = useRef<HTMLCanvasElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);
  /** Snapshots of the paint canvas as data-URLs. */
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  // Re-render triggers when history changes (so the undo/redo buttons
  // can update their disabled state).
  const [historyTick, setHistoryTick] = useState(0);
  const bumpHistory = useCallback(
    () => setHistoryTick((t) => t + 1),
    []
  );

  const { setProperty, setPropertyComplete } = useBespokePropertyWriter({
    nodeId: id,
    nodeType
  });

  // ── Drop-to-load source image ────────────────────────────────────
  // Accept external image files dropped onto the paint area. The drop is
  // stopped before React Flow's global drop handler runs (which would create
  // a new asset node next to ours). Files are uploaded as assets; on success
  // we point the `image` property at the new asset and the source image
  // pipeline takes over (hydrating canvasW/H, drawing the source layer).
  const onAreaDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const onAreaDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      const files = Array.from(e.dataTransfer.files ?? []);
      const imageFile = files.find((f) => f.type.startsWith("image/"));
      if (!imageFile) return;
      e.preventDefault();
      e.stopPropagation();
      // Probe the file's natural dimensions client-side so we can sync
      // `canvas_width` / `canvas_height` immediately. The upload itself may
      // take a moment; setting the canvas size up front avoids a flash of
      // wrong-aspect-ratio canvas before the asset URL resolves.
      const probeUrl = URL.createObjectURL(imageFile);
      const probe = new Image();
      probe.onload = () => {
        if (probe.naturalWidth > 0 && probe.naturalHeight > 0) {
          setProperty("canvas_width", probe.naturalWidth);
          setProperty("canvas_height", probe.naturalHeight);
        }
        URL.revokeObjectURL(probeUrl);
      };
      probe.onerror = () => URL.revokeObjectURL(probeUrl);
      probe.src = probeUrl;

      useAssetUpload.getState().uploadAsset({
        file: imageFile,
        workflow_id: workflowId,
        onCompleted: (asset: Asset) => {
          setProperty("image", {
            type: "image",
            asset_id: asset.id,
            uri: asset.get_url ?? undefined
          });
          setPropertyComplete();
        }
      });
    },
    [setProperty, setPropertyComplete, workflowId]
  );

  // Hydrate the canvas from `mask_data` whenever it changes externally
  // (workflow load, undo at graph level, …). Skipped during local
  // strokes via the `isDirty` flag.
  const isDirtyRef = useRef(false);
  const lastMaskDataRef = useRef<string>("");

  const ensureCanvas = useCallback((): HTMLCanvasElement | null => {
    return canvasRef.current;
  }, []);

  const snapshotMask = useCallback((): string => {
    const c = ensureCanvas();
    if (!c) return "";
    try {
      return c.toDataURL("image/png");
    } catch {
      return "";
    }
  }, [ensureCanvas]);

  /** Strip the `data:image/png;base64,` prefix so we persist the raw b64. */
  const stripDataUrl = (url: string): string => {
    const comma = url.indexOf(",");
    return comma >= 0 ? url.slice(comma + 1) : url;
  };

  const writeMaskData = useCallback(
    (dataUrl: string, complete: boolean) => {
      const raw = stripDataUrl(dataUrl);
      lastMaskDataRef.current = raw;
      setProperty("mask_data", raw);
      if (complete) setPropertyComplete();
    },
    [setProperty, setPropertyComplete]
  );

  const loadDataUrlIntoCanvas = useCallback(
    (dataUrl: string): Promise<void> =>
      new Promise((resolve) => {
        const c = ensureCanvas();
        if (!c) {
          resolve();
          return;
        }
        const ctx = c.getContext("2d");
        if (!ctx) {
          resolve();
          return;
        }
        if (!dataUrl) {
          ctx.clearRect(0, 0, c.width, c.height);
          resolve();
          return;
        }
        const img = new Image();
        img.onload = () => {
          // Draw the saved mask at its native size, anchored at (0,0). On
          // a smaller new canvas the right/bottom edges naturally clip; on
          // a larger one the extra space stays transparent. Avoids
          // stretching the user's strokes when canvas dimensions change.
          ctx.clearRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = dataUrl;
      }),
    [ensureCanvas]
  );

  // Mount-time hydration: load existing mask_data into the canvas.
  const propsMaskData = data.properties?.mask_data;
  useEffect(() => {
    const raw = typeof propsMaskData === "string" ? propsMaskData : "";
    if (raw === lastMaskDataRef.current) return;
    if (isDirtyRef.current) return; // local stroke in flight
    lastMaskDataRef.current = raw;
    if (!raw) {
      const c = ensureCanvas();
      const ctx = c?.getContext("2d");
      if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
      return;
    }
    loadDataUrlIntoCanvas(`data:image/png;base64,${raw}`);
  }, [propsMaskData, ensureCanvas, loadDataUrlIntoCanvas]);

  // Canvas resize → re-hydrate. Changing a `<canvas>` element's width/height
  // attributes wipes its bitmap, which would clear the user's strokes on a
  // canvas-size change. Redraw from the persisted mask (scaled-fit) so the
  // strokes survive. Skipped during an in-flight stroke.
  useEffect(() => {
    if (isDirtyRef.current) return;
    const raw = lastMaskDataRef.current;
    if (!raw) return;
    loadDataUrlIntoCanvas(`data:image/png;base64,${raw}`);
  }, [canvasW, canvasH, loadDataUrlIntoCanvas]);

  // ── Drawing primitives ───────────────────────────────────────────
  const pointerActiveRef = useRef(false);
  // Mirrors `pointerActiveRef` as React state to gate the buffer's CSS
  // opacity. Buffer with `opacity < 1` becomes a permanent GPU compositing
  // layer; at high zoom the texture is huge and every cursor move forces a
  // recomposite, making the whole node sluggish. Toggling opacity to 1 (no
  // layer) between strokes restores snappy hover. Opacity drops back to
  // `brushOpacity` on pointerdown so the live preview still shows.
  const [isPainting, setIsPainting] = useState(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const eventToCanvasXY = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
      // Pointer events live on the buffer; both canvases share dimensions.
      const target = bufferRef.current ?? ensureCanvas();
      if (!target) return { x: 0, y: 0 };
      const rect = target.getBoundingClientRect();
      const sx = target.width / Math.max(1, rect.width);
      const sy = target.height / Math.max(1, rect.height);
      return {
        x: (e.clientX - rect.left) * sx,
        y: (e.clientY - rect.top) * sy
      };
    },
    [ensureCanvas]
  );

  const pushUndoSnapshot = useCallback(() => {
    const snap = snapshotMask();
    if (!snap) return;
    const stack = undoStackRef.current;
    stack.push(snap);
    if (stack.length > MAX_HISTORY) stack.shift();
    redoStackRef.current = [];
    bumpHistory();
  }, [snapshotMask, bumpHistory]);

  const drawStrokeTo = useCallback(
    (to: { x: number; y: number }) => {
      // Always paint into the live buffer at full alpha, source-over. The
      // brush opacity is applied once at commit time (see finishStroke);
      // painting at alpha=1 here means overlapping segments don't stack.
      const buf = bufferRef.current;
      const ctx = buf?.getContext("2d");
      if (!buf || !ctx) return;
      const from = lastPointRef.current ?? to;
      ctx.save();
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();
      lastPointRef.current = to;
    },
    [brushSize, color]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      // Left button only — middle/right are reserved for pan / context menu.
      if (e.button !== 0) return;
      e.stopPropagation();
      const c = ensureCanvas();
      const buf = bufferRef.current;
      if (!c || !buf) return;
      // Fresh buffer for this stroke — no carry-over from prior strokes.
      const bctx = buf.getContext("2d");
      bctx?.clearRect(0, 0, buf.width, buf.height);
      pointerActiveRef.current = true;
      isDirtyRef.current = true;
      setIsPainting(true);
      pushUndoSnapshot();
      const pt = eventToCanvasXY(e);
      lastPointRef.current = pt;
      drawStrokeTo(pt); // dot at click
      const target = e.currentTarget as HTMLCanvasElement;
      if (typeof target.setPointerCapture === "function") {
        target.setPointerCapture(e.pointerId);
      }
      pointerCaptureTargetRef.current = target;
    },
    [drawStrokeTo, ensureCanvas, eventToCanvasXY, pushUndoSnapshot]
  );

  const updateBrushCursor = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const cur = cursorRef.current;
      const buf = bufferRef.current;
      if (!cur || !buf) return;
      const rect = buf.getBoundingClientRect();
      // React Flow applies `transform: scale(zoom)` to the viewport, so
      // `getBoundingClientRect()` returns post-transform screen pixels while
      // CSS lengths on a transformed-subtree child are interpreted in
      // pre-transform local pixels. Convert by offsetWidth/rect.width
      // (≈ 1/zoom). Without this the cursor drifts at zoom ≠ 1.
      const sxLocal = buf.offsetWidth / Math.max(1, rect.width);
      const syLocal = buf.offsetHeight / Math.max(1, rect.height);
      const localPerCanvasPx = buf.offsetWidth / Math.max(1, buf.width);
      const sizeCss = Math.max(2, brushSize * localPerCanvasPx);
      const x = (e.clientX - rect.left) * sxLocal;
      const y = (e.clientY - rect.top) * syLocal;
      cur.style.width = `${sizeCss}px`;
      cur.style.height = `${sizeCss}px`;
      // Position via transform (composite-only) instead of left/top
      // (layout-triggering). The trailing -50%/-50% centers the circle on
      // the pointer. Was a hot path on every pointermove.
      cur.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      cur.style.opacity = "1";
    },
    [brushSize]
  );

  const hideBrushCursor = useCallback(() => {
    const cur = cursorRef.current;
    if (cur) cur.style.opacity = "0";
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      updateBrushCursor(e);
      if (!pointerActiveRef.current) return;
      drawStrokeTo(eventToCanvasXY(e));
    },
    [drawStrokeTo, eventToCanvasXY, updateBrushCursor]
  );

  const pointerCaptureTargetRef = useRef<HTMLCanvasElement | null>(null);

  const finishStroke = useCallback(
    (e?: React.PointerEvent<HTMLCanvasElement>) => {
      if (!pointerActiveRef.current) return;
      pointerActiveRef.current = false;
      setIsPainting(false);
      lastPointRef.current = null;

      // Composite the buffered stroke onto the main canvas in a single
      // drawImage. globalAlpha applies the brush opacity once across the
      // whole stroke — overlapping segments inside the buffer were drawn at
      // alpha=1 so they don't accumulate. compositeOp branches on the tool:
      // source-over for brush (additive), destination-out for eraser
      // (subtractive — the buffer's alpha channel becomes the cut-out mask).
      const main = ensureCanvas();
      const buf = bufferRef.current;
      const mctx = main?.getContext("2d");
      const bctx = buf?.getContext("2d");
      if (main && buf && mctx && bctx) {
        mctx.save();
        mctx.globalAlpha = brushOpacity;
        mctx.globalCompositeOperation =
          tool === "eraser" ? "destination-out" : "source-over";
        mctx.drawImage(buf, 0, 0);
        mctx.restore();
        bctx.clearRect(0, 0, buf.width, buf.height);
      }

      const snap = snapshotMask();
      if (snap) writeMaskData(snap, true);
      isDirtyRef.current = false;
      const target = pointerCaptureTargetRef.current ?? e?.currentTarget;
      if (target) {
        try {
          target.releasePointerCapture(e?.pointerId ?? 0);
        } catch {
          // Pointer may already be released.
        }
        pointerCaptureTargetRef.current = null;
      }
    },
    [brushOpacity, ensureCanvas, snapshotMask, tool, writeMaskData]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.stopPropagation();
      finishStroke(e);
    },
    [finishStroke]
  );

  // Safety: release pointer capture on unmount.
  useEffect(() => {
    return () => {
      const target = pointerCaptureTargetRef.current;
      if (target) {
        try {
          const activeId = target.ownerDocument?.pointerLockElement
            ? undefined
            : 0;
          if (activeId !== undefined) {
            target.releasePointerCapture(activeId);
          }
        } catch {
          // Ignore — capture may already be gone.
        }
      }
    };
  }, []);

  // ── Undo / redo / clear ──────────────────────────────────────────
  const onUndo = useCallback(async () => {
    const undo = undoStackRef.current;
    if (undo.length === 0) return;
    const current = snapshotMask();
    const prev = undo.pop()!;
    if (current) {
      const redo = redoStackRef.current;
      redo.push(current);
      if (redo.length > MAX_HISTORY) redo.shift();
    }
    await loadDataUrlIntoCanvas(prev);
    writeMaskData(prev, true);
    bumpHistory();
  }, [bumpHistory, loadDataUrlIntoCanvas, snapshotMask, writeMaskData]);

  const onRedo = useCallback(async () => {
    const redo = redoStackRef.current;
    if (redo.length === 0) return;
    const current = snapshotMask();
    const next = redo.pop()!;
    if (current) {
      const undo = undoStackRef.current;
      undo.push(current);
      if (undo.length > MAX_HISTORY) undo.shift();
    }
    await loadDataUrlIntoCanvas(next);
    writeMaskData(next, true);
    bumpHistory();
  }, [bumpHistory, loadDataUrlIntoCanvas, snapshotMask, writeMaskData]);

  const onClear = useCallback(async () => {
    pushUndoSnapshot();
    const c = ensureCanvas();
    const ctx = c?.getContext("2d");
    if (c && ctx) {
      ctx.clearRect(0, 0, c.width, c.height);
    }
    const snap = snapshotMask();
    writeMaskData(snap, true);
  }, [ensureCanvas, pushUndoSnapshot, snapshotMask, writeMaskData]);

  // ── Inline-input handlers ────────────────────────────────────────
  const properties = useMemo(
    () => nodeMetadata.properties ?? [],
    [nodeMetadata.properties]
  );
  // Input handles: backend `input_fields` ∪ user-promoted `exposedInputs`.
  // The `image` source belongs in `input_fields` on the backend node; this
  // also lets the user promote brush_color / brush_size / etc. from the
  // Inspector and have those render as handles, matching `ContentCardBody`.
  // We always guarantee `image` is in the handle column even if the backend
  // metadata omits it from `input_fields`, since it's the Painter's primary
  // upstream input.
  const handleProperties = useMemo(() => {
    const names = new Set(resolveExposedInputNames(nodeMetadata, data));
    names.add("image");
    return properties.filter((p) => names.has(p.name));
  }, [data, nodeMetadata, properties]);

  const onBrushSize = useCallback(
    (_: React.ChangeEvent<HTMLInputElement> | null, value: number) =>
      setBrushSize(Math.max(1, Math.min(256, Math.round(value)))),
    []
  );
  const onBrushOpacity = useCallback(
    (_: React.ChangeEvent<HTMLInputElement> | null, value: number) =>
      setBrushOpacity(Math.max(0, Math.min(1, value))),
    []
  );
  const onBgFade = useCallback(
    (_: React.ChangeEvent<HTMLInputElement> | null, value: number) =>
      setBgFade(Math.max(0, Math.min(1, value))),
    []
  );
  const onColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setColor(e.target.value),
    []
  );
  const onToolChange = useCallback(
    (_: React.MouseEvent<HTMLElement>, value: Tool | null) => {
      if (value) setTool(value);
    },
    []
  );
  const onCanvasWidth = useCallback(
    (_: React.ChangeEvent<HTMLInputElement> | null, value: number) => {
      const v = Math.max(1, Math.min(4096, Math.round(value)));
      setProperty("canvas_width", v);
      setPropertyComplete();
    },
    [setProperty, setPropertyComplete]
  );
  const onCanvasHeight = useCallback(
    (_: React.ChangeEvent<HTMLInputElement> | null, value: number) => {
      const v = Math.max(1, Math.min(4096, Math.round(value)));
      setProperty("canvas_height", v);
      setPropertyComplete();
    },
    [setProperty, setPropertyComplete]
  );

  const undoDisabled = undoStackRef.current.length === 0;
  const redoDisabled = redoStackRef.current.length === 0;
  // historyTick keeps lint + react aware that disabled state can change.
  void historyTick;

  return (
    <div css={cssStyles} className="painter-body" data-bespoke-body="Painter">
      <div className="paint-row">
        <div
          className="paint-area"
          onDragOver={onAreaDragOver}
          onDrop={onAreaDrop}
        >
          {sourceSrc ? (
            <div className="paint-stage" style={paintStageStyle}>
              <img
                className="source"
                src={sourceSrc}
                onLoad={onSourceLoad}
                onError={onSourceError}
                alt=""
                style={{ opacity: bgFade }}
              />
              <canvas
                ref={canvasRef}
                className="paint nodrag"
                width={canvasW}
                height={canvasH}
              />
              <canvas
                ref={bufferRef}
                className="paint-buffer nodrag"
                width={canvasW}
                height={canvasH}
                style={{ opacity: isPainting ? brushOpacity : 1 }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onPointerEnter={updateBrushCursor}
                onPointerLeave={hideBrushCursor}
              />
              <div ref={cursorRef} className="brush-cursor" aria-hidden />
            </div>
          ) : (
            <div className="paint-stage" style={paintStageStyle}>
              {/* No source image: the main canvas is the in-flow size driver.
                  Canvas is a replaced element with intrinsic dimensions from
                  its `width`/`height` HTML attrs, so `max-width/max-height:
                  100%` shrinks it to fit the parent while preserving aspect
                  ratio — same behavior `<img>` gives the with-image branch.
                  No inline width/height override here, and no
                  `CheckerDropzone` (which would cover everything with its own
                  pattern and hide the letterbox grey[800] from .paint-area). */}
              <canvas
                ref={canvasRef}
                className="paint nodrag"
                width={canvasW}
                height={canvasH}
              />
              <canvas
                ref={bufferRef}
                className="paint-buffer nodrag"
                width={canvasW}
                height={canvasH}
                style={{ opacity: isPainting ? brushOpacity : 1 }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onPointerEnter={updateBrushCursor}
                onPointerLeave={hideBrushCursor}
              />
              <div ref={cursorRef} className="brush-cursor" aria-hidden />
            </div>
          )}
        </div>
        {/* HandleColumn is a sibling of `.paint-area` — not inside it —
            so the area's `overflow: hidden` doesn't clip handles at their
            negative-left protrusion. */}
        <HandleColumn id={id} properties={handleProperties} />
      </div>

      <FlexColumn className="bottom-toolbar nodrag" gap={0.5}>
        {/* Row 1: tools — brush/eraser, color, undo/redo/clear. Compact
            icon strip; no sliders here so the row stays tight. */}
        <FlexRow className="bottom-row tools-row" align="center" gap={0.5}>
          <ToggleGroup
            className="tool-toggle"
            value={tool}
            exclusive
            onChange={onToolChange}
            size="small"
            aria-label="Paint tool"
          >
            <ToggleOption value="brush" aria-label="Brush">
              <BrushIcon />
            </ToggleOption>
            <ToggleOption value="eraser" aria-label="Eraser">
              <EraserIcon />
            </ToggleOption>
          </ToggleGroup>
          <input
            id={`painter-color-${id}`}
            className="color-input"
            type="color"
            value={color}
            onChange={onColorChange}
            aria-label="Brush color"
          />
          <div className="row-spacer" />
          <ToolbarIconButton
            className="nodrag"
            size="small"
            onClick={onUndo}
            disabled={undoDisabled}
            tooltip="Undo"
            icon={<UndoIcon fontSize="small" />}
          />
          <ToolbarIconButton
            className="nodrag"
            size="small"
            onClick={onRedo}
            disabled={redoDisabled}
            tooltip="Redo"
            icon={<RedoIcon fontSize="small" />}
          />
          <ToolbarIconButton
            className="nodrag"
            size="small"
            onClick={onClear}
            tooltip="Clear painted mask"
            icon={<RestartAltIcon fontSize="small" />}
          />
        </FlexRow>

        {/* Row 2: sliders — equal-width tracks for size, opacity, bg fade.
            Labels come from the `name` prop via PropertyLabel's titleize,
            so use short single-word names. */}
        <FlexRow className="bottom-row sliders-row" align="center" gap={0.5}>
          <div className="slider-field">
            <NumberInput
              id={`painter-size-${id}`}
              nodeId={id}
              name="size"
              description="Brush size in pixels"
              value={brushSize}
              min={1}
              max={256}
              size="small"
              color="secondary"
              inputType="int"
              showSlider={true}
              onChange={onBrushSize}
            />
          </div>
          <div className="slider-field">
            <NumberInput
              id={`painter-opacity-${id}`}
              nodeId={id}
              name="opacity"
              description="Brush opacity (0–1)"
              value={brushOpacity}
              min={0}
              max={1}
              size="small"
              color="secondary"
              inputType="float"
              showSlider={true}
              onChange={onBrushOpacity}
            />
          </div>
        </FlexRow>

        {/* Canvas dimensions: full names ("Width", "Height"), one per half. */}
        <FlexRow className="bottom-row canvas-row" align="center" gap={0.5}>
          <div className="dim-field">
            <NumberInput
              id={`painter-canvas-w-${id}`}
              nodeId={id}
              name="canvas width"
              description="Canvas width in pixels"
              value={configuredW}
              min={1}
              max={4096}
              size="small"
              color="secondary"
              inputType="int"
              showSlider={false}
              onChange={onCanvasWidth}
            />
          </div>
          <div className="dim-field">
            <NumberInput
              id={`painter-canvas-h-${id}`}
              nodeId={id}
              name="canvas height"
              description="Canvas height in pixels"
              value={configuredH}
              min={1}
              max={4096}
              size="small"
              color="secondary"
              inputType="int"
              showSlider={false}
              onChange={onCanvasHeight}
            />
          </div>
        </FlexRow>

        {/* Background opacity on its own row below the dimensions. */}
        <FlexRow className="bottom-row" align="center" gap={0.5}>
          <div className="slider-field">
            <NumberInput
              id={`painter-fade-${id}`}
              nodeId={id}
              name="background_opacity"
              description="Background image opacity (0 = hide, 1 = full)"
              value={bgFade}
              min={0}
              max={1}
              size="small"
              color="secondary"
              inputType="float"
              showSlider={true}
              onChange={onBgFade}
            />
          </div>
        </FlexRow>
      </FlexColumn>

      {!isOutputNode && (
        <div className="outputs-row">
          <NodeOutputs
            id={id}
            outputs={nodeMetadata.outputs}
          />
        </div>
      )}

      {status === "running" && <NodeProgress id={id} workflowId={workflowId} />}
    </div>
  );
};

export const PainterBody = memo(PainterBodyInner);
PainterBody.displayName = "PainterBody";

export { PAINTER_NODE_TYPE };
export default PainterBody;
