/** @jsxImportSource @emotion/react */
/**
 * ContentCardBody
 *
 * Content-forward node body for nodes registered in `CONTENT_CARD_REGISTRY`
 * (image / video / text / etc. generators and "thin" image-edit nodes).
 * Three regions per plan §6.1:
 *
 *   1. Header           — already rendered by `NodeHeader` in `BaseNode`
 *   2. Preview area     — variant dispatch by primary-output type
 *   3. Footer strip     — optional `DynamicInputButton` (RunModelButton
 *                         removed — single-node run lives in the existing
 *                         node toolbar)
 *
 * Basic fields are rendered inline below the preview via the existing
 * `NodeInputs` infrastructure (which already understands `basic_fields`),
 * preserving the node-author API. Advanced fields stay in the Inspector
 * (Track D — landing in PR 8).
 *
 * PR 4 ships only the **image** variant. Other variants fall through to
 * `OutputRenderer` for now and get bespoke previews in PR 5.
 */

import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ImageIcon from "@mui/icons-material/Image";
import { shallow } from "zustand/shallow";

import {
  CheckerDropzone,
  DynamicInputButton,
  FlexRow
} from "../ui_primitives";
import { NodeInputs } from "../node/NodeInputs";
import HandleColumn from "../node/HandleColumn";
import ImageView from "../node/ImageView";
import OutputRenderer from "../node/OutputRenderer";
import { NodeOutputs } from "../node/NodeOutputs";
import NodeProgress from "../node/NodeProgress";

import type { NodeMetadata } from "../../stores/ApiTypes";
import type { NodeData } from "../../stores/NodeData";
import useResultsStore from "../../stores/ResultsStore";
import { useNodes } from "../../contexts/NodeContext";

import {
  getContentCardVariant,
  getPrimaryOutput,
  type ContentCardVariant
} from "./contentCardRegistry";

const styles = (theme: Theme) =>
  css({
    "&.content-card-body": {
      position: "relative",
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.5),
      padding: theme.spacing(0.5),
      minHeight: 0
    },
    // Preview dominates the card — fixed-min height so a freshly dropped
    // card still feels content-forward even before its first run.
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
        width: "100%",
        height: "100%",
        objectFit: "contain"
      }
    },
    // Inline fields render in normal flow with visible labels and editors
    ".inline-fields": {
      flex: "0 0 auto",
      paddingTop: theme.spacing(0.5)
    },
    // Input handles are rendered by <HandleColumn /> — see HandleColumn.tsx
    // for the left-edge absolute positioning.
    ".outputs-row": {
      flex: "0 0 auto"
    },
    ".footer-strip": {
      flex: "0 0 auto",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing(1),
      paddingTop: theme.spacing(0.5)
    }
  });

export interface ContentCardBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  basicFields: string[];
  isOutputNode: boolean;
}

/**
 * Resolve the value to render in the preview area from the cached result.
 * Results may be:
 *   - A primitive / asset-ref directly, OR
 *   - A `{ [outputName]: value }` record for multi/single-output nodes.
 * We prefer the primary output's named slot when the record shape is present.
 */
const extractPrimaryValue = (
  result: unknown,
  primaryOutputName: string | undefined
): unknown => {
  if (
    result &&
    typeof result === "object" &&
    !Array.isArray(result) &&
    primaryOutputName &&
    primaryOutputName in (result as Record<string, unknown>)
  ) {
    return (result as Record<string, unknown>)[primaryOutputName];
  }
  return result;
};

const PreviewArea: React.FC<{
  variant: ContentCardVariant;
  value: unknown;
}> = ({ variant, value }) => {
  // Empty state — present a checker preview with a contextual hint.
  if (value === undefined || value === null) {
    const message =
      variant === "image" || variant === "image_mask"
        ? "Run to generate"
        : variant === "video"
          ? "Run to generate video"
          : variant === "text"
            ? "Run to generate text"
            : variant === "audio"
              ? "Run to generate audio"
              : variant === "model_3d"
                ? "Run to generate 3D"
                : "Run Model";
    return (
      <CheckerDropzone
        message={message}
        icon={variant === "image" ? <ImageIcon /> : undefined}
      />
    );
  }

  // PR 4: image variant only. Other variants fall through to OutputRenderer.
  if (variant === "image") {
    const imageValue = value as { uri?: string; data?: unknown } | string;
    if (typeof imageValue === "string") {
      return <ImageView source={imageValue} />;
    }
    if (typeof imageValue === "object" && imageValue) {
      if (typeof imageValue.uri === "string" && imageValue.uri) {
        return <ImageView source={imageValue.uri} />;
      }
      if (imageValue.data) {
        const d = imageValue.data;
        const source =
          d instanceof Uint8Array
            ? d
            : Array.isArray(d)
              ? new Uint8Array(d as number[])
              : undefined;
        if (source) {
          return <ImageView source={source} />;
        }
      }
    }
  }

  return <OutputRenderer value={value} showTextActions={false} />;
};

const ContentCardBodyInner: React.FC<ContentCardBodyProps> = ({
  id,
  nodeType,
  nodeMetadata,
  data,
  workflowId,
  status,
  basicFields,
  isOutputNode
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  const primaryOutput = useMemo(
    () => getPrimaryOutput(nodeMetadata),
    [nodeMetadata]
  );
  const variant = useMemo(
    () => getContentCardVariant(primaryOutput),
    [primaryOutput]
  );

  const result = useResultsStore(
    (state) => state.getResult(workflowId, id),
    shallow
  );
  const previewValue = useMemo(
    () => extractPrimaryValue(result, primaryOutput?.name),
    [result, primaryOutput?.name]
  );

  const isDynamic = !!nodeMetadata.is_dynamic;

  // Two-pass field classification per field-classification.md:
  // 1. inlineFields: rendered as full editors in normal flow
  // 2. inputFields: rendered as handle-only on left edge
  // Fallback when neither is set: all properties render as handles (old behavior)
  // `!== undefined` so a node with explicitly empty arrays ("send everything
  // to the Inspector") is honored — not treated as legacy.
  const useNewLayout =
    nodeMetadata.inline_fields !== undefined ||
    nodeMetadata.input_fields !== undefined;
  const inlineFields = nodeMetadata.inline_fields ?? [];
  const inputFields = nodeMetadata.input_fields ?? [];

  const properties = nodeMetadata.properties ?? [];
  const inlineProps = useNewLayout
    ? properties.filter((p) => inlineFields.includes(p.name))
    : [];
  const handleProps = useNewLayout
    ? properties.filter((p) => inputFields.includes(p.name))
    : properties; // fallback: all properties render as handles

  // Adding a dynamic property is the responsibility of dynamic-input wiring
  // landed in earlier work (NodeInputs / NodePropertyForm). For PR 4 we
  // expose a placeholder onAdd that delegates to the same store flow used
  // by NodePropertyForm — but we only render the button when the node opts
  // into `is_dynamic`. If no add handler is wired, the button is disabled.
  const updateNodeData = useNodes((state) => state.updateNodeData);
  const handleAddDynamicInput = useCallback(() => {
    const existing = data.dynamic_properties ?? {};
    let i = 1;
    while (`input_${i}` in existing) {
      i += 1;
    }
    updateNodeData(id, {
      dynamic_properties: { ...existing, [`input_${i}`]: "" }
    });
  }, [data.dynamic_properties, id, updateNodeData]);

  return (
    <div
      css={cssStyles}
      className="content-card-body"
      data-content-card-variant={variant}
    >
      <div className="preview-area">
        <PreviewArea variant={variant} value={previewValue} />
      </div>

      {/* Inline fields: rendered as full editors in normal flow under preview.
          Labels are visible here (no display: none). */}
      {useNewLayout && inlineProps.length > 0 && (
        <div className="inline-fields">
          <NodeInputs
            id={id}
            nodeMetadata={nodeMetadata}
            layout={nodeMetadata.layout}
            properties={inlineProps}
            nodeType={nodeType}
            data={data}
            basicFields={[]}
            editableDynamicInputs={false}
            showFields={true}
          />
        </div>
      )}

      {/* Input fields: render as handle-only column on the left edge.
          Dedicated component — no shared NodeInputs / no CSS hiding. */}
      <HandleColumn id={id} properties={handleProps} />

      {!isOutputNode && (
        <div className="outputs-row">
          <NodeOutputs
            id={id}
            outputs={nodeMetadata.outputs}
            isStreamingOutput={nodeMetadata.is_streaming_output}
          />
        </div>
      )}

      {isDynamic && (
        <FlexRow className="footer-strip" align="center" justify="flex-start">
          <DynamicInputButton itemLabel="input" onAdd={handleAddDynamicInput} />
        </FlexRow>
      )}

      {status === "running" && <NodeProgress id={id} workflowId={workflowId} />}
    </div>
  );
};

export const ContentCardBody = memo(ContentCardBodyInner);
ContentCardBody.displayName = "ContentCardBody";

export default ContentCardBody;
