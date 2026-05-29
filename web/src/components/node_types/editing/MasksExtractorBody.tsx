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
import ImageIcon from "@mui/icons-material/Image";

import { CheckerDropzone } from "../../ui_primitives/CheckerDropzone";
import { FlexColumn } from "../../ui_primitives/FlexColumn";
import { FlexRow } from "../../ui_primitives/FlexRow";
import { RunModelButton } from "../../ui_primitives/RunModelButton";
import { ToggleGroup, ToggleOption } from "../../ui_primitives/ToggleGroup";
import HandleColumn from "../../node/HandleColumn";
import ImageView from "../../node/ImageView";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";

import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { useRunSingleNode } from "../../../hooks/nodes/useRunSingleNode";
import {
  useNodeOutput,
  useUpstreamValue
} from "../../../hooks/nodes/useNodeIO";
import { asImageRef } from "../../../utils/imageRef";

// Node types currently bound to this bespoke body. Mask-extractor / bg-removal
// providers: per §9.E6 we ship the known Bria + 851-labs variants. Extend as
// additional providers are confirmed in §9.E11.
const MASKS_EXTRACTOR_NODE_TYPES = [
  "replicate.image.background.Bria_RemoveBackground",
  "replicate.image.background.BackgroundRemover_851",
  "replicate.image.background.BackgroundRemover_Codeplug",
  "replicate.image.process.RemoveBackground",
  "fal.image_to_image.BriaBackgroundRemove"
] as const;

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
      justifyContent: "center",
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

const ImagePreview: React.FC<{ value: unknown; placeholder: string }> = memo(({
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
});
ImagePreview.displayName = "ImagePreview";

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

  // Image tab shows the cached upstream input (what the node will receive
  // on the next run). Mask tab shows the server's most recent output.
  const inputValue = useUpstreamValue(
    workflowId,
    id,
    "image",
    data.properties?.image
  );
  const imageTabValue = useMemo(() => {
    const ref = asImageRef(inputValue);
    return ref && (ref.uri || ref.data) ? ref : undefined;
  }, [inputValue]);
  const maskTabValue = useNodeOutput(workflowId, id);

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
      <HandleColumn id={id} properties={imageProperty} />
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
      </div>

      <FlexColumn className="controls" gap={0.5}>
        <FlexRow align="center" gap={0.25}>
          <ToggleGroup
            className="tab-toggle"
            size="small"
            value={tab}
            exclusive
            onChange={handleTabChange}
            aria-label="Preview tab"
          >
            <ToggleOption value="image" aria-label="Image">
              Image
            </ToggleOption>
            <ToggleOption value="mask" aria-label="Mask">
              Mask
            </ToggleOption>
          </ToggleGroup>
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
          />
        </div>
      )}

      {isRunning && <NodeProgress id={id} workflowId={workflowId} />}
    </div>
  );
};

export const MasksExtractorBody = memo(MasksExtractorBodyInner);
MasksExtractorBody.displayName = "MasksExtractorBody";

export { MASKS_EXTRACTOR_NODE_TYPES };
export default MasksExtractorBody;
