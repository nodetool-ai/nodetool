/** @jsxImportSource @emotion/react */
import React, { useState, useCallback, memo } from "react";
import { Badge, Box, IconButton, Divider } from "@mui/material";
import { Caption, Tooltip, FlexColumn } from "../ui_primitives";
import { useTheme } from "@mui/material/styles";
import HistoryIcon from "@mui/icons-material/History";
import OutputRenderer from "./OutputRenderer";
import NodeHistoryPanel from "./NodeHistoryPanel";
import { useNodeResultHistoryStore } from "../../stores/NodeResultHistoryStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { typeFor } from "./output";

/**
 * Returns a short display label for the result type.
 */
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
 * ResultOverlay component displays the node's result output.
 * Shows accumulated session results and provides access to full history.
 */
const ResultOverlay: React.FC<ResultOverlayProps> = ({
  result,
  nodeId,
  workflowId,
  nodeName
}) => {
  const theme = useTheme();
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);

  // Get session history for this node
  const sessionHistory = useNodeResultHistoryStore((state) =>
    workflowId && nodeId ? state.getHistory(workflowId, nodeId) : []
  );

  const handleOpenHistory = useCallback(() => {
    setHistoryDialogOpen(true);
  }, []);

  const handleCloseHistory = useCallback(() => {
    setHistoryDialogOpen(false);
  }, []);

  // If we have session history, display all results from the current session
  const hasSessionHistory = sessionHistory.length > 0;
  const resultsToDisplay = hasSessionHistory ? sessionHistory : [{ result, timestamp: Date.now(), status: "completed", jobId: null }];

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
      {/* History button - visible when multiple results exist */}
      {hasSessionHistory && sessionHistory.length > 1 && nodeId && workflowId && (
        <Tooltip delay={TOOLTIP_ENTER_DELAY} title={`View History (${sessionHistory.length})`} placement="left">
          <IconButton
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
              borderRadius: "4px",
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
            <Badge
              badgeContent={sessionHistory.length}
              color="primary"
              max={99}
              sx={{
                "& .MuiBadge-badge": {
                  fontSize: "0.6rem",
                  minWidth: 16,
                  height: 16,
                  padding: "0 3px"
                }
              }}
            >
              <HistoryIcon />
            </Badge>
          </IconButton>
        </Tooltip>
      )}

      {/* Render accumulated session results */}
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
        {resultsToDisplay.map((item, index) => {
          const unwrapped =
            typeof item.result === "object" &&
            item.result !== null &&
            "output" in item.result &&
            (item.result as Record<string, unknown>).output !== undefined
              ? (item.result as Record<string, unknown>).output
              : item.result;
          const typeLabel = index === 0 ? resultTypeLabel(unwrapped) : "";
          return (
            <Box key={`result-${item.timestamp}-${index}`}>
              {index === 0 && typeLabel && (
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
              {index > 0 && (
                <Divider sx={{ my: 1 }}>
                  <Caption>
                    Result {resultsToDisplay.length - index}
                  </Caption>
                </Divider>
              )}
              <OutputRenderer value={unwrapped} />
            </Box>
          );
        })}
      </FlexColumn>

      {/* History Dialog */}
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

// Memoize component to prevent unnecessary re-renders when parent components update
// ResultOverlay is used frequently in node outputs and should only re-render when result data changes
const arePropsEqual = (prevProps: ResultOverlayProps, nextProps: ResultOverlayProps) => {
  return (
    prevProps.result === nextProps.result &&
    prevProps.nodeId === nextProps.nodeId &&
    prevProps.workflowId === nextProps.workflowId &&
    prevProps.nodeName === nextProps.nodeName &&
    prevProps.onShowInputs === nextProps.onShowInputs
  );
};

export default memo(ResultOverlay, arePropsEqual);
