import React, { useState, useCallback } from "react";
import {
  Box,
  Typography,
  IconButton,
  Paper,
  Button,
  Collapse,
  Chip,
} from "@mui/material";
import { Add, Delete, Restore, History, ExpandMore, CameraAlt } from "@mui/icons-material";
import { Node, Edge } from "@xyflow/react";
import { useSnapshots } from "../../hooks/useSnapshots";
import { WorkflowSnapshot } from "../../hooks/useSnapshots";
import { useNotificationStore } from "../../stores/NotificationStore";
import SnapshotDialog from "./SnapshotDialog";

interface SnapshotPanelProps {
  workflowId: string;
  nodes: Node[];
  edges: Edge[];
  onRestoreSnapshot: (nodes: Node[], edges: Edge[]) => void;
}

const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return "Just now";
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString();
  }
};

const SnapshotPanel: React.FC<SnapshotPanelProps> = ({
  workflowId,
  nodes,
  edges,
  onRestoreSnapshot,
}) => {
  const [expanded, setExpanded] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { deleteSnapshot, getSnapshotsForWorkflow } = useSnapshots();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const snapshots = getSnapshotsForWorkflow(workflowId);

  const handleRestore = useCallback(
    (snapshot: WorkflowSnapshot) => {
      onRestoreSnapshot(snapshot.nodes, snapshot.edges);
      addNotification({
        content: `Restored snapshot "${snapshot.name}"`,
        type: "success",
        alert: true,
      });
    },
    [onRestoreSnapshot, addNotification]
  );

  const handleDelete = useCallback(
    (snapshotId: string, snapshotName: string) => {
      deleteSnapshot(snapshotId);
      addNotification({
        content: `Snapshot "${snapshotName}" deleted`,
        type: "info",
        alert: true,
      });
    },
    [deleteSnapshot, addNotification]
  );

  if (snapshots.length === 0 && !expanded) {
    return (
      <Paper
        sx={{
          position: "absolute",
          bottom: 16,
          left: 16,
          zIndex: 100,
        }}
      >
        <Button
          size="small"
          startIcon={<CameraAlt />}
          onClick={() => setExpanded(true)}
          sx={{ borderRadius: 2 }}
        >
          Snapshots
        </Button>
      </Paper>
    );
  }

  return (
    <>
      <Paper
        sx={{
          position: "absolute",
          bottom: 16,
          left: 16,
          zIndex: 100,
          maxWidth: 320,
          maxHeight: expanded ? 400 : "auto",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Box
          sx={{
            p: 1.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: expanded ? 1 : 0,
            borderColor: "divider",
            bgcolor: "action.hover",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <History fontSize="small" color="primary" />
            <Typography variant="subtitle2">Snapshots</Typography>
            <Chip
              label={snapshots.length}
              size="small"
              sx={{ height: 20, fontSize: "0.7rem" }}
            />
          </Box>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <IconButton size="small" onClick={() => setDialogOpen(true)}>
              <Add fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => setExpanded(!expanded)}
              sx={{ transform: expanded ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s" }}
            >
              <ExpandMore fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        <Collapse in={expanded}>
          <Box
            sx={{
              maxHeight: 300,
              overflow: "auto",
              p: 1,
            }}
          >
            {snapshots.length === 0 ? (
              <Box
                sx={{
                  py: 3,
                  textAlign: "center",
                  color: "text.secondary",
                }}
              >
                <CameraAlt sx={{ fontSize: 40, opacity: 0.5, mb: 1 }} />
                <Typography variant="body2" sx={{ mb: 1 }}>
                  No snapshots yet
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Save snapshots to experiment safely
                </Typography>
              </Box>
            ) : (
              <Box>
                {snapshots.slice(0, 10).map((snapshot) => (
                  <Paper
                    key={snapshot.id}
                    variant="outlined"
                    sx={{ mb: 1 }}
                  >
                    <Box
                      sx={{
                        p: 1.5,
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0, pr: 1 }}>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 500, lineHeight: 1.2 }}
                        >
                          {snapshot.name}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                        >
                          {formatTimestamp(snapshot.timestamp)}
                        </Typography>
                      </Box>
                      <Box sx={{ display: "flex", gap: 0.5 }}>
                        <IconButton
                          size="small"
                          onClick={() => handleRestore(snapshot)}
                          sx={{ width: 28, height: 28 }}
                        >
                          <Restore fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() =>
                            handleDelete(snapshot.id, snapshot.name)
                          }
                          color="error"
                          sx={{ width: 28, height: 28 }}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </Box>
                    </Box>
                    {snapshot.description && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          px: 1.5,
                          pb: 1,
                          display: "block",
                          fontStyle: "italic",
                        }}
                      >
                        {snapshot.description}
                      </Typography>
                    )}
                  </Paper>
                ))}
              </Box>
            )}
          </Box>
        </Collapse>
      </Paper>

      <SnapshotDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        workflowId={workflowId}
        nodes={nodes}
        edges={edges}
        onRestoreSnapshot={onRestoreSnapshot}
      />
    </>
  );
};

export default SnapshotPanel;
