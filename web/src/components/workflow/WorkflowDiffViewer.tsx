/** @jsxImportSource @emotion/react */
import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  Tooltip,
  Paper,
  Divider
} from "@mui/material";
import {
  AddCircleOutline,
  DeleteOutline,
  Edit,
  CheckCircleOutline,
  Close,
  CompareArrows
} from "@mui/icons-material";
import { useWorkflowDiffStore, DiffNodeStatus } from "../../stores/WorkflowDiffStore";
import type { WorkflowVersion as ApiWorkflowVersion } from "../../stores/ApiTypes";
import { computeWorkflowDiff } from "../../utils/workflowDiff";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";

const getStatusColor = (status: DiffNodeStatus, theme: Theme) => {
  switch (status) {
    case "added":
      return theme.palette.success.main;
    case "removed":
      return theme.palette.error.main;
    case "modified":
      return theme.palette.warning.main;
    default:
      return theme.palette.text.secondary;
  }
};

const getStatusIcon = (status: DiffNodeStatus) => {
  switch (status) {
    case "added":
      return <AddCircleOutline fontSize="small" />;
    case "removed":
      return <DeleteOutline fontSize="small" />;
    case "modified":
      return <Edit fontSize="small" />;
    default:
      return <CheckCircleOutline fontSize="small" />;
  }
};

const getStatusLabel = (status: DiffNodeStatus) => {
  switch (status) {
    case "added":
      return "Added";
    case "removed":
      return "Removed";
    case "modified":
      return "Modified";
    default:
      return "Unchanged";
  }
};

const DiffItem = ({
  id,
  type,
  status,
  label,
  isEdge = false
}: {
  id: string;
  type: string;
  status: DiffNodeStatus;
  label?: string;
  isEdge?: boolean;
}) => {
  const theme = useTheme<Theme>() as any;
  const color = getStatusColor(status, theme);

  return (
    <ListItem
      dense
      sx={{
        borderLeft: `3px solid ${color}`,
        mb: 0.5,
        borderRadius: 1,
        bgcolor: status === "unchanged" ? "transparent" : `${color}15`
      }}
    >
      <ListItemIcon sx={{ minWidth: 32, color }}>
        {getStatusIcon(status)}
      </ListItemIcon>
      <ListItemText
        primary={label || type}
        secondary={isEdge ? `${id} → ${id}` : id}
        primaryTypographyProps={{
          variant: "body2",
          fontWeight: status === "removed" || status === "added" ? 600 : 400
        }}
        secondaryTypographyProps={{
          variant: "caption",
          sx: { fontFamily: "monospace" }
        }}
      />
      <Chip
        label={getStatusLabel(status)}
        size="small"
        sx={{
          bgcolor: `${color}20`,
          color,
          fontWeight: 500,
          fontSize: "0.7rem",
          height: 20
        }}
      />
    </ListItem>
  );
};

interface WorkflowDiffViewerProps {
  versions: ApiWorkflowVersion[];
  currentVersionId: string;
}

export const WorkflowDiffViewer: React.FC<WorkflowDiffViewerProps> = ({
  versions,
  currentVersionId
}) => {
  const { isOpen, closeDiff, diff, setDiff } = useWorkflowDiffStore();
  const [previousVersionId, setPreviousVersionId] = useState<string | null>(null);

  const currentVersion = versions.find((v) => v.id === currentVersionId);
  const previousVersion = useMemo(() => {
    if (!previousVersionId) {
      const currentIndex = versions.findIndex((v) => v.id === currentVersionId);
      if (currentIndex > 0) {
        return versions[currentIndex - 1];
      }
      return versions[0];
    }
    return versions.find((v) => v.id === previousVersionId);
  }, [versions, currentVersionId, previousVersionId]);

  useEffect(() => {
    if (isOpen && currentVersion && previousVersion) {
      const computedDiff = computeWorkflowDiff(previousVersion, currentVersion);
      setDiff(computedDiff);
    }
  }, [isOpen, currentVersion, previousVersion, setDiff]);

  const handleClose = () => {
    closeDiff();
    setPreviousVersionId(null);
  };

  const summary = diff?.summary;

  if (!isOpen || !diff) {
    return null;
  }

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { minHeight: "60vh" }
      }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <CompareArrows color="primary" />
        <Typography variant="h6">Workflow Version Comparison</Typography>
        <Box sx={{ flex: 1 }} />
        <IconButton onClick={handleClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Previous Version
            </Typography>
            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "action.hover" }}>
              <Typography variant="body2" fontWeight={600}>
                {previousVersion?.name || `Version ${previousVersion?.version}`}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {previousVersion?.created_at
                  ? new Date(previousVersion.created_at).toLocaleString()
                  : "Unknown"}
              </Typography>
            </Paper>
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Current Version
            </Typography>
            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "primary.50" }}>
              <Typography variant="body2" fontWeight={600}>
                {currentVersion?.name || `Version ${currentVersion?.version}`}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {currentVersion?.created_at
                  ? new Date(currentVersion.created_at).toLocaleString()
                  : "Unknown"}
              </Typography>
            </Paper>
          </Box>
        </Box>

        {summary && (
          <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
            <Tooltip title="Nodes and edges added">
              <Chip
                icon={<AddCircleOutline />}
                label={`${summary.added} Added`}
                size="small"
                color="success"
                variant="outlined"
              />
            </Tooltip>
            <Tooltip title="Nodes and edges removed">
              <Chip
                icon={<DeleteOutline />}
                label={`${summary.removed} Removed`}
                size="small"
                color="error"
                variant="outlined"
              />
            </Tooltip>
            <Tooltip title="Nodes and edges modified">
              <Chip
                icon={<Edit />}
                label={`${summary.modified} Modified`}
                size="small"
                color="warning"
                variant="outlined"
              />
            </Tooltip>
            <Chip
              icon={<CheckCircleOutline />}
              label={`${summary.unchanged} Unchanged`}
              size="small"
              variant="outlined"
            />
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        <Box sx={{ display: "flex", gap: 3 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" gutterBottom>
              Nodes ({diff.nodes.length})
            </Typography>
            <List dense sx={{ maxHeight: 400, overflow: "auto" }}>
              {diff.nodes.map((node) => (
                <DiffItem
                  key={node.id}
                  id={node.id}
                  type={node.type}
                  status={node.status}
                  label={node.label}
                />
              ))}
            </List>
          </Box>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" gutterBottom>
              Connections ({diff.edges.length})
            </Typography>
            <List dense sx={{ maxHeight: 400, overflow: "auto" }}>
              {diff.edges.map((edge) => (
                <DiffItem
                  key={edge.id}
                  id={edge.id}
                  type="Edge"
                  status={edge.status}
                  label={`${edge.source} → ${edge.target}`}
                  isEdge
                />
              ))}
            </List>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};
