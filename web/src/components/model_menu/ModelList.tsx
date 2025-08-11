/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useMemo } from "react";
import {
  List,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Tooltip
} from "@mui/material";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import type { LanguageModel } from "../../stores/ApiTypes";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";

const listStyles = css({
  overflowY: "auto",
  maxHeight: 440
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
  const toggleFavorite = useModelPreferencesStore((s) => s.toggleFavorite);
  const isFavorite = useModelPreferencesStore((s) => s.isFavorite);
  const secrets = useRemoteSettingsStore((s) => s.secrets);

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
    <List dense css={listStyles}>
      {models.map((m) => {
        const fav = isFavorite(m.provider || "", m.id || "");
        const available = availabilityMap[`${m.provider}:${m.id}`] ?? true;
        return (
          <ListItemButton
            key={`${m.provider}:${m.id}`}
            onClick={() => available && onSelect(m)}
            disabled={!available}
          >
            <ListItemIcon>
              <Tooltip title={fav ? "Unfavorite" : "Favorite"}>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(m.provider || "", m.id || "");
                  }}
                >
                  {fav ? (
                    <StarIcon fontSize="small" />
                  ) : (
                    <StarBorderIcon fontSize="small" />
                  )}
                </span>
              </Tooltip>
            </ListItemIcon>
            <ListItemText
              primary={m.name}
              secondary={
                available ? m.provider : `${m.provider} · Setup required`
              }
            />
          </ListItemButton>
        );
      })}
    </List>
  );
};

export default ModelList;
