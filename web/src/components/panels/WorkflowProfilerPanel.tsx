/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText
} from "@mui/material";
import {
  SsidChart as SpeedIcon,
  WarningAmberRounded,
  Schedule,
  TrendingUp
} from "@mui/icons-material";
import useWorkflowProfilerStore, {
  type WorkflowProfile
} from "../../stores/WorkflowProfilerStore";
import { memo } from "react";
import isEqual from "lodash/isEqual";

const styles = (theme: Theme) =>
  css({
    ".profiler-container": {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      padding: "12px",
      overflow: "auto"
    },
    ".profiler-header": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      marginBottom: "12px",
      color: theme.vars.palette.text.secondary
    },
    ".summary-section": {
      display: "flex",
      gap: "16px",
      marginBottom: "16px",
      flexWrap: "wrap"
    },
    ".summary-card": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "8px 12px",
      backgroundColor: theme.vars.palette.action.hover,
      borderRadius: "8px",
      minWidth: "120px"
    },
    ".bottleneck-section": {
      marginBottom: "16px"
    },
    ".suggestions-section": {
      marginTop: "auto",
      paddingTop: "12px",
      borderTop: `1px solid ${theme.vars.palette.divider}`
    },
    ".suggestion-item": {
      padding: "8px",
      marginBottom: "8px",
      backgroundColor: theme.vars.palette.warning.light,
      borderRadius: "8px",
      color: theme.vars.palette.warning.contrastText
    },
    ".metric-value": {
      fontWeight: 600,
      fontFamily: theme.vars.typography.fontFamilyMonospace
    }
  });

const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
};

  const getDurationColor = (duration: number, maxDuration: number): string => {
  const ratio = duration / maxDuration;
  if (ratio > 0.8) {
    return "error";
  }
  if (ratio > 0.5) {
    return "warning";
  }
  return "success";
};

interface ProfilerContentProps {
  profile: WorkflowProfile;
}

const ProfilerContent: React.FC<ProfilerContentProps> = ({ profile }) => {
  const theme = useTheme();

  const maxDuration = Math.max(...profile.metrics.map((m) => m.duration), 1);

  return (
    <div css={styles(theme)} className="profiler-container">
      <div className="profiler-header">
        <SpeedIcon fontSize="small" />
        <Typography variant="subtitle1" fontWeight={600}>
          Workflow Performance Profile
        </Typography>
      </div>

      <div className="summary-section">
        <div className="summary-card">
          <Schedule fontSize="small" color="action" />
          <Box>
            <Typography variant="caption" color="text.secondary">
              Total Duration
            </Typography>
            <Typography variant="body2" className="metric-value">
              {formatDuration(profile.totalDuration)}
            </Typography>
          </Box>
        </div>
        <div className="summary-card">
          <Typography variant="caption" color="text.secondary">
            Nodes
          </Typography>
          <Typography variant="body2" className="metric-value">
            {profile.nodeCount}
          </Typography>
        </div>
        <div className="summary-card">
          <Typography variant="caption" color="text.secondary">
            Timestamp
          </Typography>
          <Typography variant="body2" className="metric-value">
            {new Date(profile.timestamp).toLocaleTimeString()}
          </Typography>
        </div>
      </div>

      {profile.bottlenecks.length > 0 && (
        <div className="bottleneck-section">
          <Typography variant="subtitle2" gutterBottom>
            Top Bottlenecks
          </Typography>
          <TableContainer
            component={Paper}
            variant="outlined"
            sx={{ backgroundColor: "transparent" }}
          >
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Node</TableCell>
                  <TableCell align="right">Duration</TableCell>
                  <TableCell align="right">% of Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {profile.bottlenecks.slice(0, 5).map((node) => (
                  <TableRow key={node.nodeId}>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                          {node.nodeName}
                        </Typography>
                        <Chip
                          label={node.nodeType.split(".").pop()}
                          size="small"
                          variant="outlined"
                          sx={{ height: 20, fontSize: "0.7rem" }}
                        />
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        color={`${getDurationColor(node.duration, maxDuration)}.main`}
                        className="metric-value"
                      >
                        {formatDuration(node.duration)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" className="metric-value">
                        {((node.duration / Math.max(profile.totalDuration, 1)) * 100).toFixed(1)}%
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </div>
      )}

      {profile.suggestions.length > 0 && (
        <div className="suggestions-section">
          <Typography variant="subtitle2" gutterBottom>
            Optimization Suggestions
          </Typography>
          <List dense>
            {profile.suggestions.map((suggestion, index) => (
              <ListItem key={index}>
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <WarningAmberRounded
                    fontSize="small"
                    sx={{ color: theme.vars.palette.warning.main }}
                  />
                </ListItemIcon>
                <ListItemText
                  primary={suggestion}
                  primaryTypographyProps={{ variant: "body2" }}
                />
              </ListItem>
            ))}
          </List>
        </div>
      )}
    </div>
  );
};

const EmptyProfilerState: React.FC = () => {
  const theme = useTheme();

  return (
    <div css={styles(theme)} className="profiler-container">
      <div className="profiler-header">
        <SpeedIcon fontSize="small" />
        <Typography variant="subtitle1" fontWeight={600}>
          Workflow Profiler
        </Typography>
      </div>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "text.secondary"
        }}
      >
        <TrendingUp sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
        <Typography variant="body1" gutterBottom>
          No profiling data available
        </Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center">
          Run a workflow to collect performance metrics.
          Profiling data will appear here after execution.
        </Typography>
      </Box>
    </div>
  );
};

const WorkflowProfilerPanel: React.FC = () => {
  const profile = useWorkflowProfilerStore((state) => state.profile);
  const isOpen = useWorkflowProfilerStore((state) => state.isOpen);

  if (!isOpen) {
    return null;
  }

  return profile ? <ProfilerContent profile={profile} /> : <EmptyProfilerState />;
};

export default memo(WorkflowProfilerPanel, isEqual);
