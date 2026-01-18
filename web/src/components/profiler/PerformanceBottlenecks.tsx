import React from "react";
import { Box, Typography, Paper, List, ListItem, ListItemText, Divider } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useProfilingStore, { WorkflowProfile } from "../../stores/ProfilingStore";

interface PerformanceBottlenecksProps {
  profile: WorkflowProfile;
}

export const PerformanceBottlenecks: React.FC<PerformanceBottlenecksProps> = ({ profile }) => {
  const theme = useTheme();

  const sortedNodes = Object.values(profile.nodes)
    .filter(n => n.startTime > 0)
    .sort((a, b) => b.duration - a.duration);

  const totalDuration = sortedNodes.reduce((sum, n) => sum + n.duration, 0);

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(1);
    return `${minutes}m ${seconds}s`;
  };

  const formatPercentage = (ms: number): string => {
    const pct = totalDuration > 0 ? (ms / totalDuration) * 100 : 0;
    return `${pct.toFixed(1)}%`;
  };

  return (
    <Paper sx={{ p: 2, height: "100%", overflow: "auto" }}>
      <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
        Execution Timeline
      </Typography>

      <List dense sx={{ py: 0 }}>
        {sortedNodes.map((node, index) => {
          const percentage = totalDuration > 0 ? (node.duration / totalDuration) * 100 : 0;
          const isBottleneck = node.duration > profile.totalDuration * 0.1;

          return (
            <React.Fragment key={node.nodeId}>
              <ListItem
                sx={{
                  px: 1,
                  py: 1,
                  bgcolor: isBottleneck ? `${theme.palette.error.light}22` : "transparent",
                  borderRadius: 1,
                  mb: 0.5
                }}
              >
                <Box sx={{ width: "100%" }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          color: isBottleneck ? "error.main" : "text.primary"
                        }}
                      >
                        {node.nodeName}
                      </Typography>
                      {isBottleneck && (
                        <Typography
                          variant="caption"
                          sx={{
                            bgcolor: "error.main",
                            color: "white",
                            px: 0.5,
                            borderRadius: 0.5,
                            fontSize: "0.6rem"
                          }}
                        >
                          SLOW
                        </Typography>
                      )}
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {formatDuration(node.duration)}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1
                    }}
                  >
                    <Box
                      sx={{
                        flexGrow: 1,
                        height: 6,
                        bgcolor: theme.palette.grey[200],
                        borderRadius: 3,
                        overflow: "hidden"
                      }}
                    >
                      <Box
                        sx={{
                          width: `${percentage}%`,
                          height: "100%",
                          bgcolor: percentage > 50
                            ? theme.palette.error.main
                            : percentage > 20
                              ? theme.palette.warning.main
                              : theme.palette.success.main,
                          borderRadius: 3,
                          transition: "width 0.3s ease"
                        }}
                      />
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ minWidth: 40, textAlign: "right" }}>
                      {formatPercentage(node.duration)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", gap: 1, mt: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      Layer {node.layer}
                    </Typography>
                    {node.parallelWith.length > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        • Parallel: {node.parallelWith.length} nodes
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary">
                      • {node.nodeType}
                    </Typography>
                  </Box>
                </Box>
              </ListItem>
              {index < sortedNodes.length - 1 && <Divider sx={{ my: 0.5 }} />}
            </React.Fragment>
          );
        })}
      </List>

      {sortedNodes.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 4 }}>
          No execution data available yet
        </Typography>
      )}
    </Paper>
  );
};

export default PerformanceBottlenecks;
