/** @jsxImportSource @emotion/react */
/**
 * ImageCompareBody — bespoke body for `nodetool.image.Compare`.
 *
 * A before/after wipe: Image B fills the preview, Image A is revealed on the
 * left up to a draggable vertical divider. The divider position is persisted
 * as the node's `split` property (0 = all B, 1 = all A). Two image inputs sit
 * on the left edge; the graph value is a passthrough of Image A.
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

import { CheckerDropzone, BORDER_RADIUS, TYPOGRAPHY } from "../../ui_primitives";
import HandleColumn from "../../node/HandleColumn";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";

import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { useBespokePropertyWriter } from "../../../hooks/nodes/useBespokePropertyWriter";
import { useUpstreamValue } from "../../../hooks/nodes/useNodeIO";
import { asImageRef, isRawRgbaRef } from "../../../utils/imageRef";
import { createImageUrl } from "../../../utils/imageUtils";
import type {
  ImageData as ImageDataValue,
  ImageSource
} from "../../../utils/imageUtils";
import { rawRgbaToPngDataUrl } from "../../../lib/workflow/materializeBrowserOutputs";
import { COMPARE_NODE_TYPE } from "../../../constants/nodeTypes";

const styles = (theme: Theme) =>
  css({
    "&.image-compare-body": {
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
      left: `calc(${theme.spacing(0)})`
    },
    ".preview-area": {
      position: "relative",
      flex: "1 1 auto",
      minHeight: 160,
      borderRadius: BORDER_RADIUS.sm,
      overflow: "hidden",
      backgroundColor: theme.vars.palette.grey[900],
      touchAction: "none",
      cursor: "ew-resize",
      userSelect: "none"
    },
    ".layer": {
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      objectFit: "contain",
      display: "block",
      pointerEvents: "none"
    },
    ".divider": {
      position: "absolute",
      top: 0,
      bottom: 0,
      width: 2,
      marginLeft: -1,
      backgroundColor: theme.vars.palette.common.white,
      boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
      pointerEvents: "none"
    },
    ".divider-grip": {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: 18,
      height: 18,
      borderRadius: "50%",
      backgroundColor: theme.vars.palette.common.white,
      boxShadow: "0 0 0 1px rgba(0,0,0,0.4)"
    },
    ".corner-label": {
      position: "absolute",
      bottom: theme.spacing(0.5),
      padding: "1px 6px",
      borderRadius: BORDER_RADIUS.sm,
      fontSize: TYPOGRAPHY.sans.caption.fontSize,
      fontWeight: 600,
      color: theme.vars.palette.common.white,
      backgroundColor: "rgba(0,0,0,0.5)",
      pointerEvents: "none"
    },
    ".corner-label.a": { left: theme.spacing(0.5) },
    ".corner-label.b": { right: theme.spacing(0.5) },
    ".outputs-row": { flex: "0 0 auto" }
  });

/**
 * Resolve a node input/output value to a displayable image URL, mirroring the
 * preview ladder in `ImageRefPreview` but yielding a plain string we can drop
 * into a stacked `<img>` (the wipe needs two bare images, not the full
 * `ImageView` chrome). Owns any blob URL it creates so it is revoked on change
 * and unmount.
 */
const useImageSrc = (value: unknown): string => {
  const ref = useMemo(() => asImageRef(value), [value]);
  const blobRef = useRef<string | null>(null);
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!ref) {
      const { blobUrl } = createImageUrl(null, blobRef.current);
      blobRef.current = blobUrl;
      setUrl("");
      return;
    }
    if (isRawRgbaRef(ref)) {
      setUrl(rawRgbaToPngDataUrl(ref.data, ref.width, ref.height));
      return;
    }
    const data = ref.data;
    const source: ImageSource =
      typeof data === "string" ||
      data instanceof Uint8Array ||
      Array.isArray(data)
        ? { uri: ref.uri, data: data as ImageDataValue }
        : { uri: ref.uri };
    const { url: nextUrl, blobUrl } = createImageUrl(source, blobRef.current);
    blobRef.current = blobUrl;
    setUrl(nextUrl);
  }, [ref]);

  useEffect(
    () => () => {
      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    },
    []
  );

  return url;
};

export interface ImageCompareBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const ImageCompareBodyInner: React.FC<ImageCompareBodyProps> = ({
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

  const properties = nodeMetadata.properties ?? [];
  const imageHandles = useMemo(
    () =>
      properties.filter(
        (p) => p.name === "image_a" || p.name === "image_b"
      ),
    [properties]
  );

  const valueA = useUpstreamValue(
    workflowId,
    id,
    "image_a",
    data.properties?.image_a
  );
  const valueB = useUpstreamValue(
    workflowId,
    id,
    "image_b",
    data.properties?.image_b
  );
  const srcA = useImageSrc(valueA);
  const srcB = useImageSrc(valueB);
  const hasA = srcA !== "";
  const hasB = srcB !== "";

  const split = Math.max(
    0,
    Math.min(1, Number(data.properties?.split ?? 0.5))
  );

  const { setProperties, setPropertyComplete } = useBespokePropertyWriter({
    nodeId: id,
    nodeType
  });

  const areaRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const updateSplitFromPointer = useCallback(
    (clientX: number) => {
      const el = areaRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return;
      const fraction = Math.max(
        0,
        Math.min(1, (clientX - rect.left) / rect.width)
      );
      setProperties({ split: fraction });
    },
    [setProperties]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!hasA && !hasB) return;
      e.stopPropagation();
      draggingRef.current = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      updateSplitFromPointer(e.clientX);
    },
    [hasA, hasB, updateSplitFromPointer]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      updateSplitFromPointer(e.clientX);
    },
    [updateSplitFromPointer]
  );

  const onPointerUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setPropertyComplete();
  }, [setPropertyComplete]);

  // Only one side connected — show it full, no divider. The wipe needs both.
  const singleSrc = hasA && hasB ? null : hasA ? srcA : hasB ? srcB : null;

  return (
    <div
      css={cssStyles}
      className="image-compare-body"
      data-bespoke-body="Compare"
    >
      <HandleColumn id={id} properties={imageHandles} />

      <div
        ref={areaRef}
        className="preview-area nodrag nowheel"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {!hasA && !hasB && (
          <CheckerDropzone
            message="Connect Image A and Image B"
            icon={<ImageIcon />}
          />
        )}
        {singleSrc && (
          <img className="layer" src={singleSrc} alt="" draggable={false} />
        )}
        {hasA && hasB && (
          <>
            {/* Base: B fills the area; A is clipped to the left of the wipe. */}
            <img className="layer" src={srcB} alt="B" draggable={false} />
            <img
              className="layer"
              src={srcA}
              alt="A"
              draggable={false}
              style={{ clipPath: `inset(0 ${(1 - split) * 100}% 0 0)` }}
            />
            <div className="divider" style={{ left: `${split * 100}%` }}>
              <div className="divider-grip" />
            </div>
            <span className="corner-label a">A</span>
            <span className="corner-label b">B</span>
          </>
        )}
      </div>

      {!isOutputNode && (
        <div className="outputs-row">
          <NodeOutputs id={id} outputs={nodeMetadata.outputs} />
        </div>
      )}

      {status === "running" && <NodeProgress id={id} workflowId={workflowId} />}
    </div>
  );
};

export const ImageCompareBody = memo(ImageCompareBodyInner);
ImageCompareBody.displayName = "ImageCompareBody";

export { COMPARE_NODE_TYPE };
export default ImageCompareBody;
