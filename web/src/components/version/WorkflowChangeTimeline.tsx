/**
 * WorkflowChangeTimeline Component (Experimental)
 *
 * Visual timeline showing workflow version history with change indicators.
 * Displays a horizontal timeline where each version is a node, sized by change magnitude.
 *
 * Features:
 * - Timeline view of all versions
 * - Change magnitude indicators (size = number of changes from previous)
 * - Click to view details or compare
 * - Color-coded by save type (manual, autosave, checkpoint, restore)
 */

import React, { useCallback, useMemo } from "react";
import {
  Box,
  Paper,
  Typography,
  Tooltip,
  Chip,
  useTheme,
  Zoom
} from "@mui/material";
import {
  Timeline as TimelineIcon
} from "@mui/icons-material";
import { formatDistanceToNow } from "date-fns";
import { WorkflowVersion, Graph } from "../../stores/ApiTypes";
import { SaveType } from "../../stores/VersionHistoryStore";
import { computeGraphDiff, GraphDiff } from "../../utils/graphDiff";

interface WorkflowChangeTimelineProps {
  workflowId: string;
  versions: Array<WorkflowVersion & { save_type: SaveType }>;
  currentGraph?: Graph | null;
  onVersionClick: (version: WorkflowVersion) => void;
  onVersionCompare: (versionA: WorkflowVersion, versionB: WorkflowVersion) => void;
  selectedVersionId?: string | null;
  height?: number;
}

interface TimelineVersion {
  version: WorkflowVersion & { save_type: SaveType };
  diff: GraphDiff | null;
  changeMagnitude: number;
  position: number;
}

const getSaveTypeColor = (
  saveType: SaveType,
  theme: { palette: { primary: { main: string }; secondary: { main: string }; info: { main: string }; warning: { main: string }; grey: { 500: string } } }
): string => {
  switch (saveType) {
    case "manual":
      return theme.palette.primary.main;
    case "autosave":
      return theme.palette.secondary.main;
    case "restore":
      return theme.palette.info.main;
    case "checkpoint":
      return theme.palette.warning.main;
    default:
      return theme.palette.grey[500];
  }
};

const calculateChangeMagnitude = (diff: GraphDiff | null): number => {
  if (!diff) {
    return 0;
  }
  return (
    diff.addedNodes.length +
    diff.removedNodes.length +
    diff.modifiedNodes.length +
    diff.addedEdges.length +
    diff.removedEdges.length
  );
};

const getDiffFromPrevious = (
  currentVersion: WorkflowVersion & { save_type: SaveType },
  previousVersion: WorkflowVersion & { save_type: SaveType } | null
): GraphDiff | null => {
  if (!previousVersion) {
    return null;
  }
  return computeGraphDiff(
    previousVersion.graph as unknown as Graph,
    currentVersion.graph as unknown as Graph
  );
};

export const WorkflowChangeTimeline: React.FC<WorkflowChangeTimelineProps> = ({
  workflowId: _workflowId,
  versions,
  currentGraph,
  onVersionClick,
  onVersionCompare,
  selectedVersionId,
  height = 120
}) => {
  const theme = useTheme();

  const timelineVersions: TimelineVersion[] = useMemo(() => {
    if (versions.length === 0) {
      return [];
    }

    const sorted = [...versions].sort((a, b) => a.version - b.version);

    return sorted.map((version, index) => {
      const previousVersion = index > 0 ? sorted[index - 1] : null;
      const diff = getDiffFromPrevious(version, previousVersion);
      return {
        version,
        diff,
        changeMagnitude: calculateChangeMagnitude(diff),
        position: index
      };
    });
  }, [versions]);

  const maxChangeMagnitude = useMemo(() => {
    return Math.max(
      1,
      ...timelineVersions.map((tv) => tv.changeMagnitude)
    );
  }, [timelineVersions]);

  const nodeRadius = useCallback((magnitude: number): number => {
    const minRadius = 6;
    const maxRadius = 20;
    const normalized = magnitude / maxChangeMagnitude;
    return minRadius + normalized * (maxRadius - minRadius);
  }, [maxChangeMagnitude]);

  const currentVersion = currentGraph
    ? { changeMagnitude: 0, version: { version: -1, save_type: "manual" as SaveType }, diff: null, position: timelineVersions.length }
    : null;

  const totalNodes = timelineVersions.length + (currentVersion ? 1 : 0);
  const nodeSpacing = Math.max(60, Math.min(120, 600 / totalNodes));
  const timelineWidth = Math.max(800, nodeSpacing * totalNodes + 100);

  const getNodeColor = (saveType: SaveType, isCurrent: boolean): string => {
    if (isCurrent) {
      return theme.palette.success.main;
    }
    return getSaveTypeColor(saveType, theme);
  };

  const handleNodeClick = useCallback(
    (timelineVersion: TimelineVersion) => {
      onVersionClick(timelineVersion.version);
    },
    [onVersionClick]
  );

  const handleNodeRightClick = useCallback(
    (e: React.MouseEvent, timelineVersion: TimelineVersion) => {
      e.preventDefault();
      const previousVersion = timelineVersions.find(
        (tv) => tv.version.version === timelineVersion.version.version - 1
      );
      if (previousVersion) {
        onVersionCompare(previousVersion.version, timelineVersion.version);
      }
    },
    [timelineVersions, onVersionCompare]
  );

  if (versions.length === 0) {
    return (
      <Paper
        elevation={2}
        sx={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: theme.palette.action.hover
        }}
      >
        <Box sx={{ textAlign: "center" }}>
          <TimelineIcon sx={{ fontSize: 40, color: "text.secondary", mb: 1 }} />
          <Typography color="text.secondary">
            No version history yet
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Save your workflow to create versions
          </Typography>
        </Box>
      </Paper>
    );
  }

  return (
    <Paper
      elevation={2}
      sx={{
        height,
        overflow: "hidden",
        position: "relative",
        bgcolor: theme.palette.action.hover
      }}
    >
      <Box
        sx={{
          position: "absolute",
          top: 8,
          left: 16,
          display: "flex",
          alignItems: "center",
          gap: 1
        }}
      >
        <TimelineIcon fontSize="small" color="action" />
        <Typography variant="caption" color="text.secondary">
          Version Timeline
        </Typography>
      </Box>

      <Box
        sx={{
          position: "absolute",
          top: 8,
          right: 8,
          display: "flex",
          gap: 0.5
        }}
      >
        <Chip label="Manual" size="small" sx={{ height: 20, fontSize: "0.65rem" }} color="primary" variant="outlined" />
        <Chip label="Auto" size="small" sx={{ height: 20, fontSize: "0.65rem" }} color="secondary" variant="outlined" />
        <Chip label="Checkpoint" size="small" sx={{ height: 20, fontSize: "0.65rem" }} color="warning" variant="outlined" />
      </Box>

      <svg
        width="100%"
        height={height}
        style={{ display: "block", cursor: "grab" }}
      >
        <defs>
          <linearGradient id="timelineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={theme.palette.divider} />
            <stop offset="50%" stopColor={theme.palette.divider} />
            <stop offset="100%" stopColor={theme.palette.divider} />
          </linearGradient>
        </defs>

        <line
          x1={40}
          y1={height / 2}
          x2={timelineWidth - 40}
          y2={height / 2}
          stroke="url(#timelineGradient)"
          strokeWidth={2}
        />

        {timelineVersions.map((timelineVersion, index) => {
          const x = 60 + index * nodeSpacing;
          const y = height / 2;
          const radius = nodeRadius(timelineVersion.changeMagnitude);
          const isSelected = selectedVersionId === timelineVersion.version.id;
          const color = getNodeColor(timelineVersion.version.save_type, false);

          return (
            <g key={timelineVersion.version.id}>
              <Tooltip
                title={
                  <Box>
                    <Typography variant="caption" fontWeight="bold">
                      v{timelineVersion.version.version}
                    </Typography>
                    <br />
                    <Typography variant="caption">
                      {formatDistanceToNow(
                        new Date(timelineVersion.version.created_at),
                        { addSuffix: true }
                      )}
                    </Typography>
                    <br />
                    {timelineVersion.changeMagnitude > 0 && (
                      <Typography variant="caption">
                        {timelineVersion.changeMagnitude} change(s)
                      </Typography>
                    )}
                  </Box>
                }
                arrow
                TransitionComponent={Zoom}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={radius}
                  fill={color}
                  stroke={isSelected ? theme.palette.success.main : color}
                  strokeWidth={isSelected ? 3 : 1}
                  opacity={0.9}
                  style={{
                    cursor: "pointer",
                    transition: "all 0.2s ease"
                  }}
                  onClick={() => handleNodeClick(timelineVersion)}
                  onContextMenu={(e) => handleNodeRightClick(e, timelineVersion)}
                />
              </Tooltip>

              <text
                x={x}
                y={y + radius + 16}
                textAnchor="middle"
                fontSize={10}
                fill={theme.palette.text.secondary}
              >
                v{timelineVersion.version.version}
              </text>

              {timelineVersion.changeMagnitude > 0 && (
                <text
                  x={x}
                  y={y - radius - 8}
                  textAnchor="middle"
                  fontSize={9}
                  fill={theme.palette.text.secondary}
                >
                  {timelineVersion.changeMagnitude}
                </text>
              )}
            </g>
          );
        })}

        {currentVersion && (
          <g>
            <line
              x1={60 + (timelineVersions.length - 1) * nodeSpacing + nodeSpacing / 2}
              y1={height / 2}
              x2={60 + timelineVersions.length * nodeSpacing}
              y2={height / 2}
              stroke={theme.palette.success.main}
              strokeWidth={2}
              strokeDasharray="4,4"
            />
            <circle
              cx={60 + timelineVersions.length * nodeSpacing}
              cy={height / 2}
              r={8}
              fill={theme.palette.success.main}
              stroke={theme.palette.success.dark}
              strokeWidth={2}
              opacity={0.9}
            />
            <text
              x={60 + timelineVersions.length * nodeSpacing}
              y={height / 2 + 8 + 16}
              textAnchor="middle"
              fontSize={10}
              fill={theme.palette.success.main}
              fontWeight="bold"
            >
              Now
            </text>
          </g>
        )}
      </svg>

      <Box
        sx={{
          position: "absolute",
          bottom: 4,
          left: 16,
          display: "flex",
          gap: 2
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {versions.length} version(s)
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Click to view details • Right-click to compare
        </Typography>
      </Box>
    </Paper>
  );
};

export default WorkflowChangeTimeline;
