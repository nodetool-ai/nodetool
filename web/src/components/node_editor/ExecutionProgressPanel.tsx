import { memo, useMemo } from "react";
import { Box, LinearProgress, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import TimerIcon from "@mui/icons-material/Timer";
import {
  useWorkflowExecutionProgress,
  formatElapsedTime
} from "../../hooks/useWorkflowExecutionProgress";

interface ExecutionProgressPanelProps {
  workflowId: string;
  isExecuting: boolean;
}

const ExecutionProgressPanel: React.FC<ExecutionProgressPanelProps> = ({
  workflowId,
  isExecuting
}) => {
  const theme = useTheme();
  const progress = useWorkflowExecutionProgress(workflowId, isExecuting);

  const statusItems = useMemo(() => {
    const items = [];

    if (progress.running > 0) {
      items.push({
        icon: <PlayArrowIcon sx={{ fontSize: "0.875rem" }} />,
        count: progress.running,
        color: theme.palette.info.main,
        tooltip: "Running"
      });
    }

    if (progress.completed > 0) {
      items.push({
        icon: <CheckCircleIcon sx={{ fontSize: "0.875rem" }} />,
        count: progress.completed,
        color: theme.palette.success.main,
        tooltip: "Completed"
      });
    }

    if (progress.error > 0) {
      items.push({
        icon: <ErrorIcon sx={{ fontSize: "0.875rem" }} />,
        count: progress.error,
        color: theme.palette.error.main,
        tooltip: "Failed"
      });
    }

    if (progress.pending > 0) {
      items.push({
        icon: <HourglassEmptyIcon sx={{ fontSize: "0.875rem" }} />,
        count: progress.pending,
        color: theme.vars.palette.text.secondary,
        tooltip: "Pending"
      });
    }

    return items;
  }, [
    progress.running,
    progress.completed,
    progress.error,
    progress.pending,
    theme
  ]);

  if (!isExecuting && progress.completed === 0 && progress.error === 0) {
    return null;
  }

  return (
    <Box
      sx={{
        position: "absolute",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
        backgroundColor: theme.vars.palette.Paper.paper,
        backdropFilter: "blur(8px)",
        borderRadius: "8px",
        border: `1px solid ${theme.vars.palette.divider}`,
        padding: "8px 12px",
        boxShadow: theme.shadows[4],
        userSelect: "none",
        pointerEvents: "auto",
        minWidth: "200px"
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {statusItems.map((item, index) => (
            <Tooltip key={index} title={item.tooltip} placement="top" arrow>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.25,
                  color: item.color
                }}
              >
                {item.icon}
                <Typography
                  sx={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    fontFamily: "JetBrains Mono, monospace"
                  }}
                >
                  {item.count}
                </Typography>
              </Box>
            </Tooltip>
          ))}
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Tooltip title="Total nodes" placement="top" arrow>
            <Typography
              sx={{
                fontSize: "0.75rem",
                fontWeight: 500,
                fontFamily: "JetBrains Mono, monospace",
                color: theme.vars.palette.text.secondary
              }}
            >
              {progress.progressPercent}% ({progress.completed + progress.error}
              /{progress.total})
            </Typography>
          </Tooltip>

          {isExecuting && (
            <Tooltip title="Elapsed time" placement="top" arrow>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.25,
                  color: theme.vars.palette.text.secondary,
                  marginLeft: 0.5
                }}
              >
                <TimerIcon sx={{ fontSize: "0.875rem" }} />
                <Typography
                  sx={{
                    fontSize: "0.75rem",
                    fontWeight: 500,
                    fontFamily: "JetBrains Mono, monospace"
                  }}
                >
                  {formatElapsedTime(progress.elapsedMs)}
                </Typography>
              </Box>
            </Tooltip>
          )}
        </Box>
      </Box>

      <LinearProgress
        variant="determinate"
        value={progress.progressPercent}
        sx={{
          height: 4,
          borderRadius: 2,
          backgroundColor: theme.vars.palette.action.hover,
          "& .MuiLinearProgress-bar": {
            borderRadius: 2,
            backgroundColor:
              progress.error > 0
                ? theme.palette.error.main
                : theme.palette.success.main
          }
        }}
      />
    </Box>
  );
};

export default memo(ExecutionProgressPanel);
