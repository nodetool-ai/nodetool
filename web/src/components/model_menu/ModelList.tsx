/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";

import React, { useCallback } from "react";
import {
  Box,
  List,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Tooltip,
  Typography
} from "@mui/material";
import FavoriteStar from "./FavoriteStar";
import DefaultModelStar from "./DefaultModelStar";
import type { ImageModel, LanguageModel } from "../../stores/ApiTypes";
import useModelPreferencesStore, {
  DefaultModelType
} from "../../stores/ModelPreferencesStore";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";
import {
  toTitleCase,
  formatGenericProviderName,
  isLocalProvider,
  isCloudProvider,
  isHuggingFaceInferenceProvider
} from "../../utils/providerDisplay";
import {
  requiredSecretForProvider,
  ModelSelectorModel,
  useLanguageModelMenuStore
} from "../../stores/ModelMenuStore";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import AutoSizer from "react-virtualized-auto-sizer";
import {
  FixedSizeList as VirtualList,
  ListChildComponentProps
} from "react-window";
import { useSecrets } from "../../hooks/useSecrets";

const listStyles = css({
  overflowY: "auto",
  overflowX: "hidden",
  maxHeight: 600
});

export interface ModelListProps<TModel extends ModelSelectorModel> {
  models: TModel[];
  onSelect: (m: TModel) => void;
  /**
   * The model type for default model preferences.
   * When provided, enables "Set as Default" functionality.
   */
  modelType?: DefaultModelType;
}

function ModelList<TModel extends ModelSelectorModel>({
  models,
  onSelect,
  modelType
}: ModelListProps<TModel>) {
  const isFavorite = useModelPreferencesStore((s) => s.isFavorite);
  const enabledProviders = useModelPreferencesStore((s) => s.enabledProviders);
  const { isApiKeySet } = useSecrets();
  const theme = useTheme();
  const searchTerm = useLanguageModelMenuStore((s) => s.search);

  const renderRow = useCallback(
    ({ index, style }: ListChildComponentProps) => {
      const m = models[index];
      const fav = isFavorite(m.provider || "", m.id || "");
      const env = requiredSecretForProvider(m.provider);
      const normKey = /gemini|google/i.test(m.provider || "")
        ? "gemini"
        : m.provider || "";
      const providerEnabled = enabledProviders?.[normKey] !== false;
      const hasKey = env ? isApiKeySet(env) : true;
      const available = providerEnabled && hasKey;
      const tooltipTitle =
        !providerEnabled && !hasKey
          ? "Enable provider and add API key in Settings to use this model"
          : !providerEnabled
          ? "Enable provider in the left sidebar to use this model"
          : !hasKey
          ? "Add API key in Settings to use this model"
          : "";
      return (
        <div style={style} key={`${m.provider}:${m.id}`}>
          <Tooltip disableInteractive title={tooltipTitle}>
            <ListItemButton
              className={`model-menu__model-item ${
                available ? "" : "is-unavailable"
              } ${fav ? "is-favorite" : ""}`}
              aria-disabled={!available}
              onClick={() => available && onSelect(m)}
            >
              <ListItemIcon sx={{ minWidth: modelType ? 50 : 30 }}>
                <FavoriteStar provider={m.provider} id={m.id} size="small" />
                {modelType && (
                  <DefaultModelStar
                    modelType={modelType}
                    provider={m.provider || ""}
                    id={m.id || ""}
                    name={m.name || ""}
                    path={m.path || undefined}
                    size="small"
                  />
                )}
              </ListItemIcon>
              <ListItemText
                primary={
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 0.75,
                      overflow: "hidden",
                      minWidth: 0,
                      width: "100%"
                    }}
                  >
                    <div
                      className="model-name"
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        minWidth: 0,
                        flex: "1 1 auto"
                      }}
                    >
                      {m.path || m.name}
                    </div>
                    {available && isLocalProvider(m.provider) && (
                      <Tooltip
                        title="Runs locally on your device"
                        placement="top"
                      >
                        <span
                          className="badge-local"
                          style={{
                            flex: "0 0 auto",
                            padding: "1px 6px",
                            fontSize: theme.vars.fontSizeTiny,
                            lineHeight: 1.2,
                            borderRadius: 4,
                            background: "transparent",
                            color: theme.vars.palette.c_provider_local,
                            letterSpacing: 0.3,
                            border: `1px solid ${theme.vars.palette.c_provider_local}`,
                            cursor: "help"
                          }}
                        >
                          Local
                        </span>
                      </Tooltip>
                    )}
                    {available &&
                      isHuggingFaceInferenceProvider(m.provider) && (
                        <Tooltip
                          title="Hugging Face Inference API (Paid)"
                          placement="top"
                        >
                          <span
                            className="badge-hf-api"
                            style={{
                              flex: "0 0 auto",
                              padding: "1px 6px",
                              fontSize: theme.vars.fontSizeTiny,
                              lineHeight: 1.2,
                              borderRadius: 4,
                              background: "transparent",
                              color: theme.vars.palette.c_provider_hf,
                              letterSpacing: 0.3,
                              border: `1px solid ${theme.vars.palette.c_provider_hf}`,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 2,
                              cursor: "help"
                            }}
                          >
                            HF API
                            <span style={{ fontSize: "0.9em", opacity: 0.8 }}>
                              $
                            </span>
                          </span>
                        </Tooltip>
                      )}
                    {available &&
                      isCloudProvider(m.provider) &&
                      !isHuggingFaceInferenceProvider(m.provider) && (
                        <Tooltip
                          title="Paid API service (Remote)"
                          placement="top"
                        >
                          <span
                            className="badge-api"
                            style={{
                              flex: "0 0 auto",
                              padding: "1px 6px",
                              fontSize: theme.vars.fontSizeTiny,
                              lineHeight: 1.2,
                              borderRadius: 4,
                              background: "transparent",
                              color: theme.vars.palette.c_provider_api,
                              letterSpacing: 0.3,
                              border: `1px solid ${theme.vars.palette.c_provider_api}`,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 2,
                              cursor: "help"
                            }}
                          >
                            API
                            <span style={{ fontSize: "0.9em", opacity: 0.8 }}>
                              $
                            </span>
                          </span>
                        </Tooltip>
                      )}
                  </Box>
                }
                secondary={
                  <Box
                    sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                  >
                    <div
                      style={{
                        fontSize: theme.vars.fontSizeTiny,
                        color: theme.vars.palette.text.secondary
                      }}
                    >
                      {m.path ? m.name : m.provider ? `Provider: ${m.provider}` : ""}
                    </div>
                  </Box>
                }
                primaryTypographyProps={{
                  noWrap: true
                }}
              />
            </ListItemButton>
          </Tooltip>
        </div>
      );
    },
    [
      models,
      isFavorite,
      enabledProviders,
      isApiKeySet,
      onSelect,
      modelType,
      theme.vars.fontSizeTiny,
      theme.vars.palette.c_provider_local,
      theme.vars.palette.c_provider_api,
      theme.vars.palette.c_provider_hf,
      theme.vars.palette.text.secondary
    ]
  );

  return (
    <Box sx={{ height: "100%", minHeight: 320, overflow: "hidden" }}>
      {models.length === 0 ? (
        <Box
          sx={{
            p: 10,
            color: theme.vars.palette.text.primary,
            fontSize: theme.vars.fontSizeNormal
          }}
        >
          <InfoOutlinedIcon color="warning" fontSize="medium" />
          <Typography sx={{ fontSize: theme.vars.fontSizeNormal }}>
            {searchTerm.trim().length === 0
              ? "No models available. Select or enable providers in the left sidebar to see models."
              : `No models found for "${searchTerm}". Try a different term or enable more providers.`}
          </Typography>
        </Box>
      ) : (
        <AutoSizer>
          {({ height, width }) => {
            const safeHeight = Math.max(height || 0, 320);
            const safeWidth = Math.max(width || 0, 250);
            return (
              <List
                dense
                css={listStyles}
                className="model-menu__models-list"
                sx={{
                  overflowX: "hidden",
                  height: safeHeight,
                  width: safeWidth,
                  "& .MuiListItemButton-root": { py: 0.4 },
                  "& .MuiListItemText-primary": {
                    fontSize: theme.vars.fontSizeNormal
                  },
                  "& .MuiListItemText-secondary": {
                    color: theme.vars.palette.text.secondary,
                    fontSize: theme.vars.fontSizeSmaller
                  },
                  "& .model-menu__model-item.is-unavailable": {
                    opacity: 0.55,
                    cursor: "not-allowed"
                  },
                  "& .model-menu__model-item.is-unavailable .MuiListItemText-primary":
                    {
                      color: theme.vars.palette.text.disabled
                    },
                  "& .model-menu__model-item.is-unavailable .MuiListItemText-secondary":
                    {
                      color: theme.vars.palette.text.disabled
                    },
                  "& .MuiListItemButton-root:hover .favorite-star": {
                    opacity: 1
                  },
                  "& .MuiListItemButton-root:hover .default-model-star": {
                    opacity: 1
                  }
                }}
              >
                <VirtualList
                  height={safeHeight}
                  width={safeWidth}
                  itemCount={models.length}
                  itemSize={40}
                >
                  {renderRow}
                </VirtualList>
              </List>
            );
          }}
        </AutoSizer>
      )}
    </Box>
  );
}

export const LanguageModelList: React.FC<ModelListProps<LanguageModel>> = (
  props
) => <ModelList<LanguageModel> {...props} />;

export const ImageModelList: React.FC<ModelListProps<ImageModel>> = (props) => (
  <ModelList<ImageModel> {...props} />
);

export default ModelList;
