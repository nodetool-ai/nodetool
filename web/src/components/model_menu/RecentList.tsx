/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useMemo, useCallback } from "react";
import {
  List,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  ListSubheader,
  Box
} from "@mui/material";
import FavoriteStar from "./FavoriteStar";
import type { ModelSelectorModel } from "../../stores/ModelMenuStore";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import { toTitleCase, isHuggingFaceLocalProvider } from "../../utils/providerDisplay";
import { useTheme } from "@mui/material/styles";

const listStyles = css({
  overflowY: "auto",
  maxHeight: "100%"
});

export interface RecentListProps<TModel extends ModelSelectorModel> {
  models: TModel[];
  onSelect: (m: TModel) => void;
}

const _requiredSecretForProvider = (provider?: string): string | null => {
  const p = (provider || "").toLowerCase();
  if (p.includes("openai")) {return "OPENAI_API_KEY";}
  if (p.includes("anthropic")) {return "ANTHROPIC_API_KEY";}
  if (p.includes("gemini") || p.includes("google")) {return "GEMINI_API_KEY";}
  if (p.includes("replicate")) {return "REPLICATE_API_TOKEN";}
  if (p.includes("aime")) {return "AIME_API_KEY";}
  return null;
};

function RecentList<TModel extends ModelSelectorModel>({
  models,
  onSelect
}: RecentListProps<TModel>) {
  const isFavorite = useModelPreferencesStore((s) => s.isFavorite);
  const theme = useTheme();
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

  const handleItemClick = useCallback((e: React.MouseEvent) => {
    const target = e.currentTarget as HTMLElement;
    const modelJson = target.dataset.model;
    if (modelJson) {
      const model = JSON.parse(modelJson) as TModel;
      const available = availabilityMap[`${model.provider}:${model.id}`] ?? true;
      if (available) {
        onSelect(model);
      }
    }
  }, [onSelect, availabilityMap]);

  if (models.length === 0) {return null;}

  return (
    <List
      dense
      css={listStyles}
      className="model-menu__recent-list"
      subheader={
        <ListSubheader
          component="div"
          sx={{
            backgroundColor: "transparent",
            fontSize: (theme) => theme.vars.fontSizeNormal,
            letterSpacing: 0.2
          }}
        >
          Recent
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
            key={`recent:${m.provider}:${m.id}`}
            className={`model-menu__recent-item ${
              available ? "" : "is-unavailable"
            } ${fav ? "is-favorite" : ""}`}
            data-model={JSON.stringify(m)}
            onClick={handleItemClick}
            disabled={!available}
          >
            <ListItemIcon sx={{ minWidth: 30 }}>
              <FavoriteStar provider={m.provider} id={m.id} size="small" />
            </ListItemIcon>
            <ListItemText
              primary={m.name}
              secondary={
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <span>
                    {available
                      ? toTitleCase(m.provider || "")
                      : `${toTitleCase(m.provider || "")} · Setup required`}
                  </span>
                  {available && isHuggingFaceLocalProvider(m.provider) && (
                    <span
                      style={{
                        padding: "1px 4px",
                        fontSize: theme.vars.fontSizeTiny,
                        lineHeight: 1.1,
                        borderRadius: 3,
                        background: "transparent",
                        color: theme.vars.palette.c_provider_local,
                        letterSpacing: 0.2,
                        border: `1px solid ${theme.vars.palette.c_provider_local}`
                      }}
                    >
                      Local
                    </span>
                  )}
                </Box>
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

export default RecentList;
