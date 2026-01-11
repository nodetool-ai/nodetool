import React, { useState, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Paper,
  Alert,
} from "@mui/material";
import { Add, Delete, Restore, History } from "@mui/icons-material";
import { Node, Edge } from "@xyflow/react";
import { useSnapshots } from "../../hooks/useSnapshots";
import { WorkflowSnapshot } from "../../hooks/useSnapshots";
import { useNotificationStore } from "../../stores/NotificationStore";

interface SnapshotDialogProps {
  open: boolean;
  onClose: () => void;
  workflowId: string;
  nodes: Node[];
  edges: Edge[];
  onRestoreSnapshot: (nodes: Node[], edges: Edge[]) => void;
}

const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const SnapshotDialog: React.FC<SnapshotDialogProps> = ({
  open,
  onClose,
  workflowId,
  nodes,
  edges,
  onRestoreSnapshot,
}) => {
  const [name, setName] = useState("");

  const { addSnapshot, deleteSnapshot, getSnapshotsForWorkflow } = useSnapshots();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const snapshots = getSnapshotsForWorkflow(workflowId);

  const handleCreateSnapshot = useCallback(() => {
    if (!name.trim()) {
      addNotification({
        content: "Please enter a snapshot name",
        type: "warning",
        alert: true,
      });
      return;
    }

    addSnapshot(workflowId, name.trim(), undefined, nodes, edges);
    setName("");
    addNotification({
      content: `Snapshot "${name}" created successfully`,
      type: "success",
      alert: true,
    });
  }, [name, workflowId, nodes, edges, addSnapshot, addNotification]);

  const handleRestore = useCallback(
    (snapshot: WorkflowSnapshot) => {
      onRestoreSnapshot(snapshot.nodes, snapshot.edges);
      addNotification({
        content: `Restored snapshot "${snapshot.name}"`,
        type: "success",
        alert: true,
      });
      onClose();
    },
    [onRestoreSnapshot, onClose, addNotification]
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

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      handleCreateSnapshot();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        component: "form",
        onSubmit: (e: React.FormEvent) => {
          e.preventDefault();
          handleCreateSnapshot();
        },
      }}
    >
      <DialogTitle>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <History color="primary" />
          Workflow Snapshots
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Create New Snapshot
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              label="Snapshot Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              fullWidth
              size="small"
              placeholder="e.g., Before trying new model"
              autoFocus
            />
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={handleCreateSnapshot}
              disabled={!name.trim()}
              sx={{ alignSelf: "flex-start" }}
            >
              Create Snapshot
            </Button>
          </Box>
        </Box>

        <Box sx={{ borderTop: 1, borderColor: "divider", my: 2 }} />

        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Saved Snapshots ({snapshots.length})
        </Typography>

        {snapshots.length === 0 ? (
          <Alert severity="info" sx={{ mt: 1 }}>
            No snapshots yet. Create a snapshot to save the current workflow
            state.
          </Alert>
        ) : (
          <Box sx={{ maxHeight: 300, overflow: "auto" }}>
            {snapshots.map((snapshot) => (
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
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
                      {snapshot.name}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", mt: 0.5 }}
                    >
                      {formatTimestamp(snapshot.timestamp)}
                      {" • "}
                      {snapshot.nodes.length} nodes
                    </Typography>
                    {snapshot.description && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          mt: 1,
                          fontStyle: "italic",
                          wordBreak: "break-word",
                        }}
                      >
                        {snapshot.description}
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ display: "flex", gap: 0.5 }}>
                    <Button
                      size="small"
                      startIcon={<Restore />}
                      onClick={() => handleRestore(snapshot)}
                      color="primary"
                    >
                      Restore
                    </Button>
                    <Button
                      size="small"
                      startIcon={<Delete />}
                      onClick={() => handleDelete(snapshot.id, snapshot.name)}
                      color="error"
                    >
                      Delete
                    </Button>
                  </Box>
                </Box>
              </Paper>
            ))}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default SnapshotDialog;
