/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React from "react";
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  Chip,
  Collapse,
  Tooltip
} from "@mui/material";
import {
  ExpandMore,
  ExpandLess,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Close as CloseIcon,
  OpenInNew as OpenInNewIcon
} from "@mui/icons-material";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { EdgeValidationIssue } from "../../stores/EdgeValidationStore";

const styles = (theme: Theme) =>
  css({
    ".edge-validation-panel": {
      position: "absolute",
      bottom: "16px",
      left: "16px",
      maxWidth: "400px",
      maxHeight: "300px",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      zIndex: 1000
    },
    ".validation-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 12px",
      cursor: "pointer"
    },
    ".validation-content": {
      overflowY: "auto",
      maxHeight: "220px"
    },
    ".issue-item": {
      borderBottom: "1px solid rgba(255,255,255,0.1)",
      "&:last-child": {
        borderBottom: "none"
      }
    },
    ".issue-error": {
      borderLeft: "3px solid #f44336"
    },
    ".issue-warning": {
      borderLeft: "3px solid #ff9800"
    },
    ".issue-info": {
      borderLeft: "3px solid #2196f3"
    }
  });

interface EdgeValidationPanelProps {
  workflowId: string;
}

const EdgeValidationPanel: React.FC<EdgeValidationPanelProps> = ({
  workflowId
}) => {
  const theme = useTheme();
  const { getEdgeValidation, clearEdgeValidation, validateAllEdges } =
    useWorkflowManager((state) => ({
      getEdgeValidation: state.getEdgeValidation,
      clearEdgeValidation: state.clearEdgeValidation,
      validateAllEdges: state.validateAllEdges
    }));
  const validation = getEdgeValidation();
  const [expanded, setExpanded] = React.useState(true);

  if (!validation) {
    return null;
  }

  const { issues, isValid, edgeCount, issueCount } = validation;

  if (edgeCount === 0) {
    return null;
  }

  const errorCount = issues.filter(
    (i: EdgeValidationIssue) => i.severity === "error"
  ).length;
  const warningCount = issues.filter(
    (i: EdgeValidationIssue) => i.severity === "warning"
  ).length;

  const getSeverityIcon = (severity: EdgeValidationIssue["severity"]) => {
    switch (severity) {
      case "error":
        return <ErrorIcon color="error" fontSize="small" />;
      case "warning":
        return <WarningIcon color="warning" fontSize="small" />;
      case "info":
        return <InfoIcon color="info" fontSize="small" />;
    }
  };

  const getSeverityChipColor = (
    severity: EdgeValidationIssue["severity"]
  ): "error" | "warning" | "info" => {
    switch (severity) {
      case "error":
        return "error";
      case "warning":
        return "warning";
      case "info":
        return "info";
    }
    throw new Error(`Unknown severity: ${severity}`);
  };

  const handleRevalidate = () => {
    validateAllEdges();
  };

  const handleClose = () => {
    clearEdgeValidation();
  };

  const handleToggleExpand = () => {
    setExpanded(!expanded);
  };

  return (
    <Paper css={styles(theme)} className="edge-validation-panel" elevation={4}>
      <Box
        className="validation-header"
        onClick={handleToggleExpand}
        sx={{
          backgroundColor: isValid
            ? "success.main"
            : errorCount > 0
            ? "error.main"
            : "warning.main",
          color: "white",
          "&:hover": {
            opacity: 0.9
          }
        }}
      >
        <Box display="flex" alignItems="center" gap={1}>
          {isValid ? (
            <Typography variant="subtitle2">
              All {edgeCount} edge(s) valid
            </Typography>
          ) : (
            <Typography variant="subtitle2">
              {errorCount} error(s), {warningCount} warning(s)
            </Typography>
          )}
        </Box>
        <Box display="flex" alignItems="center" gap={0.5}>
          <Tooltip title="Re-validate">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleRevalidate();
              }}
              sx={{ color: "white" }}
            >
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Close">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleClose();
              }}
              sx={{ color: "white" }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {expanded ? (
            <ExpandLess sx={{ color: "white" }} />
          ) : (
            <ExpandMore sx={{ color: "white" }} />
          )}
        </Box>
      </Box>
      <Collapse in={expanded}>
        <List dense className="validation-content">
          {issues.map((issue: EdgeValidationIssue, index: number) => (
            <ListItem
              key={`${issue.edgeId}-${index}`}
              className={`issue-item issue-${issue.severity}`}
              sx={{ py: 1, px: 2 }}
            >
              <ListItemIcon sx={{ minWidth: 32 }}>
                {getSeverityIcon(issue.severity)}
              </ListItemIcon>
              <ListItemText
                primary={
                  <Box display="flex" alignItems="center" gap={1}>
                    <Chip
                      label={issue.code.replace(/_/g, " ")}
                      size="small"
                      color={getSeverityChipColor(issue.severity)}
                      variant="outlined"
                    />
                    <Typography variant="body2" color="text.primary">
                      {issue.message}
                    </Typography>
                  </Box>
                }
                secondary={
                  <Typography variant="caption" color="text.secondary">
                    Edge: {issue.sourceId} → {issue.targetId}
                    {issue.sourceHandle && ` (${issue.sourceHandle})`}
                    {issue.targetHandle && ` → (${issue.targetHandle})`}
                  </Typography>
                }
              />
            </ListItem>
          ))}
        </List>
      </Collapse>
    </Paper>
  );
};

export default EdgeValidationPanel;
