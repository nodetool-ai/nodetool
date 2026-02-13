/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useCallback } from "react";

import { Box, Chip, Tooltip, Typography } from "@mui/material";
import HistoryIcon from "@mui/icons-material/History";
import CloseIcon from "@mui/icons-material/Close";

import { useSearchHistoryStore, SearchHistoryEntry } from "../../stores/SearchHistoryStore";

const styles = (theme: Theme) =>
  css({
    ".search-history-container": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1),
      padding: theme.spacing(1, 0)
    },
    ".search-history-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing(1),
      marginBottom: theme.spacing(0.5)
    },
    ".search-history-title": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.5),
      fontSize: "0.75rem",
      fontWeight: 500,
      color: theme.vars.palette.text.secondary
    },
    ".search-history-chips": {
      display: "flex",
      flexWrap: "wrap",
      gap: theme.spacing(0.5),
      alignItems: "center"
    },
    ".search-history-chip": {
      fontSize: "0.75rem",
      height: "24px",
      backgroundColor: theme.vars.palette.action.hover,
      transition: "all 0.15s ease-in-out",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.selected
      }
    },
    ".search-history-chip-label": {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      maxWidth: "200px"
    },
    ".search-history-empty": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: theme.spacing(1),
      color: theme.vars.palette.text.disabled,
      fontSize: "0.8rem",
      fontStyle: "italic"
    },
    ".clear-button": {
      fontSize: "0.7rem",
      height: "20px",
      minWidth: "unset",
      padding: theme.spacing(0.25, 0.5),
      border: `1px solid ${theme.vars.palette.divider}`
    }
  });

interface SearchHistoryChipsProps {
  onSearchTermClick: (term: string) => void;
}

/**
 * SearchHistoryChips Component
 *
 * Displays recent search terms as clickable chips.
 * Allows users to quickly rerun previous searches.
 */
const SearchHistoryChips = memo(({ onSearchTermClick }: SearchHistoryChipsProps) => {
  const theme = useTheme();
  const memoizedStyles = React.useMemo(() => styles(theme), [theme]);

  const recentSearches = useSearchHistoryStore((state) => state.getRecentSearches(8));
  const removeSearchTerm = useSearchHistoryStore((state) => state.removeSearchTerm);
  const clearHistory = useSearchHistoryStore((state) => state.clearHistory);

  const handleChipClick = useCallback(
    (entry: SearchHistoryEntry) => {
      onSearchTermClick(entry.term);
    },
    [onSearchTermClick]
  );

  const handleDeleteChip = useCallback(
    (event: React.MouseEvent, entry: SearchHistoryEntry) => {
      event.stopPropagation();
      removeSearchTerm(entry.term);
    },
    [removeSearchTerm]
  );

  const handleClearHistory = useCallback(() => {
    clearHistory();
  }, [clearHistory]);

  if (recentSearches.length === 0) {
    return null;
  }

  return (
    <div className="search-history-container" css={memoizedStyles}>
      <div className="search-history-header">
        <Box className="search-history-title">
          <HistoryIcon sx={{ fontSize: "0.9rem" }} />
          <Typography variant="caption">Recent Searches</Typography>
        </Box>
        <Chip
          label="Clear"
          size="small"
          className="clear-button"
          onClick={handleClearHistory}
          data-testid="search-history-clear-btn"
        />
      </div>
      <div className="search-history-chips">
        {recentSearches.map((entry) => (
          <Tooltip key={entry.term} title={entry.term} placement="top">
            <Chip
              label={
                <span className="search-history-chip-label">{entry.term}</span>
              }
              size="small"
              className="search-history-chip"
              onClick={() => handleChipClick(entry)}
              onDelete={(event) => handleDeleteChip(event, entry)}
              deleteIcon={<CloseIcon sx={{ fontSize: "0.9rem" }} />}
              data-testid={`search-history-chip-${entry.term.replace(/\s+/g, "-")}`}
            />
          </Tooltip>
        ))}
      </div>
    </div>
  );
});

SearchHistoryChips.displayName = "SearchHistoryChips";

export default SearchHistoryChips;
