/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { Caption, FlexColumn } from "../ui_primitives";
import OutputRenderer from "./OutputRenderer";
import { typeFor } from "./output";

function resultTypeLabel(value: unknown): string {
  if (value === null || value === undefined) return "";
  const type = typeFor(value);
  const labels: Record<string, string> = {
    image: "Image",
    audio: "Audio",
    video: "Video",
    string: "Text",
    number: "Number",
    boolean: "Boolean",
    array: "Array",
    dataframe: "DataFrame",
    model_3d: "3D Model",
    html: "HTML",
    document: "Document",
    object: "Object"
  };
  return labels[type] || type;
}

interface ResultOverlayProps {
  result: unknown;
  nodeId?: string;
  workflowId?: string;
  nodeName?: string;
  onShowInputs?: () => void; // Kept for backwards compatibility but now handled in NodeHeader
}

/**
 * ResultOverlay — renders a node's live (in-memory) output via the generic
 * OutputRenderer. Persisted history navigation lives in the ContentCardBody
 * via NodeHistoryViewer; this overlay stays minimal for legacy node types.
 */
const ResultOverlay: React.FC<ResultOverlayProps> = ({ result }) => {
  const unwrapped =
    typeof result === "object" &&
    result !== null &&
    "output" in result &&
    (result as Record<string, unknown>).output !== undefined
      ? (result as Record<string, unknown>).output
      : result;

  const typeLabel = resultTypeLabel(unwrapped);

  return (
    <FlexColumn
      className="result-overlay node-drag-handle"
      fullWidth
      fullHeight
      sx={{
        position: "relative",
        minHeight: "60px",
        minWidth: 0,
        flex: 1
      }}
    >
      <FlexColumn
        className="result-overlay-content"
        fullWidth
        fullHeight
        sx={{
          minHeight: 0,
          minWidth: 0,
          flex: 1,
          overflow: "auto",
          "& .image-output": {
            width: "100%",
            minHeight: "120px"
          }
        }}
      >
        {typeLabel && (
          <Caption
            size="tiny"
            sx={{
              display: "block",
              px: 1,
              pt: 0.5,
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              opacity: 0.7
            }}
          >
            {typeLabel}
          </Caption>
        )}
        <OutputRenderer value={unwrapped} />
      </FlexColumn>
    </FlexColumn>
  );
};

const arePropsEqual = (
  prevProps: ResultOverlayProps,
  nextProps: ResultOverlayProps
) => {
  return (
    prevProps.result === nextProps.result &&
    prevProps.nodeId === nextProps.nodeId &&
    prevProps.workflowId === nextProps.workflowId &&
    prevProps.nodeName === nextProps.nodeName &&
    prevProps.onShowInputs === nextProps.onShowInputs
  );
};

export default memo(ResultOverlay, arePropsEqual);
