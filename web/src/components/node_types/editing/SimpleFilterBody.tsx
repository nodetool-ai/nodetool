/** @jsxImportSource @emotion/react */
/**
 * SimpleFilterBody — bespoke body for stateless one-input image filters.
 *
 * Today: `lib.image.filter.Invert`, `lib.image.filter.ConvertToGrayscale`.
 * Both nodes take a single `image` input and have no other parameters, so
 * the bespoke body is a "Before / After" toggle preview — the Before tab
 * shows the upstream value flowing into `image`, the After tab shows the
 * node's own output. There are no controls to render; the preview itself
 * is the differentiator from a generic body.
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
  ToggleOption
} from "../../ui_primitives";
import HandleColumn from "../../node/HandleColumn";
import ImageView from "../../node/ImageView";
import ImageRefPreview from "../../node/ImageRefPreview";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";

import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import {
  useNodeOutput,
  useUpstreamValue
} from "../../../hooks/nodes/useNodeIO";
import { asImageRef } from "../../../utils/imageRef";

type SimpleFilterTab = "before" | "after";

const styles = (theme: Theme) =>
  css({
    "&.simple-filter-body": {
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
      }
    },
    ".preview-tab-bar": {
      flex: "0 0 auto"
    },
    ".tab-toggle-row": {
      width: "100%"
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
    ".image-preview": {
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: 0
    },
    ".outputs-row": {
      flex: "0 0 auto"
    },
    /* Collapsed: co-locate with PainterBody — Emotion order beats global collapsed.css. */
    ".node-body.collapsed &.simple-filter-body": {
      padding: 0,
      gap: 0,
      minHeight: 0,
      height: 0,
      overflow: "visible",
      "& > .preview-area": {
        display: "none"
      },
      "& > .preview-tab-bar, & > .controls": {
        display: "none"
      },
      "& > .outputs-row": {
        height: 0,
        minHeight: 0,
        padding: 0,
        margin: 0,
        flex: "none",
        overflow: "visible"
      }
    }
  });

const ImagePreview: React.FC<{
  value: unknown;
  placeholder: string;
  tab: SimpleFilterTab;
}> = memo(({ value, placeholder, tab }) => (
  <div className={`image-preview preview-${tab}`} data-preview-tab={tab}>
    <ImageRefPreview
      value={value}
      placeholder={
        <CheckerDropzone
          className="preview-empty"
          message={placeholder}
          icon={<ImageIcon />}
        />
      }
    />
  </div>
));
ImagePreview.displayName = "SimpleFilterImagePreview";

export interface SimpleFilterBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const SimpleFilterBodyInner: React.FC<SimpleFilterBodyProps> = ({
  id,
  nodeMetadata,
  data,
  workflowId,
  status,
  isOutputNode
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  const [tab, setTab] = useState<SimpleFilterTab>("after");

  const properties = nodeMetadata.properties ?? [];
  const imageProperty = useMemo(
    () => properties.filter((p) => p.name === "image"),
    [properties]
  );

  const beforeValue = useUpstreamValue(
    workflowId,
    id,
    "image",
    data.properties?.image
  );
  const afterValue = useNodeOutput(workflowId, id);

  const handleTabChange = useCallback(
    (_: React.MouseEvent<HTMLElement>, next: string | null) => {
      if (next !== "before" && next !== "after") return;
      setTab(next);
    },
    []
  );

  return (
    <div
      css={cssStyles}
      className="simple-filter-body"
      data-bespoke-body="SimpleFilter"
    >
      <HandleColumn id={id} properties={imageProperty} />
      <div className={`preview-area preview-${tab}`} data-preview-tab={tab}>
        {tab === "before" ? (
          <ImagePreview
            tab="before"
            value={beforeValue}
            placeholder="Connect an image"
          />
        ) : (
          <ImagePreview
            tab="after"
            value={afterValue}
            placeholder="Run the node to see the result"
          />
        )}
      </div>

      <FlexColumn className="preview-tab-bar" gap={0.5}>
        <FlexRow className="tab-toggle-row" align="center" gap={0.25}>
          <ToggleGroup
            className="tab-toggle"
            size="small"
            value={tab}
            exclusive
            onChange={handleTabChange}
            aria-label="Preview tab"
          >
            <ToggleOption
              className="tab-option tab-option-before"
              value="before"
              aria-label="Before"
            >
              Before
            </ToggleOption>
            <ToggleOption
              className="tab-option tab-option-after"
              value="after"
              aria-label="After"
            >
              After
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

export const SimpleFilterBody = memo(SimpleFilterBodyInner);
SimpleFilterBody.displayName = "SimpleFilterBody";

export default SimpleFilterBody;
