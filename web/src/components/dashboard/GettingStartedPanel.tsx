/** @jsxImportSource @emotion/react */
import React, { useMemo, useCallback, useState } from "react";
import {
  Typography,
  Box,
  Button,
  LinearProgress,
  Tooltip,
  Chip,
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
import { Workflow, UnifiedModel } from "../../stores/ApiTypes";
import { getIsElectronDetails } from "../../utils/browser";
import { isProduction, client } from "../../stores/ApiClient";
import { DEFAULT_MODEL } from "../../config/constants";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { DownloadProgress } from "../hugging_face/DownloadProgress";
import { useGettingStartedStore } from "../../stores/GettingStartedStore";

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
    ".local-models-list": {
      listStyleType: "none",
      padding: 0,
      margin: 0,
      display: "flex",
      flexDirection: "column",
      gap: "0.75em"
    },
    ".local-model-item": {
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      backgroundColor: theme.vars.palette.grey[850],
      borderRadius: 8,
      padding: "10px 12px"
    },
    ".local-model-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "0.5em",
      flexWrap: "wrap"
    },
    ".local-model-title": {
      display: "flex",
      alignItems: "center",
      gap: "0.5em"
    },
    ".local-model-actions": {
      display: "flex",
      alignItems: "center"
    },
    ".model-variant-buttons": {
      display: "flex",
      gap: 0.5,
      flexWrap: "wrap"
    },
    ".local-model-desc": {
      marginTop: 6,
      opacity: 0.95
    },
    ".model-note": {
      color: theme.vars.palette.warning.main,
      marginTop: 4,
      fontSize: "0.85em"
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

// Inline Model Download Component
const InlineModelDownload: React.FC<{
  model: UnifiedModel;
  label?: React.ReactNode;
  isDefault?: boolean;
  tooltip?: string;
}> = ({ model, label, isDefault, tooltip }) => {
  const { startDownload, downloads } = useModelDownloadStore((state) => ({
    startDownload: state.startDownload,
    downloads: state.downloads
  }));
  const downloadKey = model.repo_id || model.id;
  const inProgress = !!downloads[downloadKey];
  if (inProgress) {
    return (
      <Box
        component="span"
        sx={{ ml: 1, display: "inline-flex", verticalAlign: "middle" }}
        className="inline-download-progress"
      >
        <DownloadProgress name={downloadKey} minimal />
      </Box>
    );
  }
  const button = (
    <Button
      size="small"
      variant={isDefault ? "contained" : "outlined"}
      color={isDefault ? "primary" : "inherit"}
      startIcon={<DownloadIcon fontSize="small" />}
      aria-label={`Download ${model.repo_id || model.id}`}
      sx={{ ml: 1, verticalAlign: "middle" }}
      className={`model-download-button ${isDefault ? "default-model" : ""}`}
      onClick={() =>
        startDownload(
          model.repo_id || "",
          model.type || "hf.model",
          model.path ?? null,
          model.allow_patterns ?? null,
          model.ignore_patterns ?? null
        )
      }
    >
      {label ?? "Download"}
    </Button>
  );
  return tooltip ? (
    <Tooltip title={tooltip} arrow>
      <span>{button}</span>
    </Tooltip>
  ) : (
    button
  );
};

interface FeaturedModel extends UnifiedModel {
  displayName?: string;
  note?: string;
  vision?: boolean;
  reasoning?: boolean;
  base?: string;
  variants?: string[];
  defaultVariant?: string;
}

const recommendedModels: FeaturedModel[] = [
  {
    id: DEFAULT_MODEL,
    name: "GPT - OSS",
    displayName: "GPT - OSS",
    type: "llama_model",
    repo_id: DEFAULT_MODEL,
    base: "gpt-oss",
    variants: ["20b", "120b"],
    defaultVariant: "20b",
    description:
      "Powerful reasoning and agentic tasks.",
    reasoning: true,
    vision: false,
    downloaded: false
  },
  {
    id: "gemma3:4b",
    name: "Gemma 3 4B",
    displayName: "Gemma 3",
    type: "llama_model",
    repo_id: "gemma3:4b",
    base: "gemma3",
    variants: ["1b", "4b", "12b", "27b"],
    defaultVariant: "4b",
    description:
      "Lightweight, multimodal (text, images, video), 128K context.",
    reasoning: true,
    vision: true,
    downloaded: false
  },
  {
    id: "qwen3:4b",
    name: "Qwen 3 4B",
    displayName: "Qwen 3",
    type: "llama_model",
    repo_id: "qwen3:4b",
    base: "qwen3",
    variants: ["0.6b", "1.7b", "4b", "8b", "14b", "30b", "32b"],
    defaultVariant: "4b",
    description:
      "Hybrid reasoning with multilingual support.",
    reasoning: true,
    vision: false,
    downloaded: false
  }
];

const GettingStartedPanel: React.FC<GettingStartedPanelProps> = ({
  sortedWorkflows,
  isLoadingWorkflows,
  startTemplates,
  handleExampleClick,
  handleCreateNewWorkflow
}) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [modelsExpanded, setModelsExpanded] = useState(false);

  const shouldShowLocalModels =
    getIsElectronDetails().isElectron || !isProduction;

  // Fetch secrets to check provider configuration
  const secrets = useSecretsStore((state) => state.secrets);
  const fetchSecrets = useSecretsStore((state) => state.fetchSecrets);

  useQuery({
    queryKey: ["secrets-onboarding"],
    queryFn: () => fetchSecrets(),
    staleTime: 30000
  });

  // Check for local models (Ollama)
  const { data: ollamaModels } = useQuery({
    queryKey: ["ollama-models"],
    queryFn: async () => {
      const { data } = await client.GET("/api/models/ollama");
      // Handle potential response structures (array or object with models property)
      if (Array.isArray(data)) {return data;}
      
      const responseData = data as any;
      if (responseData?.models && Array.isArray(responseData.models)) {return responseData.models;}
      return [];
    },
    refetchInterval: 5000 // Poll every 5s to check for new downloads
  });

  const hasLocalModels = (ollamaModels?.length ?? 0) > 0;

  // Check if any provider is configured
  const hasProviderConfigured = useMemo(() => {
    if (!secrets || secrets.length === 0) {
      return false;
    }
    return secrets.some(
      (secret) => secret.is_configured && PROVIDER_KEYS.includes(secret.key)
    );
  }, [secrets]);

  // Getting started progress from store (persisted in localStorage)
  const { 
    progress, 
    setHasCreatedWorkflow, 
    setHasTriedTemplate 
  } = useGettingStartedStore();
  
  const hasCreatedWorkflow = progress.hasCreatedWorkflow;
  const hasTriedTemplate = progress.hasTriedTemplate;

  // Update hasCreatedWorkflow when user has workflows
  React.useEffect(() => {
    if (!isLoadingWorkflows && sortedWorkflows.length > 0 && !hasCreatedWorkflow) {
      setHasCreatedWorkflow(true);
    }
  }, [isLoadingWorkflows, sortedWorkflows.length, hasCreatedWorkflow, setHasCreatedWorkflow]);

  const handleOpenSettings = useCallback(() => {
    navigate("/settings");
  }, [navigate]);

  const handleTryTemplate = useCallback(() => {
    // Mark template as tried when user clicks
    if (!hasTriedTemplate) {
      setHasTriedTemplate(true);
    }
    if (startTemplates.length > 0) {
      handleExampleClick(startTemplates[0]);
    } else {
      navigate("/templates");
    }
  }, [startTemplates, handleExampleClick, navigate, hasTriedTemplate, setHasTriedTemplate]);

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
        // No action button - users can download directly from the collapsible models list
        isCompleted: hasLocalModels,
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
    hasLocalModels
  ]);

  // Calculate progress
  const completedSteps = steps.filter((s) => s.isCompleted).length;
  const totalSteps = steps.length;
  const progressPercentage = (completedSteps / totalSteps) * 100;

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
            {completedSteps} of {totalSteps} steps completed
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
                {/* Collapsible Popular Models section for download-model step */}
                {step.id === "download-model" && (
                  <Box sx={{ mt: 1.5 }}>
                    <Box
                      onClick={() => setModelsExpanded(!modelsExpanded)}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        cursor: "pointer",
                        gap: 0.5,
                        "&:hover": { opacity: 0.8 }
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 500,
                          fontSize: "0.85rem",
                          color: "primary.main"
                        }}
                      >
                        Popular Models
                      </Typography>
                      <IconButton size="small" sx={{ p: 0 }} aria-label={modelsExpanded ? "Collapse popular models" : "Expand popular models"}>
                        {modelsExpanded ? (
                          <ExpandLessIcon fontSize="small" />
                        ) : (
                          <ExpandMoreIcon fontSize="small" />
                        )}
                      </IconButton>
                    </Box>
                    <Collapse in={modelsExpanded}>
                      <ul className="local-models-list" style={{ marginTop: "0.5em" }}>
                        {recommendedModels.map((model) => (
                          <li key={model.id} style={{ listStyle: "none" }}>
                            <div className="local-model-item">
                              <div className="local-model-header">
                                <div className="local-model-title">
                                  <Typography
                                    variant="subtitle2"
                                    sx={{ fontWeight: 500 }}
                                  >
                                    {(model as FeaturedModel).displayName ||
                                      model.name}
                                  </Typography>
                                </div>
                                <div className="local-model-actions">
                                  <Box className="model-variant-buttons">
                                    {((model as FeaturedModel).variants &&
                                    (model as FeaturedModel).variants!.length > 0
                                      ? (model as FeaturedModel).variants!
                                      : [model.id.split(":")[1] || "latest"]
                                    ).map((variant) => {
                                      const base =
                                        (model as FeaturedModel).base ||
                                        (model.id.includes(":")
                                          ? model.id.split(":")[0]
                                          : model.id);
                                      const variantModel: UnifiedModel = {
                                        ...model,
                                        id: `${base}:${variant}`,
                                        repo_id: `${base}:${variant}`
                                      };
                                      const defaultVariant =
                                        (model as FeaturedModel).defaultVariant ||
                                        (model.id.includes(":")
                                          ? model.id.split(":")[1]
                                          : "");
                                      const isDefault =
                                        variant.toLowerCase() ===
                                        (defaultVariant || "").toLowerCase();
                                      return (
                                        <InlineModelDownload
                                          key={`${model.id}-${variant}`}
                                          model={variantModel}
                                          isDefault={isDefault}
                                          label={`${variant.toUpperCase()}`}
                                          tooltip={`Download ${base}:${variant}`}
                                        />
                                      );
                                    })}
                                  </Box>
                                </div>
                              </div>
                              <div className="local-model-desc">
                                {model.description && (
                                  <Typography
                                    variant="body2"
                                    sx={{ fontSize: "0.85em" }}
                                  >
                                    {model.description}
                                  </Typography>
                                )}
                                <Box
                                  sx={{
                                    display: "flex",
                                    gap: 0.5,
                                    flexWrap: "wrap",
                                    mt: 0.75
                                  }}
                                >
                                  {((model as FeaturedModel).reasoning ??
                                    false) && (
                                    <Chip
                                      size="small"
                                      label="Reasoning"
                                      color="primary"
                                      variant="outlined"
                                      sx={{ height: "20px", fontSize: "0.7em" }}
                                    />
                                  )}
                                  {((model as FeaturedModel).vision ?? false) && (
                                    <Chip
                                      size="small"
                                      label="Vision"
                                      color="secondary"
                                      variant="outlined"
                                      sx={{ height: "20px", fontSize: "0.7em" }}
                                    />
                                  )}
                                </Box>
                                {(model as FeaturedModel).note && (
                                  <Typography
                                    variant="caption"
                                    className="model-note"
                                  >
                                    {(model as FeaturedModel).note}
                                  </Typography>
                                )}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </Collapse>
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
      </Box>
    </Box>
  );
};

export default React.memo(GettingStartedPanel);
