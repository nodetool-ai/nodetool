/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useEffect, useRef, useState } from "react";
import { Box, Typography, List, ListItem, ListItemButton, IconButton } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ClearIcon from "@mui/icons-material/Clear";
import HistoryIcon from "@mui/icons-material/History";
import CloseIcon from "@mui/icons-material/Close";
import { useFindInWorkflow } from "../../hooks/useFindInWorkflow";

const styles = (theme: Theme) =>
  css({
    "&.find-dialog-container": {
      position: "fixed",
      top: "60px",
      right: "20px",
      width: "320px",
      maxHeight: "450px",
      zIndex: 20000,
      display: "flex",
      flexDirection: "column",
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: "12px",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
      border: `1px solid ${theme.vars.palette.divider}`,
      animation: "fadeIn 0.15s ease-out forwards",
      overflow: "hidden"
    },
    "@keyframes fadeIn": {
      "0%": { opacity: 0, transform: "translateY(-10px)" },
      "100%": { opacity: 1, transform: "translateY(0)" }
    },
    "& .find-header": {
      display: "flex",
      alignItems: "center",
      padding: "12px 16px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.action.hover
    },
    "& .search-icon-wrapper": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: theme.vars.palette.text.secondary,
      marginRight: "12px"
    },
    "& .search-input-wrapper": {
      flex: 1,
      position: "relative"
    },
    "& .search-input": {
      width: "100%",
      padding: "8px 12px",
      fontSize: "14px",
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: "8px",
      backgroundColor: theme.vars.palette.background.default,
      color: theme.vars.palette.text.primary,
      outline: "none",
      "&:focus": {
        borderColor: theme.vars.palette.primary.main
      },
      "&::placeholder": {
        color: theme.vars.palette.text.disabled
      }
    },
    "& .clear-button": {
      position: "absolute",
      right: "8px",
      top: "50%",
      transform: "translateY(-50%)",
      background: "none",
      border: "none",
      cursor: "pointer",
      color: theme.vars.palette.text.disabled,
      padding: "4px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      "&:hover": {
        color: theme.vars.palette.text.primary
      }
    },
    "& .history-button": {
      padding: "4px",
      minWidth: "28px",
      height: "28px",
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: "4px",
      backgroundColor: theme.vars.palette.background.default,
      color: theme.vars.palette.text.secondary,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginLeft: "4px",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        color: theme.vars.palette.text.primary
      },
      "&.active": {
        backgroundColor: theme.vars.palette.primary.main,
        color: theme.vars.palette.primary.contrastText,
        borderColor: theme.vars.palette.primary.main
      }
    },
    "& .results-count": {
      padding: "8px 16px",
      fontSize: "12px",
      color: theme.vars.palette.text.secondary,
      backgroundColor: theme.vars.palette.action.hover,
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    "& .results-list": {
      flex: 1,
      overflowY: "auto",
      padding: 0,
      margin: 0,
      listStyle: "none"
    },
    "& .result-item": {
      padding: 0,
      margin: 0
    },
    "& .result-button": {
      display: "flex",
      alignItems: "center",
      padding: "10px 16px",
      minHeight: "44px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.selected
      },
      "&.selected": {
        backgroundColor: theme.vars.palette.action.selected,
        borderLeft: `3px solid ${theme.vars.palette.primary.main}`
      }
    },
    "& .result-name": {
      flex: 1,
      fontSize: "14px",
      color: theme.vars.palette.text.primary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    "& .result-type": {
      fontSize: "11px",
      color: theme.vars.palette.text.secondary,
      marginLeft: "8px",
      maxWidth: "100px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    "& .navigation-buttons": {
      display: "flex",
      gap: "4px",
      marginLeft: "8px"
    },
    "& .nav-button": {
      padding: "4px",
      minWidth: "28px",
      height: "28px",
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: "4px",
      backgroundColor: theme.vars.palette.background.default,
      color: theme.vars.palette.text.secondary,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        color: theme.vars.palette.text.primary
      },
      "&:disabled": {
        opacity: 0.5,
        cursor: "not-allowed"
      }
    },
    "& .empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px 16px",
      color: theme.vars.palette.text.secondary,
      textAlign: "center"
    },
    "& .empty-icon": {
      fontSize: "32px",
      marginBottom: "8px",
      opacity: 0.5
    },
    "& .empty-text": {
      fontSize: "13px"
    },
    "& .recent-searches-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 16px",
      backgroundColor: theme.vars.palette.action.hover,
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    "& .recent-searches-title": {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      fontSize: "12px",
      color: theme.vars.palette.text.secondary,
      fontWeight: 500
    },
    "& .clear-recent-button": {
      padding: "2px 6px",
      fontSize: "11px",
      minWidth: "auto",
      height: "auto",
      color: theme.vars.palette.text.secondary,
      "&:hover": {
        color: theme.vars.palette.error.main,
        backgroundColor: "transparent"
      }
    },
    "& .recent-item": {
      padding: "8px 16px",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.selected
      }
    },
    "& .recent-item-icon": {
      color: theme.vars.palette.text.disabled,
      fontSize: "16px"
    },
    "& .recent-item-text": {
      flex: 1,
      fontSize: "13px",
      color: theme.vars.palette.text.primary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  });

interface FindInWorkflowDialogProps {
  workflowId: string;
}

const FindInWorkflowDialog: React.FC<FindInWorkflowDialogProps> = memo(
  ({ workflowId: _workflowId }: FindInWorkflowDialogProps) => {
    const theme = useTheme();
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const [recentSearchHoverIndex, setRecentSearchHoverIndex] = useState(-1);

    const {
      isOpen,
      searchTerm,
      results,
      selectedIndex,
      recentSearches,
      showRecentSearches,
      closeFind,
      performSearch,
      goToSelected,
      navigateNext,
      navigatePrevious,
      clearSearch,
      selectRecentSearch,
      clearRecentSearches,
      setShowRecentSearches,
      getNodeDisplayName
    } = useFindInWorkflow();

    useEffect(() => {
      if (isOpen) {
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    }, [isOpen]);

    useEffect(() => {
      if (!isOpen) {
        return;
      }

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          if (showRecentSearches && searchTerm === "") {
            setShowRecentSearches(false);
          } else {
            event.preventDefault();
            closeFind();
          }
          return;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          if (showRecentSearches && recentSearchHoverIndex >= 0 && recentSearchHoverIndex < recentSearches.length) {
            selectRecentSearch(recentSearches[recentSearchHoverIndex]);
            closeFind();
          } else if (results.length > 0) {
            goToSelected();
            closeFind();
          }
          return;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          if (showRecentSearches && recentSearches.length > 0) {
            setRecentSearchHoverIndex(prev => Math.min(prev + 1, recentSearches.length - 1));
          } else {
            navigateNext();
          }
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          if (showRecentSearches && recentSearches.length > 0) {
            setRecentSearchHoverIndex(prev => Math.max(prev - 1, 0));
          } else {
            navigatePrevious();
          }
          return;
        }

        if (event.key === "F" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          return;
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, closeFind, navigateNext, navigatePrevious, results.length, goToSelected, showRecentSearches, recentSearches, recentSearchHoverIndex, selectRecentSearch, setShowRecentSearches, searchTerm]);

    if (!isOpen) {
      return null;
    }

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      if (value === "") {
        setShowRecentSearches(true);
        setRecentSearchHoverIndex(-1);
      } else {
        setShowRecentSearches(false);
      }
      performSearch(value);
    };

    const handleResultClick = (index: number) => {
      selectRecentSearch(recentSearches[index]);
      closeFind();
    };

    const handleNodeResultClick = () => {
      goToSelected();
      closeFind();
    };

    const handleClear = () => {
      clearSearch();
      inputRef.current?.focus();
    };

    const handleHistoryClick = () => {
      setShowRecentSearches(!showRecentSearches);
      if (!showRecentSearches) {
        setRecentSearchHoverIndex(-1);
      }
    };

    const formatNodeType = (type: string): string => {
      const parts = type.split(".");
      if (parts.length > 1) {
        return parts.slice(0, -1).join(".");
      }
      return type;
    };

    return (
      <Box className="find-dialog-container" css={styles(theme)}>
        <Box className="find-header">
          <Box className="search-icon-wrapper">
            <SearchIcon fontSize="small" />
          </Box>
          <Box className="search-input-wrapper">
            <input
              ref={inputRef}
              className="search-input"
              type="text"
              placeholder="Find nodes..."
              value={searchTerm}
              onChange={handleInputChange}
            />
            {searchTerm ? (
              <button className="clear-button" onClick={handleClear}>
                <ClearIcon fontSize="small" />
              </button>
            ) : null}
          </Box>
          <button
            className={`history-button ${showRecentSearches ? "active" : ""}`}
            onClick={handleHistoryClick}
            title="Recent searches"
          >
            <HistoryIcon fontSize="small" />
          </button>
          <Box className="navigation-buttons">
            <button
              className="nav-button"
              onClick={navigatePrevious}
              disabled={results.length === 0 || showRecentSearches}
              title="Previous (Shift+Enter)"
            >
              <ArrowUpwardIcon fontSize="small" />
            </button>
            <button
              className="nav-button"
              onClick={navigateNext}
              disabled={results.length === 0 || showRecentSearches}
              title="Next (Enter)"
            >
              <ArrowDownwardIcon fontSize="small" />
            </button>
          </Box>
        </Box>

        {showRecentSearches && recentSearches.length > 0 ? (
          <>
            <Box className="recent-searches-header">
              <Typography className="recent-searches-title">
                <HistoryIcon fontSize="small" />
                Recent Searches
              </Typography>
              <IconButton
                className="clear-recent-button"
                onClick={clearRecentSearches}
                size="small"
                title="Clear all"
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
            <List className="results-list">
              {recentSearches.map((recentSearch, index) => (
                <ListItem
                  key={recentSearch}
                  className="result-item"
                  disablePadding
                >
                  <ListItemButton
                    className={`result-button ${index === recentSearchHoverIndex ? "selected" : ""}`}
                    onClick={() => handleResultClick(index)}
                    onMouseEnter={() => setRecentSearchHoverIndex(index)}
                  >
                    <SearchIcon className="recent-item-icon" fontSize="small" />
                    <Typography className="recent-item-text" variant="body2">
                      {recentSearch}
                    </Typography>
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </>
        ) : (
          <>
            <Box className="results-count">
              {results.length > 0 ? (
                <>
                  {selectedIndex + 1} of {results.length} node{results.length !== 1 ? "s" : ""} found
                </>
              ) : searchTerm ? (
                <>No nodes found</>
              ) : (
                <>Type to search nodes</>
              )}
            </Box>

            {results.length > 0 ? (
              <List className="results-list" ref={listRef}>
                {results.map((result, index) => (
                  <ListItem key={result.node.id} className="result-item" disablePadding>
                    <ListItemButton
                      className={`result-button ${index === selectedIndex ? "selected" : ""}`}
                      onClick={handleNodeResultClick}
                    >
                      <Typography className="result-name" variant="body2">
                        {getNodeDisplayName(result.node)}
                      </Typography>
                      <Typography className="result-type" variant="caption">
                        {formatNodeType(result.node.type ?? "")}
                      </Typography>
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            ) : searchTerm ? (
              <Box className="empty-state">
                <SearchIcon className="empty-icon" />
                <Typography className="empty-text">No matching nodes</Typography>
              </Box>
            ) : null}
          </>
        )}
      </Box>
    );
  }
);

FindInWorkflowDialog.displayName = "FindInWorkflowDialog";

export default FindInWorkflowDialog;
