/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";

import React, { useCallback, useMemo, memo } from "react";
import {
  Box,
  List,
  ListItemButton,
  ListItemText,
  ListItemIcon
} from "@mui/material";
import { Tooltip, Text } from "../ui_primitives";
import FavoriteStar from "./FavoriteStar";
import type { ImageModel, LanguageModel } from "../../stores/ApiTypes";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import {
  isLocalProvider,
  isCloudProvider,
  isHuggingFaceInferenceProvider
} from "../../utils/providerDisplay";
import {
  requiredSecretForProvider,
  ModelSelectorModel
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

/**
 * HighlightedModelName - Memoized component for highlighting search term in model name.
 * Uses useMemo to avoid creating RegExp on every render.
 */
const HighlightedModelName = memo<{
  name: string;
  searchTerm: string;
  primaryColor: string;
}>(({ name, searchTerm, primaryColor }) => {
  const highlightedName = useMemo(() => {
    if (!searchTerm || !name) {
      return { parts: [{ text: name, isMatch: false }] };
    }

    // Split the name by search term, creating a RegExp only when searchTerm changes
    const parts = name.split(new RegExp(`(${searchTerm})`, "gi"));
    return {
      parts: parts.map((part) => ({
        text: part,
        isMatch: part.toLowerCase() === searchTerm.toLowerCase()
      }))
    };
  }, [name, searchTerm]);

  return (
    <>
      {highlightedName.parts.map((part, i) =>
        part.isMatch ? (
          <span key={`${name}-${i}-${part.text}`} style={{ color: primaryColor, fontWeight: 600 }}>
            {part.text}
          </span>
        ) : (
          part.text
        )
      )}
    </>
  );
});

HighlightedModelName.displayName = "HighlightedModelName";

export interface ModelListProps<TModel extends ModelSelectorModel> {
  models: TModel[];
  onSelect: (m: TModel) => void;
  searchTerm?: string;
}

function ModelList<TModel extends ModelSelectorModel>({
  models,
  onSelect,
  searchTerm = ""
}: ModelListProps<TModel>) {
  const isFavorite = useModelPreferencesStore((s) => s.isFavorite);
  const enabledProviders = useModelPreferencesStore((s) => s.enabledProviders);
  const { isApiKeySet } = useSecrets();
  const theme = useTheme();

  // Stable handler for model selection using data attributes
  const handleModelClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const target = event.currentTarget;
    const index = Number(target.dataset.index);
    const available = target.dataset.available === "true";
    if (available && models[index]) {
      onSelect(models[index]);
    }
  }, [models, onSelect]);

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
              className={`model-menu__model-item ${available ? "" : "is-unavailable"
                } ${fav ? "is-favorite" : ""}`}
              aria-disabled={!available}
              data-index={index}
              data-available={available}
              onClick={handleModelClick}
              sx={{ width: "100%", textAlign: "left" }}
            >
              <ListItemIcon sx={{ minWidth: 30 }}>
                <FavoriteStar provider={m.provider} id={m.id} size="small" />
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
                    <span
                      className="model-name"
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        minWidth: 0,
                        flex: "1 1 auto"
                      }}
                    >
                      <HighlightedModelName
                        name={m.path || m.name}
                        searchTerm={searchTerm}
                        primaryColor={theme.vars.palette.primary.main}
                      />
                    </span>
                    {available && isLocalProvider(m.provider) && (
                      <Tooltip
                        title="Runs locally on your device"
                        placement="top"
                      >
                        <span
                          className="badge-local"
                          style={{
                            flex: "0 0 auto",
                            padding: "0px 6px",
                            fontSize: "10px",
                            lineHeight: 1.4,
                            borderRadius: 4,
                            background: theme.vars.palette.action.hover,
                            color: theme.vars.palette.text.secondary,
                            letterSpacing: 0.2,
                            border: "none"
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
                              padding: "0px 6px",
                              fontSize: "10px",
                              lineHeight: 1.4,
                              borderRadius: 4,
                              background: theme.vars.palette.action.hover,
                              color: theme.vars.palette.text.secondary,
                              letterSpacing: 0.2,
                              border: "none",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 2
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
                              padding: "0px 6px",
                              fontSize: "10px",
                              lineHeight: 1.4,
                              borderRadius: 4,
                              background: theme.vars.palette.action.hover,
                              color: theme.vars.palette.text.secondary,
                              letterSpacing: 0.2,
                              border: "none",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 2
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
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: theme.vars.fontSizeTiny,
                      color: theme.vars.palette.text.secondary,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {m.path ? m.name : m.provider ? `Provider: ${m.provider}` : ""}
                  </span>
                }
                primaryTypographyProps={{
                  component: "div",
                  noWrap: true
                }}
                secondaryTypographyProps={{
                  component: "div"
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
      handleModelClick,
      theme.vars.fontSizeTiny,

      theme.vars.palette.text.secondary,
      searchTerm,
      theme.vars.palette.primary.main,
      theme.vars.palette.action.hover
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
          <Text>
            {searchTerm.trim().length === 0
              ? "No models available. Select or enable providers in the left sidebar to see models."
              : `No models found for "${searchTerm}". Try a different term or enable more providers.`}
          </Text>
        </Box>
      ) : (
        <AutoSizer>
          {({ height, width }) => {
            const safeHeight = Math.max(height || 0, 320);
            const safeWidth = Math.max(width || 0, 350);
            return (
              <List
                dense
                css={listStyles}
                className="model-menu__models-list"
                sx={{
                  overflowX: "hidden",
                  height: safeHeight,
                  width: safeWidth,
                  "& .MuiListItemButton-root": { py: 0.5 },
                  "& .MuiListItemText-primary": {
                    fontSize: theme.vars.fontSizeNormal
                  },
                  "& .MuiListItemText-secondary": {
                    color: theme.vars.palette.text.secondary,
                    fontSize: theme.vars.fontSizeSmall
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
