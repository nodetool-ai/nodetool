/** @jsxImportSource @emotion/react */
import React, { useState, useCallback } from "react";
import { Box, Button, Typography, Divider } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import HistoryIcon from "@mui/icons-material/History";
import OutputRenderer from "./OutputRenderer";
import NodeHistoryPanel from "./NodeHistoryPanel";
import { useNodeResultHistoryStore } from "../../stores/NodeResultHistoryStore";

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
      {/* Header with history button */}
      {hasSessionHistory && nodeId && workflowId && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            px: 1,
            py: 0.5,
            borderBottom: `1px solid ${theme.vars.palette.divider}`,
            backgroundColor: theme.vars.palette.background.paper
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Session Results ({sessionHistory.length})
          </Typography>
          <Button
            size="small"
            startIcon={<HistoryIcon />}
            onClick={handleOpenHistory}
            sx={{ minWidth: "auto", fontSize: "0.75rem" }}
          >
            Full History
          </Button>
        </Box>
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

export default ResultOverlay;
