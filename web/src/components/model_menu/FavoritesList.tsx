/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useMemo } from "react";
import {
  List,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Tooltip,
  ListSubheader
} from "@mui/material";
import FavoriteStar from "./FavoriteStar";
import type { ModelSelectorModel } from "../../stores/ModelMenuStore";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";
import { toTitleCase } from "../../utils/providerDisplay";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const listStyles = css({
  overflowY: "auto",
  maxHeight: "100%"
});

export interface FavoritesListProps<TModel extends ModelSelectorModel> {
  models: TModel[];
  onSelect: (m: TModel) => void;
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

function FavoritesList<TModel extends ModelSelectorModel>({
  models,
  onSelect
}: FavoritesListProps<TModel>) {
  const isFavorite = useModelPreferencesStore((s) => s.isFavorite);
  // const secrets = useRemoteSettingsStore((s) => s.secrets);

  const availabilityMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    models.forEach((m) => {
      // const env = requiredSecretForProvider(m.provider);
      // const ok =
      //   !env ||
      //   Boolean(secrets?.[env] && String(secrets?.[env]).trim().length > 0);
      map[`${m.provider}:${m.id}`] = true;
    });
    return map;
  }, [models]);

  if (models.length === 0) return null;

  return (
    <List
      dense
      css={listStyles}
      className="model-menu__favorites-list"
      subheader={
        <ListSubheader
          component="div"
          sx={{
            fontSize: (theme) => theme.vars.fontSizeSmall,
            letterSpacing: 0.2,
            backgroundColor: "transparent"
          }}
        >
          Favorites
        </ListSubheader>
      }
      sx={{
        fontSize: (theme) => theme.vars.fontSizeSmall,
        "& .MuiListItemButton-root": { py: 0.25 },
        "& .MuiListItemText-primary": {
          fontSize: (theme) => theme.vars.fontSizeSmall
        },
        "& .MuiListItemText-secondary": {
          fontSize: (theme) => theme.vars.fontSizeSmaller
        },
        "& .MuiListItemButton-root:hover .favorite-star": { opacity: 1 }
      }}
    >
      {models.map((m) => {
        const fav = isFavorite(m.provider || "", m.id || "");
        const available = availabilityMap[`${m.provider}:${m.id}`] ?? true;
        return (
          <ListItemButton
            key={`favorite:${m.provider}:${m.id}`}
            className={`model-menu__favorite-item ${
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
        );
      })}
    </List>
  );
}

export default FavoritesList;
