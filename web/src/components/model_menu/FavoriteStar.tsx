/** @jsxImportSource @emotion/react */
import React, { useMemo } from "react";
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

const FavoriteStar: React.FC<FavoriteStarProps> = ({
  provider = "",
  id = "",
  size = "small",
  stopPropagation = true
}) => {
  const favorites = useModelPreferencesStore((s) => s.favorites);
  const toggleFavorite = useModelPreferencesStore((s) => s.toggleFavorite);

  const isFavorite = useMemo(() => {
    return favorites.has(`${provider}:${id}`);
  }, [favorites, provider, id]);

  const handleClick: React.MouseEventHandler<HTMLSpanElement> = (e) => {
    if (stopPropagation) e.stopPropagation();
    toggleFavorite(provider, id);
  };

  return (
    <Tooltip
      enterDelay={TOOLTIP_ENTER_DELAY}
      disableInteractive
      title={isFavorite ? "Unfavorite" : "Favorite"}
    >
      <span onClick={handleClick}>
        {isFavorite ? (
          <StarIcon fontSize={size} />
        ) : (
          <StarBorderIcon fontSize={size} />
        )}
      </span>
    </Tooltip>
  );
};

export default FavoriteStar;
