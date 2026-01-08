/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useMemo, useCallback, useEffect } from "react";
import { Box, Tooltip, IconButton, Typography } from "@mui/material";
import StarIcon from "@mui/icons-material/Star";
import KeyboardIcon from "@mui/icons-material/Keyboard";
import CloseIcon from "@mui/icons-material/Close";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import useMetadataStore from "../../stores/MetadataStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useCreateNode } from "../../hooks/useCreateNode";
import { useFavoriteNodesStore } from "../../stores/FavoriteNodesStore";
import { useCombo } from "../../stores/KeyPressedStore";
import { isMac } from "../../utils/platform";

const toolbarStyles = (theme: Theme) =>
  css({
    "&": {
      position: "absolute",
      bottom: "20px",
      left: "50%",
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "8px 12px",
      borderRadius: "12px",
      backgroundColor: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.divider}`,
      boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)",
      zIndex: 100,
      transition: "opacity 0.2s ease, transform 0.2s ease",
      opacity: 0.9,
      "&:hover": {
        opacity: 1,
        boxShadow: "0 6px 24px rgba(0, 0, 0, 0.2)"
      }
    },
    ".toolbar-divider": {
      width: "1px",
      height: "24px",
      backgroundColor: theme.vars.palette.divider,
      margin: "0 4px"
    },
    ".favorite-btn": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      width: "48px",
      height: "48px",
      borderRadius: "8px",
      cursor: "pointer",
      position: "relative",
      transition: "all 0.2s ease",
      backgroundColor: "rgba(255, 193, 7, 0.1)",
      border: "1px solid rgba(255, 193, 7, 0.3)",
      "&:hover": {
        backgroundColor: "rgba(255, 193, 7, 0.2)",
        transform: "translateY(-2px)"
      },
      "&:active": {
        transform: "translateY(0)"
      }
    },
    ".shortcut-hint": {
      position: "absolute",
      bottom: "2px",
      right: "4px",
      fontSize: "0.6rem",
      fontWeight: 600,
      color: theme.vars.palette.text.secondary,
      opacity: 0.8
    },
    ".no-favorites": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      color: theme.vars.palette.text.secondary,
      fontSize: "0.8rem",
      padding: "4px 8px"
    },
    ".collapse-btn": {
      padding: "4px",
      minWidth: "auto",
      color: theme.vars.palette.text.secondary,
      "&:hover": {
        color: theme.vars.palette.text.primary,
        backgroundColor: theme.vars.palette.action.hover
      }
    }
  });

interface FavoriteNodesToolbarProps {
  onClose?: () => void;
}

const FavoriteNodesToolbar: React.FC<FavoriteNodesToolbarProps> = ({ onClose }) => {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => toolbarStyles(theme), [theme]);

  const { favorites, isVisible, setVisibility } = useFavoriteNodesStore(
    (state) => ({
      favorites: state.favorites,
      isVisible: state.isVisible,
      setVisibility: state.setVisibility
    })
  );

  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const addNotification = useNotificationStore((state) => state.addNotification);
  const handleCreateNode = useCreateNode();

  const handleFavoriteClick = useCallback(
    (nodeType: string) => {
      const metadata = getMetadata(nodeType);
      if (!metadata) {
        addNotification({
          type: "warning",
          content: `Unable to find metadata for ${nodeType}.`,
          timeout: 4000
        });
        return;
      }
      handleCreateNode(metadata);
    },
    [getMetadata, addNotification, handleCreateNode]
  );

  const handleKeyboardShortcut = useCallback(
    (index: number) => {
      if (index >= 0 && index < favorites.length) {
        handleFavoriteClick(favorites[index].nodeType);
      }
    },
    [favorites, handleFavoriteClick]
  );

  useEffect(() => {
    if (!isVisible) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey) {
        const key = event.key;
        if (key >= "1" && key <= "9") {
          const index = parseInt(key, 10) - 1;
          handleKeyboardShortcut(index);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isVisible, favorites, handleKeyboardShortcut]);

  if (!isVisible || favorites.length === 0) {
    return null;
  }

  return (
    <Box css={memoizedStyles}>
      <Tooltip
        title="Quickly insert favorite nodes with Alt+1 through Alt+9"
        placement="top"
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <IconButton size="small" className="collapse-btn">
          <KeyboardIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <div className="toolbar-divider" />
      {favorites.slice(0, 9).map((favorite, index) => {
        const metadata = getMetadata(favorite.nodeType);
        const displayName = metadata?.title || favorite.nodeType.split(".").pop() || favorite.nodeType;
        const shortcutKey = index + 1;

        return (
          <Tooltip
            key={favorite.nodeType}
            title={
              <div>
                <div>{displayName}</div>
                <div style={{ fontSize: "0.7rem", opacity: 0.75, marginTop: "4px" }}>
                  Click to place · Alt+{shortcutKey}
                </div>
              </div>
            }
            placement="top"
            enterDelay={TOOLTIP_ENTER_DELAY}
          >
            <div
              className="favorite-btn"
              onClick={() => handleFavoriteClick(favorite.nodeType)}
            >
              <StarIcon
                fontSize="small"
                sx={{ color: "warning.main", opacity: 0.9 }}
              />
              <Typography
                variant="caption"
                sx={{
                  fontSize: "0.6rem",
                  fontWeight: 600,
                  color: "text.primary",
                  maxWidth: "40px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }}
              >
                {displayName}
              </Typography>
              <span className="shortcut-hint">Alt+{shortcutKey}</span>
            </div>
          </Tooltip>
        );
      })}
      {favorites.length > 9 && (
        <Tooltip
          title={`${favorites.length - 9} more favorites (open Node Menu to see all)`}
          placement="top"
          enterDelay={TOOLTIP_ENTER_DELAY}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              backgroundColor: "action.hover",
              color: "text.secondary",
              fontSize: "0.7rem",
              fontWeight: 600
            }}
          >
            +{favorites.length - 9}
          </Box>
        </Tooltip>
      )}
      <div className="toolbar-divider" />
      <Tooltip title="Hide favorites toolbar" placement="top" enterDelay={TOOLTIP_ENTER_DELAY}>
        <IconButton
          size="small"
          className="collapse-btn"
          onClick={() => {
            setVisibility(false);
            onClose?.();
          }}
          aria-label="Hide favorites toolbar"
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

export default memo(FavoriteNodesToolbar);
