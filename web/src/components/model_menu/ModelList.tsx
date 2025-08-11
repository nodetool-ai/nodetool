/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
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

const listStyles = css({
  overflowY: "auto",
  maxHeight: 440
});

export interface ModelListProps {
  models: LanguageModel[];
  onSelect: (m: LanguageModel) => void;
}

const ModelList: React.FC<ModelListProps> = ({ models, onSelect }) => {
  const toggleFavorite = useModelPreferencesStore((s) => s.toggleFavorite);
  const isFavorite = useModelPreferencesStore((s) => s.isFavorite);

  return (
    <List dense css={listStyles}>
      {models.map((m) => {
        const fav = isFavorite(m.provider || "", m.id || "");
        return (
          <ListItemButton
            key={`${m.provider}:${m.id}`}
            onClick={() => onSelect(m)}
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
            <ListItemText primary={m.name} secondary={m.provider} />
          </ListItemButton>
        );
      })}
    </List>
  );
};

export default ModelList;
