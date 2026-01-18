/**
 * Version Metrics Panel Component
 *
 * Research Feature: Detailed metrics comparison between two workflow versions.
 * Shows node count, edge count, complexity, and change indicators.
 *
 * Status: ⚠️ Experimental - This is a research feature. API may change.
 */

import React, { useMemo } from "react";
import {
  Box,
  Typography,
  Paper,
  Grid,
  Chip,
  useTheme,
  alpha
} from "@mui/material";
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Remove as NoChangeIcon,
  AccountTree as GraphIcon
} from "@mui/icons-material";

interface VersionMetricsPanelProps {
  diff: {
    addedNodes: Array<{ id: string }>;
    removedNodes: Array<{ id: string }>;
    modifiedNodes: Array<{ nodeId: string }>;
    addedEdges: Array<{ source: string; target: string }>;
    removedEdges: Array<{ source: string; target: string }>;
    hasChanges: boolean;
  };
  oldVersion: {
    version: { version: number };
    metrics: {
      nodeCount: number;
      edgeCount: number;
      complexity: number;
      sizeBytes: number;
    };
  };
  newVersion: {
    version: { version: number };
    metrics: {
      nodeCount: number;
      edgeCount: number;
      complexity: number;
      sizeBytes: number;
    };
  };
}

const MetricCard: React.FC<{
  title: string;
  oldValue: number;
  newValue: number;
  icon: React.ReactNode;
  format?: (v: number) => string;
}> = ({ title, oldValue, newValue, icon, format = (v) => v.toString() }) => {
  const theme = useTheme();
  const change = newValue - oldValue;
  const hasChange = change !== 0;

  const getChangeColor = () => {
    if (change > 0) {return theme.palette.success.main;}
    if (change < 0) {return theme.palette.error.main;}
    return theme.palette.text.secondary;
  };

  const getChangeIcon = () => {
    if (change > 0) {return <TrendingUpIcon fontSize="small" color="success" />;}
    if (change < 0) {return <TrendingDownIcon fontSize="small" color="error" />;}
    return <NoChangeIcon fontSize="small" color="disabled" />;
  };

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        bgcolor: alpha(theme.palette.background.default, 0.5),
        border: 1,
        borderColor: "divider",
        borderRadius: 2
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <Box sx={{ color: "text.secondary" }}>{icon}</Box>
        <Typography variant="caption" color="text.secondary" fontWeight={500}>
          {title}
        </Typography>
      </Box>

      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
        <Typography variant="h5" fontWeight={600}>
          {format(newValue)}
        </Typography>
        {hasChange && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            {getChangeIcon()}
            <Typography
              variant="caption"
              sx={{ color: getChangeColor(), fontWeight: 500 }}
            >
              {change > 0 ? "+" : ""}{change}
            </Typography>
          </Box>
        )}
      </Box>

      <Typography variant="caption" color="text.secondary">
        was {format(oldValue)}
      </Typography>
    </Paper>
  );
};

export const VersionMetricsPanel: React.FC<VersionMetricsPanelProps> = ({
  diff,
  oldVersion,
  newVersion
}) => {
  const theme = useTheme();

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) {return `${bytes} B`;}
    if (bytes < 1024 * 1024) {return `${(bytes / 1024).toFixed(1)} KB`;}
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const changes = useMemo(() => {
    const changes = [];
    if (diff.addedNodes.length > 0) {
      changes.push({ type: "added", count: diff.addedNodes.length, label: "Added" });
    }
    if (diff.removedNodes.length > 0) {
      changes.push({ type: "removed", count: diff.removedNodes.length, label: "Removed" });
    }
    if (diff.modifiedNodes.length > 0) {
      changes.push({ type: "modified", count: diff.modifiedNodes.length, label: "Modified" });
    }
    if (diff.addedEdges.length > 0) {
      changes.push({ type: "added", count: diff.addedEdges.length, label: "Connections Added" });
    }
    if (diff.removedEdges.length > 0) {
      changes.push({ type: "removed", count: diff.removedEdges.length, label: "Connections Removed" });
    }
    return changes;
  }, [diff]);

  const totalChanges = useMemo(() => {
    return diff.addedNodes.length +
      diff.removedNodes.length +
      diff.modifiedNodes.length +
      diff.addedEdges.length +
      diff.removedEdges.length;
  }, [diff]);

  if (!diff.hasChanges) {
    return null;
  }

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <GraphIcon color="primary" />
        <Typography variant="subtitle1" fontWeight={600}>
          v{oldVersion.version.version} → v{newVersion.version.version}
        </Typography>
        <Chip
          label={`${totalChanges} change${totalChanges !== 1 ? "s" : ""}`}
          size="small"
          color={totalChanges > 5 ? "warning" : "default"}
        />
      </Box>

      {/* Metrics comparison */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <MetricCard
            title="Nodes"
            oldValue={oldVersion.metrics.nodeCount}
            newValue={newVersion.metrics.nodeCount}
            icon={<Box sx={{ fontSize: 20 }}>◻</Box>}
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <MetricCard
            title="Connections"
            oldValue={oldVersion.metrics.edgeCount}
            newValue={newVersion.metrics.edgeCount}
            icon={<Box sx={{ fontSize: 20 }}>━</Box>}
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <MetricCard
            title="Complexity"
            oldValue={oldVersion.metrics.complexity}
            newValue={newVersion.metrics.complexity}
            icon={<Box sx={{ fontSize: 20 }}>◈</Box>}
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <MetricCard
            title="Size"
            oldValue={oldVersion.metrics.sizeBytes}
            newValue={newVersion.metrics.sizeBytes}
            icon={<Box sx={{ fontSize: 20 }}>↓</Box>}
            format={formatBytes}
          />
        </Grid>
      </Grid>

      {/* Change summary */}
      <Box
        sx={{
          p: 1.5,
          bgcolor: alpha(theme.palette.info.main, 0.1),
          borderRadius: 1,
          display: "flex",
          gap: 1,
          flexWrap: "wrap",
          alignItems: "center"
        }}
      >
        <Typography variant="caption" color="text.secondary">
          Changes:
        </Typography>
        {changes.map((change, index) => (
          <Chip
            key={index}
            label={`${change.label}: ${change.count}`}
            size="small"
            color={
              change.type === "added" ? "success" :
              change.type === "removed" ? "error" :
              "warning"
            }
            sx={{ height: 22, fontSize: "0.7rem" }}
          />
        ))}
        {changes.length === 0 && (
          <Typography variant="caption" color="text.secondary">
            No structural changes
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default VersionMetricsPanel;
