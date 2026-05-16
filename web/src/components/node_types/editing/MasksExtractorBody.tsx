/** @jsxImportSource @emotion/react */
/**
 * MasksExtractorBody — bespoke body for mask-extractor model nodes
 * (plan §9.E6, PR 14).
 *
 * Top: tabbed preview — `Image` shows the source image fed into the node's
 * `image` input, `Mask` shows the node's own output (the extracted mask /
 * background-removed foreground).
 *
 * Bottom: `Recalculate` action button (RunModelButton) — triggers a
 * single-node run via `useRunSingleNode`.
 *
 * Registered for the established mask-extractor providers (Bria /
 * BackgroundRemover variants). Additional providers can be added to the
 * registry as their bespoke targets are confirmed.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import ImageIcon from "@mui/icons-material/Image";
import { shallow } from "zustand/shallow";

import {
  CheckerDropzone,
  FlexColumn,
  FlexRow,
  RunModelButton
} from "../../ui_primitives";
import HandleColumn from "../../node/HandleColumn";
import ImageView from "../../node/ImageView";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";

import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import useResultsStore from "../../../stores/ResultsStore";
import { useNodes } from "../../../contexts/NodeContext";
import { useRunSingleNode } from "../../../hooks/nodes/useRunSingleNode";

// Node types currently bound to this bespoke body. Mask-extractor / bg-removal
// providers: per §9.E6 we ship the known Bria + 851-labs variants. Extend as
// additional providers are confirmed in §9.E11.
const MASKS_EXTRACTOR_NODE_TYPES: ReadonlyArray<string> = [
  "replicate.image.background.Bria_RemoveBackground",
  "replicate.image.background.BackgroundRemover_851",
  "replicate.image.background.BackgroundRemover_Codeplug",
  "replicate.image.process.RemoveBackground"
];

type PreviewTab = "image" | "mask";

const styles = (theme: Theme) =>
  css({
    "&.masks-extractor-body": {
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
    ".tab-toggle": {
      width: "100%",
      ".MuiToggleButton-root": {
        flex: "1 1 auto",
        padding: `${theme.spacing(0.25)} ${theme.spacing(0.5)}`,
        fontSize: theme.fontSizeSmaller,
        fontFamily: theme.fontFamily2,
        textTransform: "none",
        minWidth: 0
      }
    },
    ".action-row": {
      paddingTop: theme.spacing(0.25),
      display: "flex",
      justifyContent: "flex-end"
    },
    ".outputs-row": {
      flex: "0 0 auto"
    }
  });

interface ImageRefLike {
  uri?: string;
  data?: unknown;
}

const asImageRef = (value: unknown): ImageRefLike | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  return {
    uri: typeof v.uri === "string" ? (v.uri as string) : undefined,
    data: v.data
  };
};

const unwrapOutput = (value: unknown, handle?: string | null): unknown => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const v = value as Record<string, unknown>;
  if (handle && handle in v) return v[handle];
  if ("output" in v) return v.output;
  return value;
};

const ImagePreview: React.FC<{ value: unknown; placeholder: string }> = ({
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

export interface MasksExtractorBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const MasksExtractorBodyInner: React.FC<MasksExtractorBodyProps> = ({
  id,
  nodeMetadata,
  data,
  workflowId,
  status,
  isOutputNode
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  const [tab, setTab] = useState<PreviewTab>("image");

  const properties = nodeMetadata.properties ?? [];
  const imageProperty = useMemo(
    () => properties.filter((p) => p.name === "image"),
    [properties]
  );

  // Resolve upstream image (cached result of whatever feeds our `image`
  // input), so the Image tab can show what the node will receive on next run.
  const upstreamEdge = useNodes(
    (state) =>
      state.edges.find(
        (e) => e.target === id && (e.targetHandle ?? "") === "image"
      ),
    shallow
  );

  const upstreamResult = useResultsStore(
    (state) =>
      upstreamEdge
        ? state.getResult(workflowId, upstreamEdge.source)
        : undefined,
    shallow
  );

  const myResult = useResultsStore(
    (state) => state.getResult(workflowId, id),
    shallow
  );

  const imageTabValue = useMemo(() => {
    if (upstreamEdge) {
      const v = unwrapOutput(upstreamResult, upstreamEdge.sourceHandle);
      const ref = asImageRef(v);
      if (ref && (ref.uri || ref.data)) return ref;
    }
    const constRef = asImageRef(data.properties?.image);
    if (constRef && (constRef.uri || constRef.data)) return constRef;
    return undefined;
  }, [upstreamEdge, upstreamResult, data.properties?.image]);

  const maskTabValue = useMemo(() => unwrapOutput(myResult), [myResult]);

  const { runSingleNode, isWorkflowRunning } = useRunSingleNode(id);

  const handleTabChange = useCallback(
    (_: React.MouseEvent<HTMLElement>, next: string | null) => {
      if (next !== "image" && next !== "mask") return;
      setTab(next);
    },
    []
  );

  const isRunning = status === "running" || isWorkflowRunning;

  return (
    <div
      css={cssStyles}
      className="masks-extractor-body"
      data-bespoke-body="MasksExtractor"
    >
      <div className="preview-area">
        {tab === "image" ? (
          <ImagePreview
            value={imageTabValue}
            placeholder="Connect an image"
          />
        ) : (
          <ImagePreview
            value={maskTabValue}
            placeholder="Run the node to extract a mask"
          />
        )}
        <HandleColumn id={id} properties={imageProperty} />
      </div>

      <FlexColumn className="controls" gap={0.5}>
        <FlexRow align="center" gap={0.25}>
          <ToggleButtonGroup
            className="tab-toggle"
            size="small"
            value={tab}
            exclusive
            onChange={handleTabChange}
            aria-label="Preview tab"
          >
            <ToggleButton value="image" aria-label="Image">
              Image
            </ToggleButton>
            <ToggleButton value="mask" aria-label="Mask">
              Mask
            </ToggleButton>
          </ToggleButtonGroup>
        </FlexRow>
        <div className="action-row">
          <RunModelButton
            label="Recalculate Mask"
            isRunning={isRunning}
            onClick={runSingleNode}
          />
        </div>
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

export const MasksExtractorBody = memo(MasksExtractorBodyInner);
MasksExtractorBody.displayName = "MasksExtractorBody";

export { MASKS_EXTRACTOR_NODE_TYPES };
export default MasksExtractorBody;
