/**
 * VersionDiff Component
 *
 * Visualizes the differences between two workflow versions.
 */

import React, { memo } from "react";
import {
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider
} from "@mui/material";
import {
  Add as AddIcon,
  Remove as RemoveIcon,
  Edit as EditIcon,
  ExpandMore as ExpandMoreIcon,
  Timeline as TimelineIcon,
  LinkOff as LinkOffIcon
} from "@mui/icons-material";
import { GraphDiff, NodeChange, PropertyChange } from "../../utils/graphDiff";

interface VersionDiffProps {
  diff: GraphDiff;
  oldVersionNumber: number;
  newVersionNumber: number;
}

const renderPropertyChange = (change: PropertyChange, index: number) => {
  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) {
      return "null";
    }
    if (typeof value === "object") {
      return JSON.stringify(value).substring(0, 50) + "...";
    }
    return String(value).substring(0, 50);
  };

  return (
    <Box
      key={index}
      sx={{
        display: "flex",
        alignItems: "flex-start",
        gap: 1,
        py: 0.5,
        pl: 2
      }}
    >
      <Typography
        variant="caption"
        fontWeight="medium"
        sx={{ minWidth: 80, color: "text.secondary" }}
      >
        {change.key}:
      </Typography>
      <Box sx={{ flex: 1 }}>
        <Typography
          variant="caption"
          sx={{
            color: "error.main",
            textDecoration: "line-through",
            display: "block"
          }}
        >
          {formatValue(change.oldValue)}
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: "success.main", display: "block" }}
        >
          {formatValue(change.newValue)}
        </Typography>
      </Box>
    </Box>
  );
};

const NodeDiffItem: React.FC<{
  node: { id: string; type?: string };
  type: "added" | "removed";
}> = ({ node, type }) => (
  <ListItem
    sx={{
      bgcolor: type === "added" ? "rgba(46, 125, 50, 0.1)" : "rgba(211, 47, 47, 0.1)",
      borderRadius: 1,
      mb: 0.5
    }}
  >
    <ListItemIcon sx={{ minWidth: 36 }}>
      {type === "added" ? (
        <AddIcon color="success" fontSize="small" />
      ) : (
        <RemoveIcon color="error" fontSize="small" />
      )}
    </ListItemIcon>
    <ListItemText
      primary={
        <Typography variant="body2">
          {node.type?.split(".").pop() || "Node"}
        </Typography>
      }
      secondary={
        <Typography variant="caption" color="text.secondary">
          ID: {node.id.substring(0, 8)}...
        </Typography>
      }
    />
    <Chip
      label={type === "added" ? "Added" : "Removed"}
      size="small"
      color={type === "added" ? "success" : "error"}
      sx={{ height: 20, fontSize: "0.65rem" }}
    />
  </ListItem>
);

const ModifiedNodeItem: React.FC<{ nodeChange: NodeChange }> = ({
  nodeChange
}) => (
  <Accordion
    sx={{
      bgcolor: "rgba(237, 108, 2, 0.1)",
      mb: 0.5,
      "&:before": { display: "none" }
    }}
    disableGutters
  >
    <AccordionSummary
      expandIcon={<ExpandMoreIcon />}
      sx={{ minHeight: 48 }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          width: "100%"
        }}
      >
        <EditIcon color="warning" fontSize="small" />
        <Typography variant="body2">
          {nodeChange.nodeType?.split(".").pop() || "Node"}
        </Typography>
        <Chip
          label={`${nodeChange.changes.length} change(s)`}
          size="small"
          color="warning"
          sx={{ height: 20, fontSize: "0.65rem", ml: "auto", mr: 1 }}
        />
      </Box>
    </AccordionSummary>
    <AccordionDetails sx={{ pt: 0 }}>
      {nodeChange.changes.map((change, index) =>
        renderPropertyChange(change, index)
      )}
    </AccordionDetails>
  </Accordion>
);

const EdgeDiffItem: React.FC<{
  edge: { source?: string; target?: string };
  type: "added" | "removed";
}> = ({ edge, type }) => (
  <ListItem
    sx={{
      bgcolor:
        type === "added"
          ? "rgba(46, 125, 50, 0.1)"
          : "rgba(211, 47, 47, 0.1)",
      borderRadius: 1,
      mb: 0.5,
      py: 0.5
    }}
  >
    <ListItemIcon sx={{ minWidth: 36 }}>
      {type === "added" ? (
        <TimelineIcon color="success" fontSize="small" />
      ) : (
        <LinkOffIcon color="error" fontSize="small" />
      )}
    </ListItemIcon>
    <ListItemText
      primary={
        <Typography variant="caption">
          {edge.source?.substring(0, 8)}... → {edge.target?.substring(0, 8)}...
        </Typography>
      }
    />
  </ListItem>
);

export const VersionDiff: React.FC<VersionDiffProps> = ({
  diff,
  oldVersionNumber,
  newVersionNumber
}) => {
  if (!diff.hasChanges) {
    return (
      <Paper sx={{ p: 2, textAlign: "center" }}>
        <Typography color="text.secondary">No changes detected</Typography>
      </Paper>
    );
  }

  return (
    <Box sx={{ p: 1 }}>
      <Typography variant="subtitle2" gutterBottom>
        Changes: v{oldVersionNumber} → v{newVersionNumber}
      </Typography>

      {/* Added Nodes */}
      {diff.addedNodes.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography
            variant="caption"
            color="success.main"
            fontWeight="medium"
            sx={{ display: "block", mb: 1 }}
          >
            Added Nodes ({diff.addedNodes.length})
          </Typography>
          <List dense disablePadding>
            {diff.addedNodes.map((node) => (
              <NodeDiffItem key={node.id} node={node} type="added" />
            ))}
          </List>
        </Box>
      )}

      {/* Removed Nodes */}
      {diff.removedNodes.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography
            variant="caption"
            color="error.main"
            fontWeight="medium"
            sx={{ display: "block", mb: 1 }}
          >
            Removed Nodes ({diff.removedNodes.length})
          </Typography>
          <List dense disablePadding>
            {diff.removedNodes.map((node) => (
              <NodeDiffItem key={node.id} node={node} type="removed" />
            ))}
          </List>
        </Box>
      )}

      {/* Modified Nodes */}
      {diff.modifiedNodes.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography
            variant="caption"
            color="warning.main"
            fontWeight="medium"
            sx={{ display: "block", mb: 1 }}
          >
            Modified Nodes ({diff.modifiedNodes.length})
          </Typography>
          {diff.modifiedNodes.map((nodeChange) => (
            <ModifiedNodeItem key={nodeChange.nodeId} nodeChange={nodeChange} />
          ))}
        </Box>
      )}

      {/* Edge Changes */}
      {(diff.addedEdges.length > 0 || diff.removedEdges.length > 0) && (
        <>
          <Divider sx={{ my: 1 }} />
          <Typography
            variant="caption"
            fontWeight="medium"
            sx={{ display: "block", mb: 1 }}
          >
            Connection Changes
          </Typography>
          <List dense disablePadding>
            {diff.addedEdges.map((edge, index) => (
              <EdgeDiffItem key={`added-${edge.source}-${edge.target}-${index}`} edge={edge} type="added" />
            ))}
            {diff.removedEdges.map((edge, index) => (
              <EdgeDiffItem key={`removed-${edge.source}-${edge.target}-${index}`} edge={edge} type="removed" />
            ))}
          </List>
        </>
      )}
    </Box>
  );
};

export default memo(VersionDiff);
