/** @jsxImportSource @emotion/react */
/**
 * ResizeBody — bespoke body for `nodetool.image.Resize` (plan §9.E8, PR 9).
 *
 * Image preview on top (current result or empty checker), W/H number inputs
 * on the bottom with a chain-lock toggle that constrains H when W changes
 * (and vice versa) using the W/H aspect ratio captured when the lock engages.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import LinkIcon from "@mui/icons-material/Link";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import ImageIcon from "@mui/icons-material/Image";
import { shallow } from "zustand/shallow";

import { CheckerDropzone, FlexRow, StateIconButton } from "../../ui_primitives";
import HandleColumn from "../../node/HandleColumn";
import ImageView from "../../node/ImageView";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";
import NumberInput from "../../inputs/NumberInput";

import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import useResultsStore from "../../../stores/ResultsStore";
import { useNodes } from "../../../contexts/NodeContext";
import { useSignedUrl } from "../../node/output/hooks";
import {
  useLivePreview,
  useLivePreviewActions
} from "../../../preview/useLivePreview";

const RESIZE_NODE_TYPE = "nodetool.image.Resize";

const styles = (theme: Theme) =>
  css({
    "&.resize-body": {
      position: "relative",
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.5),
      padding: theme.spacing(0.5),
      minHeight: 0
    },
    ".preview-area": {
      position: "relative",
      flex: "1 1 auto",
      minHeight: 160,
      borderRadius: "var(--rounded-sm)",
      overflow: "visible",
      backgroundColor: theme.vars.palette.grey[900],
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      "& > .handle-column": {
        top: 0,
        bottom: 0,
        left: `calc(${theme.spacing(-0.5)})`
      },
      "& img": {
        display: "block",
        width: "100%",
        height: "100%",
        objectFit: "contain"
      },
      ".dimensions-badge": {
        position: "absolute",
        bottom: theme.spacing(0.5),
        right: theme.spacing(0.5),
        padding: `${theme.spacing(0.25)} ${theme.spacing(0.75)}`,
        background: "rgba(0,0,0,0.6)",
        color: theme.vars.palette.common.white,
        fontFamily: theme.fontFamily2,
        fontSize: theme.fontSizeSmaller,
        borderRadius: "var(--rounded-sm)",
        pointerEvents: "none"
      }
    },
    ".controls-row": {
      flex: "0 0 auto",
      display: "flex",
      alignItems: "flex-end",
      gap: theme.spacing(0.5)
    },
    ".dim-field": {
      flex: "1 1 50%",
      minWidth: 0
    },
    ".outputs-row": {
      flex: "0 0 auto"
    }
  });

const extractDims = (
  value: unknown
): { width?: number; height?: number; uri?: string; data?: unknown } => {
  if (!value || typeof value !== "object") {
    return {};
  }
  const v = value as Record<string, unknown>;
  return {
    width: typeof v.width === "number" ? (v.width as number) : undefined,
    height: typeof v.height === "number" ? (v.height as number) : undefined,
    uri: typeof v.uri === "string" ? (v.uri as string) : undefined,
    data: v.data
  };
};

/**
 * Decode an arbitrary image carrier into raw bytes.
 * Returns `null` when the value doesn't contain inline bytes — caller must
 * decide how to handle (typically: skip the preview update).
 */
const bytesFromValue = (value: unknown): Uint8Array | null => {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") {
    // base64 or data URI
    const raw = value.startsWith("data:")
      ? value.slice(value.indexOf(",") + 1)
      : value;
    try {
      const bin = atob(raw);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch {
      return null;
    }
  }
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (v.data instanceof Uint8Array) return v.data;
    if (Array.isArray(v.data)) return new Uint8Array(v.data as number[]);
    // Recurse through the typical ImageRef wrapper { output: { data, ... } }
    if (v.output !== undefined) return bytesFromValue(v.output);
  }
  return null;
};

const ImagePreview: React.FC<{ value: unknown }> = ({ value }) => {
  if (typeof value === "string" && value) {
    return <ImageView source={value} />;
  }
  const v = extractDims(value);
  if (v.uri) {
    return <ImageView source={v.uri} />;
  }
  if (v.data instanceof Uint8Array) {
    return <ImageView source={v.data} />;
  }
  if (Array.isArray(v.data)) {
    return <ImageView source={new Uint8Array(v.data as number[])} />;
  }
  return (
    <CheckerDropzone message="Connect an image, then run" icon={<ImageIcon />} />
  );
};

export interface ResizeBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const ResizeBodyInner: React.FC<ResizeBodyProps> = ({
  id,
  nodeMetadata,
  data,
  workflowId,
  status,
  isOutputNode
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  const properties = nodeMetadata.properties ?? [];
  // Image input — rendered as a left-edge handle.
  const imageProperty = useMemo(
    () => properties.filter((p) => p.name === "image"),
    [properties]
  );
  const widthProperty = useMemo(
    () => properties.find((p) => p.name === "width"),
    [properties]
  );
  const heightProperty = useMemo(
    () => properties.find((p) => p.name === "height"),
    [properties]
  );

  const widthValue = Number(data.properties?.width ?? widthProperty?.default ?? 512);
  const heightValue = Number(data.properties?.height ?? heightProperty?.default ?? 512);

  const result = useResultsStore(
    (state) => state.getResult(workflowId, id),
    shallow
  );
  // Resize emits a single named output "output" — extract it for preview.
  const serverPreviewValue = useMemo(() => {
    if (result && typeof result === "object" && !Array.isArray(result)) {
      const r = result as Record<string, unknown>;
      if ("output" in r) {
        return r.output;
      }
    }
    return result;
  }, [result]);

  // Client-side overlay. When present, it wins over the server result so the
  // user sees their slider drag immediately.
  const livePreview = useLivePreview(id);
  const previewValue = livePreview ?? serverPreviewValue;
  const previewDims = useMemo(() => extractDims(previewValue), [previewValue]);

  const updateNodeProperties = useNodes((state) => state.updateNodeProperties);

  // Resolve the upstream image source for live preview.
  //
  // Three candidate sources, tried in order:
  //   1. Server result for the upstream node (workflow has run at least once).
  //   2. Upstream node's `value` property — covers Constant.Image, which
  //      carries its image inline without ever running the workflow.
  //   3. This node's own `data.properties.image` (rare; defensive fallback).
  //
  // Image values may carry raw bytes (data: Uint8Array) OR just a URI. For the
  // URI path we plumb through useSignedUrl to get a fetchable URL, then fetch
  // the bytes once and cache them in local state. Slider drags reuse the cache.
  const upstreamSourceId = useNodes((state) => {
    const edge = state.edges.find(
      (e) => e.target === id && e.targetHandle === "image"
    );
    return edge?.source;
  });
  const upstreamResult = useResultsStore((state) =>
    upstreamSourceId
      ? state.getResult(workflowId, upstreamSourceId)
      : undefined
  );
  const upstreamValueProperty = useNodes((state) => {
    if (!upstreamSourceId) return undefined;
    const n = state.findNode(upstreamSourceId);
    const props = (n?.data as { properties?: Record<string, unknown> } | undefined)
      ?.properties;
    return props?.value;
  });

  const upstreamCandidate = useMemo(() => {
    if (upstreamResult !== undefined) {
      if (
        typeof upstreamResult === "object" &&
        upstreamResult !== null &&
        !Array.isArray(upstreamResult) &&
        "output" in (upstreamResult as Record<string, unknown>)
      ) {
        return (upstreamResult as Record<string, unknown>).output;
      }
      return upstreamResult;
    }
    if (upstreamValueProperty && typeof upstreamValueProperty === "object") {
      return upstreamValueProperty;
    }
    return data.properties?.image;
  }, [upstreamResult, upstreamValueProperty, data.properties?.image]);

  const candidateUri = useMemo(() => {
    const v = upstreamCandidate as { uri?: string } | undefined;
    return typeof v?.uri === "string" && v.uri.length > 0 ? v.uri : undefined;
  }, [upstreamCandidate]);
  const signedUrl = useSignedUrl(candidateUri);

  // Cached source bytes for the preview pipeline.
  const [sourceBytes, setSourceBytes] = useState<{
    data: Uint8Array;
    width?: number;
    height?: number;
  } | null>(null);

  useEffect(() => {
    // Path 1: inline bytes (data: Uint8Array | base64).
    const inline = bytesFromValue(upstreamCandidate);
    if (inline && inline.byteLength > 0) {
      const dims = extractDims(upstreamCandidate);
      setSourceBytes({
        data: inline,
        width: dims.width,
        height: dims.height
      });
      return;
    }
    // Path 2: fetch via signed URL.
    if (signedUrl) {
      let cancelled = false;
      void fetch(signedUrl)
        .then((r) => r.arrayBuffer())
        .then((buf) => {
          if (cancelled) return;
          const dims = extractDims(upstreamCandidate);
          setSourceBytes({
            data: new Uint8Array(buf),
            width: dims.width,
            height: dims.height
          });
        })
        .catch(() => {
          if (!cancelled) setSourceBytes(null);
        });
      return () => {
        cancelled = true;
      };
    }
    setSourceBytes(null);
    return undefined;
  }, [upstreamCandidate, signedUrl]);

  const { runPreview } = useLivePreviewActions();

  const [chainLocked, setChainLocked] = useState(false);
  // Aspect captured when the lock engages — kept as a ref so it survives
  // re-renders without re-triggering effects.
  const aspectRef = useRef<number | null>(null);
  useEffect(() => {
    if (chainLocked && aspectRef.current === null && widthValue > 0 && heightValue > 0) {
      aspectRef.current = widthValue / heightValue;
    }
    if (!chainLocked) {
      aspectRef.current = null;
    }
  }, [chainLocked, widthValue, heightValue]);

  const triggerPreview = useCallback(
    (w: number, h: number) => {
      if (!sourceBytes) return;
      // Fire-and-forget — the hook handles debouncing and stale-token guards.
      void runPreview(id, "resize", { width: w, height: h }, sourceBytes);
    },
    [id, sourceBytes, runPreview]
  );

  // Once bytes are resolved, fire an initial preview at the current W/H so the
  // body shows the resize immediately on mount (and when the upstream loads).
  useEffect(() => {
    if (sourceBytes) {
      void runPreview(
        id,
        "resize",
        { width: widthValue, height: heightValue },
        sourceBytes
      );
    }
    // Only re-fire on sourceBytes identity change (upstream load) — the W/H
    // change handlers fire the preview themselves.
  }, [sourceBytes]);

  const setWidth = useCallback(
    (next: number) => {
      const w = Math.max(1, Math.round(next));
      let h = heightValue;
      if (chainLocked && aspectRef.current && aspectRef.current > 0) {
        h = Math.max(1, Math.round(w / aspectRef.current));
        updateNodeProperties(id, { width: w, height: h });
      } else {
        updateNodeProperties(id, { width: w });
      }
      triggerPreview(w, h);
    },
    [chainLocked, heightValue, id, triggerPreview, updateNodeProperties]
  );

  const setHeight = useCallback(
    (next: number) => {
      const h = Math.max(1, Math.round(next));
      let w = widthValue;
      if (chainLocked && aspectRef.current && aspectRef.current > 0) {
        w = Math.max(1, Math.round(h * aspectRef.current));
        updateNodeProperties(id, { width: w, height: h });
      } else {
        updateNodeProperties(id, { height: h });
      }
      triggerPreview(w, h);
    },
    [chainLocked, widthValue, id, triggerPreview, updateNodeProperties]
  );

  const handleWidthChange = useCallback(
    (_: React.ChangeEvent<HTMLInputElement> | null, value: number) => setWidth(value),
    [setWidth]
  );
  const handleHeightChange = useCallback(
    (_: React.ChangeEvent<HTMLInputElement> | null, value: number) => setHeight(value),
    [setHeight]
  );

  return (
    <div css={cssStyles} className="resize-body" data-bespoke-body="Resize">
      <div className="preview-area">
        <ImagePreview value={previewValue} />
        {previewDims.width != null && previewDims.height != null && (
          <span className="dimensions-badge">
            {previewDims.width} × {previewDims.height}
          </span>
        )}
        <HandleColumn id={id} properties={imageProperty} />
      </div>

      <FlexRow className="controls-row" align="flex-end" gap={0.5}>
        <div className="dim-field">
          {widthProperty && (
            <NumberInput
              id={`resize-width-${id}`}
              nodeId={id}
              name="width"
              description={widthProperty.description ?? "Target width"}
              value={widthValue}
              min={widthProperty.min ?? 1}
              max={widthProperty.max ?? 8192}
              size="small"
              color="secondary"
              inputType="int"
              showSlider={false}
              onChange={handleWidthChange}
            />
          )}
        </div>
        <StateIconButton
          size="small"
          isActive={chainLocked}
          icon={<LinkOffIcon fontSize="small" />}
          activeIcon={<LinkIcon fontSize="small" />}
          tooltip={chainLocked ? "Unlock aspect ratio" : "Lock aspect ratio"}
          ariaLabel={chainLocked ? "Unlock aspect ratio" : "Lock aspect ratio"}
          onClick={() => setChainLocked((v) => !v)}
        />
        <div className="dim-field">
          {heightProperty && (
            <NumberInput
              id={`resize-height-${id}`}
              nodeId={id}
              name="height"
              description={heightProperty.description ?? "Target height"}
              value={heightValue}
              min={heightProperty.min ?? 1}
              max={heightProperty.max ?? 8192}
              size="small"
              color="secondary"
              inputType="int"
              showSlider={false}
              onChange={handleHeightChange}
            />
          )}
        </div>
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

export const ResizeBody = memo(ResizeBodyInner);
ResizeBody.displayName = "ResizeBody";

export { RESIZE_NODE_TYPE };
export default ResizeBody;
