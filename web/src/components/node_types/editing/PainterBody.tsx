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
import ImageIcon from "@mui/icons-material/Image";
import BrushIcon from "@mui/icons-material/Brush";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import RestartAltIcon from "@mui/icons-material/RestartAlt";

import {
  CheckerDropzone,
  FlexColumn,
  FlexRow,
  ToggleGroup,
  ToggleOption,
  ToolbarIconButton
} from "../../ui_primitives";
import HandleColumn from "../../node/HandleColumn";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";
import NumberInput from "../../inputs/NumberInput";

import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { useUpstreamValue } from "../../../hooks/nodes/useNodeIO";
import { useBespokePropertyWriter } from "../../../hooks/nodes/useBespokePropertyWriter";

const PAINTER_NODE_TYPE = "nodetool.image.Painter";

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

const asImageRef = (value: unknown): ImageRefLike | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  return {
    uri: typeof v.uri === "string" ? v.uri : undefined,
    width: typeof v.width === "number" ? v.width : undefined,
    height: typeof v.height === "number" ? v.height : undefined,
    data: v.data
  };
};

const toImageSrc = (img: ImageRefLike | undefined): string | undefined => {
  if (!img) return undefined;
  if (img.uri) return img.uri;
  if (img.data instanceof Uint8Array) {
    return URL.createObjectURL(
      new Blob([img.data as BlobPart], { type: "image/png" })
    );
  }
  return undefined;
};

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
      gap: theme.spacing(0.5)
    },
    ".paint-area": {
      flex: "1 1 auto",
      minWidth: 0,
      position: "relative",
      borderRadius: "var(--rounded-sm)",
      overflow: "hidden",
      backgroundColor: theme.vars.palette.grey[900],
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      "& > .handle-column": {
        top: 0,
        bottom: 0,
        left: `calc(${theme.spacing(-0.5)})`
      }
    },
    ".paint-stage": {
      position: "relative",
      maxWidth: "100%",
      maxHeight: "100%",
      "& img.source": {
        display: "block",
        maxWidth: "100%",
        maxHeight: "100%",
        objectFit: "contain",
        userSelect: "none",
        pointerEvents: "none"
      },
      "& canvas.paint": {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        cursor: "crosshair",
        touchAction: "none"
      }
    },
    ".toolbar": {
      flex: "0 0 96px",
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.75),
      padding: theme.spacing(0.5),
      borderRadius: "var(--rounded-sm)",
      background: theme.vars.palette.action.hover,
      border: `1px solid ${theme.vars.palette.divider}`,
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller
    },
    ".toolbar label": {
      color: theme.vars.palette.text.secondary,
      fontSize: theme.fontSizeSmaller,
      marginBottom: 2
    },
    ".color-input": {
      width: "100%",
      height: 24,
      border: "none",
      padding: 0,
      background: "transparent",
      cursor: "pointer"
    },
    ".tool-toggle .MuiToggleButton-root": {
      flex: "1 1 50%",
      padding: theme.spacing(0.25),
      "& svg": { fontSize: 16 }
    },
    ".bottom-row": {
      flex: "0 0 auto",
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.5)
    },
    ".fade-field": {
      flex: "1 1 auto",
      minWidth: 0
    },
    ".outputs-row": {
      flex: "0 0 auto"
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

  // Blob URL lifecycle: revoke previous URL on change / unmount.
  const blobUrlRef = useRef<string | undefined>(undefined);
  const sourceSrc = useMemo(() => toImageSrc(sourceImage), [sourceImage]);
  useEffect(() => {
    if (sourceSrc && sourceSrc.startsWith("blob:")) {
      blobUrlRef.current = sourceSrc;
    }
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = undefined;
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

  const canvasW = imgDims?.w ?? DEFAULT_CANVAS_SIZE;
  const canvasH = imgDims?.h ?? DEFAULT_CANVAS_SIZE;

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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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
          // If the saved mask dimensions no longer match the canvas
          // (source image changed), clear instead of stretching.
          if (img.naturalWidth !== c.width || img.naturalHeight !== c.height) {
            ctx.clearRect(0, 0, c.width, c.height);
            resolve();
            return;
          }
          ctx.clearRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
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
  }, [propsMaskData, ensureCanvas, loadDataUrlIntoCanvas, canvasW, canvasH]);

  // ── Drawing primitives ───────────────────────────────────────────
  const pointerActiveRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const eventToCanvasXY = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
      const c = ensureCanvas();
      if (!c) return { x: 0, y: 0 };
      const rect = c.getBoundingClientRect();
      const sx = c.width / Math.max(1, rect.width);
      const sy = c.height / Math.max(1, rect.height);
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
      const c = ensureCanvas();
      const ctx = c?.getContext("2d");
      if (!c || !ctx) return;
      const from = lastPointRef.current ?? to;
      ctx.save();
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (tool === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = `rgba(0,0,0,${brushOpacity})`;
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = brushOpacity;
        ctx.strokeStyle = color;
      }
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();
      lastPointRef.current = to;
    },
    [brushOpacity, brushSize, color, ensureCanvas, tool]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.stopPropagation();
      const c = ensureCanvas();
      if (!c) return;
      pointerActiveRef.current = true;
      isDirtyRef.current = true;
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

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!pointerActiveRef.current) return;
      drawStrokeTo(eventToCanvasXY(e));
    },
    [drawStrokeTo, eventToCanvasXY]
  );

  const pointerCaptureTargetRef = useRef<HTMLCanvasElement | null>(null);

  const finishStroke = useCallback(
    (e?: React.PointerEvent<HTMLCanvasElement>) => {
      if (!pointerActiveRef.current) return;
      pointerActiveRef.current = false;
      lastPointRef.current = null;
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
    [snapshotMask, writeMaskData]
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
          // Release any active pointer capture when the component unmounts.
          const activeId = (target as any).ownerDocument?.pointerLockElement
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
  const imageProperty = useMemo(
    () => properties.filter((p) => p.name === "image"),
    [properties]
  );

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

  const undoDisabled = undoStackRef.current.length === 0;
  const redoDisabled = redoStackRef.current.length === 0;
  // historyTick keeps lint + react aware that disabled state can change.
  void historyTick;

  return (
    <div css={cssStyles} className="painter-body" data-bespoke-body="Painter">
      <div className="paint-row">
        <div className="paint-area">
          {sourceSrc ? (
            <div className="paint-stage">
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
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            </div>
          ) : (
            <div className="paint-stage">
              <canvas
                ref={canvasRef}
                className="paint nodrag"
                width={canvasW}
                height={canvasH}
                style={{
                  position: "relative",
                  width: canvasW,
                  height: canvasH,
                  maxWidth: "100%",
                  maxHeight: "100%"
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
              <CheckerDropzone
                message="Paint, or connect an image"
                icon={<ImageIcon />}
              />
            </div>
          )}
          <HandleColumn id={id} properties={imageProperty} />
        </div>

        <FlexColumn className="toolbar nodrag" gap={0.75}>
          <div>
            <label htmlFor={`painter-size-${id}`}>Size</label>
            <NumberInput
              id={`painter-size-${id}`}
              nodeId={id}
              name="brush_size"
              description="Brush size (px)"
              value={brushSize}
              min={1}
              max={256}
              size="small"
              color="secondary"
              inputType="int"
              showSlider={false}
              onChange={onBrushSize}
            />
          </div>
          <div>
            <label htmlFor={`painter-opacity-${id}`}>Opacity</label>
            <NumberInput
              id={`painter-opacity-${id}`}
              nodeId={id}
              name="brush_opacity"
              description="Brush opacity (0 – 1)"
              value={brushOpacity}
              min={0}
              max={1}
              size="small"
              color="secondary"
              inputType="float"
              showSlider={false}
              onChange={onBrushOpacity}
            />
          </div>
          <div>
            <label htmlFor={`painter-color-${id}`}>Color</label>
            <input
              id={`painter-color-${id}`}
              className="color-input"
              type="color"
              value={color}
              onChange={onColorChange}
            />
          </div>
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
              <AutoFixHighIcon />
            </ToggleOption>
          </ToggleGroup>
        </FlexColumn>
      </div>

      <FlexRow className="bottom-row" align="center" gap={0.5}>
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
        <div className="fade-field">
          <NumberInput
            id={`painter-fade-${id}`}
            nodeId={id}
            name="bg_fade"
            description="Background fade (0 = hide, 1 = full)"
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
        <ToolbarIconButton
          className="nodrag"
          size="small"
          onClick={onClear}
          tooltip="Clear painted mask"
          icon={<RestartAltIcon fontSize="small" />}
        />
      </FlexRow>

      {!isOutputNode && (
        <div className="outputs-row">
          <NodeOutputs
            id={id}
            outputs={nodeMetadata.outputs}
            isStreamingOutput={nodeMetadata.is_streaming_output}
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
