/** @jsxImportSource @emotion/react */
import React, { useState, useCallback, memo } from "react";
import { Box, IconButton, Typography, Divider, Tooltip } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import HistoryIcon from "@mui/icons-material/History";
import OutputRenderer from "./OutputRenderer";
import NodeHistoryPanel from "./NodeHistoryPanel";
import { useNodeResultHistoryStore } from "../../stores/NodeResultHistoryStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

interface ResultOverlayProps {
  result: any;
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
    <Box
      className="result-overlay node-drag-handle"
      sx={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        minHeight: "60px",
        minWidth: 0,
        flex: 1
      }}
    >
      {/* History button - only shows on hover */}
      {hasSessionHistory && nodeId && workflowId && (
        <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="View History" placement="left">
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
              opacity: 0,
              transition: "opacity 0.2s ease",
              backgroundColor: `rgba(${theme.vars.palette.common.blackChannel || "0, 0, 0"}, 0.6)`,
              color: theme.vars.palette.common.white,
              ".result-overlay:hover &": {
                opacity: 1
              },
              "&:hover": {
                backgroundColor: `rgba(${theme.vars.palette.common.blackChannel || "0, 0, 0"}, 0.85)`
              },
              "& svg": {
                fontSize: 14
              }
            }}
          >
            <HistoryIcon />
          </IconButton>
        </Tooltip>
      )}

      {/* Render accumulated session results */}
      <Box
        className="result-overlay-content"
        sx={{
          width: "100%",
          height: "100%",
          minHeight: 0,
          minWidth: 0,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "auto",
          "& .image-output": {
            width: "100%",
            minHeight: "120px"
          }
        }}
      >
        {resultsToDisplay.map((item, index) => (
          <Box key={`result-${item.timestamp}-${index}`}>
            {index > 0 && (
              <Divider sx={{ my: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Result {resultsToDisplay.length - index}
                </Typography>
              </Divider>
            )}
            <OutputRenderer
              value={
                typeof item.result === "object" &&
                  item.result !== null &&
                  "output" in item.result &&
                  item.result.output !== undefined
                  ? item.result.output
                  : item.result
              }
            />
          </Box>
        ))}
      </Box>

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
    </Box>
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
