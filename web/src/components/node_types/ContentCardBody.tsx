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
 *   3. Footer strip     — optional `DynamicInputButton` + `RunModelButton`
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
  FlexRow,
  RunModelButton
} from "../ui_primitives";
import { NodeInputs } from "../node/NodeInputs";
import ImageView from "../node/ImageView";
import OutputRenderer from "../node/OutputRenderer";
import { NodeOutputs } from "../node/NodeOutputs";
import NodeProgress from "../node/NodeProgress";

import type { NodeMetadata } from "../../stores/ApiTypes";
import type { NodeData } from "../../stores/NodeData";
import useResultsStore from "../../stores/ResultsStore";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
import { useNodes, useNodeStoreRef } from "../../contexts/NodeContext";

import {
  getContentCardVariant,
  getPrimaryOutput,
  type ContentCardVariant
} from "./contentCardRegistry";

const styles = (theme: Theme) =>
  css({
    "&.content-card-body": {
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
    // Basic-fields column renders handle + label only (no inline editor —
    // editors live in the Inspector). Tight margins so it doesn't compete
    // with the preview for visual weight. Type chips are hidden inside
    // content-card bodies — the label already communicates the property,
    // and the chip clutters the compact handle column.
    ".basic-fields": {
      flex: "0 0 auto",
      "& > div": {
        marginTop: 0,
        marginBottom: 0
      },
      ".typed-port-chip": {
        display: "none"
      }
    },
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

  // Single-node run wiring — mirrors GroupNode's pattern, but scoped to one
  // node. Upstream-edge handling is intentionally minimal in PR 4: properties
  // run from their currently stored values (literal or last-cached). Wiring
  // upstream propagation lands with the rest of Track B/E.
  const store = useNodeStoreRef();
  const run = useWebsocketRunner((state) => state.run);
  const runnerState = useWebsocketRunner((state) => state.state);

  const handleRun = useCallback(() => {
    const s = store.getState();
    const node = s.nodes.find((n) => n.id === id);
    if (!node) {
      return;
    }
    void run({}, s.workflow, [node], []);
  }, [id, run, store]);

  const isRunning =
    status === "running" || runnerState === "running";
  const isDynamic = !!nodeMetadata.is_dynamic;

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

      {/* Property handles render on the card's left edge as labeled handles
          only — no inline editors (plan §6.1, target design). Editors live
          in the Inspector (Track D / PR 8). `showFields={false}` keeps the
          handle + compact label and drops the editor; the row stays short
          so the preview keeps dominating the card. */}
      {nodeMetadata.properties && nodeMetadata.properties.length > 0 && (
        <div className="basic-fields">
          <NodeInputs
            id={id}
            nodeMetadata={nodeMetadata}
            layout={nodeMetadata.layout}
            properties={nodeMetadata.properties}
            nodeType={nodeType}
            data={data}
            hasAdvancedFields={false}
            showAdvancedFields={false}
            basicFields={basicFields}
            onToggleAdvancedFields={() => {}}
            editableDynamicInputs={false}
            showFields={false}
          />
        </div>
      )}

      {!isOutputNode && (
        <div className="outputs-row">
          <NodeOutputs
            id={id}
            outputs={nodeMetadata.outputs}
            isStreamingOutput={nodeMetadata.is_streaming_output}
          />
        </div>
      )}

      <FlexRow className="footer-strip" align="center" justify="space-between">
        {isDynamic ? (
          <DynamicInputButton itemLabel="input" onAdd={handleAddDynamicInput} />
        ) : (
          <span />
        )}
        <RunModelButton isRunning={isRunning} onClick={handleRun} />
      </FlexRow>

      {status === "running" && <NodeProgress id={id} workflowId={workflowId} />}
    </div>
  );
};

export const ContentCardBody = memo(ContentCardBodyInner);
ContentCardBody.displayName = "ContentCardBody";

export default ContentCardBody;
