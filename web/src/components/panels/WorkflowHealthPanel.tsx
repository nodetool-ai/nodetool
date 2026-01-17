import React from "react";
import { Box, Typography, List, ListItem, ListItemIcon, ListItemText, Chip, IconButton, Tooltip } from "@mui/material";
import { useTheme, type Theme } from "@mui/material/styles";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ErrorIcon from "@mui/icons-material/Error";
import InfoIcon from "@mui/icons-material/Info";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CloseIcon from "@mui/icons-material/Close";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import useWorkflowValidationStore from "../../stores/WorkflowValidationStore";
import { ValidationIssue } from "../../stores/WorkflowValidationStore";
import { useRightPanelStore } from "../../stores/RightPanelStore";

const getIssueIcon = (issue: ValidationIssue) => {
  switch (issue.severity) {
    case "error":
      return <ErrorIcon color="error" />;
    case "warning":
      return <WarningAmberIcon color="warning" />;
    case "info":
      return <InfoIcon color="info" />;
    default:
      return <InfoIcon color="info" />;
  }
};

const getScoreColor = (score: number, theme: Theme) => {
  if (score >= 80) return theme.palette.success.main;
  if (score >= 50) return theme.palette.warning.main;
  return theme.palette.error.main;
};

const formatTimestamp = (timestamp: number | null) => {
  if (!timestamp) return "Never";
  return new Date(timestamp).toLocaleTimeString();
};

export const WorkflowHealthPanel: React.FC = () => {
  const theme = useTheme();
  const { issues, isValid, score, lastValidatedAt, clearValidation, getIssueCount } = useWorkflowValidationStore();
  const { setVisibility } = useRightPanelStore();

  const { errors, warnings, info } = getIssueCount();

  const handleClose = () => {
    setVisibility(false);
  };

  const handleDismiss = () => {
    clearValidation();
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", p: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="h6">Workflow Health</Typography>
          <Tooltip title="Validates your workflow for common issues">
            <HelpOutlineIcon fontSize="small" sx={{ color: "text.secondary" }} />
          </Tooltip>
        </Box>
        <IconButton size="small" onClick={handleClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Health Score
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: "bold", color: getScoreColor(score, theme) }}>
            {score}/100
          </Typography>
        </Box>
        <Box
          sx={{
            height: 8,
            borderRadius: 4,
            bgcolor: "action.hover",
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              height: "100%",
              width: `${score}%`,
              bgcolor: getScoreColor(score, theme),
              transition: "width 0.3s ease, bgcolor 0.3s ease",
            }}
          />
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
          Last validated: {formatTimestamp(lastValidatedAt)}
        </Typography>
      </Box>

      {issues.length === 0 ? (
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "success.main" }}>
          <CheckCircleIcon sx={{ fontSize: 48, mb: 1 }} />
          <Typography variant="body1" fontWeight="medium">Workflow looks good!</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, textAlign: "center" }}>
            No issues detected.
          </Typography>
        </Box>
      ) : (
        <>
          <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
            {errors > 0 && <Chip size="small" label={`${errors} Error${errors > 1 ? "s" : ""}`} color="error" />}
            {warnings > 0 && <Chip size="small" label={`${warnings} Warning${warnings > 1 ? "s" : ""}`} color="warning" />}
            {info > 0 && <Chip size="small" label={`${info} Info`} variant="outlined" />}
          </Box>

          <Typography variant="subtitle2" sx={{ mb: 1 }}>Issues Found</Typography>
          <List sx={{ flex: 1, overflow: "auto", bgcolor: "background.default", borderRadius: 1 }}>
            {issues.map((issue) => (
              <ListItem key={issue.id} alignItems="flex-start" sx={{ py: 1 }}>
                <ListItemIcon sx={{ minWidth: 36, mt: 0.5 }}>
                  {getIssueIcon(issue)}
                </ListItemIcon>
                <ListItemText
                  primary={issue.message}
                  secondary={issue.nodeId ? `Node: ${issue.nodeId}` : undefined}
                  primaryTypographyProps={{ variant: "body2" }}
                />
              </ListItem>
            ))}
          </List>
        </>
      )}

      <Box sx={{ mt: 2, display: "flex", justifyContent: "flex-end" }}>
        {issues.length > 0 && (
          <Chip
            label="Clear Issues"
            onClick={handleDismiss}
            size="small"
            variant="outlined"
            clickable
          />
        )}
      </Box>
    </Box>
  );
};

export default WorkflowHealthPanel;
