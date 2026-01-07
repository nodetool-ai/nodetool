/** @jsxImportSource @emotion/react */
import React, { useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Alert,
  List,
  ListItem,
  Divider
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {
  WorkflowExplanationStep,
  WorkflowExplanation
} from "../../../hooks/useWorkflowExplainer";

const styles = (theme: Theme) =>
  css({
    ".workflow-explanation-container": {
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: "12px",
      border: `1px solid ${theme.vars.palette.divider}`,
      overflow: "hidden",
      marginTop: "0.5rem"
    },

    ".workflow-summary": {
      padding: "1rem",
      backgroundColor: `${theme.vars.palette.primary.main}15`,
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      "& .MuiTypography-root": {
        color: theme.vars.palette.text.primary
      }
    },

    ".workflow-steps": {
      padding: "0"
    },

    ".step-item": {
      position: "relative",
      padding: "1rem 1rem 1rem 2.5rem",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      "&:last-child": {
        borderBottom: "none"
      },
      "&::before": {
        content: '""',
        position: "absolute",
        left: "1rem",
        top: "1.25rem",
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        backgroundColor: theme.vars.palette.primary.main,
        boxShadow: `0 0 8px ${theme.vars.palette.primary.main}66`
      }
    },

    ".step-order": {
      position: "absolute",
      left: "0.6rem",
      top: "1rem",
      width: "20px",
      height: "20px",
      borderRadius: "50%",
      backgroundColor: theme.vars.palette.primary.main,
      color: theme.vars.palette.primary.contrastText,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "0.65rem",
      fontWeight: 700
    },

    ".step-header": {
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      marginBottom: "0.5rem",
      flexWrap: "wrap"
    },

    ".step-type-chip": {
      backgroundColor: `${theme.vars.palette.primary.main}22`,
      color: theme.vars.palette.primary.light,
      fontSize: "0.7rem",
      fontWeight: 600
    },

    ".step-description": {
      fontSize: "0.85rem",
      color: theme.vars.palette.text.secondary,
      lineHeight: 1.5,
      marginBottom: "0.75rem"
    },

    ".step-connections": {
      display: "flex",
      gap: "1rem",
      flexWrap: "wrap",
      fontSize: "0.75rem"
    },

    ".connection-group": {
      display: "flex",
      alignItems: "center",
      gap: "0.25rem"
    },

    ".connection-label": {
      color: theme.vars.palette.text.secondary,
      fontWeight: 500
    },

    ".connection-values": {
      display: "flex",
      gap: "0.25rem",
      flexWrap: "wrap"
    },

    ".connection-chip": {
      backgroundColor: theme.vars.palette.action.hover,
      fontSize: "0.7rem"
    },

    ".data-flow-section": {
      padding: "1rem",
      backgroundColor: theme.vars.palette.action.hover,
      borderTop: `1px solid ${theme.vars.palette.divider}`
    },

    ".data-flow-title": {
      fontSize: "0.7rem",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      color: theme.vars.palette.text.secondary,
      marginBottom: "0.5rem",
      display: "flex",
      alignItems: "center",
      gap: "0.5rem"
    },

    ".data-flow-items": {
      display: "flex",
      flexDirection: "column",
      gap: "0.25rem"
    },

    ".data-flow-item": {
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      fontSize: "0.8rem",
      color: theme.vars.palette.text.primary,
      "& .MuiTypography-root": {
        fontSize: "0.8rem"
      }
    },

    ".issues-section": {
      padding: "1rem"
    },

    ".issues-title": {
      fontSize: "0.7rem",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      color: theme.vars.palette.warning.light,
      marginBottom: "0.75rem",
      display: "flex",
      alignItems: "center",
      gap: "0.5rem"
    },

    ".empty-state": {
      padding: "2rem",
      textAlign: "center",
      color: theme.vars.palette.text.secondary
    }
  });

interface WorkflowExplanationDisplayProps {
  explanation: WorkflowExplanation;
}

const StepItem: React.FC<{ step: WorkflowExplanationStep }> = ({ step }) => {
  const theme = useTheme();

  return (
    <div className="step-item">
      <div className="step-order">{step.order}</div>
      <div className="step-header">
        <Chip
          label={step.nodeType}
          size="small"
          className="step-type-chip"
        />
      </div>
      <Typography className="step-description">{step.description}</Typography>
      {(step.inputs.length > 0 || step.outputs.length > 0) && (
        <div className="step-connections">
          {step.inputs.length > 0 && (
            <div className="connection-group">
              <span className="connection-label">Inputs:</span>
              <div className="connection-values">
                {step.inputs.map((input, idx) => (
                  <Chip
                    key={idx}
                    label={input}
                    size="small"
                    variant="outlined"
                    className="connection-chip"
                  />
                ))}
              </div>
            </div>
          )}
          {step.outputs.length > 0 && (
            <div className="connection-group">
              <span className="connection-label">Outputs:</span>
              <div className="connection-values">
                {step.outputs.map((output, idx) => (
                  <Chip
                    key={idx}
                    label={output}
                    size="small"
                    variant="outlined"
                    className="connection-chip"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const WorkflowExplanationDisplay: React.FC<
  WorkflowExplanationDisplayProps
> = ({ explanation }) => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState<string | false>("steps");

  const handleChange =
    (panel: string) => (_: React.SyntheticEvent, isExpanded: boolean) => {
      setExpanded(isExpanded ? panel : false);
    };

  if (!explanation) {
    return (
      <div className="empty-state">
        <Typography>No explanation available</Typography>
      </div>
    );
  }

  return (
    <Box className="workflow-explanation-container" css={styles(theme)}>
      <Box className="workflow-summary">
        <Typography variant="body2" fontWeight={500}>
          {explanation.summary}
        </Typography>
        <Box sx={{ mt: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Chip
            icon={<AccountTreeIcon sx={{ fontSize: 16 }} />}
            label={`${explanation.steps.length} steps`}
            size="small"
            variant="outlined"
          />
          {explanation.dataFlow.length > 0 && (
            <Chip
              icon={<ArrowForwardIcon sx={{ fontSize: 16 }} />}
              label={`${explanation.dataFlow.length} connections`}
              size="small"
              variant="outlined"
            />
          )}
          {explanation.potentialIssues.length > 0 && (
            <Chip
              icon={<WarningAmberIcon sx={{ fontSize: 16 }} />}
              label={`${explanation.potentialIssues.length} issues`}
              size="small"
              color="warning"
              variant="outlined"
            />
          )}
        </Box>
      </Box>

      <Accordion
        expanded={expanded === "steps"}
        onChange={handleChange("steps")}
        disableGutters
        elevation={0}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          sx={{ px: 1, minHeight: "48px" }}
        >
          <Typography variant="body2" fontWeight={600}>
            Workflow Steps
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 0 }}>
          {explanation.steps.length > 0 ? (
            <List className="workflow-steps" disablePadding>
              {explanation.steps.map((step) => (
                <ListItem key={step.nodeId} disablePadding alignItems="flex-start">
                  <StepItem step={step} />
                </ListItem>
              ))}
            </List>
          ) : (
            <Box sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                No steps in this workflow
              </Typography>
            </Box>
          )}
        </AccordionDetails>
      </Accordion>

      {explanation.dataFlow.length > 0 && (
        <>
          <Divider />
          <Box className="data-flow-section">
            <Typography className="data-flow-title">
              <AccountTreeIcon sx={{ fontSize: 16 }} />
              Data Flow
            </Typography>
            <Box className="data-flow-items">
              {explanation.dataFlow.map((flow, idx) => (
                <Box key={idx} className="data-flow-item">
                  <ArrowForwardIcon
                    sx={{ fontSize: 16, color: theme.vars.palette.primary.main }}
                  />
                  <Typography variant="body2">{flow}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </>
      )}

      {explanation.potentialIssues.length > 0 && (
        <>
          <Divider />
          <Box className="issues-section">
            <Typography className="issues-title">
              <WarningAmberIcon sx={{ fontSize: 18 }} />
              Potential Issues
            </Typography>
            {explanation.potentialIssues.map((issue, idx) => (
              <Alert
                key={idx}
                severity="warning"
                sx={{ mt: 0.5, fontSize: "0.8rem" }}
              >
                {issue}
              </Alert>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
};

export default WorkflowExplanationDisplay;
