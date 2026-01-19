/**
 * VersionCompareWithCurrent Component (Experimental)
 *
 * Compares a historical version with the current workflow state.
 * Shows visual diff of what has changed since that version.
 *
 * Features:
 * - Visual comparison with current workflow
 * - Shows nodes/edges that would be added/modified/removed to restore
 * - Highlights new functionality added since that version
 * - Restore preview with impact analysis
 */

import React, { useCallback, useMemo } from "react";
import {
  Box,
  Paper,
  Typography,
  Button,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
  useTheme,
  Alert,
  AlertTitle
} from "@mui/material";
import {
  Compare as CompareIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  Edit as EditIcon,
  Link as LinkIcon,
  LinkOff as LinkOffIcon,
  Restore as RestoreIcon
} from "@mui/icons-material";
import { WorkflowVersion, Graph } from "../../stores/ApiTypes";
import { GraphDiff } from "../../utils/graphDiff";
import { GraphVisualDiff } from "./GraphVisualDiff";
import { computeGraphDiff } from "../../utils/graphDiff";

interface VersionCompareWithCurrentProps {
  historicalVersion: WorkflowVersion;
  currentGraph: Graph | null;
  onRestore: (version: WorkflowVersion) => void;
  onClose: () => void;
}

interface ChangeSummaryProps {
  diff: GraphDiff;
  type: "ahead" | "behind";
}

const ChangeSummary: React.FC<ChangeSummaryProps> = ({ diff, type }) => {
  const theme = useTheme();

  const changes = useMemo(() => {
    const items: Array<{
      label: string;
      count: number;
      icon: React.ReactNode;
      color: string;
    }> = [];

    if (diff.addedNodes.length > 0) {
      items.push({
        label: type === "ahead" ? "Added since v" : "Would add",
        count: diff.addedNodes.length,
        icon: <AddIcon fontSize="small" />,
        color: theme.palette.success.main
      });
    }

    if (diff.removedNodes.length > 0) {
      items.push({
        label: type === "ahead" ? "Removed since v" : "Would remove",
        count: diff.removedNodes.length,
        icon: <RemoveIcon fontSize="small" />,
        color: theme.palette.error.main
      });
    }

    if (diff.modifiedNodes.length > 0) {
      items.push({
        label: "Modified",
        count: diff.modifiedNodes.length,
        icon: <EditIcon fontSize="small" />,
        color: theme.palette.warning.main
      });
    }

    if (diff.addedEdges.length > 0) {
      items.push({
        label: "New connections",
        count: diff.addedEdges.length,
        icon: <LinkIcon fontSize="small" />,
        color: theme.palette.success.light
      });
    }

    if (diff.removedEdges.length > 0) {
      items.push({
        label: "Lost connections",
        count: diff.removedEdges.length,
        icon: <LinkOffIcon fontSize="small" />,
        color: theme.palette.error.light
      });
    }

    return items;
  }, [diff, type, theme]);

  if (!diff.hasChanges) {
    return (
      <Box sx={{ textAlign: "center", py: 2 }}>
        <Typography color="text.secondary">
          No changes from current version
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {type === "ahead" && (
        <Typography variant="subtitle2" gutterBottom>
          Changes since v{diff.addedNodes.length > 0 ? "this version" : ""}
        </Typography>
      )}

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 2 }}>
        {changes.map((item, index) => (
          <Chip
            key={index}
            icon={item.icon as React.ReactElement}
            label={`${item.count} ${item.label}`}
            size="small"
            sx={{
              bgcolor: `${item.color}20`,
              borderColor: item.color,
              border: 1,
              "& .MuiChip-icon": {
                color: item.color
              }
            }}
          />
        ))}
      </Box>

      {type === "ahead" && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <AlertTitle>Version is behind current</AlertTitle>
          The current workflow has evolved since this version. Restoring will
          revert some changes.
        </Alert>
      )}

      {type === "behind" && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <AlertTitle>Version is ahead of current</AlertTitle>
          This version has changes not in the current workflow. Restoring will
          add new functionality.
        </Alert>
      )}
    </Box>
  );
};

const NodeChangeList: React.FC<{
  nodes: Array<{ id: string; type?: string }>;
  icon: React.ReactNode;
  color: string;
}> = ({ nodes, icon, _color }) => {
  if (nodes.length === 0) {
    return null;
  }

  return (
    <List dense sx={{ py: 0 }}>
      {nodes.slice(0, 5).map((node, _index) => (
        <ListItem key={node.id} sx={{ py: 0.25 }}>
          <ListItemIcon sx={{ minWidth: 28 }}>{icon}</ListItemIcon>
          <ListItemText
            primary={node.type?.split(".").pop() || "Node"}
            secondary={node.id.substring(0, 12) + "..."}
            primaryTypographyProps={{ variant: "body2", fontSize: "0.75rem" }}
            secondaryTypographyProps={{ variant: "caption" }}
          />
        </ListItem>
      ))}
      {nodes.length > 5 && (
        <ListItem sx={{ py: 0.25 }}>
          <ListItemText
            primary={`+${nodes.length - 5} more...`}
            primaryTypographyProps={{
              variant: "body2",
              fontSize: "0.75rem",
              color: "text.secondary"
            }}
          />
        </ListItem>
      )}
    </List>
  );
};

export const VersionCompareWithCurrent: React.FC<VersionCompareWithCurrentProps> = ({
  historicalVersion,
  currentGraph,
  onRestore,
  onClose
}) => {
  const theme = useTheme();

  const diff: GraphDiff | null = useMemo(() => {
    if (!currentGraph) {
      return null;
    }
    return computeGraphDiff(
      historicalVersion.graph as unknown as Graph,
      currentGraph
    );
  }, [historicalVersion, currentGraph]);

  const handleRestore = useCallback(() => {
    onRestore(historicalVersion);
  }, [historicalVersion, onRestore]);

  const isAhead = useMemo(() => {
    if (!diff) {
      return false;
    }
    return diff.addedNodes.length > 0 || diff.addedEdges.length > 0;
  }, [diff]);

  if (!currentGraph) {
    return (
      <Paper elevation={3} sx={{ p: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <CompareIcon color="primary" />
          <Typography variant="h6">Compare with Current</Typography>
        </Box>
        <Typography color="text.secondary">
          No current workflow loaded. Please open a workflow to compare.
        </Typography>
        <Button onClick={onClose} sx={{ mt: 2 }}>
          Close
        </Button>
      </Paper>
    );
  }

  if (!diff) {
    return (
      <Paper elevation={3} sx={{ p: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <CompareIcon color="primary" />
          <Typography variant="h6">Compare with Current</Typography>
        </Box>
        <Typography color="text.secondary">
          Unable to compute diff. The version may have invalid graph data.
        </Typography>
        <Button onClick={onClose} sx={{ mt: 2 }}>
          Close
        </Button>
      </Paper>
    );
  }

  return (
    <Paper
      elevation={3}
      sx={{
        p: 2,
        maxWidth: 500,
        overflow: "hidden"
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 2
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <CompareIcon color="primary" />
          <Typography variant="h6">v{historicalVersion.version} vs Current</Typography>
        </Box>
        <Chip
          label={isAhead ? "Ahead" : "Behind"}
          color={isAhead ? "success" : "warning"}
          size="small"
        />
      </Box>

      <ChangeSummary diff={diff} type={isAhead ? "behind" : "ahead"} />

      <Divider sx={{ my: 2 }} />

      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          Visual Preview
        </Typography>
        <GraphVisualDiff
          diff={diff}
          oldGraph={historicalVersion.graph as unknown as Graph}
          newGraph={currentGraph}
          width={450}
          height={180}
        />
      </Box>

      <Divider sx={{ my: 2 }} />

      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          Change Details
        </Typography>

        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
          <Box>
            <Typography
              variant="caption"
              color="success.main"
              fontWeight="medium"
              sx={{ display: "block", mb: 0.5 }}
            >
              Added in Current
            </Typography>
            <NodeChangeList
              nodes={diff.addedNodes}
              icon={<AddIcon fontSize="small" color="success" />}
              color={theme.palette.success.main}
            />
          </Box>

          <Box>
            <Typography
              variant="caption"
              color="error.main"
              fontWeight="medium"
              sx={{ display: "block", mb: 0.5 }}
            >
              Removed from Current
            </Typography>
            <NodeChangeList
              nodes={diff.removedNodes}
              icon={<RemoveIcon fontSize="small" color="error" />}
              color={theme.palette.error.main}
            />
          </Box>
        </Box>

        {diff.modifiedNodes.length > 0 && (
          <Box sx={{ mt: 1 }}>
            <Typography
              variant="caption"
              color="warning.main"
              fontWeight="medium"
              sx={{ display: "block", mb: 0.5 }}
            >
              Modified in Current
            </Typography>
            <NodeChangeList
              nodes={diff.modifiedNodes.map(n => ({ id: n.nodeId, type: n.nodeType }))}
              icon={<EditIcon fontSize="small" color="warning" />}
              color={theme.palette.warning.main}
            />
          </Box>
        )}
      </Box>

      <Divider sx={{ my: 2 }} />

      <Box
        sx={{
          display: "flex",
          gap: 1,
          justifyContent: "flex-end"
        }}
      >
        <Button onClick={onClose} size="small">
          Cancel
        </Button>
        <Tooltip
          title={
            <Box>
              <Typography variant="caption">
                This will restore the workflow to v{historicalVersion.version}
              </Typography>
              <br />
              <Typography variant="caption">
                {diff.hasChanges
                  ? `${diff.addedNodes.length + diff.addedEdges.length} changes will be lost`
                  : "No changes will be lost"}
              </Typography>
            </Box>
          }
        >
          <Button
            variant="contained"
            color="warning"
            startIcon={<RestoreIcon />}
            onClick={handleRestore}
            size="small"
          >
            Restore v{historicalVersion.version}
          </Button>
        </Tooltip>
      </Box>
    </Paper>
  );
};

export default VersionCompareWithCurrent;
