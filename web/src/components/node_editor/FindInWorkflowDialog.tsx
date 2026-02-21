/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useEffect, useRef, useCallback } from "react";
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemButton,
  Divider,
  Chip
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ClearIcon from "@mui/icons-material/Clear";
import HistoryIcon from "@mui/icons-material/History";
import { CloseButton } from "../ui_primitives/CloseButton";
import { useFindInWorkflow } from "../../hooks/useFindInWorkflow";
import { useSearchHistoryStore } from "../../stores/SearchHistoryStore";

const styles = (theme: Theme) =>
  css({
    "&.find-dialog-container": {
      position: "fixed",
      top: "60px",
      right: "20px",
      width: "360px",
      maxHeight: "500px",
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
    "& .keyboard-hint": {
      position: "absolute",
      bottom: "-20px",
      left: "0",
      fontSize: "10px",
      color: theme.vars.palette.text.disabled,
      pointerEvents: "none"
    },
    "& .results-count": {
      padding: "8px 16px",
      fontSize: "12px",
      color: theme.vars.palette.text.secondary,
      backgroundColor: theme.vars.palette.action.hover,
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
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
    "& .history-section": {
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    "& .history-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 16px",
      fontSize: "11px",
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      backgroundColor: theme.vars.palette.action.hover
    },
    "& .history-item": {
      padding: "8px 16px",
      fontSize: "13px",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      },
      "&:last-child": {
        borderBottom: "none"
      }
    },
    "& .history-text": {
      flex: 1,
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
    const containerRef = useRef<HTMLDivElement>(null);

    const {
      isOpen,
      searchTerm,
      results,
      selectedIndex,
      closeFind,
      performSearch,
      goToSelected,
      navigateNext,
      navigatePrevious,
      clearSearch,
      selectNode,
      getNodeDisplayName
    } = useFindInWorkflow();

    const { history, addSearchTerm, _removeSearchTerm, clearHistory } =
      useSearchHistoryStore();

    useEffect(() => {
      if (isOpen) {
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    }, [isOpen]);

    // Click outside to close
    useEffect(() => {
      if (!isOpen) {
        return;
      }

      const handleClickOutside = (event: MouseEvent) => {
        if (
          containerRef.current &&
          !containerRef.current.contains(event.target as Node)
        ) {
          closeFind();
        }
      };

      let isMounted = true;

      const timeoutId = setTimeout(() => {
        if (isMounted) {
          document.addEventListener("mousedown", handleClickOutside);
        }
      }, 100);

      return () => {
        isMounted = false;
        clearTimeout(timeoutId);
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }, [isOpen, closeFind]);

    useEffect(() => {
      if (!isOpen) {
        return;
      }

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeFind();
          return;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          if (results.length > 0) {
            goToSelected();
            closeFind();
          }
          return;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          navigateNext();
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          navigatePrevious();
          return;
        }

        if (event.key === "F" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          return;
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [
      isOpen,
      closeFind,
      navigateNext,
      navigatePrevious,
      results.length,
      goToSelected
    ]);

    const handleInputChange = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        performSearch(event.target.value);
      },
      [performSearch]
    );

    const handleResultClick = useCallback(
      (index: number) => (_event: React.MouseEvent) => {
        selectNode(index);
        goToSelected();
        closeFind();
      },
      [selectNode, goToSelected, closeFind]
    );

    const handleClear = useCallback(() => {
      clearSearch();
      inputRef.current?.focus();
    }, [clearSearch]);

    const handleHistoryClick = useCallback(
      (term: string) => () => {
        performSearch(term);
        addSearchTerm(term);
      },
      [performSearch, addSearchTerm]
    );

    const handleClearHistory = useCallback(() => {
      clearHistory();
    }, [clearHistory]);

    // Save to history when search completes
    useEffect(() => {
      if (searchTerm.trim() && results.length > 0) {
        addSearchTerm(searchTerm);
      }
    }, [searchTerm, results.length, addSearchTerm]);

    if (!isOpen) {
      return null;
    }

    const formatNodeType = (type: string): string => {
      const parts = type.split(".");
      if (parts.length > 1) {
        return parts.slice(0, -1).join(".");
      }
      return type;
    };

    const showHistory = !searchTerm && history.length > 0;
    const showResults = results.length > 0;

    return (
      <Box
        ref={containerRef}
        className="find-dialog-container"
        css={styles(theme)}
      >
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
            {searchTerm && (
              <button className="clear-button" onClick={handleClear}>
                <ClearIcon fontSize="small" />
              </button>
            )}
            <div className="keyboard-hint">
              ↑↓ Navigate • Enter Go • Esc Close
            </div>
          </Box>
          <Box className="navigation-buttons">
            <button
              className="nav-button"
              onClick={navigatePrevious}
              disabled={results.length === 0}
              title="Previous (↑)"
            >
              <ArrowUpwardIcon fontSize="small" />
            </button>
            <button
              className="nav-button"
              onClick={navigateNext}
              disabled={results.length === 0}
              title="Next (↓)"
            >
              <ArrowDownwardIcon fontSize="small" />
            </button>
          </Box>
          <CloseButton
            onClick={closeFind}
            tooltip="Close (Esc)"
            buttonSize="small"
            nodrag={false}
            sx={{ marginLeft: "8px" }}
          />
        </Box>

        <Box className="results-count">
          <span>
            {results.length > 0
              ? `${selectedIndex + 1} of ${results.length} node${results.length !== 1 ? "s" : ""} found`
              : searchTerm
                ? "No nodes found"
                : "Type to search nodes"}
          </span>
          {showHistory && (
            <Chip
              label="Clear"
              size="small"
              onClick={handleClearHistory}
              sx={{ height: "20px", fontSize: "10px" }}
            />
          )}
        </Box>

        <Box className="results-list" ref={listRef}>
          {/* History Section */}
          {showHistory && (
            <Box className="history-section">
              <Box className="history-header">
                <span>Recent Searches</span>
                <HistoryIcon sx={{ fontSize: "14px" }} />
              </Box>
              {history.map((term, index) => (
                <Box
                  key={`${term}-${index}`}
                  className="history-item"
                  onClick={handleHistoryClick(term)}
                >
                  <HistoryIcon sx={{ fontSize: "14px" }} />
                  <span className="history-text">{term}</span>
                </Box>
              ))}
            </Box>
          )}

          {/* Results Section */}
          {showResults && (
            <>
              {showHistory && <Divider />}
              <List>
                {results.map((result, index) => (
                  <ListItem
                    key={result.node.id}
                    className="result-item"
                    disablePadding
                  >
                    <ListItemButton
                      className={`result-button ${
                        index === selectedIndex ? "selected" : ""
                      }`}
                      onClick={handleResultClick(index)}
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
            </>
          )}

          {/* Empty State */}
          {!showHistory && !showResults && searchTerm && (
            <Box className="empty-state">
              <SearchIcon className="empty-icon" />
              <Typography className="empty-text">No matching nodes</Typography>
            </Box>
          )}

          {/* Initial Empty State */}
          {!showHistory && !showResults && !searchTerm && (
            <Box className="empty-state">
              <SearchIcon className="empty-icon" />
              <Typography className="empty-text">
                Start typing to search nodes by name, type, or ID
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    );
  }
);

FindInWorkflowDialog.displayName = "FindInWorkflowDialog";

export default FindInWorkflowDialog;
