/** @jsxImportSource @emotion/react */
/**
 * CropBody — bespoke body for `nodetool.image.Crop` (plan §9.E2, PR 11).
 *
 * Top: image preview with a draggable crop rectangle overlay (4 corner +
 * 4 edge handles, drag-to-move interior). The overlay lives in image-
 * pixel space; left/top/right/bottom on the node correspond directly to
 * `CropNode`'s backend props.
 *
 * Bottom: aspect-ratio dropdown, W/H inputs (read-write, derived from
 * right-left / bottom-top), Reset button.
 *
 * Preview source resolution:
 *   1. Upstream node's result via the edge feeding our `image` input
 *   2. Constant `image` prop value (when input is unconnected)
 *   3. Our own result (post-run fallback so the user sees something)
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
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import type { SelectChangeEvent } from "@mui/material/Select";

import { CheckerDropzone } from "../../ui_primitives";
import HandleColumn from "../../node/HandleColumn";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";
import NumberInput from "../../inputs/NumberInput";

import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { useBespokePropertyWriter } from "../../../hooks/nodes/useBespokePropertyWriter";
import { useNodeOutput, useUpstreamValue } from "../../../hooks/nodes/useNodeIO";

const CROP_NODE_TYPE = "nodetool.image.Crop";

/** Aspect-ratio dropdown options. `free` means no constraint. */
const ASPECT_OPTIONS = [
  { value: "free", label: "Free" },
  { value: "1:1", label: "1:1 Square" },
  { value: "4:3", label: "4:3" },
  { value: "3:2", label: "3:2" },
  { value: "16:9", label: "16:9" },
  { value: "3:4", label: "3:4" },
  { value: "2:3", label: "2:3" },
  { value: "9:16", label: "9:16" }
] as const;

type AspectKey = (typeof ASPECT_OPTIONS)[number]["value"];

const parseAspect = (key: AspectKey): number | null => {
  if (key === "free") return null;
  const [a, b] = key.split(":").map(Number);
  return a && b ? a / b : null;
};

const styles = (theme: Theme) =>
  css({
    "&.crop-body": {
      position: "relative",
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.5),
      padding: theme.spacing(0.5),
      minHeight: 0
    },
    "& > .handle-column": {
      top: theme.spacing(1),
      bottom: theme.spacing(1),
      left: `calc(${theme.spacing(-0.5)})`
    },
    ".preview-area": {
      position: "relative",
      flex: "1 1 auto",
      minHeight: 160,
      borderRadius: "var(--rounded-sm)",
      overflow: "hidden",
      backgroundColor: theme.vars.palette.grey[900],
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    },
    ".image-stage": {
      position: "relative",
      maxWidth: "100%",
      maxHeight: "100%",
      "& img": {
        display: "block",
        maxWidth: "100%",
        maxHeight: "100%",
        objectFit: "contain",
        userSelect: "none",
        pointerEvents: "none"
      }
    },
    ".crop-overlay": {
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      ".darken": {
        fill: "rgba(0,0,0,0.55)",
        fillRule: "evenodd",
        pointerEvents: "none"
      },
      ".crop-rect": {
        fill: "transparent",
        stroke: theme.vars.palette.secondary.main,
        strokeWidth: 1.5,
        pointerEvents: "auto",
        cursor: "move"
      },
      ".grid-line": {
        stroke: "rgba(255,255,255,0.35)",
        strokeWidth: 0.5,
        pointerEvents: "none"
      },
      ".handle": {
        fill: theme.vars.palette.secondary.main,
        stroke: theme.vars.palette.common.white,
        strokeWidth: 1,
        pointerEvents: "auto"
      }
    },
    ".dim-badge": {
      position: "absolute",
      top: theme.spacing(0.5),
      left: theme.spacing(0.5),
      padding: `${theme.spacing(0.25)} ${theme.spacing(0.75)}`,
      background: "rgba(0,0,0,0.6)",
      color: theme.vars.palette.common.white,
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      borderRadius: "var(--rounded-sm)",
      pointerEvents: "none"
    },
    ".controls": {
      flex: "0 0 auto",
      display: "grid",
      gridTemplateColumns: "auto 1fr auto",
      columnGap: theme.spacing(1),
      rowGap: theme.spacing(0.75),
      alignItems: "center",
      padding: `${theme.spacing(0.5)} ${theme.spacing(0.75)} ${theme.spacing(0.25)}`
    },
    ".ctrl-label": {
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      lineHeight: 1
    },
    ".aspect-select": {
      gridColumn: "2 / span 2",
      width: "100%",
      fontSize: theme.fontSizeSmaller,
      ".MuiSelect-select": {
        padding: `${theme.spacing(0.25)} ${theme.spacing(1)} ${theme.spacing(0.25)} 0`
      }
    },
    ".dims-cluster": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.5),
      minWidth: 0,
      "& .dim-field": {
        flex: "1 1 0",
        minWidth: 0
      },
      "& .dim-x": {
        flex: "0 0 auto",
        color: theme.vars.palette.text.secondary,
        fontSize: theme.fontSizeSmaller,
        fontFamily: theme.fontFamily2,
        userSelect: "none"
      }
    },
    ".reset-btn": {
      gridColumn: "3",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 22,
      height: 22,
      padding: 0,
      borderRadius: "var(--rounded-sm)",
      border: `1px solid ${theme.vars.palette.divider}`,
      background: "transparent",
      color: theme.vars.palette.text.secondary,
      cursor: "pointer",
      "&:hover": {
        background: theme.vars.palette.action.hover,
        color: theme.vars.palette.text.primary
      },
      "& svg": {
        fontSize: 14
      }
    },
    ".outputs-row": {
      flex: "0 0 auto"
    }
  });

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
    uri: typeof v.uri === "string" ? (v.uri as string) : undefined,
    width: typeof v.width === "number" ? (v.width as number) : undefined,
    height: typeof v.height === "number" ? (v.height as number) : undefined,
    data: v.data
  };
};

const toSource = (img: ImageRefLike | undefined): string | undefined => {
  if (!img) return undefined;
  if (img.uri) return img.uri;
  if (img.data instanceof Uint8Array) {
    // Copy into a fresh ArrayBuffer so the BlobPart type is satisfied even
    // when the source buffer is a SharedArrayBuffer view.
    const buf = new ArrayBuffer(img.data.byteLength);
    new Uint8Array(buf).set(img.data);
    return URL.createObjectURL(new Blob([buf]));
  }
  return undefined;
};

interface DragState {
  /** Which handle is being dragged. "move" = drag the rectangle. */
  kind:
    | "move"
    | "nw"
    | "n"
    | "ne"
    | "e"
    | "se"
    | "s"
    | "sw"
    | "w";
  startPointerX: number;
  startPointerY: number;
  startLeft: number;
  startTop: number;
  startRight: number;
  startBottom: number;
  /** px-per-image-pixel scaling at drag start. */
  scale: number;
}

export interface CropBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const CropBodyInner: React.FC<CropBodyProps> = ({
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

  const properties = useMemo(
    () => nodeMetadata.properties ?? [],
    [nodeMetadata.properties]
  );
  const imageProperty = useMemo(
    () => properties.filter((p) => p.name === "image"),
    [properties]
  );

  // Resolve preview source: edge feeding `image` → constant `image` prop →
  // our own output (post-run fallback so the user sees something).
  const inputValue = useUpstreamValue(
    workflowId,
    id,
    "image",
    data.properties?.image
  );
  const ownOutput = useNodeOutput(workflowId, id);

  const sourceImage: ImageRefLike | undefined = useMemo(() => {
    const fromInput = asImageRef(inputValue);
    if (fromInput && (fromInput.uri || fromInput.data)) return fromInput;
    return asImageRef(ownOutput);
  }, [inputValue, ownOutput]);

  const sourceSrc = useMemo(() => toSource(sourceImage), [sourceImage]);

  // Track the source image's natural dimensions. Prefer the metadata
  // already on the ImageRef; fall back to the `<img>`'s naturalWidth
  // on load (covers URI-only refs without dimension metadata).
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(
    null
  );
  useEffect(() => {
    if (sourceImage?.width && sourceImage?.height) {
      setImgDims({ w: sourceImage.width, h: sourceImage.height });
    }
  }, [sourceImage?.width, sourceImage?.height]);

  const onImgLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const el = e.currentTarget;
      if (el.naturalWidth > 0 && el.naturalHeight > 0) {
        setImgDims({ w: el.naturalWidth, h: el.naturalHeight });
      }
    },
    []
  );

  // ── Crop coordinates (image-pixel space) ──────────────────────────
  const props = data.properties ?? {};
  const left = Number(props.left ?? 0);
  const top = Number(props.top ?? 0);
  const right = Number(props.right ?? imgDims?.w ?? 512);
  const bottom = Number(props.bottom ?? imgDims?.h ?? 512);
  const cropW = Math.max(1, right - left);
  const cropH = Math.max(1, bottom - top);

  const [aspect, setAspect] = useState<AspectKey>("free");
  const aspectRatio = useMemo(() => parseAspect(aspect), [aspect]);

  const { setProperties, setPropertyComplete } = useBespokePropertyWriter({
    nodeId: id,
    nodeType
  });

  // Clamp & write a candidate rect to the node, optionally respecting
  // the locked aspect by adjusting whichever edge the user is dragging.
  const writeRect = useCallback(
    (next: {
      left: number;
      top: number;
      right: number;
      bottom: number;
    }) => {
      const W = imgDims?.w ?? 4096;
      const H = imgDims?.h ?? 4096;
      const cl = Math.max(0, Math.min(W - 1, Math.round(next.left)));
      const ct = Math.max(0, Math.min(H - 1, Math.round(next.top)));
      const cr = Math.max(cl + 1, Math.min(W, Math.round(next.right)));
      const cb = Math.max(ct + 1, Math.min(H, Math.round(next.bottom)));
      setProperties({ left: cl, top: ct, right: cr, bottom: cb });
    },
    [imgDims, setProperties]
  );

  // ── Drag handling on the SVG overlay ──────────────────────────────
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const renderedScale = useCallback((): number => {
    // px per image-pixel; assumes objectFit: contain.
    const stage = stageRef.current;
    if (!stage || !imgDims) return 1;
    const img = stage.querySelector("img");
    if (!img) return 1;
    const rect = img.getBoundingClientRect();
    if (rect.width <= 0 || imgDims.w <= 0) return 1;
    return rect.width / imgDims.w;
  }, [imgDims]);

  const onHandlePointerDown = useCallback(
    (kind: DragState["kind"]) =>
      (e: React.PointerEvent<SVGElement>) => {
        if (!imgDims) return;
        e.stopPropagation();
        const scale = renderedScale();
        if (scale <= 0) return;
        dragRef.current = {
          kind,
          startPointerX: e.clientX,
          startPointerY: e.clientY,
          startLeft: left,
          startTop: top,
          startRight: right,
          startBottom: bottom,
          scale
        };
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      },
    [imgDims, left, top, right, bottom, renderedScale]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGElement>) => {
      const d = dragRef.current;
      if (!d || !imgDims) return;
      const dx = (e.clientX - d.startPointerX) / d.scale;
      const dy = (e.clientY - d.startPointerY) / d.scale;

      let nl = d.startLeft;
      let nt = d.startTop;
      let nr = d.startRight;
      let nb = d.startBottom;

      switch (d.kind) {
        case "move": {
          const w = d.startRight - d.startLeft;
          const h = d.startBottom - d.startTop;
          nl = d.startLeft + dx;
          nt = d.startTop + dy;
          // Keep size constant — clamp position so we don't shrink.
          nl = Math.max(0, Math.min(imgDims.w - w, nl));
          nt = Math.max(0, Math.min(imgDims.h - h, nt));
          nr = nl + w;
          nb = nt + h;
          break;
        }
        case "nw":
          nl = d.startLeft + dx;
          nt = d.startTop + dy;
          break;
        case "n":
          nt = d.startTop + dy;
          break;
        case "ne":
          nr = d.startRight + dx;
          nt = d.startTop + dy;
          break;
        case "e":
          nr = d.startRight + dx;
          break;
        case "se":
          nr = d.startRight + dx;
          nb = d.startBottom + dy;
          break;
        case "s":
          nb = d.startBottom + dy;
          break;
        case "sw":
          nl = d.startLeft + dx;
          nb = d.startBottom + dy;
          break;
        case "w":
          nl = d.startLeft + dx;
          break;
      }

      // Apply aspect-ratio lock for non-move edits. The dominant edge
      // is whichever the user is dragging; the orthogonal edge follows.
      if (aspectRatio && d.kind !== "move") {
        const newW = Math.max(1, nr - nl);
        const newH = Math.max(1, nb - nt);
        const horizDriven =
          d.kind === "e" || d.kind === "w" || Math.abs(dx) >= Math.abs(dy);
        if (horizDriven) {
          const targetH = newW / aspectRatio;
          // Pin the anchor edge opposite to whichever vertical edge is
          // closer to the drag (n vs s); for corners use the dragged corner.
          if (d.kind === "nw" || d.kind === "ne" || d.kind === "n") {
            nt = nb - targetH;
          } else {
            nb = nt + targetH;
          }
        } else {
          const targetW = newH * aspectRatio;
          if (d.kind === "nw" || d.kind === "sw" || d.kind === "w") {
            nl = nr - targetW;
          } else {
            nr = nl + targetW;
          }
        }
      }

      writeRect({ left: nl, top: nt, right: nr, bottom: nb });
    },
    [aspectRatio, imgDims, writeRect]
  );

  const onPointerUp = useCallback(() => {
    if (dragRef.current) {
      dragRef.current = null;
      setPropertyComplete();
    }
  }, [setPropertyComplete]);

  // ── Aspect / W / H / Reset handlers ───────────────────────────────
  const handleAspectChange = useCallback(
    (event: SelectChangeEvent<AspectKey>) => {
      const key = event.target.value as AspectKey;
      setAspect(key);
      const ratio = parseAspect(key);
      if (!ratio || !imgDims) return;
      // Recompute height from the current width using the new ratio,
      // anchoring the top-left corner. Clamp to image bounds.
      const targetH = Math.round(cropW / ratio);
      const newBottom = Math.min(imgDims.h, top + targetH);
      const newTop = newBottom - targetH < 0 ? 0 : newBottom - targetH;
      writeRect({ left, top: newTop, right, bottom: newBottom });
      setPropertyComplete();
    },
    [cropW, top, left, right, imgDims, writeRect, setPropertyComplete]
  );

  const handleWidthChange = useCallback(
    (_: React.ChangeEvent<HTMLInputElement> | null, value: number) => {
      const w = Math.max(1, Math.round(value));
      let newRight = left + w;
      let newBottom = bottom;
      if (aspectRatio) {
        const h = Math.round(w / aspectRatio);
        newBottom = top + h;
      }
      writeRect({ left, top, right: newRight, bottom: newBottom });
    },
    [aspectRatio, bottom, left, top, writeRect]
  );

  const handleHeightChange = useCallback(
    (_: React.ChangeEvent<HTMLInputElement> | null, value: number) => {
      const h = Math.max(1, Math.round(value));
      let newBottom = top + h;
      let newRight = right;
      if (aspectRatio) {
        const w = Math.round(h * aspectRatio);
        newRight = left + w;
      }
      writeRect({ left, top, right: newRight, bottom: newBottom });
    },
    [aspectRatio, left, right, top, writeRect]
  );

  const handleReset = useCallback(() => {
    if (!imgDims) {
      writeRect({ left: 0, top: 0, right: 512, bottom: 512 });
    } else {
      writeRect({ left: 0, top: 0, right: imgDims.w, bottom: imgDims.h });
    }
    setPropertyComplete();
  }, [imgDims, writeRect, setPropertyComplete]);

  // ── Overlay geometry (in image-pixel space; SVG viewBox uses
  // imgDims so handle math stays in source coords). ────────────────
  const vbW = imgDims?.w ?? 1;
  const vbH = imgDims?.h ?? 1;
  // Handle radius in viewBox units = ~6px at typical scale; we keep it
  // proportional to the smaller image dimension to stay visible on
  // small thumbnails. Min 3, max ~24.
  const handleR = Math.max(3, Math.min(24, Math.min(vbW, vbH) * 0.012));

  // Rule-of-thirds grid lines within the crop rectangle.
  const gridXs = [left + cropW / 3, left + (cropW * 2) / 3];
  const gridYs = [top + cropH / 3, top + (cropH * 2) / 3];

  const widthProperty = useMemo(
    () => properties.find((p) => p.name === "right"),
    [properties]
  );
  const heightProperty = useMemo(
    () => properties.find((p) => p.name === "bottom"),
    [properties]
  );

  return (
    <div css={cssStyles} className="crop-body" data-bespoke-body="Crop">
      <HandleColumn id={id} properties={imageProperty} />
      <div className="preview-area">
        <div className="image-stage" ref={stageRef}>
          {sourceSrc ? (
            <>
              <img src={sourceSrc} onLoad={onImgLoad} alt="" />
              {imgDims && (
                <svg
                  className="crop-overlay"
                  viewBox={`0 0 ${vbW} ${vbH}`}
                  preserveAspectRatio="none"
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                >
                  {/* Darken everything outside the crop rectangle. */}
                  <path
                    className="darken"
                    d={
                      `M0,0 H${vbW} V${vbH} H0 Z ` +
                      `M${left},${top} V${bottom} H${right} V${top} Z`
                    }
                  />
                  {/* Rule-of-thirds grid lines (inside the crop). */}
                  {gridXs.map((x) => (
                    <line
                      key={`gx-${x}`}
                      className="grid-line"
                      x1={x}
                      y1={top}
                      x2={x}
                      y2={bottom}
                    />
                  ))}
                  {gridYs.map((y) => (
                    <line
                      key={`gy-${y}`}
                      className="grid-line"
                      x1={left}
                      y1={y}
                      x2={right}
                      y2={y}
                    />
                  ))}
                  {/* Crop rectangle (drag-to-move). */}
                  <rect
                    className="crop-rect"
                    x={left}
                    y={top}
                    width={cropW}
                    height={cropH}
                    onPointerDown={onHandlePointerDown("move")}
                  />
                  {/* 4 corner + 4 edge handles. */}
                  {(
                    [
                      ["nw", left, top, "nwse-resize"],
                      ["n", (left + right) / 2, top, "ns-resize"],
                      ["ne", right, top, "nesw-resize"],
                      ["e", right, (top + bottom) / 2, "ew-resize"],
                      ["se", right, bottom, "nwse-resize"],
                      ["s", (left + right) / 2, bottom, "ns-resize"],
                      ["sw", left, bottom, "nesw-resize"],
                      ["w", left, (top + bottom) / 2, "ew-resize"]
                    ] as const
                  ).map(([k, cx, cy, cur]) => (
                    <circle
                      key={k}
                      className="handle"
                      data-handle={k}
                      cx={cx}
                      cy={cy}
                      r={handleR}
                      style={{ cursor: cur }}
                      onPointerDown={onHandlePointerDown(k)}
                    />
                  ))}
                </svg>
              )}
            </>
          ) : (
            <CheckerDropzone
              message="Connect an image, then run"
              icon={<ImageIcon />}
            />
          )}
        </div>
        {imgDims && (
          <span className="dim-badge">
            {cropW} × {cropH} px
          </span>
        )}
      </div>

      <div className="controls">
        <span className="ctrl-label">Aspect</span>
        <Select
          className="aspect-select nodrag"
          size="small"
          variant="standard"
          value={aspect}
          onChange={handleAspectChange}
          aria-label="Aspect ratio"
          disableUnderline
        >
          {ASPECT_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value} dense>
              {o.label}
            </MenuItem>
          ))}
        </Select>

        <span className="ctrl-label">Size</span>
        <div className="dims-cluster">
          <div className="dim-field">
            <NumberInput
              id={`crop-width-${id}`}
              nodeId={id}
              name="width"
              description={widthProperty?.description ?? "Crop width"}
              value={cropW}
              min={1}
              max={imgDims?.w ?? 8192}
              size="small"
              color="secondary"
              inputType="int"
              showSlider={false}
              hideLabel
              onChange={handleWidthChange}
              onChangeComplete={setPropertyComplete}
            />
          </div>
          <span className="dim-x">×</span>
          <div className="dim-field">
            <NumberInput
              id={`crop-height-${id}`}
              nodeId={id}
              name="height"
              description={heightProperty?.description ?? "Crop height"}
              value={cropH}
              min={1}
              max={imgDims?.h ?? 8192}
              size="small"
              color="secondary"
              inputType="int"
              showSlider={false}
              hideLabel
              onChange={handleHeightChange}
              onChangeComplete={setPropertyComplete}
            />
          </div>
        </div>
        <button
          type="button"
          className="reset-btn"
          onClick={handleReset}
          aria-label="Reset crop"
          title="Reset crop"
        >
          <RestartAltIcon fontSize="small" />
        </button>
      </div>

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

export const CropBody = memo(CropBodyInner);
CropBody.displayName = "CropBody";

export { CROP_NODE_TYPE };
export default CropBody;
