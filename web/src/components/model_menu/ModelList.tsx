/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";

import React, { useCallback, useMemo } from "react";
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
import type { LanguageModel } from "../../stores/ApiTypes";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";
import {
  toTitleCase,
  formatGenericProviderName
} from "../../utils/providerDisplay";
import { isProviderAvailable } from "../../stores/ModelMenuStore";
import useModelMenuStore from "../../stores/ModelMenuStore";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import AutoSizer from "react-virtualized-auto-sizer";
import {
  FixedSizeList as VirtualList,
  ListChildComponentProps
} from "react-window";

const listStyles = css({
  overflowY: "auto",
  overflowX: "hidden",
  maxHeight: 600
});

export interface ModelListProps {
  models: LanguageModel[];
  onSelect: (m: LanguageModel) => void;
}

const requiredSecretForProvider = (provider?: string): string | null => {
  const p = (provider || "").toLowerCase();
  if (p.includes("openai")) return "OPENAI_API_KEY";
  if (p.includes("anthropic")) return "ANTHROPIC_API_KEY";
  if (p.includes("gemini") || p.includes("google")) return "GEMINI_API_KEY";
  if (p.includes("replicate")) return "REPLICATE_API_TOKEN";
  if (p.includes("aime")) return "AIME_API_KEY";
  // Local providers like llama.cpp do not require API keys
  if (
    p.includes("llama_cpp") ||
    p.includes("llama-cpp") ||
    p.includes("llamacpp")
  )
    return null;
  return null;
};

const ITEM_HEIGHT = 40; // approximate row height for dense list items

const ModelList: React.FC<ModelListProps> = ({ models, onSelect }) => {
  const isFavorite = useModelPreferencesStore((s) => s.isFavorite);
  const enabledProviders = useModelPreferencesStore((s) => s.enabledProviders);
  const secrets = useRemoteSettingsStore((s) => s.secrets);
  const theme = useTheme();
  const searchTerm = useModelMenuStore((s) => s.search);

  const renderRow = useCallback(
    ({ index, style }: ListChildComponentProps) => {
      const m = models[index];
      const fav = isFavorite(m.provider || "", m.id || "");
      const env = requiredSecretForProvider(m.provider);
      const normKey = /gemini|google/i.test(m.provider || "")
        ? "gemini"
        : m.provider || "";
      const providerEnabled = enabledProviders?.[normKey] !== false;
      const hasKey = env
        ? Boolean(secrets?.[env] && String(secrets?.[env]).trim().length > 0)
        : true;
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
              <ListItemIcon sx={{ minWidth: 30 }}>
                <FavoriteStar provider={m.provider} id={m.id} size="small" />
              </ListItemIcon>
              <ListItemText
                primary={m.name}
                secondary={
                  available
                    ? formatGenericProviderName(m.provider || "")
                    : `${toTitleCase(
                        m.provider || ""
                      )} · Activate provider & setup`
                }
                primaryTypographyProps={{
                  noWrap: true,
                  sx: {
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "100%"
                  }
                }}
              />
            </ListItemButton>
          </Tooltip>
        </div>
      );
    },
    [models, isFavorite, enabledProviders, secrets, onSelect]
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
                  // Grey out unavailable/disabled models
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
                  // Reveal star on parent row hover
                  "& .MuiListItemButton-root:hover .favorite-star": {
                    opacity: 1
                  }
                }}
              >
                <VirtualList
                  height={safeHeight}
                  width={safeWidth}
                  itemCount={models.length}
                  itemSize={ITEM_HEIGHT}
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
};

export default React.memo(ModelList);
