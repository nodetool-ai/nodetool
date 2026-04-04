/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useCallback, memo, useMemo } from "react";
import { FavoriteButton } from "../ui_primitives";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";

export interface FavoriteStarProps {
  provider?: string;
  id?: string;
  size?: "small" | "medium";
  stopPropagation?: boolean;
}

const wrapperStyles = (_theme: Theme) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    transition: "all 0.2s ease-in-out",
    opacity: 0,
    "&:hover": {
      scale: 1.5,
      transform: "rotate(42deg)"
    }
  });

const FavoriteStar: React.FC<FavoriteStarProps> = memo(function FavoriteStar({
  provider = "",
  id = "",
  size = "small",
  stopPropagation = true
}) {
  const favorites = useModelPreferencesStore((s) => s.favorites);
  const toggleFavorite = useModelPreferencesStore((s) => s.toggleFavorite);
  const theme = useTheme();

  const isFavorite = useMemo(() => {
    return favorites.has(`${provider}:${id}`);
  }, [favorites, provider, id]);

  const handleToggle = useCallback(() => {
    toggleFavorite(provider, id);
  }, [toggleFavorite, provider, id]);

  return (
    <span
      className="favorite-star"
      css={wrapperStyles(theme as Theme)}
      style={{
        opacity: isFavorite ? 1 : undefined
      }}
    >
      <FavoriteButton
        isFavorite={isFavorite}
        onToggle={handleToggle}
        variant="star"
        buttonSize={size}
        addTooltip="Favorite"
        removeTooltip="Unfavorite"
        stopPropagation={stopPropagation}
      />
    </span>
  );
});

FavoriteStar.displayName = "FavoriteStar";

export default FavoriteStar;
