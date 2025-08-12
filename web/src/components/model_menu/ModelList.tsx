/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";

import React, { useMemo } from "react";
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
import { toTitleCase } from "../../utils/providerDisplay";
import { isProviderAvailable } from "../../stores/ModelMenuStore";
import useModelMenuStore from "../../stores/ModelMenuStore";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

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
  return null;
};

const ModelList: React.FC<ModelListProps> = ({ models, onSelect }) => {
  const isFavorite = useModelPreferencesStore((s) => s.isFavorite);
  const enabledProviders = useModelPreferencesStore((s) => s.enabledProviders);
  const secrets = useRemoteSettingsStore((s) => s.secrets);
  const theme = useTheme();
  const searchTerm = useModelMenuStore((s) => s.search);
  React.useEffect(() => {
    console.log("[ModelList] all models (prop)", {
      count: models.length,
      models
    });
  }, [models]);
  const availabilityMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    models.forEach((m) => {
      const env = requiredSecretForProvider(m.provider);
      const providerEnabled = enabledProviders?.[m.provider || ""] !== false;
      const ok =
        providerEnabled &&
        (!env ||
          Boolean(secrets?.[env] && String(secrets?.[env]).trim().length > 0));
      map[`${m.provider}:${m.id}`] = ok;
    });
    return map;
  }, [models, secrets, enabledProviders]);

  return (
    <List
      dense
      css={listStyles}
      className="model-menu__models-list"
      sx={{
        overflowX: "hidden",
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
        "& .model-menu__model-item.is-unavailable .MuiListItemText-primary": {
          color: theme.vars.palette.text.disabled
        },
        "& .model-menu__model-item.is-unavailable .MuiListItemText-secondary": {
          color: theme.vars.palette.text.disabled
        },
        // Reveal star on parent row hover
        "& .MuiListItemButton-root:hover .favorite-star": { opacity: 1 }
      }}
    >
      {models.length === 0 && (
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
      )}
      {models.map((m) => {
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
          <Tooltip
            key={`tooltip:${m.provider}:${m.id}`}
            disableInteractive
            title={tooltipTitle}
          >
            <ListItemButton
              key={`${m.provider}:${m.id}`}
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
                    ? toTitleCase(m.provider || "")
                    : `${toTitleCase(
                        m.provider || ""
                      )} · Activate provider & setup`
                }
              />
            </ListItemButton>
          </Tooltip>
        );
      })}
    </List>
  );
};

export default ModelList;
