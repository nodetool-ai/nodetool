/** @jsxImportSource @emotion/react */
/**
 * LevelsBody — bespoke body for `nodetool.image.Levels` (plan §9.E1, PR 15).
 *
 * Layout:
 *   • Full-bleed image preview (top)
 *   • Histogram canvas with R / G / B / Luminance view toggle
 *   • Channel selector (R / G / B) → 3 sliders (Black / Gamma / White)
 *   • Reset button restores neutral values
 *
 * Histogram is computed off the node's own output image via
 * `computeHistogramAsync`, which auto-offloads to a web worker for images
 * with > 1024² pixels (1_048_576) to keep the main thread responsive.
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
import { ToggleGroup, ToggleOption, BORDER_RADIUS } from "../../ui_primitives";
import ImageIcon from "@mui/icons-material/Image";
import RestartAltIcon from "@mui/icons-material/RestartAlt";

import {
  CheckerDropzone,
  FlexColumn,
  FlexRow,
  NodeSlider,
  StateIconButton
} from "../../ui_primitives";
import HandleColumn from "../../node/HandleColumn";
import ImageView from "../../node/ImageView";
import ImageRefPreview from "../../node/ImageRefPreview";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";

import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { useBespokePropertyWriter } from "../../../hooks/nodes/useBespokePropertyWriter";
import { useNodeOutput } from "../../../hooks/nodes/useNodeIO";
import { computeHistogramAsync } from "../../../utils/histogram/histogramAsync";
import type { ImageHistogram } from "../../../utils/histogram/computeHistogram";
import { LEVELS_NODE_TYPE } from "../../../constants/nodeTypes";

type ChannelKey = "r" | "g" | "b";
type HistogramView = "r" | "g" | "b" | "luminance";

const CHANNEL_OPTIONS: ReadonlyArray<{ value: ChannelKey; label: string }> = [
  { value: "r", label: "R" },
  { value: "g", label: "G" },
  { value: "b", label: "B" }
];

const HIST_VIEW_OPTIONS: ReadonlyArray<{ value: HistogramView; label: string }> = [
  { value: "r", label: "R" },
  { value: "g", label: "G" },
  { value: "b", label: "B" },
  { value: "luminance", label: "L" }
];

const HIST_HEIGHT = 56;
const HIST_DPR_CAP = 2;

const styles = (theme: Theme) =>
  css({
    "&.levels-body": {
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
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      "& img": {
        display: "block",
        maxWidth: "100%",
        maxHeight: "100%",
        objectFit: "contain"
      }
    },
    ".histogram-area": {
      flex: "0 0 auto",
      position: "relative",
      backgroundColor: theme.vars.palette.grey[900],
      borderRadius: BORDER_RADIUS.sm,
      padding: theme.spacing(0.5),
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.5)
    },
    ".histogram-canvas": {
      width: "100%",
      height: HIST_HEIGHT,
      display: "block"
    },
    ".controls": {
      flex: "0 0 auto"
    },
    ".channel-toggle, .hist-toggle": {
      width: "100%",
      ".MuiToggleButton-root": {
        flex: "1 1 auto",
        padding: `${theme.spacing(0.5)} ${theme.spacing(0.5)}`,
        fontSize: theme.fontSizeSmaller,
        fontFamily: theme.fontFamily2,
        textTransform: "none",
        minWidth: 0
      }
    },
    ".slider-row": {
      paddingLeft: theme.spacing(0.5),
      paddingRight: theme.spacing(0.5)
    },
    ".slider-label": {
      flex: "0 0 auto",
      minWidth: 48,
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.secondary
    },
    ".slider-readout": {
      flex: "0 0 auto",
      minWidth: 36,
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.secondary,
      textAlign: "right"
    },
    ".action-row": {
      paddingTop: theme.spacing(0.5),
      display: "flex",
      justifyContent: "flex-end"
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

const ImagePreview: React.FC<{ value: unknown }> = ({ value }) => (
  <ImageRefPreview
    value={value}
    placeholder={
      <CheckerDropzone message="Connect an image, then run" icon={<ImageIcon />} />
    }
  />
);

/** Decode any image source the result store gives us into RGBA pixels. */
async function loadRgba(
  source: string | undefined,
  signal: AbortSignal
): Promise<{ rgba: Uint8ClampedArray; width: number; height: number } | null> {
  if (!source || signal.aborted) return null;
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = source;
  });
  if (signal.aborted) return null;
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return {
    rgba: data.data,
    width: canvas.width,
    height: canvas.height
  };
}

function drawHistogram(
  canvas: HTMLCanvasElement,
  bins: Uint32Array,
  colorRgb: string
): void {
  const dpr = Math.min(HIST_DPR_CAP, window.devicePixelRatio || 1);
  const cssW = canvas.clientWidth || 256;
  const cssH = HIST_HEIGHT;
  if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  let peak = 0;
  for (let i = 0; i < 256; i++) {
    if (bins[i] > peak) peak = bins[i];
  }
  if (peak === 0) return;

  // Clip extreme outliers so the histogram is readable.
  const cap = Math.max(1, peak * 0.85);
  const binW = cssW / 256;
  ctx.fillStyle = colorRgb;
  for (let i = 0; i < 256; i++) {
    const h = Math.min(1, bins[i] / cap) * cssH;
    ctx.fillRect(i * binW, cssH - h, Math.max(1, binW), h);
  }
}

const HIST_COLORS: Record<HistogramView, string> = {
  r: "rgba(244, 67, 54, 0.85)",
  g: "rgba(76, 175, 80, 0.85)",
  b: "rgba(33, 150, 243, 0.85)",
  luminance: "rgba(255, 255, 255, 0.85)"
};

export interface LevelsBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const LevelsBodyInner: React.FC<LevelsBodyProps> = ({
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
  const imageProperty = useMemo(
    () => properties.filter((p) => p.name === "image"),
    [properties]
  );

  const props = data.properties ?? {};
  const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const clampGamma = (n: number) => Math.max(0.01, Math.min(10, n));

  const r_black = clamp255(Number(props.r_black ?? 0));
  const r_gamma = clampGamma(Number(props.r_gamma ?? 1));
  const r_white = clamp255(Number(props.r_white ?? 255));
  const g_black = clamp255(Number(props.g_black ?? 0));
  const g_gamma = clampGamma(Number(props.g_gamma ?? 1));
  const g_white = clamp255(Number(props.g_white ?? 255));
  const b_black = clamp255(Number(props.b_black ?? 0));
  const b_gamma = clampGamma(Number(props.b_gamma ?? 1));
  const b_white = clamp255(Number(props.b_white ?? 255));

  const previewValue = useNodeOutput(workflowId, id);

  const previewSource = useMemo<string | undefined>(() => {
    if (typeof previewValue === "string" && previewValue) return previewValue;
    const ref = asImageRef(previewValue);
    if (ref?.uri) return ref.uri;
    if (ref?.data instanceof Uint8Array) {
      const buf = new ArrayBuffer(ref.data.byteLength);
      new Uint8Array(buf).set(ref.data);
      return URL.createObjectURL(new Blob([buf]));
    }
    if (Array.isArray(ref?.data)) {
      return URL.createObjectURL(
        new Blob([new Uint8Array(ref!.data as number[])])
      );
    }
    return undefined;
  }, [previewValue]);

  // Revoke blob URLs on unmount / change to prevent leaks.
  const blobUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const current = previewSource;
    if (current && current.startsWith("blob:")) {
      blobUrlRef.current = current;
    }
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [previewSource]);

  const [histogram, setHistogram] = useState<ImageHistogram | null>(null);
  const [histView, setHistView] = useState<HistogramView>("luminance");

  // Recompute histogram when the preview source changes.
  useEffect(() => {
    if (!previewSource) {
      setHistogram(null);
      return;
    }
    const ctrl = new AbortController();
    (async () => {
      try {
        const rgba = await loadRgba(previewSource, ctrl.signal);
        if (!rgba || ctrl.signal.aborted) return;
        const hist = await computeHistogramAsync(rgba);
        if (ctrl.signal.aborted) return;
        setHistogram(hist);
      } catch {
        // Decode / worker errors — silently leave the previous histogram.
      }
    })();
    return () => ctrl.abort();
  }, [previewSource]);

  // Paint the canvas whenever histogram or view changes.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !histogram) return;
    drawHistogram(canvas, histogram[histView], HIST_COLORS[histView]);
  }, [histogram, histView]);

  const { setProperty, setProperties, setPropertyComplete } =
    useBespokePropertyWriter({ nodeId: id, nodeType });

  const [channel, setChannel] = useState<ChannelKey>("r");

  const handleChannelChange = useCallback(
    (_: React.MouseEvent<HTMLElement>, next: string | null) => {
      if (next === "r" || next === "g" || next === "b") setChannel(next);
    },
    []
  );

  const handleHistViewChange = useCallback(
    (_: React.MouseEvent<HTMLElement>, next: string | null) => {
      if (
        next === "r" ||
        next === "g" ||
        next === "b" ||
        next === "luminance"
      ) {
        setHistView(next);
      }
    },
    []
  );

  const channelProps = useMemo(() => {
    if (channel === "r") {
      return {
        black: r_black,
        gamma: r_gamma,
        white: r_white,
        keys: ["r_black", "r_gamma", "r_white"]
      };
    }
    if (channel === "g") {
      return {
        black: g_black,
        gamma: g_gamma,
        white: g_white,
        keys: ["g_black", "g_gamma", "g_white"]
      };
    }
    return {
      black: b_black,
      gamma: b_gamma,
      white: b_white,
      keys: ["b_black", "b_gamma", "b_white"]
    };
  }, [
    channel,
    r_black,
    r_gamma,
    r_white,
    g_black,
    g_gamma,
    g_white,
    b_black,
    b_gamma,
    b_white
  ]);

  const handleBlackChange = useCallback(
    (_: Event, v: number | number[]) => {
      const next = clamp255(Array.isArray(v) ? v[0] : v);
      setProperty(channelProps.keys[0], next);
    },
    [setProperty, channelProps.keys]
  );
  const handleGammaChange = useCallback(
    (_: Event, v: number | number[]) => {
      const next = clampGamma(Array.isArray(v) ? v[0] : v);
      setProperty(channelProps.keys[1], next);
    },
    [setProperty, channelProps.keys]
  );
  const handleWhiteChange = useCallback(
    (_: Event, v: number | number[]) => {
      const next = clamp255(Array.isArray(v) ? v[0] : v);
      setProperty(channelProps.keys[2], next);
    },
    [setProperty, channelProps.keys]
  );

  const commit = useCallback(() => setPropertyComplete(), [setPropertyComplete]);

  const handleReset = useCallback(() => {
    setProperties({
      r_black: 0,
      r_gamma: 1,
      r_white: 255,
      g_black: 0,
      g_gamma: 1,
      g_white: 255,
      b_black: 0,
      b_gamma: 1,
      b_white: 255
    });
    setPropertyComplete();
  }, [setProperties, setPropertyComplete]);

  return (
    <div
      css={cssStyles}
      className="levels-body"
      data-bespoke-body="Levels"
    >
      <HandleColumn id={id} properties={imageProperty} />
      <div className="preview-area">
        <ImagePreview value={previewValue} />
      </div>

      <div className="histogram-area">
        <canvas ref={canvasRef} className="histogram-canvas" />
        <ToggleGroup
          className="hist-toggle"
          size="small"
          value={histView}
          exclusive
          onChange={handleHistViewChange}
          aria-label="Histogram channel"
        >
          {HIST_VIEW_OPTIONS.map((o) => (
            <ToggleOption key={o.value} value={o.value} aria-label={o.label}>
              {o.label}
            </ToggleOption>
          ))}
        </ToggleGroup>
      </div>

      <FlexColumn className="controls" gap={0.5}>
        <FlexRow align="center" gap={0.5}>
          <ToggleGroup
            className="channel-toggle"
            size="small"
            value={channel}
            exclusive
            onChange={handleChannelChange}
            aria-label="Channel"
          >
            {CHANNEL_OPTIONS.map((o) => (
              <ToggleOption key={o.value} value={o.value} aria-label={o.label}>
                {o.label}
              </ToggleOption>
            ))}
          </ToggleGroup>
        </FlexRow>

        <FlexRow className="slider-row" align="center" gap={0.5}>
          <span className="slider-label">Black</span>
          <NodeSlider
            min={0}
            max={255}
            step={1}
            value={channelProps.black}
            onChange={handleBlackChange}
            onChangeCommitted={commit}
            aria-label="Black point"
          />
          <span className="slider-readout">{channelProps.black}</span>
        </FlexRow>
        <FlexRow className="slider-row" align="center" gap={0.5}>
          <span className="slider-label">Gamma</span>
          <NodeSlider
            min={0.1}
            max={10}
            step={0.01}
            value={channelProps.gamma}
            onChange={handleGammaChange}
            onChangeCommitted={commit}
            aria-label="Gamma"
          />
          <span className="slider-readout">{channelProps.gamma.toFixed(2)}</span>
        </FlexRow>
        <FlexRow className="slider-row" align="center" gap={0.5}>
          <span className="slider-label">White</span>
          <NodeSlider
            min={0}
            max={255}
            step={1}
            value={channelProps.white}
            onChange={handleWhiteChange}
            onChangeCommitted={commit}
            aria-label="White point"
          />
          <span className="slider-readout">{channelProps.white}</span>
        </FlexRow>

        <div className="action-row">
          <StateIconButton
            size="small"
            icon={<RestartAltIcon fontSize="small" />}
            tooltip="Reset levels"
            ariaLabel="Reset levels"
            onClick={handleReset}
          />
        </div>
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

export const LevelsBody = memo(LevelsBodyInner);
LevelsBody.displayName = "LevelsBody";

export { LEVELS_NODE_TYPE };
export default LevelsBody;
