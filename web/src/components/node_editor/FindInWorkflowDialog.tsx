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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Collapse,
  Button
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ClearIcon from "@mui/icons-material/Clear";
import FilterListIcon from "@mui/icons-material/FilterList";
import { CloseButton } from "../ui_primitives/CloseButton";
import { useFindInWorkflow } from "../../hooks/useFindInWorkflow";

const styles = (theme: Theme) =>
  css({
    "&.find-dialog-container": {
      position: "fixed",
      top: "60px",
      right: "20px",
      width: "380px",
      maxHeight: "600px",
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
    "& .filter-toggle-button": {
      padding: "4px 8px",
      marginLeft: "8px",
      minWidth: "auto",
      height: "28px",
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: "4px",
      backgroundColor: theme.vars.palette.background.default,
      color: theme.vars.palette.text.secondary,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: "4px",
      fontSize: "12px",
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
    "& .filters-panel": {
      padding: "12px 16px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.action.hover,
      display: "flex",
      flexDirection: "column",
      gap: "12px"
    },
    "& .filter-row": {
      display: "flex",
      gap: "8px",
      alignItems: "center"
    },
    "& .filter-select": {
      flex: 1,
      fontSize: "13px"
    },
    "& .filter-chips": {
      display: "flex",
      flexWrap: "wrap",
      gap: "6px"
    },
    "& .filter-chip": {
      fontSize: "11px",
      height: "22px"
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
      filters,
      showFilters,
      closeFind,
      performSearch,
      goToSelected,
      navigateNext,
      navigatePrevious,
      clearSearch,
      selectNode,
      getNodeDisplayName,
      toggleFilters,
      updateFilter
    } = useFindInWorkflow();

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

      // Delay adding the listener to avoid immediately closing on the same click that opened
      const timeoutId = setTimeout(() => {
        document.addEventListener("mousedown", handleClickOutside);
      }, 100);

      return () => {
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

    const handleFilterChange = useCallback(
      (filterKey: keyof typeof filters) => (value: any) => {
        updateFilter(filterKey, value);
        // Re-run search with new filters
        if (searchTerm) {
          performSearch(searchTerm);
        }
      },
      [updateFilter, searchTerm, performSearch]
    );

    const getActiveFilterCount = useCallback(() => {
      let count = 0;
      if (filters.typeCategory) {
        count++;
      }
      if (filters.connectionState && filters.connectionState !== "any") {
        count++;
      }
      if (filters.executionState && filters.executionState !== "any") {
        count++;
      }
      if (filters.bypassState && filters.bypassState !== "any") {
        count++;
      }
      return count;
    }, [filters]);

    const clearAllFilters = useCallback(() => {
      updateFilter("typeCategory", undefined);
      updateFilter("connectionState", undefined);
      updateFilter("executionState", undefined);
      updateFilter("bypassState", undefined);
      // Re-run search with cleared filters
      if (searchTerm) {
        performSearch(searchTerm);
      }
    }, [updateFilter, searchTerm, performSearch]);

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
          </Box>
          <button
            className={`filter-toggle-button ${showFilters ? "active" : ""}`}
            onClick={toggleFilters}
            title="Toggle filters"
          >
            <FilterListIcon fontSize="small" />
            {getActiveFilterCount() > 0 && (
              <Chip
                label={getActiveFilterCount()}
                size="small"
                sx={{
                  height: "16px",
                  fontSize: "10px",
                  minWidth: "16px",
                  padding: "0 4px"
                }}
              />
            )}
          </button>
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
          <CloseButton
            onClick={closeFind}
            tooltip="Close (Escape)"
            buttonSize="small"
            nodrag={false}
            sx={{ marginLeft: "8px" }}
          />
        </Box>

        <Collapse in={showFilters}>
          <Box className="filters-panel">
            <Box className="filter-row">
              <FormControl size="small" className="filter-select">
                <InputLabel id="type-category-label">Type</InputLabel>
                <Select
                  labelId="type-category-label"
                  value={filters.typeCategory ?? ""}
                  label="Type"
                  onChange={(e) => handleFilterChange("typeCategory")(e.target.value)}
                >
                  <MenuItem value="">
                    <em>Any</em>
                  </MenuItem>
                  <MenuItem value="image">Image</MenuItem>
                  <MenuItem value="text">Text</MenuItem>
                  <MenuItem value="audio">Audio</MenuItem>
                  <MenuItem value="video">Video</MenuItem>
                  <MenuItem value="input">Input</MenuItem>
                  <MenuItem value="output">Output</MenuItem>
                </Select>
              </FormControl>

              <FormControl size="small" className="filter-select">
                <InputLabel id="connection-state-label">Connections</InputLabel>
                <Select
                  labelId="connection-state-label"
                  value={filters.connectionState ?? "any"}
                  label="Connections"
                  onChange={(e) => handleFilterChange("connectionState")(e.target.value)}
                >
                  <MenuItem value="any">Any</MenuItem>
                  <MenuItem value="connected">Connected</MenuItem>
                  <MenuItem value="disconnected">Disconnected</MenuItem>
                </Select>
              </FormControl>
            </Box>

            <Box className="filter-row">
              <FormControl size="small" className="filter-select">
                <InputLabel id="execution-state-label">Execution</InputLabel>
                <Select
                  labelId="execution-state-label"
                  value={filters.executionState ?? "any"}
                  label="Execution"
                  onChange={(e) => handleFilterChange("executionState")(e.target.value)}
                >
                  <MenuItem value="any">Any</MenuItem>
                  <MenuItem value="success">Success</MenuItem>
                  <MenuItem value="error">Error</MenuItem>
                  <MenuItem value="running">Running</MenuItem>
                  <MenuItem value="pending">Pending</MenuItem>
                </Select>
              </FormControl>

              <FormControl size="small" className="filter-select">
                <InputLabel id="bypass-state-label">Bypass</InputLabel>
                <Select
                  labelId="bypass-state-label"
                  value={filters.bypassState ?? "any"}
                  label="Bypass"
                  onChange={(e) => handleFilterChange("bypassState")(e.target.value)}
                >
                  <MenuItem value="any">Any</MenuItem>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="bypassed">Bypassed</MenuItem>
                </Select>
              </FormControl>
            </Box>

            {getActiveFilterCount() > 0 && (
              <Box className="filter-row">
                <Button
                  size="small"
                  onClick={clearAllFilters}
                  variant="outlined"
                  sx={{ fontSize: "11px", padding: "2px 8px", minHeight: "24px" }}
                >
                  Clear Filters
                </Button>
                <Box className="filter-chips">
                  {filters.typeCategory && (
                    <Chip
                      label={`Type: ${filters.typeCategory}`}
                      size="small"
                      className="filter-chip"
                      onDelete={() => handleFilterChange("typeCategory")(undefined)}
                    />
                  )}
                  {filters.connectionState && filters.connectionState !== "any" && (
                    <Chip
                      label={`Connections: ${filters.connectionState}`}
                      size="small"
                      className="filter-chip"
                      onDelete={() => handleFilterChange("connectionState")("any")}
                    />
                  )}
                  {filters.executionState && filters.executionState !== "any" && (
                    <Chip
                      label={`Execution: ${filters.executionState}`}
                      size="small"
                      className="filter-chip"
                      onDelete={() => handleFilterChange("executionState")("any")}
                    />
                  )}
                  {filters.bypassState && filters.bypassState !== "any" && (
                    <Chip
                      label={`Bypass: ${filters.bypassState}`}
                      size="small"
                      className="filter-chip"
                      onDelete={() => handleFilterChange("bypassState")("any")}
                    />
                  )}
                </Box>
              </Box>
            )}
          </Box>
        </Collapse>

        <Box className="results-count">
          <Box>
            {results.length > 0 ? (
              <>
                {selectedIndex + 1} of {results.length} node
                {results.length !== 1 ? "s" : ""} found
              </>
            ) : searchTerm || getActiveFilterCount() > 0 ? (
              <>No nodes found</>
            ) : (
              <>Type to search nodes</>
            )}
          </Box>
          {getActiveFilterCount() > 0 && !showFilters && (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {getActiveFilterCount()} filter{getActiveFilterCount() !== 1 ? "s" : ""} active
            </Typography>
          )}
        </Box>

        {results.length > 0 ? (
          <List className="results-list" ref={listRef}>
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
