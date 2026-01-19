/**
 * Version Analytics Dashboard
 *
 * Provides insights into workflow version history including:
 * - Evolution metrics (node growth, complexity over time)
 * - Edit patterns (when edits happen)
 * - Node type change frequencies
 * - Visual timeline of workflow evolution
 */

import React, { useMemo } from "react";
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  useTheme,
  alpha
} from "@mui/material";
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Timeline as TimelineIcon,
  Edit as EditIcon,
  Speed as SpeedIcon,
  Schedule as ScheduleIcon,
  Storage as StorageIcon,
  Psychology as PsychologyIcon,
  LocalOffer as TagIcon
} from "@mui/icons-material";
import { useWorkflowVersions } from "../../serverState/useWorkflowVersions";
import {
  generateVersionAnalytics,
  formatDuration,
  formatGrowthRate,
  VersionAnalytics
} from "../../utils/versionAnalytics";

interface VersionAnalyticsDashboardProps {
  workflowId: string;
}

const MetricCard: React.FC<{
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: number;
  color?: "primary" | "success" | "warning" | "error" | "info";
}> = ({ title, value, subtitle, icon, trend, color = "primary" }) => {
  const theme = useTheme();

  return (
    <Card
      sx={{
        height: "100%",
        bgcolor: alpha(theme.palette[color].main, 0.05),
        border: `1px solid ${theme.palette[color].main}20`
      }}
    >
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
          <Box
            sx={{
              p: 0.75,
              borderRadius: 1,
              bgcolor: alpha(theme.palette[color].main, 0.15),
              color: theme.palette[color].main,
              display: "flex"
            }}
          >
            {icon}
          </Box>
          <Typography variant="body2" color="text.secondary">
            {title}
          </Typography>
        </Box>
        <Typography variant="h4" fontWeight="bold" sx={{ mb: 0.5 }}>
          {value}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {trend !== undefined && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.25,
                color: trend >= 0 ? "success.main" : "error.main"
              }}
            >
              {trend >= 0 ? <TrendingUpIcon fontSize="small" /> : <TrendingDownIcon fontSize="small" />}
              <Typography variant="caption">
                {formatGrowthRate(trend)}
              </Typography>
            </Box>
          )}
          {subtitle && (
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

const TimelineView: React.FC<{ analytics: VersionAnalytics }> = ({ analytics }) => {
  const theme = useTheme();
  const { metrics } = analytics;
  const maxNodes = Math.max(...metrics.map(m => m.nodeCount));

  return (
    <Box sx={{ position: "relative", minHeight: 200, py: 2 }}>
      <svg width="100%" height={200} style={{ display: "block" }}>
        {metrics.map((metric, index) => {
          const x = (index / (metrics.length - 1)) * 100;
          const nodeHeight = (metric.nodeCount / maxNodes) * 150;

          return (
            <g key={metric.version}>
              <line
                x1={`${x}%`}
                y1={200 - nodeHeight}
                x2={`${x}%`}
                y2={200}
                stroke={theme.palette.primary.main}
                strokeWidth={2}
                opacity={0.3}
              />
              <rect
                x={`${x}% - 4`}
                y={200 - nodeHeight - 10}
                width={8}
                height={Math.max(4, nodeHeight)}
                fill={theme.palette.primary.main}
                rx={2}
              />
              <text
                x={`${x}%`}
                y={195}
                textAnchor="middle"
                fontSize={10}
                fill={theme.palette.text.secondary}
              >
                v{metric.version}
              </text>
            </g>
          );
        })}
      </svg>
      <Box sx={{ display: "flex", justifyContent: "center", gap: 3, mt: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Box sx={{ width: 12, height: 12, bgcolor: "primary.main", borderRadius: 0.5 }} />
          <Typography variant="caption" color="text.secondary">
            Node Count
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Box sx={{ width: 12, height: 12, bgcolor: "warning.main", borderRadius: 0.5 }} />
          <Typography variant="caption" color="text.secondary">
            Complexity
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

const EditPatternView: React.FC<{ analytics: VersionAnalytics }> = ({ analytics }) => {
  const theme = useTheme();
  const { editPatterns, evolution } = analytics;

  if (editPatterns.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <Typography color="text.secondary">No edit pattern data</Typography>
      </Box>
    );
  }

  const maxEdits = Math.max(...editPatterns.map(p => p.editCount));
  const hourLabels = ["12am", "3am", "6am", "9am", "12pm", "3pm", "6pm", "9pm"];
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <Box>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
        Most edits on {evolution.mostProductiveDay}
      </Typography>
      <Grid container spacing={1}>
        {Array.from({ length: 7 }).map((_, day) => (
          <Grid size={{ xs: 12/7 }} key={day}>
            <Box sx={{ textAlign: "center", mb: 1 }}>
              <Typography variant="caption" color="text.secondary">
                {dayLabels[day]}
              </Typography>
            </Box>
            {Array.from({ length: 8 }).map((_, hour) => {
              const pattern = editPatterns.find(
                p => p.dayOfWeek === day && Math.floor(p.hourOfDay / 3) === hour
              );
              const intensity = pattern ? pattern.editCount / maxEdits : 0;

              return (
                <Box
                  key={hour}
                  sx={{
                    height: 24,
                    bgcolor: intensity > 0
                      ? alpha(theme.palette.primary.main, 0.2 + intensity * 0.6)
                      : theme.palette.action.hover,
                    borderRadius: 0.25,
                    mb: 0.25,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  {intensity > 0.7 && (
                    <Typography variant="caption" sx={{ fontSize: "0.6rem" }}>
                      {pattern?.editCount}
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Grid>
        ))}
      </Grid>
      <Box sx={{ display: "flex", justifyContent: "space-between", mt: 1, px: 1 }}>
        {hourLabels.map(label => (
          <Typography key={label} variant="caption" color="text.secondary" sx={{ fontSize: "0.6rem" }}>
            {label}
          </Typography>
        ))}
      </Box>
    </Box>
  );
};

const SaveTypeDistribution: React.FC<{ distribution: Record<string, number> }> = ({
  distribution
}) => {
  const theme = useTheme();
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);

  if (total === 0) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <Typography color="text.secondary">No save type data</Typography>
      </Box>
    );
  }

  const typeLabels: Record<string, string> = {
    manual: "Manual",
    autosave: "Auto-save",
    checkpoint: "Checkpoint",
    restore: "Restore"
  };

  const typeColors: Record<string, "primary" | "success" | "warning" | "info"> = {
    manual: "primary",
    autosave: "success",
    checkpoint: "warning",
    restore: "info"
  };

  return (
    <Box>
      {Object.entries(distribution).map(([type, count]) => (
        <Box key={type} sx={{ mb: 1.5 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Chip
                label={typeLabels[type] || type}
                size="small"
                color={typeColors[type] || "primary"}
                sx={{ height: 20, fontSize: "0.65rem" }}
              />
              <Typography variant="caption" color="text.secondary">
                {count} ({((count / total) * 100).toFixed(0)}%)
              </Typography>
            </Box>
          </Box>
          <LinearProgress
            variant="determinate"
            value={(count / total) * 100}
            sx={{
              height: 6,
              borderRadius: 3,
              bgcolor: alpha(theme.palette[typeColors[type] || "primary"].main, 0.1),
              "& .MuiLinearProgress-bar": {
                bgcolor: theme.palette[typeColors[type] || "primary"].main,
                borderRadius: 3
              }
            }}
          />
        </Box>
      ))}
    </Box>
  );
};

export const VersionAnalyticsDashboard: React.FC<VersionAnalyticsDashboardProps> = ({
  workflowId
}) => {
  const theme = useTheme();

  const { data: apiVersions, isLoading } = useWorkflowVersions(workflowId);

  const analytics = useMemo((): VersionAnalytics => {
    if (!apiVersions?.versions) {
      return generateVersionAnalytics([]);
    }
    return generateVersionAnalytics(apiVersions.versions);
  }, [apiVersions]);

  if (isLoading) {
    return (
      <Paper sx={{ p: 4, textAlign: "center" }}>
        <Typography color="text.secondary">Loading analytics...</Typography>
      </Paper>
    );
  }

  if (analytics.metrics.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: "center" }}>
        <TimelineIcon sx={{ fontSize: 48, color: "text.secondary", mb: 2 }} />
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No Version History
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Save your workflow multiple times to see analytics
        </Typography>
      </Paper>
    );
  }

  const { evolution, nodeTypeChanges, peakComplexityVersion, mostChangedVersion } = analytics;

  return (
    <Box sx={{ p: 2 }}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12 }}>
          <Typography variant="h6" sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
            <TimelineIcon color="primary" />
            Workflow Evolution
          </Typography>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Total Versions"
            value={evolution.totalVersions}
            subtitle={`${evolution.totalEdits} edits`}
            icon={<EditIcon />}
            color="primary"
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Avg. Nodes"
            value={evolution.averageNodesPerVersion.toFixed(1)}
            subtitle="per version"
            icon={<StorageIcon />}
            color="info"
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Node Growth"
            value={formatGrowthRate(evolution.nodeGrowthRate)}
            trend={evolution.nodeGrowthRate}
            icon={<TrendingUpIcon />}
            color={evolution.nodeGrowthRate >= 0 ? "success" : "error"}
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Version Span"
            value={formatDuration(evolution.versionSpan)}
            subtitle="over time"
            icon={<ScheduleIcon />}
            color="warning"
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>
                Complexity Over Time
              </Typography>
              <TimelineView analytics={analytics} />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>
                Save Type Distribution
              </Typography>
              <SaveTypeDistribution distribution={evolution.saveTypeDistribution} />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>
                Edit Patterns
              </Typography>
              <EditPatternView analytics={analytics} />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>
                Node Type Changes
              </Typography>
              {nodeTypeChanges.length > 0 ? (
                <List dense>
                  {nodeTypeChanges.slice(0, 5).map(change => (
                    <ListItem key={change.type} disablePadding>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <TagIcon fontSize="small" color="action" />
                      </ListItemIcon>
                      <ListItemText
                        primary={change.type}
                        secondary={
                          <Box component="span" sx={{ display: "flex", gap: 0.5, mt: 0.5 }}>
                            {change.addedCount > 0 && (
                              <Chip label={`+${change.addedCount}`} size="small" color="success" sx={{ height: 18, fontSize: "0.6rem" }} />
                            )}
                            {change.removedCount > 0 && (
                              <Chip label={`-${change.removedCount}`} size="small" color="error" sx={{ height: 18, fontSize: "0.6rem" }} />
                            )}
                            {change.modifiedCount > 0 && (
                              <Chip label={`~${change.modifiedCount}`} size="small" color="warning" sx={{ height: 18, fontSize: "0.6rem" }} />
                            )}
                          </Box>
                        }
                        primaryTypographyProps={{ variant: "body2" }}
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Need 2+ versions to analyze node types
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <Divider sx={{ my: 1 }} />
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Box
                sx={{
                  p: 2,
                  bgcolor: alpha(theme.palette.warning.main, 0.1),
                  borderRadius: 1,
                  border: `1px solid ${theme.palette.warning.main}30`
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                  <SpeedIcon color="warning" fontSize="small" />
                  <Typography variant="subtitle2">Peak Complexity</Typography>
                </Box>
                {peakComplexityVersion ? (
                  <>
                    <Typography variant="h6">
                      v{peakComplexityVersion.version} ({peakComplexityVersion.complexity} pts)
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {peakComplexityVersion.nodeCount} nodes, {peakComplexityVersion.edgeCount} edges
                    </Typography>
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No data
                  </Typography>
                )}
              </Box>
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <Box
                sx={{
                  p: 2,
                  bgcolor: alpha(theme.palette.info.main, 0.1),
                  borderRadius: 1,
                  border: `1px solid ${theme.palette.info.main}30`
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                  <PsychologyIcon color="info" fontSize="small" />
                  <Typography variant="subtitle2">Most Changed</Typography>
                </Box>
                {mostChangedVersion ? (
                  <>
                    <Typography variant="h6">
                      v{mostChangedVersion.version}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Significant workflow changes
                    </Typography>
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No data
                  </Typography>
                )}
              </Box>
            </Grid>
          </Grid>
        </Grid>
      </Grid>
    </Box>
  );
};

export default VersionAnalyticsDashboard;
