/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, memo } from "react";
import { FavoriteButton, MOTION } from "../ui_primitives";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";

interface FavoriteStarProps {
  provider?: string;
  id?: string;
  size?: "small" | "medium";
  stopPropagation?: boolean;
}

const wrapperStyles = css({
  display: "inline-flex",
  alignItems: "center",
  transition: MOTION.all,
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
  // Select the flag, not the Set: `favorites` is replaced on every toggle,
  // which would re-render every star in the model list.
  const isFavorite = useModelPreferencesStore((s) =>
    s.favorites.has(`${provider}:${id}`)
  );
  const toggleFavorite = useModelPreferencesStore((s) => s.toggleFavorite);

  const handleToggle = useCallback(() => {
    toggleFavorite(provider, id);
  }, [toggleFavorite, provider, id]);

  return (
    <span
      className="favorite-star"
      css={wrapperStyles}
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
