import React from "react";
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Paper,
  Collapse,
  IconButton,
  Tooltip,
  Divider,
} from "@mui/material";
import {
  AddCircleOutline,
  RemoveCircleOutline,
  ChangeCircleOutlined,
  ArrowForward,
  ExpandMore,
  ExpandLess,
  CompareArrows,
} from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import {
  WorkflowDiff,
  AddedNode,
  RemovedNode,
  ModifiedNode,
  AddedEdge,
  RemovedEdge,
  NodeChange,
} from "../../hooks/useWorkflowDiff";

interface WorkflowDiffViewerProps {
  diff: WorkflowDiff;
  compact?: boolean;
}

export const WorkflowDiffViewer: React.FC<WorkflowDiffViewerProps> = ({
  diff,
  compact = false,
}) => {
  const theme = useTheme();
  const hasChanges =
    diff.addedNodes.length > 0 ||
    diff.removedNodes.length > 0 ||
    diff.modifiedNodes.length > 0 ||
    diff.addedEdges.length > 0 ||
    diff.removedEdges.length > 0;

  if (!hasChanges) {
    return (
      <Box sx={{ p: 2, textAlign: "center" }}>
        <Typography color="text.secondary">No changes between versions</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: compact ? 1 : 2 }}>
      <Typography variant="h6" sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
        <CompareArrows />
        Changes Summary
      </Typography>

      {!compact && (
        <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
          <Chip
            icon={<AddCircleOutline />}
            label={`${diff.addedNodes.length} added`}
            color="success"
            size="small"
          />
          <Chip
            icon={<RemoveCircleOutline />}
            label={`${diff.removedNodes.length} removed`}
            color="error"
            size="small"
          />
          <Chip
            icon={<ChangeCircleOutlined />}
            label={`${diff.modifiedNodes.length} modified`}
            color="warning"
            size="small"
          />
          <Chip
            icon={<ArrowForward />}
            label={`${diff.addedEdges} connections`}
            color="info"
            size="small"
            variant="outlined"
          />
        </Box>
      )}

      <List dense={compact}>
        {diff.addedNodes.map((node) => (
          <AddedNodeItem key={node.id} node={node} compact={compact} />
        ))}

        {diff.removedNodes.map((node) => (
          <RemovedNodeItem key={node.id} node={node} compact={compact} />
        ))}

        {diff.modifiedNodes.map((node) => (
          <ModifiedNodeItem key={node.id} node={node} compact={compact} />
        ))}

        {diff.addedEdges.length > 0 && !compact && (
          <>
            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle2" color="text.secondary" sx={{ px: 2, py: 1 }}>
              Connection Changes
            </Typography>
            {diff.addedEdges.map((edge) => (
              <AddedEdgeItem key={edge.id} edge={edge} />
            ))}
            {diff.removedEdges.map((edge) => (
              <RemovedEdgeItem key={edge.id} edge={edge} />
            ))}
          </>
        )}
      </List>
    </Box>
  );
};

const AddedNodeItem: React.FC<{ node: AddedNode; compact?: boolean }> = ({
  node,
  compact,
}) => {
  const [expanded, setExpanded] = React.useState(!compact);

  return (
    <>
      <ListItem
        sx={{
          bgcolor: "success.lighter",
          borderRadius: 1,
          mb: 0.5,
          "&:hover": { bgcolor: "success.light" },
        }}
      >
        <ListItemIcon sx={{ minWidth: 36 }}>
          <AddCircleOutline color="success" />
        </ListItemIcon>
        <ListItemText
          primary={
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="body2" fontWeight="medium">
                {node.id}
              </Typography>
              <Chip label={node.type} size="small" color="success" variant="outlined" />
            </Box>
          }
          secondary={!compact && node.data ? undefined : undefined}
        />
        {!compact && node.data && (
          <IconButton size="small" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        )}
      </ListItem>
      {!compact && node.data && (
        <Collapse in={expanded}>
          <Box sx={{ pl: 6, pr: 2, py: 1, bgcolor: "grey.50", borderRadius: 1, mb: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {formatNodeData(node.data)}
            </Typography>
          </Box>
        </Collapse>
      )}
    </>
  );
};

const RemovedNodeItem: React.FC<{ node: RemovedNode; compact?: boolean }> = ({
  node,
  compact,
}) => {
  const [expanded, setExpanded] = React.useState(!compact);

  return (
    <>
      <ListItem
        sx={{
          bgcolor: "error.lighter",
          borderRadius: 1,
          mb: 0.5,
          "&:hover": { bgcolor: "error.light" },
        }}
      >
        <ListItemIcon sx={{ minWidth: 36 }}>
          <RemoveCircleOutline color="error" />
        </ListItemIcon>
        <ListItemText
          primary={
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="body2" fontWeight="medium">
                {node.id}
              </Typography>
              <Chip label={node.type} size="small" color="error" variant="outlined" />
            </Box>
          }
        />
        {!compact && node.data && (
          <IconButton size="small" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        )}
      </ListItem>
      {!compact && node.data && (
        <Collapse in={expanded}>
          <Box sx={{ pl: 6, pr: 2, py: 1, bgcolor: "grey.50", borderRadius: 1, mb: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {formatNodeData(node.data)}
            </Typography>
          </Box>
        </Collapse>
      )}
    </>
  );
};

const ModifiedNodeItem: React.FC<{ node: ModifiedNode; compact?: boolean }> = ({
  node,
  compact,
}) => {
  const [expanded, setExpanded] = React.useState(!compact);

  return (
    <>
      <ListItem
        sx={{
          bgcolor: "warning.lighter",
          borderRadius: 1,
          mb: 0.5,
          "&:hover": { bgcolor: "warning.light" },
        }}
      >
        <ListItemIcon sx={{ minWidth: 36 }}>
          <ChangeCircleOutlined color="warning" />
        </ListItemIcon>
        <ListItemText
          primary={
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="body2" fontWeight="medium">
                {node.id}
              </Typography>
              <Chip label={node.type} size="small" color="warning" variant="outlined" />
              <Chip label={`${node.changes.length} change(s)`} size="small" variant="outlined" />
            </Box>
          }
        />
        {!compact && (
          <IconButton size="small" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        )}
      </ListItem>
      {!compact && (
        <Collapse in={expanded}>
          <Box sx={{ pl: 6, pr: 2, py: 1, bgcolor: "grey.50", borderRadius: 1, mb: 1 }}>
            {node.changes.map((change: NodeChange, idx: number) => (
              <Box key={idx} sx={{ mb: 0.5 }}>
                <Typography variant="caption" component="span" fontWeight="medium">
                  {change.field}:
                </Typography>{" "}
                <Typography
                  variant="caption"
                  component="span"
                  sx={{ textDecoration: "line-through", color: "error.main", mr: 1 }}
                >
                  {String(change.oldValue)}
                </Typography>
                <Typography
                  variant="caption"
                  component="span"
                  sx={{ color: "success.main" }}
                >
                  {String(change.newValue)}
                </Typography>
              </Box>
            ))}
          </Box>
        </Collapse>
      )}
    </>
  );
};

const AddedEdgeItem: React.FC<{ edge: AddedEdge }> = ({ edge }) => (
  <ListItem
    sx={{
      bgcolor: "info.lighter",
      borderRadius: 1,
      mb: 0.5,
    }}
  >
    <ListItemIcon sx={{ minWidth: 36 }}>
      <AddCircleOutline color="info" />
    </ListItemIcon>
    <ListItemText
      primary={
        <Typography variant="body2">
          {edge.source} → {edge.target}
        </Typography>
      }
    />
  </ListItem>
);

const RemovedEdgeItem: React.FC<{ edge: RemovedEdge }> = ({ edge }) => (
  <ListItem
    sx={{
      bgcolor: "grey.200",
      borderRadius: 1,
      mb: 0.5,
    }}
  >
    <ListItemIcon sx={{ minWidth: 36 }}>
      <RemoveCircleOutline color="disabled" />
    </ListItemIcon>
    <ListItemText
      primary={
        <Typography variant="body2" color="text.secondary">
          {edge.source} → {edge.target}
        </Typography>
      }
    />
  </ListItem>
);

function formatNodeData(data: Record<string, unknown>): string {
  const entries = Object.entries(data).slice(0, 5);
  return entries
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`)
    .join(", ");
}
