/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useMemo, useCallback, useEffect } from "react";
import { Box, Typography, IconButton, List, ListItem, ListItemButton, Tooltip } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import StarIcon from "@mui/icons-material/Star";
import CloseIcon from "@mui/icons-material/Close";
import KeyboardIcon from "@mui/icons-material/Keyboard";
import { useQuickFavoritesPaletteStore } from "../../stores/QuickFavoritesPaletteStore";
import { useFavoriteNodesStore } from "../../stores/FavoriteNodesStore";
import useMetadataStore from "../../stores/MetadataStore";
import { useCreateNode } from "../../hooks/useCreateNode";
import { useCombo } from "../../stores/KeyPressedStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const paletteStyles = (theme: Theme) =>
  css({
    "&": {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: "400px",
      maxHeight: "500px",
      zIndex: 30000,
      display: "flex",
      flexDirection: "column",
      borderRadius: "16px",
      boxShadow: "0 20px 60px rgba(0, 0, 0, 0.4), 0 8px 20px rgba(0,0,0,0.2)",
      backgroundColor: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.divider}`,
      animation: "quickFavoritesSlideIn 0.15s ease-out forwards",
      overflow: "hidden"
    },
    "@keyframes quickFavoritesSlideIn": {
      "0%": {
        opacity: 0,
        transform: "translate(-50%, -50%) scale(0.95)"
      },
      "100%": {
        opacity: 1,
        transform: "translate(-50%, -50%) scale(1)"
      }
    },
    ".palette-header": {
      display: "flex",
      alignItems: "center",
      padding: "12px 16px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.default,
      gap: "8px"
    },
    ".search-container": {
      flex: 1,
      display: "flex",
      alignItems: "center",
      backgroundColor: theme.vars.palette.action.hover,
      borderRadius: "8px",
      padding: "0 12px",
      gap: "8px"
    },
    ".search-input": {
      flex: 1,
      border: "none",
      outline: "none",
      backgroundColor: "transparent",
      fontSize: "0.95rem",
      color: theme.vars.palette.text.primary,
      "&::placeholder": {
        color: theme.vars.palette.text.secondary,
        opacity: 0.7
      }
    },
    ".shortcut-hint": {
      display: "flex",
      alignItems: "center",
      gap: "4px",
      padding: "4px 8px",
      borderRadius: "6px",
      backgroundColor: theme.vars.palette.action.hover,
      color: theme.vars.palette.text.secondary,
      fontSize: "0.75rem",
      fontWeight: 500
    },
    ".shortcut-key": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: "20px",
      height: "20px",
      padding: "0 6px",
      borderRadius: "4px",
      backgroundColor: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.divider}`,
      fontSize: "0.7rem"
    },
    ".results-container": {
      flex: 1,
      overflowY: "auto",
      padding: "8px"
    },
    ".result-item": {
      display: "flex",
      alignItems: "center",
      padding: "10px 12px",
      borderRadius: "8px",
      cursor: "pointer",
      transition: "all 0.15s ease",
      marginBottom: "4px",
      "&.selected": {
        backgroundColor: theme.vars.palette.primary.main,
        color: theme.vars.palette.primary.contrastText,
        "& .result-description": {
          color: theme.vars.palette.primary.contrastText,
          opacity: 0.8
        }
      },
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      },
      "&:last-child": {
        marginBottom: 0
      }
    },
    ".result-icon": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "36px",
      height: "36px",
      borderRadius: "8px",
      backgroundColor: "rgba(255, 193, 7, 0.15)",
      color: "warning.main",
      marginRight: "12px"
    },
    ".result-content": {
      flex: 1,
      minWidth: 0
    },
    ".result-title": {
      fontSize: "0.9rem",
      fontWeight: 500,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    },
    ".result-description": {
      fontSize: "0.75rem",
      color: theme.vars.palette.text.secondary,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      marginTop: "2px"
    },
    ".empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 20px",
      textAlign: "center",
      color: theme.vars.palette.text.secondary
    },
    ".empty-icon": {
      fontSize: "48px",
      marginBottom: "16px",
      opacity: 0.5
    },
    ".empty-title": {
      fontSize: "0.95rem",
      fontWeight: 500,
      marginBottom: "8px"
    },
    ".empty-description": {
      fontSize: "0.8rem",
      opacity: 0.7,
      maxWidth: "280px"
    },
    ".footer": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 16px",
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.default,
      fontSize: "0.75rem",
      color: theme.vars.palette.text.secondary
    },
    ".footer-actions": {
      display: "flex",
      alignItems: "center",
      gap: "8px"
    },
    ".footer-action": {
      display: "flex",
      alignItems: "center",
      gap: "4px"
    },
    ".footer-key": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: "18px",
      height: "18px",
      padding: "0 4px",
      borderRadius: "4px",
      backgroundColor: theme.vars.palette.action.hover,
      fontSize: "0.65rem",
      fontWeight: 500
    }
  });

interface QuickFavoritesPaletteProps {
  onClose?: () => void;
}

const QuickFavoritesPalette = memo(function QuickFavoritesPalette({
  onClose
}: QuickFavoritesPaletteProps) {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => paletteStyles(theme), [theme]);

  const { isOpen, closePalette, searchTerm, setSearchTerm, selectedIndex, setSelectedIndex, moveSelectionUp, moveSelectionDown } =
    useQuickFavoritesPaletteStore();

  const { favorites } = useFavoriteNodesStore((state) => ({
    favorites: state.favorites
  }));

  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const handleCreateNode = useCreateNode();

  const getNodeDisplayName = useCallback((nodeType: string): string => {
    const metadata = getMetadata(nodeType);
    if (metadata) {
      return metadata.title || metadata.node_type.split(".").pop() || nodeType;
    }
    return nodeType.split(".").pop() || nodeType;
  }, [getMetadata]);

  const getNodeDescription = useCallback((nodeType: string): string => {
    const metadata = getMetadata(nodeType);
    if (metadata) {
      return metadata.node_type;
    }
    return nodeType;
  }, [getMetadata]);

  const filteredFavorites = useMemo(() => {
    if (!searchTerm.trim()) {
      return favorites;
    }
    const term = searchTerm.toLowerCase();
    return favorites.filter((fav) => {
      const name = getNodeDisplayName(fav.nodeType).toLowerCase();
      const desc = getNodeDescription(fav.nodeType).toLowerCase();
      return name.includes(term) || desc.includes(term);
    });
  }, [favorites, searchTerm, getNodeDisplayName, getNodeDescription]);

  const handleSelectNode = useCallback((nodeType: string) => {
    const metadata = getMetadata(nodeType);
    if (metadata) {
      handleCreateNode(metadata);
      closePalette();
      onClose?.();
    }
  }, [getMetadata, handleCreateNode, closePalette, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveSelectionDown();
        break;
      case "ArrowUp":
        e.preventDefault();
        moveSelectionUp();
        break;
      case "Enter":
        e.preventDefault();
        if (filteredFavorites[selectedIndex]) {
          handleSelectNode(filteredFavorites[selectedIndex].nodeType);
        }
        break;
      case "Escape":
        e.preventDefault();
        closePalette();
        onClose?.();
        break;
    }
  }, [filteredFavorites, selectedIndex, moveSelectionDown, moveSelectionUp, handleSelectNode, closePalette, onClose]);

  useCombo(["Escape"], () => {
    if (isOpen) {
      closePalette();
      onClose?.();
    }
  });

  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(0);
    }
  }, [isOpen, setSelectedIndex]);

  if (!isOpen) {
    return null;
  }

  return (
    <Box css={memoizedStyles} onKeyDown={handleKeyDown}>
      <div className="palette-header">
        <div className="search-container">
          <SearchIcon sx={{ color: "text.secondary", fontSize: "0.9rem" }} />
          <input
            className="search-input"
            placeholder="Search favorites..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoFocus
          />
        </div>
        <Tooltip title="Keyboard: ↑↓ to navigate, Enter to select, Esc to close" placement="bottom" enterDelay={TOOLTIP_ENTER_DELAY}>
          <div className="shortcut-hint">
            <KeyboardIcon sx={{ fontSize: "0.8rem" }} />
          </div>
        </Tooltip>
        <Tooltip title="Close" placement="bottom" enterDelay={TOOLTIP_ENTER_DELAY}>
          <IconButton size="small" onClick={() => { closePalette(); onClose?.(); }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </div>

      <div className="results-container">
        {filteredFavorites.length === 0 ? (
          <div className="empty-state">
            <StarIcon className="empty-icon" />
            <Typography className="empty-title">
              {searchTerm.trim() ? "No matching favorites" : "No favorites yet"}
            </Typography>
            <Typography className="empty-description">
              {searchTerm.trim()
                ? "Try a different search term"
                : "Star nodes in the Node Menu to add them to your favorites"}
            </Typography>
          </div>
        ) : (
          <List dense disablePadding>
            {filteredFavorites.map((fav, index) => {
              const nodeType = fav.nodeType;
              const displayName = getNodeDisplayName(nodeType);
              const description = getNodeDescription(nodeType);
              const isSelected = index === selectedIndex;

              return (
                <ListItem key={nodeType} disablePadding>
                  <ListItemButton
                    className={`result-item ${isSelected ? "selected" : ""}`}
                    onClick={() => handleSelectNode(nodeType)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    selected={isSelected}
                    sx={{
                      py: 1.25,
                      px: 1.5,
                      mb: 0.5,
                      borderRadius: "8px"
                    }}
                  >
                    <div className="result-icon">
                      <StarIcon sx={{ fontSize: "1.1rem" }} />
                    </div>
                    <div className="result-content">
                      <Typography className="result-title">{displayName}</Typography>
                      <Typography className="result-description">{description}</Typography>
                    </div>
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        )}
      </div>

      <div className="footer">
        <div className="footer-info">
          {filteredFavorites.length} favorite{filteredFavorites.length !== 1 ? "s" : ""}
        </div>
        <div className="footer-actions">
          <div className="footer-action">
            <span className="footer-key">↑↓</span>
            <span>Navigate</span>
          </div>
          <div className="footer-action">
            <span className="footer-key">↵</span>
            <span>Insert</span>
          </div>
          <div className="footer-action">
            <span className="footer-key">esc</span>
            <span>Close</span>
          </div>
        </div>
      </div>
    </Box>
  );
});

export default QuickFavoritesPalette;
