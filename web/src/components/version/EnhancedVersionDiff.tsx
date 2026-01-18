/**
 * Enhanced Version Diff Component
 *
 * Displays detailed property-level changes for nodes in a workflow version comparison.
 * Shows before/values with syntax highlighting and supports expanding node details.
 */

import React, { useState, useMemo } from "react";
import {
  Box,
  Typography,
  Collapse,
  IconButton,
  Chip,
  Paper,
  useTheme,
  Tooltip
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  Edit as EditIcon
} from "@mui/icons-material";
import { GraphDiff, NodeChange, PropertyChange } from "../../utils/graphDiff";

interface EnhancedVersionDiffProps {
  diff: GraphDiff;
  oldVersionNumber: number;
  newVersionNumber: number;
}

interface NodeDiffSectionProps {
  title: string;
  nodes: any[];
  icon: React.ReactNode;
  color: string;
  emptyMessage: string;
}

const NodeDiffSection: React.FC<NodeDiffSectionProps> = ({
  title,
  nodes,
  icon,
  color,
  emptyMessage
}) => {
  const theme = useTheme();

  if (nodes.length === 0) {
    return null;
  }

  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <Box sx={{ color }}>{icon}</Box>
        <Typography variant="subtitle2" fontWeight="medium">
          {title} ({nodes.length})
        </Typography>
      </Box>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
        {nodes.map((node) => (
          <Chip
            key={node.id}
            label={node.type?.split(".").pop() || node.id}
            size="small"
            sx={{
              bgcolor: `${color}20`,
              color: color,
              borderColor: color,
              border: `1px solid ${color}40`,
              fontWeight: "medium"
            }}
          />
        ))}
      </Box>
    </Box>
  );
};

interface PropertyChangeDisplayProps {
  change: PropertyChange;
}

const PropertyChangeDisplay: React.FC<PropertyChangeDisplayProps> = ({ change }) => {
  const theme = useTheme();
  const isSimpleValue =
    typeof change.oldValue === "string" ||
    typeof change.oldValue === "number" ||
    typeof change.oldValue === "boolean" ||
    change.oldValue === null;

  const formatValue = (value: unknown): string => {
    if (value === null) {return "null";}
    if (value === undefined) {return "undefined";}
    if (typeof value === "string") {return `"${value}"`;}
    if (typeof value === "object") {return JSON.stringify(value, null, 2);}
    return String(value);
  };

  if (isSimpleValue) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, fontFamily: "monospace", fontSize: "0.75rem" }}>
        <Typography
          component="span"
          sx={{
            color: theme.palette.error.main,
            bgcolor: `${theme.palette.error.main}15`,
            px: 0.5,
            py: 0.25,
            borderRadius: 0.5,
            textDecoration: "line-through"
          }}
        >
          {formatValue(change.oldValue)}
        </Typography>
        <Typography component="span" color="text.secondary">
          →
        </Typography>
        <Typography
          component="span"
          sx={{
            color: theme.palette.success.main,
            bgcolor: `${theme.palette.success.main}15`,
            px: 0.5,
            py: 0.25,
            borderRadius: 0.5,
            fontWeight: "medium"
          }}
        >
          {formatValue(change.newValue)}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
      <Box sx={{ color: theme.palette.error.main, mb: 0.5 }}>
        -{formatValue(change.oldValue)}
      </Box>
      <Box sx={{ color: theme.palette.success.main }}>
        +{formatValue(change.newValue)}
      </Box>
    </Box>
  );
};

interface ModifiedNodeDetailProps {
  nodeChange: NodeChange;
}

const ModifiedNodeDetail: React.FC<ModifiedNodeDetailProps> = ({ nodeChange }) => {
  const [expanded, setExpanded] = useState(false);
  const theme = useTheme();

  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 1,
        overflow: "hidden",
        borderColor: `${theme.palette.warning.main}40`,
        "&:hover": {
          borderColor: theme.palette.warning.main
        }
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          p: 1,
          bgcolor: `${theme.palette.warning.main}08`,
          cursor: "pointer"
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <EditIcon fontSize="small" sx={{ color: theme.palette.warning.main }} />
          <Typography variant="body2" fontWeight="medium">
            {nodeChange.nodeType?.split(".").pop() || nodeChange.nodeId}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            ({nodeChange.changes.length} change{nodeChange.changes.length !== 1 ? "s" : ""})
          </Typography>
        </Box>
        <IconButton size="small">
          {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>
      <Collapse in={expanded}>
        <Box sx={{ p: 1.5, pt: 1, borderTop: `1px solid ${theme.palette.divider}` }}>
          {nodeChange.changes.map((change, index) => (
            <Box key={index} sx={{ mb: 1.5, "&:last-child": { mb: 0 } }}>
              <Typography
                variant="caption"
                fontWeight="medium"
                sx={{
                  display: "block",
                  mb: 0.5,
                  color: "text.secondary",
                  fontFamily: "monospace"
                }}
              >
                {change.key}
              </Typography>
              <PropertyChangeDisplay change={change} />
            </Box>
          ))}
        </Box>
      </Collapse>
    </Paper>
  );
};

export const EnhancedVersionDiff: React.FC<EnhancedVersionDiffProps> = ({
  diff,
  oldVersionNumber,
  newVersionNumber
}) => {
  const theme = useTheme();

  const stats = useMemo(() => {
    const addedNodes = diff.addedNodes.length;
    const removedNodes = diff.removedNodes.length;
    const modifiedNodes = diff.modifiedNodes.length;
    const totalNodeChanges = addedNodes + removedNodes + modifiedNodes;
    const addedEdges = diff.addedEdges.length;
    const removedEdges = diff.removedEdges.length;
    const totalChanges = totalNodeChanges + addedEdges + removedEdges;

    return {
      addedNodes,
      removedNodes,
      modifiedNodes,
      totalNodeChanges,
      addedEdges,
      removedEdges,
      totalChanges
    };
  }, [diff]);

  if (!diff.hasChanges) {
    return (
      <Box sx={{ p: 2, textAlign: "center" }}>
        <Typography color="text.secondary">
          No changes between version {oldVersionNumber} and {newVersionNumber}
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Summary Stats */}
      <Paper
        sx={{
          p: 1.5,
          mb: 2,
          bgcolor: "background.default",
          display: "flex",
          flexWrap: "wrap",
          gap: 2
        }}
      >
        <Box>
          <Typography variant="caption" color="text.secondary">
            Total Changes
          </Typography>
          <Typography variant="h6" fontWeight="bold">
            {stats.totalChanges}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 2 }}>
          <Tooltip title="Nodes added">
            <Box sx={{ textAlign: "center" }}>
              <AddIcon fontSize="small" sx={{ color: theme.palette.success.main }} />
              <Typography variant="body2" fontWeight="medium" color="success.main">
                +{stats.addedNodes}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                nodes
              </Typography>
            </Box>
          </Tooltip>
          <Tooltip title="Nodes removed">
            <Box sx={{ textAlign: "center" }}>
              <RemoveIcon fontSize="small" sx={{ color: theme.palette.error.main }} />
              <Typography variant="body2" fontWeight="medium" color="error.main">
                -{stats.removedNodes}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                nodes
              </Typography>
            </Box>
          </Tooltip>
          <Tooltip title="Nodes modified">
            <Box sx={{ textAlign: "center" }}>
              <EditIcon fontSize="small" sx={{ color: theme.palette.warning.main }} />
              <Typography variant="body2" fontWeight="medium" color="warning.main">
                ~{stats.modifiedNodes}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                nodes
              </Typography>
            </Box>
          </Tooltip>
          <Tooltip title="Connections added/removed">
            <Box sx={{ textAlign: "center" }}>
              <Typography variant="body2" fontWeight="medium">
                <Typography component="span" color="success.main">+{stats.addedEdges}</Typography>
                <Typography component="span" color="text.secondary">/</Typography>
                <Typography component="span" color="error.main">-{stats.removedEdges}</Typography>
              </Typography>
              <Typography variant="caption" color="text.secondary">
                connections
              </Typography>
            </Box>
          </Tooltip>
        </Box>
      </Paper>

      {/* Node Changes Summary */}
      <NodeDiffSection
        title="Added Nodes"
        nodes={diff.addedNodes}
        icon={<AddIcon fontSize="small" />}
        color={theme.palette.success.main}
        emptyMessage="No nodes added"
      />

      <NodeDiffSection
        title="Removed Nodes"
        nodes={diff.removedNodes}
        icon={<RemoveIcon fontSize="small" />}
        color={theme.palette.error.main}
        emptyMessage="No nodes removed"
      />

      {/* Modified Nodes Detail */}
      {diff.modifiedNodes.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <EditIcon fontSize="small" sx={{ color: theme.palette.warning.main }} />
            <Typography variant="subtitle2" fontWeight="medium">
              Modified Nodes ({diff.modifiedNodes.length})
            </Typography>
          </Box>
          {diff.modifiedNodes.map((nodeChange) => (
            <ModifiedNodeDetail key={nodeChange.nodeId} nodeChange={nodeChange} />
          ))}
        </Box>
      )}

      {/* Edge Changes */}
      {(diff.addedEdges.length > 0 || diff.removedEdges.length > 0) && (
        <Box>
          <Typography variant="subtitle2" fontWeight="medium" sx={{ mb: 1 }}>
            Connection Changes
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {diff.addedEdges.map((edge) => (
              <Chip
                key={`added-${edge.id}`}
                label={`${edge.source} → ${edge.target}`}
                size="small"
                sx={{
                  bgcolor: `${theme.palette.success.main}20`,
                  color: theme.palette.success.main,
                  fontFamily: "monospace",
                  fontSize: "0.7rem"
                }}
              />
            ))}
            {diff.removedEdges.map((edge) => (
              <Chip
                key={`removed-${edge.id}`}
                label={`${edge.source} → ${edge.target}`}
                size="small"
                sx={{
                  bgcolor: `${theme.palette.error.main}20`,
                  color: theme.palette.error.main,
                  textDecoration: "line-through",
                  fontFamily: "monospace",
                  fontSize: "0.7rem"
                }}
              />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default EnhancedVersionDiff;
