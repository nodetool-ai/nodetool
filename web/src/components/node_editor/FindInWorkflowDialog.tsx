/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useEffect, useRef } from "react";
import { Box, Typography, List, ListItem, ListItemButton } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ClearIcon from "@mui/icons-material/Clear";
import { useFindInWorkflow } from "../../hooks/useFindInWorkflow";

const styles = (theme: Theme) =>
  css({
    "& .find-dialog-container": {
      position: "fixed",
      top: "60px",
      right: "20px",
      width: "320px",
      maxHeight: "400px",
      zIndex: 20000,
      display: "flex",
      flexDirection: "column",
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: "12px",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.15)",
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
          event.preventDefault();
          closeFind();
          return;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          if (event.shiftKey) {
            navigatePrevious();
          } else {
            navigateNext();
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
    }, [isOpen, closeFind, navigateNext, navigatePrevious]);

    if (!isOpen) {
      return null;
    }

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      performSearch(event.target.value);
    };

    const handleResultClick = (index: number) => {
      selectNode(index);
      goToSelected();
      closeFind();
    };

    const handleClear = () => {
      clearSearch();
      inputRef.current?.focus();
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
            {searchTerm && (
              <button className="clear-button" onClick={handleClear}>
                <ClearIcon fontSize="small" />
              </button>
            )}
          </Box>
          <Box className="navigation-buttons">
            <button
              className="nav-button"
              onClick={navigatePrevious}
              disabled={results.length === 0}
              title="Previous (Shift+Enter)"
            >
              <ArrowUpwardIcon fontSize="small" />
            </button>
            <button
              className="nav-button"
              onClick={navigateNext}
              disabled={results.length === 0}
              title="Next (Enter)"
            >
              <ArrowDownwardIcon fontSize="small" />
            </button>
          </Box>
        </Box>

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
                  onClick={() => handleResultClick(index)}
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
      </Box>
    );
  }
);

FindInWorkflowDialog.displayName = "FindInWorkflowDialog";

export default FindInWorkflowDialog;
