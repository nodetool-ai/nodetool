/** @jsxImportSource @emotion/react */
import React, { useMemo, useCallback } from "react";
import {
  Typography,
  Box,
  Button,
  LinearProgress,
  Tooltip,
  Collapse,
  IconButton
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import SettingsIcon from "@mui/icons-material/Settings";
import DownloadIcon from "@mui/icons-material/Download";
import LibraryBooksIcon from "@mui/icons-material/LibraryBooks";
import { css } from "@emotion/react";
import { useTheme, Theme } from "@mui/material/styles";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import useSecretsStore from "../../stores/SecretsStore";
import { Workflow } from "../../stores/ApiTypes";
import { getIsElectronDetails } from "../../utils/browser";
import { isProduction } from "../../stores/ApiClient";

interface GettingStartedPanelProps {
  sortedWorkflows: Workflow[];
  isLoadingWorkflows: boolean;
  startTemplates: Workflow[];
  isLoadingTemplates: boolean;
  handleExampleClick: (example: Workflow) => void;
  handleCreateNewWorkflow: () => void;
}

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  action?: () => void;
  actionLabel?: string;
  isCompleted: boolean;
  isOptional?: boolean;
}

const panelStyles = (theme: Theme) =>
  css({
    "&": {
      height: "100%",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      padding: "1em"
    },
    ".panel-header": {
      display: "flex",
      alignItems: "center",
      gap: "0.75em",
      marginBottom: "1em",
      paddingBottom: "0.75em",
      borderBottom: `1px solid ${theme.vars.palette.grey[700]}`
    },
    ".header-icon": {
      color: theme.vars.palette.primary.main,
      fontSize: "1.75rem"
    },
    ".progress-section": {
      marginBottom: "1.25em"
    },
    ".progress-header": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "0.5em"
    },
    ".progress-text": {
      fontSize: "0.875rem",
      color: theme.vars.palette.text.secondary
    },
    ".progress-bar": {
      height: "8px",
      borderRadius: "4px",
      backgroundColor: theme.vars.palette.grey[800],
      "& .MuiLinearProgress-bar": {
        borderRadius: "4px",
        backgroundColor: theme.vars.palette.success.main
      }
    },
    ".scrollable-content": {
      flex: 1,
      overflowY: "auto",
      overflowX: "hidden"
    },
    ".steps-container": {
      display: "flex",
      flexDirection: "column",
      gap: "0.75em"
    },
    ".step-card": {
      display: "flex",
      alignItems: "flex-start",
      gap: "0.75em",
      padding: "0.875em",
      borderRadius: "10px",
      backgroundColor: theme.vars.palette.grey[900],
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      transition: "all 0.2s ease"
    },
    ".step-card.completed": {
      borderColor: theme.vars.palette.success.main,
      borderLeftWidth: "3px"
    },
    ".step-card:hover:not(.completed)": {
      borderColor: theme.vars.palette.grey[600],
      backgroundColor: theme.vars.palette.grey[850]
    },
    ".step-icon-container": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "36px",
      height: "36px",
      borderRadius: "50%",
      backgroundColor: theme.vars.palette.grey[800],
      flexShrink: 0
    },
    ".step-icon-container.completed": {
      backgroundColor: `${theme.vars.palette.success.main}20`
    },
    ".step-icon": {
      fontSize: "1.25rem",
      color: theme.vars.palette.grey[400]
    },
    ".step-icon.completed": {
      color: theme.vars.palette.success.main
    },
    ".step-content": {
      flex: 1,
      minWidth: 0
    },
    ".step-title": {
      display: "flex",
      alignItems: "center",
      gap: "0.5em",
      fontWeight: 500,
      fontSize: "0.95rem",
      color: theme.vars.palette.text.primary,
      marginBottom: "0.25em"
    },
    ".step-title.completed": {
      color: theme.vars.palette.success.main
    },
    ".step-description": {
      fontSize: "0.85rem",
      color: theme.vars.palette.text.secondary,
      lineHeight: 1.4,
      marginBottom: "0.5em"
    },
    ".step-action": {
      marginTop: "0.5em"
    },
    ".step-status": {
      display: "flex",
      alignItems: "center",
      flexShrink: 0
    },
    ".optional-badge": {
      fontSize: "0.7rem",
      padding: "2px 6px",
      borderRadius: "4px",
      backgroundColor: theme.vars.palette.grey[800],
      color: theme.vars.palette.text.secondary,
      marginLeft: "0.5em"
    },
    ".quick-actions": {
      marginTop: "1em",
      padding: "0.875em",
      borderRadius: "10px",
      backgroundColor: theme.vars.palette.grey[900],
      border: `1px solid ${theme.vars.palette.grey[700]}`
    },
    ".quick-actions-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      cursor: "pointer",
      marginBottom: "0.5em"
    },
    ".quick-actions-title": {
      display: "flex",
      alignItems: "center",
      gap: "0.5em",
      fontWeight: 500,
      fontSize: "0.95rem"
    },
    ".quick-actions-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
      gap: "0.5em",
      marginTop: "0.75em"
    },
    ".quick-action-btn": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "0.25em",
      padding: "0.75em",
      borderRadius: "8px",
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      backgroundColor: "transparent",
      cursor: "pointer",
      transition: "all 0.2s ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[850],
        borderColor: theme.vars.palette.primary.main
      }
    },
    ".quick-action-icon": {
      fontSize: "1.5rem",
      color: theme.vars.palette.primary.main
    },
    ".quick-action-label": {
      fontSize: "0.8rem",
      color: theme.vars.palette.text.primary,
      textAlign: "center"
    }
  });

// Provider keys to check for configuration
const PROVIDER_KEYS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "OPENROUTER_API_KEY",
  "HF_TOKEN"
];

const GettingStartedPanel: React.FC<GettingStartedPanelProps> = ({
  sortedWorkflows,
  isLoadingWorkflows,
  startTemplates,
  isLoadingTemplates,
  handleExampleClick,
  handleCreateNewWorkflow
}) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [quickActionsExpanded, setQuickActionsExpanded] = React.useState(true);

  const shouldShowLocalModels =
    getIsElectronDetails().isElectron || !isProduction;

  // Fetch secrets to check provider configuration
  const { secrets, fetchSecrets } = useSecretsStore();

  useQuery({
    queryKey: ["secrets-onboarding"],
    queryFn: () => fetchSecrets(),
    staleTime: 30000
  });

  // Check if any provider is configured
  const hasProviderConfigured = useMemo(() => {
    if (!secrets || secrets.length === 0) {return false;}
    return secrets.some(
      (secret) => secret.is_configured && PROVIDER_KEYS.includes(secret.key)
    );
  }, [secrets]);

  // Check if user has created a workflow
  const hasCreatedWorkflow = useMemo(() => {
    return !isLoadingWorkflows && sortedWorkflows.length > 0;
  }, [isLoadingWorkflows, sortedWorkflows]);

  // Check if user has tried a template
  const hasTriedTemplate = useMemo(() => {
    // For now, we consider this complete if they have any workflows
    // In a more complete implementation, we might track this separately
    return hasCreatedWorkflow;
  }, [hasCreatedWorkflow]);

  const handleOpenSettings = useCallback(() => {
    navigate("/settings");
  }, [navigate]);

  const handleOpenModels = useCallback(() => {
    navigate("/models");
  }, [navigate]);

  const handleOpenTemplates = useCallback(() => {
    navigate("/templates");
  }, [navigate]);

  const handleOpenChat = useCallback(() => {
    navigate("/chat");
  }, [navigate]);

  const handleTryTemplate = useCallback(() => {
    if (startTemplates.length > 0) {
      handleExampleClick(startTemplates[0]);
    } else {
      navigate("/templates");
    }
  }, [startTemplates, handleExampleClick, navigate]);

  // Define onboarding steps
  const steps: OnboardingStep[] = useMemo(() => {
    const baseSteps: OnboardingStep[] = [
      {
        id: "setup-provider",
        title: "Set up an AI Provider",
        description:
          "Add API keys for OpenAI, Anthropic, or other providers to use cloud AI models.",
        icon: <SettingsIcon />,
        action: handleOpenSettings,
        actionLabel: "Open Settings",
        isCompleted: hasProviderConfigured,
        isOptional: shouldShowLocalModels
      },
      {
        id: "try-template",
        title: "Try a Template",
        description:
          "Explore a ready-made workflow to see what NodeTool can do.",
        icon: <LibraryBooksIcon />,
        action: handleTryTemplate,
        actionLabel: "Open Template",
        isCompleted: hasTriedTemplate
      },
      {
        id: "create-workflow",
        title: "Create Your First Workflow",
        description:
          "Build your own workflow by connecting nodes on the canvas.",
        icon: <PlayArrowIcon />,
        action: handleCreateNewWorkflow,
        actionLabel: "Create Workflow",
        isCompleted: hasCreatedWorkflow
      }
    ];

    // Add local models step for Electron or non-production
    if (shouldShowLocalModels) {
      baseSteps.splice(1, 0, {
        id: "download-model",
        title: "Download a Local Model",
        description:
          "Download GPT-OSS or another model to run AI locally without API keys.",
        icon: <DownloadIcon />,
        action: handleOpenModels,
        actionLabel: "Open Models",
        isCompleted: false, // Would need model status from store
        isOptional: true
      });
    }

    return baseSteps;
  }, [
    hasProviderConfigured,
    hasTriedTemplate,
    hasCreatedWorkflow,
    shouldShowLocalModels,
    handleOpenSettings,
    handleTryTemplate,
    handleCreateNewWorkflow,
    handleOpenModels
  ]);

  // Calculate progress
  const completedSteps = steps.filter((s) => s.isCompleted).length;
  const requiredSteps = steps.filter((s) => !s.isOptional).length;
  const completedRequired = steps.filter(
    (s) => s.isCompleted && !s.isOptional
  ).length;
  const progressPercentage = (completedRequired / requiredSteps) * 100;

  return (
    <Box css={panelStyles(theme)} className="getting-started-panel">
      <Box className="panel-header">
        <RocketLaunchIcon className="header-icon" />
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, fontSize: "1.1rem" }}>
            Getting Started
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: "text.secondary", fontSize: "0.85rem" }}
          >
            Complete these steps to get up and running
          </Typography>
        </Box>
      </Box>

      <Box className="progress-section">
        <Box className="progress-header">
          <Typography className="progress-text">
            {completedRequired} of {requiredSteps} steps completed
          </Typography>
          <Typography className="progress-text">
            {Math.round(progressPercentage)}%
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={progressPercentage}
          className="progress-bar"
        />
      </Box>

      <Box className="scrollable-content">
        <Box className="steps-container">
          {steps.map((step, index) => (
            <Box
              key={step.id}
              className={`step-card ${step.isCompleted ? "completed" : ""}`}
            >
              <Box
                className={`step-icon-container ${step.isCompleted ? "completed" : ""}`}
              >
                {step.isCompleted ? (
                  <CheckCircleIcon
                    className="step-icon completed"
                    sx={{ color: "success.main" }}
                  />
                ) : (
                  React.cloneElement(step.icon as React.ReactElement, {
                    className: "step-icon"
                  })
                )}
              </Box>
              <Box className="step-content">
                <Typography
                  className={`step-title ${step.isCompleted ? "completed" : ""}`}
                >
                  {index + 1}. {step.title}
                  {step.isOptional && (
                    <span className="optional-badge">Optional</span>
                  )}
                </Typography>
                <Typography className="step-description">
                  {step.description}
                </Typography>
                {!step.isCompleted && step.action && (
                  <Box className="step-action">
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={step.action}
                      startIcon={<PlayArrowIcon />}
                    >
                      {step.actionLabel}
                    </Button>
                  </Box>
                )}
              </Box>
              <Box className="step-status">
                {step.isCompleted ? (
                  <Tooltip title="Completed">
                    <CheckCircleIcon
                      sx={{ color: "success.main", fontSize: "1.25rem" }}
                    />
                  </Tooltip>
                ) : (
                  <Tooltip title="Not completed">
                    <RadioButtonUncheckedIcon
                      sx={{ color: "grey.600", fontSize: "1.25rem" }}
                    />
                  </Tooltip>
                )}
              </Box>
            </Box>
          ))}
        </Box>

        <Box className="quick-actions">
          <Box
            className="quick-actions-header"
            onClick={() => setQuickActionsExpanded(!quickActionsExpanded)}
          >
            <Typography className="quick-actions-title">
              Quick Actions
            </Typography>
            <IconButton size="small">
              {quickActionsExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>
          <Collapse in={quickActionsExpanded}>
            <Box className="quick-actions-grid">
              <Box
                className="quick-action-btn"
                onClick={handleCreateNewWorkflow}
              >
                <PlayArrowIcon className="quick-action-icon" />
                <Typography className="quick-action-label">
                  New Workflow
                </Typography>
              </Box>
              <Box className="quick-action-btn" onClick={handleOpenTemplates}>
                <LibraryBooksIcon className="quick-action-icon" />
                <Typography className="quick-action-label">
                  Templates
                </Typography>
              </Box>
              <Box className="quick-action-btn" onClick={handleOpenChat}>
                <RocketLaunchIcon className="quick-action-icon" />
                <Typography className="quick-action-label">
                  Open Chat
                </Typography>
              </Box>
              <Box className="quick-action-btn" onClick={handleOpenSettings}>
                <SettingsIcon className="quick-action-icon" />
                <Typography className="quick-action-label">Settings</Typography>
              </Box>
            </Box>
          </Collapse>
        </Box>
      </Box>
    </Box>
  );
};

export default GettingStartedPanel;
