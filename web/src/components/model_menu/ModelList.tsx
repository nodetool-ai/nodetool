/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";

import React, { useMemo } from "react";
import {
  List,
  ListItemButton,
  ListItemText,
  ListItemIcon
} from "@mui/material";
import FavoriteStar from "./FavoriteStar";
import type { LanguageModel } from "../../stores/ApiTypes";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";
import { toTitleCase } from "../../utils/providerDisplay";

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
  const secrets = useRemoteSettingsStore((s) => s.secrets);
  const theme = useTheme();
  const availabilityMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    models.forEach((m) => {
      const env = requiredSecretForProvider(m.provider);
      const ok =
        !env ||
        Boolean(secrets?.[env] && String(secrets?.[env]).trim().length > 0);
      map[`${m.provider}:${m.id}`] = ok;
    });
    return map;
  }, [models, secrets]);

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
        "& .MuiListItemButton-root:hover .favorite-star": { opacity: 1 }
      }}
    >
      {models.map((m) => {
        const fav = isFavorite(m.provider || "", m.id || "");
        const available = availabilityMap[`${m.provider}:${m.id}`] ?? true;
        return (
          <ListItemButton
            key={`${m.provider}:${m.id}`}
            className={`model-menu__model-item ${
              available ? "" : "is-unavailable"
            } ${fav ? "is-favorite" : ""}`}
            onClick={() => available && onSelect(m)}
            disabled={!available}
          >
            <ListItemIcon sx={{ minWidth: 30 }}>
              <FavoriteStar provider={m.provider} id={m.id} size="small" />
            </ListItemIcon>
            <ListItemText
              primary={m.name}
              secondary={
                available
                  ? toTitleCase(m.provider || "")
                  : `${toTitleCase(m.provider || "")} · Setup required`
              }
            />
          </ListItemButton>
        );
      })}
    </List>
  );
};

export default ModelList;
