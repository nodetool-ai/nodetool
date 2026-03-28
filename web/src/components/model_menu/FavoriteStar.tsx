/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useCallback, memo, useMemo } from "react";
import { Tooltip } from "@mui/material";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

export interface FavoriteStarProps {
  provider?: string;
  id?: string;
  size?: "small" | "medium";
  stopPropagation?: boolean;
}

const styles = (theme: Theme) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    cursor: "pointer",
    color: theme.vars.palette.info.main,
    transition: "all 0.2s ease-in-out",
    opacity: 0,
    "& svg": {
      maxWidth: 20,
      maxHeight: 20
    },
    "&:hover": {
      scale: 1.5,
      transform: "rotate(42deg)",
      color: theme.vars.palette.info.light
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

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>) => {
      if (stopPropagation) {
        e.stopPropagation();
      }
      toggleFavorite(provider, id);
    },
    [stopPropagation, toggleFavorite, provider, id]
  );

  return (
    <Tooltip
      enterDelay={TOOLTIP_ENTER_DELAY * 2}
      enterNextDelay={TOOLTIP_ENTER_DELAY * 2}
      disableInteractive
      title={isFavorite ? "Unfavorite" : "Favorite"}
    >
      <span
        className="favorite-star"
        css={styles(theme as Theme)}
        style={{
          // Show when favorited always; otherwise only on parent hover
          opacity: isFavorite ? 1 : undefined
        }}
        onClick={handleClick}
      >
        {isFavorite ? (
          <StarIcon fontSize={size} />
        ) : (
          <StarBorderIcon fontSize={size} />
        )}
      </span>
    </Tooltip>
  );
});

FavoriteStar.displayName = "FavoriteStar";

export default FavoriteStar;
