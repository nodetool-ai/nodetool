/** @jsxImportSource @emotion/react */
/**
 * MaskBody — bespoke body for `lib.image.Mask`.
 *
 * Three image inputs (image1, image2, mask) and a tabbed preview that
 * shows each of them plus the composite result. No controls — the node's
 * compositing behaviour is entirely driven by the inputs.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ImageIcon from "@mui/icons-material/Image";

import {
  CheckerDropzone,
  FlexColumn,
  FlexRow,
  ToggleGroup,
  ToggleOption, BORDER_RADIUS } from "../../ui_primitives";
import HandleColumn from "../../node/HandleColumn";
import ImageRefPreview from "../../node/ImageRefPreview";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";

import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import {
  useNodeOutput,
  useUpstreamValue
} from "../../../hooks/nodes/useNodeIO";
import { MASK_NODE_TYPE } from "../../../constants/nodeTypes";

type MaskTab = "image1" | "image2" | "mask" | "result";

const TAB_PLACEHOLDERS: Record<MaskTab, string> = {
  image1: "Connect Image 1",
  image2: "Connect Image 2",
  mask: "Connect a mask",
  result: "Run the node to composite"
};

const styles = (theme: Theme) =>
  css({
    "&.mask-body": {
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
    ".tab-toggle": {
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
    ".controls": {
      flex: "0 0 auto"
    },
    ".outputs-row": {
      flex: "0 0 auto"
    }
  });

const ImagePreview: React.FC<{ value: unknown; placeholder: string }> = memo(
  ({ value, placeholder }) => (
    <ImageRefPreview
      value={value}
      placeholder={<CheckerDropzone message={placeholder} icon={<ImageIcon />} />}
    />
  )
);
ImagePreview.displayName = "MaskImagePreview";

export interface MaskBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const MaskBodyInner: React.FC<MaskBodyProps> = ({
  id,
  nodeMetadata,
  data,
  workflowId,
  status,
  isOutputNode
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  const [tab, setTab] = useState<MaskTab>("result");

  const properties = nodeMetadata.properties ?? [];
  const imageHandles = useMemo(
    () =>
      properties.filter(
        (p) => p.name === "image1" || p.name === "image2" || p.name === "mask"
      ),
    [properties]
  );

  const image1 = useUpstreamValue(
    workflowId,
    id,
    "image1",
    data.properties?.image1
  );
  const image2 = useUpstreamValue(
    workflowId,
    id,
    "image2",
    data.properties?.image2
  );
  const mask = useUpstreamValue(workflowId, id, "mask", data.properties?.mask);
  const result = useNodeOutput(workflowId, id);

  const tabValue: unknown =
    tab === "image1"
      ? image1
      : tab === "image2"
        ? image2
        : tab === "mask"
          ? mask
          : result;

  const handleTabChange = useCallback(
    (_: React.MouseEvent<HTMLElement>, next: string | null) => {
      if (next !== "image1" && next !== "image2" && next !== "mask" && next !== "result") {
        return;
      }
      setTab(next);
    },
    []
  );

  return (
    <div css={cssStyles} className="mask-body" data-bespoke-body="Mask">
      <HandleColumn id={id} properties={imageHandles} />
      <div className="preview-area">
        <ImagePreview value={tabValue} placeholder={TAB_PLACEHOLDERS[tab]} />
      </div>

      <FlexColumn className="controls" gap={0.5}>
        <FlexRow align="center" gap={0.5}>
          <ToggleGroup
            className="tab-toggle"
            size="small"
            value={tab}
            exclusive
            onChange={handleTabChange}
            aria-label="Preview tab"
          >
            <ToggleOption value="image1" aria-label="Image 1">
              Img 1
            </ToggleOption>
            <ToggleOption value="image2" aria-label="Image 2">
              Img 2
            </ToggleOption>
            <ToggleOption value="mask" aria-label="Mask">
              Mask
            </ToggleOption>
            <ToggleOption value="result" aria-label="Result">
              Result
            </ToggleOption>
          </ToggleGroup>
        </FlexRow>
      </FlexColumn>

      {!isOutputNode && (
        <div className="outputs-row">
          <NodeOutputs id={id} outputs={nodeMetadata.outputs} />
        </div>
      )}

      {status === "running" && <NodeProgress id={id} workflowId={workflowId} />}
    </div>
  );
};

export const MaskBody = memo(MaskBodyInner);
MaskBody.displayName = "MaskBody";

export { MASK_NODE_TYPE };
export default MaskBody;
