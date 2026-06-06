/** @jsxImportSource @emotion/react */
/**
 * PasteBody — bespoke body for `nodetool.image.Paste`.
 *
 * Preview on top with a faint outline showing the paste rectangle relative
 * to the base image (derived from base dimensions, paste dimensions, and
 * the Left/Top offset). Two image inputs on the left edge — `image` (base)
 * and `paste` (overlay). Left/Top integer inputs underneath.
 */

import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ImageIcon from "@mui/icons-material/Image";

import { CheckerDropzone, FlexRow } from "../../ui_primitives";
import HandleColumn from "../../node/HandleColumn";
import ImageView from "../../node/ImageView";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";
import NumberInput from "../../inputs/NumberInput";

import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { useBespokePropertyWriter } from "../../../hooks/nodes/useBespokePropertyWriter";
import {
  useNodeOutput,
  useUpstreamValue
} from "../../../hooks/nodes/useNodeIO";
import { asImageRef } from "../../../utils/imageRef";
import { PASTE_NODE_TYPE } from "../../../constants/nodeTypes";

const styles = (theme: Theme) =>
  css({
    "&.paste-body": {
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
      borderRadius: "var(--rounded-sm)",
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
      },
      ".overlay-rect": {
        position: "absolute",
        boxSizing: "border-box",
        border: `1px dashed ${theme.vars.palette.primary.main}`,
        background: `color-mix(in srgb, ${theme.vars.palette.primary.main} 12%, transparent)`,
        pointerEvents: "none"
      },
      ".dimensions-badge": {
        position: "absolute",
        bottom: theme.spacing(0.5),
        right: theme.spacing(0.5),
        padding: `${theme.spacing(0.5)} ${theme.spacing(1)}`,
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
    ".coord-field": {
      flex: "1 1 50%",
      minWidth: 0
    },
    ".outputs-row": {
      flex: "0 0 auto"
    }
  });

const PreviewImage: React.FC<{ value: unknown; placeholder: string }> = ({
  value,
  placeholder
}) => {
  if (typeof value === "string" && value) {
    return <ImageView source={value} />;
  }
  const ref = asImageRef(value);
  if (ref?.uri) {
    return <ImageView source={ref.uri} />;
  }
  if (ref?.data instanceof Uint8Array) {
    return <ImageView source={ref.data} />;
  }
  if (Array.isArray(ref?.data)) {
    return <ImageView source={new Uint8Array(ref!.data as number[])} />;
  }
  return <CheckerDropzone message={placeholder} icon={<ImageIcon />} />;
};

export interface PasteBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const PasteBodyInner: React.FC<PasteBodyProps> = ({
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
  // Both image inputs share the left-edge handle column; preserve metadata
  // order so the visual stacking matches the property order.
  const imageHandles = useMemo(
    () =>
      properties.filter((p) => p.name === "image" || p.name === "paste"),
    [properties]
  );
  const leftProperty = useMemo(
    () => properties.find((p) => p.name === "left"),
    [properties]
  );
  const topProperty = useMemo(
    () => properties.find((p) => p.name === "top"),
    [properties]
  );

  const left = Math.max(0, Number(data.properties?.left ?? 0));
  const top = Math.max(0, Number(data.properties?.top ?? 0));

  const previewValue = useNodeOutput(workflowId, id);
  const baseValue = useUpstreamValue(
    workflowId,
    id,
    "image",
    data.properties?.image
  );
  const pasteValue = useUpstreamValue(
    workflowId,
    id,
    "paste",
    data.properties?.paste
  );

  const baseRef = useMemo(() => asImageRef(baseValue), [baseValue]);
  const pasteRef = useMemo(() => asImageRef(pasteValue), [pasteValue]);
  const previewRef = useMemo(() => asImageRef(previewValue), [previewValue]);

  // Overlay rectangle expressed as a percentage of the base image — only
  // drawn when both source dimensions are known. The base may have changed
  // since the last run, so we prefer the inputs' dimensions over the
  // output's.
  const overlayRect = useMemo(() => {
    const bw = baseRef?.width;
    const bh = baseRef?.height;
    const pw = pasteRef?.width;
    const ph = pasteRef?.height;
    if (!bw || !bh || !pw || !ph) return undefined;
    return {
      leftPct: Math.max(0, Math.min(100, (left / bw) * 100)),
      topPct: Math.max(0, Math.min(100, (top / bh) * 100)),
      widthPct: Math.max(0, Math.min(100, (pw / bw) * 100)),
      heightPct: Math.max(0, Math.min(100, (ph / bh) * 100))
    };
  }, [baseRef?.width, baseRef?.height, pasteRef?.width, pasteRef?.height, left, top]);

  const { setProperties, setPropertyComplete } = useBespokePropertyWriter({
    nodeId: id,
    nodeType
  });

  const handleLeftChange = useCallback(
    (_: React.ChangeEvent<HTMLInputElement> | null, value: number) => {
      setProperties({ left: Math.max(0, Math.round(value)) });
    },
    [setProperties]
  );
  const handleTopChange = useCallback(
    (_: React.ChangeEvent<HTMLInputElement> | null, value: number) => {
      setProperties({ top: Math.max(0, Math.round(value)) });
    },
    [setProperties]
  );

  return (
    <div css={cssStyles} className="paste-body" data-bespoke-body="Paste">
      <HandleColumn id={id} properties={imageHandles} />
      <div className="preview-area">
        <PreviewImage
          value={previewValue ?? baseValue}
          placeholder="Connect Image and Paste, then run"
        />
        {overlayRect && (
          <div
            className="overlay-rect"
            style={{
              left: `${overlayRect.leftPct}%`,
              top: `${overlayRect.topPct}%`,
              width: `${overlayRect.widthPct}%`,
              height: `${overlayRect.heightPct}%`
            }}
          />
        )}
        {previewRef?.width != null && previewRef.height != null && (
          <span className="dimensions-badge">
            {previewRef.width} × {previewRef.height}
          </span>
        )}
      </div>

      <FlexRow className="controls-row" align="flex-end" gap={0.5}>
        <div className="coord-field">
          {leftProperty && (
            <NumberInput
              id={`paste-left-${id}`}
              nodeId={id}
              name="left"
              description={leftProperty.description ?? "Left offset"}
              value={left}
              min={leftProperty.min ?? 0}
              max={leftProperty.max ?? 4096}
              size="small"
              color="secondary"
              inputType="int"
              showSlider={false}
              onChange={handleLeftChange}
              onChangeComplete={setPropertyComplete}
            />
          )}
        </div>
        <div className="coord-field">
          {topProperty && (
            <NumberInput
              id={`paste-top-${id}`}
              nodeId={id}
              name="top"
              description={topProperty.description ?? "Top offset"}
              value={top}
              min={topProperty.min ?? 0}
              max={topProperty.max ?? 4096}
              size="small"
              color="secondary"
              inputType="int"
              showSlider={false}
              onChange={handleTopChange}
              onChangeComplete={setPropertyComplete}
            />
          )}
        </div>
      </FlexRow>

      {!isOutputNode && (
        <div className="outputs-row">
          <NodeOutputs id={id} outputs={nodeMetadata.outputs} />
        </div>
      )}

      {status === "running" && <NodeProgress id={id} workflowId={workflowId} />}
    </div>
  );
};

export const PasteBody = memo(PasteBodyInner);
PasteBody.displayName = "PasteBody";

export { PASTE_NODE_TYPE };
export default PasteBody;
