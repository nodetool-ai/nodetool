/** @jsxImportSource @emotion/react */
/**
 * BlurBody — bespoke body for `nodetool.image.Blur` (plan §9.E4, PR 12).
 *
 * Image preview at top with a CSS-filter approximation of the current blur
 * for instant visual feedback; server reconciles on commit. Bottom: type
 * dropdown (Gaussian / Box / Motion) and a 0–100 size slider.
 */

import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import type { SelectChangeEvent } from "@mui/material/Select";
import ImageIcon from "@mui/icons-material/Image";
import { shallow } from "zustand/shallow";

import {
  CheckerDropzone,
  FlexColumn,
  FlexRow,
  NodeSlider
} from "../../ui_primitives";
import HandleColumn from "../../node/HandleColumn";
import ImageView from "../../node/ImageView";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";

import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import useResultsStore from "../../../stores/ResultsStore";
import { useBespokePropertyWriter } from "../../../hooks/nodes/useBespokePropertyWriter";

const BLUR_NODE_TYPE = "nodetool.image.Blur";

type BlurType = "gaussian" | "box" | "motion";

const BLUR_TYPES: ReadonlyArray<{ value: BlurType; label: string }> = [
  { value: "gaussian", label: "Gaussian" },
  { value: "box", label: "Box" },
  { value: "motion", label: "Motion" }
];

const SIZE_MARKS = [
  { value: 0, label: "0" },
  { value: 25 },
  { value: 50, label: "50" },
  { value: 75 },
  { value: 100, label: "100" }
];

const styles = (theme: Theme) =>
  css({
    "&.blur-body": {
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
      overflow: "hidden",
      backgroundColor: theme.vars.palette.grey[900],
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      "& > .handle-column": {
        top: 0,
        bottom: 0,
        left: `calc(${theme.spacing(-0.5)})`
      },
      ".blur-wrap": {
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "filter 60ms linear",
        willChange: "filter"
      },
      "& img": {
        display: "block",
        maxWidth: "100%",
        maxHeight: "100%",
        objectFit: "contain"
      }
    },
    ".controls": {
      flex: "0 0 auto",
      paddingTop: theme.spacing(0.25)
    },
    ".type-row": {
      paddingLeft: theme.spacing(0.5),
      paddingRight: theme.spacing(0.5)
    },
    ".type-select": {
      flex: "1 1 auto",
      fontSize: theme.fontSizeSmaller,
      ".MuiSelect-select": {
        padding: `${theme.spacing(0.5)} ${theme.spacing(1)}`
      }
    },
    ".size-row": {
      paddingLeft: theme.spacing(0.5),
      paddingRight: theme.spacing(0.5)
    },
    ".size-readout": {
      flex: "0 0 auto",
      minWidth: 32,
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.secondary,
      textAlign: "right"
    },
    ".outputs-row": {
      flex: "0 0 auto"
    }
  });

const extractImageRef = (
  value: unknown
): { uri?: string; data?: unknown } => {
  if (!value || typeof value !== "object") {
    return {};
  }
  const v = value as Record<string, unknown>;
  return {
    uri: typeof v.uri === "string" ? (v.uri as string) : undefined,
    data: v.data
  };
};

const ImagePreview: React.FC<{ value: unknown }> = ({ value }) => {
  if (typeof value === "string" && value) {
    return <ImageView source={value} />;
  }
  const v = extractImageRef(value);
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
    <CheckerDropzone
      message="Connect an image, then run"
      icon={<ImageIcon />}
    />
  );
};

export interface BlurBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const BlurBodyInner: React.FC<BlurBodyProps> = ({
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
  const size = Math.max(0, Math.min(100, Number(props.size ?? 0)));
  const rawType = String(props.blur_type ?? "gaussian");
  const blurType: BlurType = (BLUR_TYPES.find((t) => t.value === rawType)
    ?.value ?? "gaussian") as BlurType;

  // Live preview filter — CSS `blur(Npx)` is a Gaussian; we use it as a
  // visual approximation for all three modes and let the server output
  // reconcile the exact algorithm once a run lands.
  const filter = useMemo(() => {
    if (!size) return "none";
    const px = Math.max(0, size * 0.5);
    return `blur(${px}px)`;
  }, [size]);

  const result = useResultsStore(
    (state) => state.getResult(workflowId, id),
    shallow
  );
  const previewValue = useMemo(() => {
    if (result && typeof result === "object" && !Array.isArray(result)) {
      const r = result as Record<string, unknown>;
      if ("output" in r) {
        return r.output;
      }
    }
    return result;
  }, [result]);

  const { setProperty, setPropertyComplete } = useBespokePropertyWriter({
    nodeId: id,
    nodeType
  });

  const handleTypeChange = useCallback(
    (event: SelectChangeEvent<BlurType>) => {
      setProperty("blur_type", event.target.value);
      setPropertyComplete();
    },
    [setProperty, setPropertyComplete]
  );

  const handleSizeChange = useCallback(
    (_: Event, v: number | number[]) => {
      const next = Array.isArray(v) ? v[0] : v;
      setProperty("size", Math.round(next));
    },
    [setProperty]
  );

  const handleSizeCommitted = useCallback(
    () => setPropertyComplete(),
    [setPropertyComplete]
  );

  return (
    <div css={cssStyles} className="blur-body" data-bespoke-body="Blur">
      <div className="preview-area">
        <div className="blur-wrap" style={{ filter }}>
          <ImagePreview value={previewValue} />
        </div>
        <HandleColumn id={id} properties={imageProperty} />
      </div>

      <FlexColumn className="controls" gap={0.5}>
        <FlexRow className="type-row" align="center" gap={0.5}>
          <Select
            className="type-select"
            size="small"
            variant="standard"
            value={blurType}
            onChange={handleTypeChange}
            aria-label="Blur type"
            disableUnderline
          >
            {BLUR_TYPES.map((t) => (
              <MenuItem key={t.value} value={t.value} dense>
                {t.label}
              </MenuItem>
            ))}
          </Select>
        </FlexRow>
        <FlexRow className="size-row" align="center" gap={0.5}>
          <NodeSlider
            min={0}
            max={100}
            step={1}
            marks={SIZE_MARKS}
            value={size}
            onChange={handleSizeChange}
            onChangeCommitted={handleSizeCommitted}
            aria-label="Blur size"
          />
          <span className="size-readout">{Math.round(size)}</span>
        </FlexRow>
      </FlexColumn>

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

export const BlurBody = memo(BlurBodyInner);
BlurBody.displayName = "BlurBody";

export { BLUR_NODE_TYPE };
export default BlurBody;
