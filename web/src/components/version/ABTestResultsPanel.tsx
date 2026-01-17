import React from "react";
import {
  Paper,
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Divider,
  Chip
} from "@mui/material";
import {
  Close as CloseIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Schedule as TimeIcon
} from "@mui/icons-material";
import { useABTestResultsStore, ABTestWorkflowResult } from "../../stores/ab_test/ABTestResultsStore";
import { formatDuration } from "../../utils/duration";

interface ABTestResultsPanelProps {
  onClose: () => void;
}

const WorkflowResultCard: React.FC<{
  title: string;
  result: ABTestWorkflowResult;
  color: "primary" | "secondary";
}> = ({ title, result, color }) => {
  const isComplete = result.status === "completed";
  const isError = result.status === "error";

  const duration = result.duration
    ? formatDuration(result.duration)
    : result.startTime
      ? "Running..."
      : "-";

  return (
    <Paper
      elevation={2}
      sx={{
        p: 2,
        borderLeft: 4,
        borderColor: isError ? "error.main" : isComplete ? `${color}.main` : "text.disabled"
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
        <Typography variant="subtitle1" fontWeight="medium">
          {title} (v{result.version})
        </Typography>
        {isComplete && <CheckIcon color="success" />}
        {isError && <ErrorIcon color="error" />}
      </Box>

      <Box sx={{ display: "flex", gap: 2, mb: 1 }}>
        <Box>
          <Typography variant="caption" color="text.secondary">Status</Typography>
          <Typography variant="body2">
            <Chip
              label={result.status}
              size="small"
              color={isError ? "error" : isComplete ? "success" : "default"}
              sx={{ textTransform: "capitalize" }}
            />
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">Duration</Typography>
          <Typography variant="body2" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <TimeIcon fontSize="small" color="action" />
            {duration}
          </Typography>
        </Box>
      </Box>

      <Box>
        <Typography variant="caption" color="text.secondary">Nodes</Typography>
        <Typography variant="body2">
          {result.nodesCompleted} / {result.totalNodes} completed
        </Typography>
      </Box>

      {isError && result.error && (
        <Box sx={{ mt: 1, p: 1, bgcolor: "error.light", borderRadius: 1 }}>
          <Typography variant="caption" color="error.contrastText">
            {result.error}
          </Typography>
        </Box>
      )}
    </Paper>
  );
};

export const ABTestResultsPanel: React.FC<ABTestResultsPanelProps> = ({
  onClose
}) => {
  const currentTest = useABTestResultsStore((state) => state.currentTest);

  if (!currentTest) {
    return null;
  }

  const isRunning = currentTest.status === "running";

  return (
    <Paper
      elevation={3}
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
      }}
    >
      <Box
        sx={{
          p: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "background.default"
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="h6">A/B Test Results</Typography>
          <Chip
            label={currentTest.status}
            size="small"
            color={currentTest.status === "completed" ? "success" : currentTest.status === "error" ? "error" : "primary"}
            sx={{ textTransform: "capitalize" }}
          />
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
        {isRunning && (
          <Box sx={{ mb: 2, p: 1, bgcolor: "info.light", borderRadius: 1 }}>
            <Typography variant="body2" color="info.contrastText">
              Running both versions simultaneously...
            </Typography>
          </Box>
        )}

        <Box sx={{ display: "flex", gap: 2, flexDirection: { xs: "column", md: "row" } }}>
          <WorkflowResultCard
            title="Base Version"
            result={currentTest.workflows.base}
            color="primary"
          />
          <WorkflowResultCard
            title="Test Version"
            result={currentTest.workflows.test}
            color="secondary"
          />
        </Box>

        {currentTest.comparison && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" gutterBottom>
              Comparison Summary
            </Typography>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              {currentTest.comparison.baseWins.length > 0 && (
                <Chip
                  label={`Base wins: ${currentTest.comparison.baseWins.join(", ")}`}
                  color="primary"
                  variant="outlined"
                  size="small"
                />
              )}
              {currentTest.comparison.testWins.length > 0 && (
                <Chip
                  label={`Test wins: ${currentTest.comparison.testWins.join(", ")}`}
                  color="secondary"
                  variant="outlined"
                  size="small"
                />
              )}
              {currentTest.comparison.ties.length > 0 && (
                <Chip
                  label={`Ties: ${currentTest.comparison.ties.join(", ")}`}
                  color="default"
                  variant="outlined"
                  size="small"
                />
              )}
            </Box>
          </>
        )}
      </Box>

      <Box
        sx={{
          p: 1,
          borderTop: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}
      >
        <Typography variant="caption" color="text.secondary">
          Test ID: {currentTest.id}
        </Typography>
        {currentTest.endTime && (
          <Typography variant="caption" color="text.secondary">
            Total time: {formatDuration(currentTest.endTime - currentTest.startTime)}
          </Typography>
        )}
      </Box>
    </Paper>
  );
};
