/** @jsxImportSource @emotion/react */
import React from "react";
import {
  Typography,
  Box,
  Link,
  Button,
  Chip,
  Tooltip
} from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import WidgetsIcon from "@mui/icons-material/Widgets";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import { UnifiedModel } from "../../stores/ApiTypes";
import { DEFAULT_MODEL } from "../../config/constants";
import { useNavigate } from "react-router-dom";
import { IconForType } from "../../config/data_types";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { DownloadProgress } from "../hugging_face/DownloadProgress";
import DownloadIcon from "@mui/icons-material/Download";
import { getIsElectronDetails } from "../../utils/browser";

const isProduction = process.env.NODE_ENV === "production";

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

const panelStyles = (theme: any) =>
  css({
    "&": {
      height: "100%",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      padding: "0.75em"
    },
    ".scrollable-content": {
      flex: 1,
      overflowY: "auto",
      overflowX: "hidden"
    },
    ".setup-container": {
      padding: "1em",
      borderRadius: "12px"
    },
    ".setup-list-title": {
      fontWeight: "bold",
      marginTop: "1em",
      marginBottom: "0.5em",
      color: "var(--palette-primary-main)"
    },
    ".step-list": {
      marginTop: "0.5em",
      paddingLeft: "1.25em",
      "& li": { marginBottom: "0.5em" }
    },
    ".callout": {
      background: theme.vars.palette.grey[900],
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      borderRadius: 6,
      padding: "6px 10px",
      marginTop: "0.5em"
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
      backgroundColor: theme.vars.palette.grey[900],
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
    },
    ".fake-button": {
      color: theme.vars.palette.primary.main,
      textTransform: "uppercase",
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      padding: "0 0.4em",
      margin: "0 0.2em"
    },
    ".setup-link": {
      color: theme.vars.palette.primary.main
    }
  });

const SetupPanel: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();

  // Featured local models to display
  const featuredLocalModelIds = [
    DEFAULT_MODEL,
    "qwen3:4b",
    "deepseek-r1:7b",
    "gemma3:4b"
  ];
  const featuredModels = recommendedModels.filter((m) =>
    featuredLocalModelIds.includes(m.id)
  );

  return (
    <Box css={panelStyles(theme)} className="setup-panel-container">
      <div className="scrollable-content">
        <Box className="setup-container">
          <Typography variant="h6" sx={{ mb: 1.5, fontSize: "1em" }}>
            How to Use Models
          </Typography>

          <Typography variant="subtitle2" className="setup-list-title">
            Remote Models
          </Typography>
          <Box>
            <ol className="step-list">
              <li>
                Open <SettingsIcon
                  sx={{ verticalAlign: "middle", fontSize: "inherit" }}
                />
                <b> Settings</b> in the top-right
              </li>
              <li>Add API keys</li>
            </ol>
          </Box>
          {(getIsElectronDetails().isElectron || !isProduction) && (
            <>
              <Typography variant="subtitle2" className="setup-list-title">
                Local Models
              </Typography>
              <Box sx={{ mb: 2 }}>
                <ol className="step-list">
                  <li>
                    Download models using the <span className="fake-button">Models</span> 
                    button in the header
                  </li>
                  <li>Or use <span className="fake-button">Recommended Models</span> button on nodes</li>
                </ol>
              </Box>
            </>
          )}

          {(getIsElectronDetails().isElectron || !isProduction) && (
            <>
              <Typography variant="subtitle2" className="setup-list-title">
                Popular Models
              </Typography>
              <ul className="local-models-list">
                {featuredModels.map((model) => (
                  <li key={model.id} style={{ listStyle: "none" }}>
                    <div className="local-model-item">
                      <div className="local-model-header">
                        <div className="local-model-title">
                          <Typography
                            variant="subtitle2"
                            sx={{ fontWeight: 500 }}
                          >
                            {(model as FeaturedModel).displayName || model.name}
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
                          <Typography variant="body2" sx={{ fontSize: "0.85em" }}>
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
                          {((model as FeaturedModel).reasoning ?? false) && (
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
                          <Typography variant="caption" className="model-note">
                            {(model as FeaturedModel).note}
                          </Typography>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Box>
      </div>
    </Box>
  );
};

export default SetupPanel;

