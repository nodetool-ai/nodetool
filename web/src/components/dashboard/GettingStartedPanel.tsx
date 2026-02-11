/** @jsxImportSource @emotion/react */
import React, { useMemo, useCallback, useState } from "react";
import {
  Box,
  Button,
  LinearProgress,
  Tooltip,
  Chip,
  Collapse
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
import { useSettingsStore } from "../../stores/SettingsStore";
import { FlexColumn, FlexRow, Card, Text, Caption } from "../ui_primitives";

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
      height: "100%"
    },
    ".panel-header": {
      paddingBottom: "0.75em",
      borderBottom: `1px solid ${theme.vars.palette.grey[700]}`
    },
    ".header-icon": {
      color: theme.vars.palette.primary.main,
      fontSize: "1.75rem"
    },
    ".progress-bar": {
      height: "4px",
      borderRadius: "2px",
      backgroundColor: theme.vars.palette.grey[800],
      "& .MuiLinearProgress-bar": {
        borderRadius: "2px",
        backgroundColor: theme.vars.palette.success.main
      }
    },
    ".scrollable-content": {
      flex: 1,
      overflowY: "auto",
      overflowX: "hidden"
    },
    ".step-card": {
      transition: "all 0.2s ease"
    },
    ".step-card.completed": {
      opacity: 0.7
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
    ".step-icon": {
      fontSize: "1.25rem",
      color: theme.vars.palette.grey[400]
    },
    ".step-content": {
      flex: 1,
      minWidth: 0
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
    ".model-variant-buttons": {
      display: "flex",
      gap: "4px",
      flexWrap: "wrap",
      alignItems: "center"
    },
    ".model-download-button": {
      fontSize: "0.75rem",
      fontWeight: 500,
      padding: "3px 8px",
      minWidth: "unset",
      lineHeight: 1.3,
      textTransform: "uppercase",
      letterSpacing: "0.02em",
      opacity: 0.7,
      backgroundColor: "rgba(255,255,255,0.05)",
      borderRadius: "4px",
      "&:hover": {
        opacity: 1,
        backgroundColor: "rgba(255,255,255,0.12)"
      },
      "& .MuiButton-startIcon": {
        marginRight: "3px",
        "& svg": {
          fontSize: "0.85rem"
        }
      }
    },
    ".model-download-button.default-model": {
      fontWeight: 600,
      opacity: 1,
      color: theme.vars.palette.primary.main,
      backgroundColor: `color-mix(in srgb, ${theme.vars.palette.primary.main} 15%, transparent)`,
      "&:hover": {
        backgroundColor: `color-mix(in srgb, ${theme.vars.palette.primary.main} 25%, transparent)`
      }
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

  const handleDownload = useCallback(() => {
    startDownload(
      model.repo_id || "",
      model.type || "hf.model",
      model.path ?? null,
      model.allow_patterns ?? null,
      model.ignore_patterns ?? null
    );
  }, [startDownload, model.repo_id, model.type, model.path, model.allow_patterns, model.ignore_patterns]);

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
      variant="text"
      color="inherit"
      startIcon={<DownloadIcon />}
      aria-label={`Download ${model.repo_id || model.id}`}
      className={`model-download-button ${isDefault ? "default-model" : ""}`}
      onClick={handleDownload}
    >
      {label}
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
    queryKey: ["secrets"],
    queryFn: () => fetchSecrets(),
    staleTime: 30000
  });

  // Check for local models (Ollama)
  const { data: ollamaModels } = useQuery({
    queryKey: ["ollama-models"],
    queryFn: async () => {
      const { data } = await client.GET("/api/models/ollama");
      // Handle potential response structures (array or object with models property)
      if (Array.isArray(data)) { return data; }

      const responseData = data as any;
      if (responseData?.models && Array.isArray(responseData.models)) { return responseData.models; }
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
  // Use selective selectors to prevent unnecessary re-renders
  const progress = useGettingStartedStore((state) => state.progress);
  const setHasCreatedWorkflow = useGettingStartedStore((state) => state.setHasCreatedWorkflow);
  const setHasTriedTemplate = useGettingStartedStore((state) => state.setHasTriedTemplate);

  const hasCreatedWorkflow = progress.hasCreatedWorkflow;
  const hasTriedTemplate = progress.hasTriedTemplate;

  // Update hasCreatedWorkflow when user has workflows
  React.useEffect(() => {
    if (!isLoadingWorkflows && sortedWorkflows.length > 0 && !hasCreatedWorkflow) {
      setHasCreatedWorkflow(true);
    }
  }, [isLoadingWorkflows, sortedWorkflows.length, hasCreatedWorkflow, setHasCreatedWorkflow]);

  const setMenuOpen = useSettingsStore((state) => state.setMenuOpen);

  const handleOpenSettings = useCallback(() => {
    // Open settings dialog on "API Settings" tab (index 1)
    setMenuOpen(true, 1);
  }, [setMenuOpen]);

  const handleToggleModelsExpanded = useCallback(() => {
    setModelsExpanded(prev => !prev);
  }, []);

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
    <FlexColumn gap={0} padding={4} fullHeight css={panelStyles(theme)} className="getting-started-panel">
      <FlexRow gap={3} align="center" className="panel-header">
        <RocketLaunchIcon className="header-icon" />
        <FlexColumn gap={0.5}>
          <Text size="big" weight={600}>Getting Started</Text>
          <Caption size="small">
            {progressPercentage < 100
              ? "Complete these steps to get up and running"
              : "All set, welcome to NodeTool!"}
          </Caption>
        </FlexColumn>
      </FlexRow>

      {progressPercentage < 100 && (
        <FlexColumn gap={2} sx={{ mb: 1.5 }}>
          <FlexRow justify="space-between" align="center">
            <Caption size="small">
              {completedSteps} of {totalSteps} steps completed
            </Caption>
            <Caption size="small">
              {Math.round(progressPercentage)}%
            </Caption>
          </FlexRow>
          <LinearProgress
            variant="determinate"
            value={progressPercentage}
            className="progress-bar"
          />
        </FlexColumn>
      )}

      <Box className="scrollable-content">
        <FlexColumn gap={3}>
          {steps.map((step, index) => (
            <Card
              key={step.id}
              variant="outlined"
              padding="normal"
              className={`step-card ${step.isCompleted ? "completed" : ""}`}
            >
              <FlexRow gap={3} align="flex-start">
                <Box className="step-icon-container">
                  {React.cloneElement(step.icon as React.ReactElement, {
                    className: "step-icon"
                  })}
                </Box>
                <FlexColumn gap={0.5} className="step-content">
                  <FlexRow gap={2} align="center">
                    <Text 
                      size="normal" 
                      weight={500}
                      color={step.isCompleted ? "success" : "inherit"}
                    >
                      {index + 1}. {step.title}
                      {step.isOptional && (
                        <span className="optional-badge">Optional</span>
                      )}
                    </Text>
                  </FlexRow>
                  <Caption size="small">
                    {step.description}
                  </Caption>
                  {step.action && (!step.isCompleted || step.id === "setup-provider") && (
                    <Box sx={{ mt: 2 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={step.action}
                        startIcon={step.isCompleted ? <SettingsIcon /> : <PlayArrowIcon />}
                      >
                        {step.isCompleted && step.id === "setup-provider" ? "Edit Settings" : step.actionLabel}
                      </Button>
                    </Box>
                  )}
                  {/* Collapsible Popular Models section for download-model step */}
                  {step.id === "download-model" && (
                    <Box sx={{ mt: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={handleToggleModelsExpanded}
                        endIcon={modelsExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      >
                        Popular Models
                      </Button>
                      <Collapse in={modelsExpanded}>
                        <ul className="local-models-list" style={{ marginTop: "0.5em" }}>
                          {recommendedModels.map((model) => (
                            <li key={model.id} style={{ listStyle: "none" }}>
                              <div className="local-model-item">
                                <FlexColumn gap={0.5}>
                                  <FlexRow gap={2} align="center" justify="space-between">
                                    <Text size="small" weight={500}>
                                      {(model as FeaturedModel).displayName ||
                                        model.name}
                                    </Text>
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
                                  </FlexRow>
                                  {model.description && (
                                    <Caption size="small">
                                      {model.description}
                                    </Caption>
                                  )}
                                  <FlexRow gap={2} wrap sx={{ mt: 0.75 }}>
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
                                  </FlexRow>
                                  {(model as FeaturedModel).note && (
                                    <Caption size="smaller" className="model-note">
                                      {(model as FeaturedModel).note}
                                    </Caption>
                                  )}
                                </FlexColumn>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </Collapse>
                    </Box>
                  )}
                </FlexColumn>
                <Box sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
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
              </FlexRow>
            </Card>
          ))}
        </FlexColumn>
      </Box>
    </FlexColumn>
  );
};

export default React.memo(GettingStartedPanel);
