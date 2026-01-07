/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useMemo, useCallback, useEffect, useState } from "react";

import { Box, IconButton, Paper } from "@mui/material";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import CloseIcon from "@mui/icons-material/Close";

import useFavoritesStore from "../../stores/FavoritesStore";
import useMetadataStore from "../../stores/MetadataStore";
import { useCombo } from "../../stores/KeyPressedStore";
import { useCreateNode } from "../../hooks/useCreateNode";

const favoritesMenuStyles = (theme: Theme) =>
  css({
    position: "fixed",
    zIndex: 20001,
    backgroundColor: theme.vars.palette.background.paper,
    backdropFilter: "blur(8px)",
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: "12px",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
    padding: "8px",
    minWidth: "280px",
    maxWidth: "400px",
    maxHeight: "60vh",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    animation: "fadeIn 0.15s ease-out forwards",
    "@keyframes fadeIn": {
      "0%": { opacity: 0, transform: "scale(0.95)" },
      "100%": { opacity: 1, transform: "scale(1)" }
    }
  });

const headerStyles = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 8px 4px 8px",
  borderBottom: "1px solid rgba(128, 128, 128, 0.12)",
  marginBottom: "4px"
});

const titleStyles = css({
  display: "flex",
  alignItems: "center",
  gap: "6px",
  fontSize: "14px",
  fontWeight: 600,
  color: "inherit"
});

const nodeListStyles = css({
  flex: 1,
  overflowY: "auto",
  padding: "4px"
});

const nodeItemStyles = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 12px",
  borderRadius: "8px",
  cursor: "pointer",
  transition: "background-color 0.1s ease",
  "&:hover": {
    backgroundColor: "rgba(128, 128, 128, 0.08)"
  }
});

const nodeNameStyles = css({
  fontSize: "13px",
  fontWeight: 500,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
});

const emptyStateStyles = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px 16px",
  color: "rgba(128, 128, 128, 0.6)",
  textAlign: "center",
  fontSize: "13px"
});

const getNodeDisplayName = (nodeType: string): string => {
  const parts = nodeType.split(".");
  const name = parts[parts.length - 1];
  return name.replace(/([A-Z])/g, " $1").trim();
};

interface QuickFavoritesMenuProps {
  open: boolean;
  onClose: () => void;
  position: { x: number; y: number };
}

const QuickFavoritesMenu = memo(
  ({ open, onClose, position }: QuickFavoritesMenuProps) => {
    const theme = useTheme();
    const styles = useMemo(() => favoritesMenuStyles(theme), [theme]);

    const favorites = useFavoritesStore((state) => state.favorites);
    const removeFavorite = useFavoritesStore((state) => state.removeFavorite);
    const allMetadata = useMetadataStore((state) => state.metadata);

    const handleCreateNode = useCreateNode();

    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
      setSelectedIndex(0);
    }, [favorites.length]);

    const handleNodeClick = useCallback(
      (nodeType: string) => {
        const nodeMetadata = allMetadata[nodeType];
        if (nodeMetadata) {
          handleCreateNode(nodeMetadata);
        }
        onClose();
      },
      [handleCreateNode, onClose, allMetadata]
    );

    const handleKeyDown = useCallback(
      (e: KeyboardEvent) => {
        if (!open) {
          return;
        }

        switch (e.key) {
          case "ArrowDown":
            e.preventDefault();
            setSelectedIndex((prev) =>
              Math.min(prev + 1, favorites.length - 1)
            );
            break;
          case "ArrowUp":
            e.preventDefault();
            setSelectedIndex((prev) => Math.max(prev - 1, 0));
            break;
          case "Enter":
            e.preventDefault();
            if (favorites[selectedIndex]) {
              handleNodeClick(favorites[selectedIndex].nodeType);
            }
            break;
          case "Escape":
            e.preventDefault();
            onClose();
            break;
        }
      },
      [open, favorites, selectedIndex, handleNodeClick, onClose]
    );

    useEffect(() => {
      if (open) {
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
      }
    }, [open, handleKeyDown]);

    useCombo(["Escape"], onClose, true, open);

    if (!open) {
      return null;
    }

    const menuStyle = {
      ...styles,
      left: position.x,
      top: position.y
    } as const;

    return (
      <Paper css={menuStyle} style={menuStyle}>
        <Box css={headerStyles}>
          <Box css={titleStyles}>
            <StarIcon fontSize="small" sx={{ color: "#ffc107" }} />
            Quick Favorites
          </Box>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        <Box css={nodeListStyles}>
          {favorites.length === 0 ? (
            <Box css={emptyStateStyles}>
              <StarBorderIcon
                sx={{ fontSize: 40, marginBottom: 1, opacity: 0.4 }}
              />
              <div>No favorites yet</div>
              <div style={{ fontSize: "11px", marginTop: 4 }}>
                Click the star icon on any node to add it here
              </div>
            </Box>
          ) : (
            favorites.map((favorite, index) => {
              const nodeMeta = allMetadata[favorite.nodeType];
              const displayName = nodeMeta?.title || getNodeDisplayName(favorite.nodeType);
              const isSelected = index === selectedIndex;

              return (
                <Box
                  key={favorite.nodeType}
                  css={nodeItemStyles}
                  onClick={() => handleNodeClick(favorite.nodeType)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  sx={{
                    backgroundColor: isSelected
                      ? "rgba(128, 128, 128, 0.12)"
                      : "transparent"
                  }}
                >
                  <Box css={nodeNameStyles}>{displayName}</Box>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFavorite(favorite.nodeType);
                    }}
                    sx={{ opacity: 0.5, "&:hover": { opacity: 1 } }}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Box>
              );
            })
          )}
        </Box>
      </Paper>
    );
  }
);

QuickFavoritesMenu.displayName = "QuickFavoritesMenu";

export default QuickFavoritesMenu;
