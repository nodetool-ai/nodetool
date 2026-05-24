/** @jsxImportSource @emotion/react */
import React, { useState, useCallback, memo } from "react";
import {
  Caption,
  FlexColumn,
  ToolbarIconButton,
  NotificationBadge
} from "../ui_primitives";
import { useTheme } from "@mui/material/styles";
import HistoryIcon from "@mui/icons-material/History";
import OutputRenderer from "./OutputRenderer";
import NodeHistoryPanel from "./NodeHistoryPanel";
import { useNodeResultHistory } from "../../hooks/nodes/useNodeResultHistory";
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
 * ResultOverlay — renders the current result and offers a button to open
 * the persisted history dialog. The `result` value is already the live
 * (streaming-accumulated) value from `ResultsStore.outputResults`; we no
 * longer keep a parallel session-history copy.
 */
const ResultOverlay: React.FC<ResultOverlayProps> = ({
  result,
  nodeId,
  workflowId,
  nodeName
}) => {
  const theme = useTheme();
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);

  const { historyCount } = useNodeResultHistory(
    workflowId ?? null,
    nodeId ?? null
  );

  const handleOpenHistory = useCallback(() => {
    setHistoryDialogOpen(true);
  }, []);

  const handleCloseHistory = useCallback(() => {
    setHistoryDialogOpen(false);
  }, []);

  const unwrapped =
    typeof result === "object" &&
    result !== null &&
    "output" in result &&
    (result as Record<string, unknown>).output !== undefined
      ? (result as Record<string, unknown>).output
      : result;

  const typeLabel = resultTypeLabel(unwrapped);
  const showHistoryButton =
    nodeId !== undefined && workflowId !== undefined && historyCount > 1;

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
      {showHistoryButton && (
        <ToolbarIconButton
          title={`View History (${historyCount})`}
          size="small"
          onClick={handleOpenHistory}
          sx={{
            position: "absolute",
            top: 4,
            right: 8,
            zIndex: 10,
            width: 24,
            height: 24,
            padding: "4px",
            borderRadius: "var(--rounded-sm)",
            opacity: 0.6,
            transition: "opacity 0.2s ease",
            backgroundColor: `rgba(${theme.vars.palette.common.blackChannel || "0, 0, 0"}, 0.6)`,
            color: theme.vars.palette.common.white,
            "&:hover": {
              opacity: 1,
              backgroundColor: `rgba(${theme.vars.palette.common.blackChannel || "0, 0, 0"}, 0.85)`
            },
            "& svg": {
              fontSize: 14
            }
          }}
        >
          <NotificationBadge count={historyCount} color="primary" max={99}>
            <HistoryIcon />
          </NotificationBadge>
        </ToolbarIconButton>
      )}

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

      {nodeId && workflowId && (
        <NodeHistoryPanel
          workflowId={workflowId}
          nodeId={nodeId}
          nodeName={nodeName}
          open={historyDialogOpen}
          onClose={handleCloseHistory}
        />
      )}
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
