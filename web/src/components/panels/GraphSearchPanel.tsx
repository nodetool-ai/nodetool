/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  TextField,
  IconButton,
  Typography,
  List,
  ListItemButton,
  ListItemText,
  Chip,
  FormControlLabel,
  Checkbox,
  Collapse
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import FilterListIcon from "@mui/icons-material/FilterList";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useGraphSearch } from "../../hooks/useGraphSearch";
import { useNodes } from "../../contexts/NodeContext";
import { useReactFlow } from "@xyflow/react";

const containerStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: "100%",
    padding: "12px 10px 10px 10px",
    boxSizing: "border-box",
    gap: 8,
    ".search-header": {
      display: "flex",
      alignItems: "center",
      gap: 8
    },
    ".search-input": {
      flex: 1,
      "& .MuiOutlinedInput-root": {
        backgroundColor: theme.vars.palette.background.paper,
        fontSize: theme.fontSizeSmall
      },
      "& .MuiOutlinedInput-input": {
        padding: "8px 12px"
      }
    },
    ".search-actions": {
      display: "flex",
      alignItems: "center",
      gap: 4
    },
    ".filters-section": {
      marginTop: 4
    },
    ".filters-toggle": {
      display: "flex",
      alignItems: "center",
      gap: 4,
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.text.secondary,
      cursor: "pointer",
      userSelect: "none",
      "&:hover": {
        color: theme.vars.palette.text.primary
      }
    },
    ".filter-options": {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      padding: "8px 0"
    },
    ".results-section": {
      flex: 1,
      minHeight: 0,
      display: "flex",
      flexDirection: "column"
    },
    ".results-header": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      paddingBottom: 8,
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    ".results-count": {
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.text.secondary
    },
    ".results-nav": {
      display: "flex",
      alignItems: "center",
      gap: 4
    },
    ".results-list": {
      flex: 1,
      minHeight: 0,
      overflowY: "auto",
      "& .MuiListItemButton-root": {
        padding: "6px 8px",
        marginBottom: 2,
        borderRadius: 6,
        "&.selected": {
          backgroundColor: `${theme.vars.palette.primary.main}22`,
          "&:hover": {
            backgroundColor: `${theme.vars.palette.primary.main}33`
          }
        },
        "&:hover": {
          backgroundColor: theme.vars.palette.action.hover
        }
      }
    },
    ".result-item": {
      display: "flex",
      flexDirection: "column",
      gap: 2
    },
    ".result-name": {
      fontSize: theme.fontSizeSmall,
      fontWeight: 500,
      color: theme.vars.palette.text.primary,
      "& mark": {
        backgroundColor: theme.vars.palette.warning.light,
        color: theme.vars.palette.text.primary,
        borderRadius: 2,
        padding: "0 2px"
      }
    },
    ".result-meta": {
      display: "flex",
      alignItems: "center",
      gap: 6,
      fontSize: "11px",
      color: theme.vars.palette.text.secondary
    },
    ".result-match": {
      fontFamily: theme.fontFamily2,
      fontSize: "11px",
      color: theme.vars.palette.text.secondary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      "& mark": {
        backgroundColor: theme.vars.palette.info.light,
        color: theme.vars.palette.text.primary,
        borderRadius: 2,
        padding: "0 2px"
      }
    },
    ".empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      color: theme.vars.palette.text.secondary,
      textAlign: "center",
      padding: 20
    },
    ".stats-bar": {
      display: "flex",
      gap: 12,
      padding: "8px 0",
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      fontSize: "11px",
      color: theme.vars.palette.text.secondary
    }
  });

const getNodeTypeLabel = (type: string | undefined): string => {
  if (!type) {
    return "Unknown";
  }
  const parts = type.split(".");
  const lastPart = parts[parts.length - 1];
  return lastPart.replace(/_/g, " ").replace(/([A-Z])/g, " $1").trim();
};

const GraphSearchPanel: React.FC = () => {
  const theme = useTheme();
  const { searchQuery, results, selectedResultIndex, filters, performSearch, setSelectedResultIndex, nextResult, previousResult, setFilters, clearSearch, setIsOpen } = useGraphSearch();
  const nodes = useNodes((state) => state.nodes);
  const edges = useNodes((state) => state.edges);
  const { fitView } = useReactFlow();
  const [showFilters, setShowFilters] = useState(false);
  const [inputValue, setInputValue] = useState(searchQuery);

  useEffect(() => {
    setInputValue(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputValue !== searchQuery) {
        performSearch(inputValue);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [inputValue, performSearch, searchQuery]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  }, []);

  const handleClearSearch = useCallback(() => {
    setInputValue("");
    clearSearch();
  }, [clearSearch]);

  const handleResultClick = useCallback((index: number) => {
    setSelectedResultIndex(index);
  }, [setSelectedResultIndex]);

  const handleNavigate = useCallback((direction: "next" | "prev") => {
    if (direction === "next") {
      nextResult();
    } else {
      previousResult();
    }
    const selected = results[selectedResultIndex];
    if (selected) {
      fitView({ nodes: [selected.node], padding: 0.5, duration: 300 });
    }
  }, [results, selectedResultIndex, nextResult, previousResult, fitView]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && results.length > 0) {
      e.preventDefault();
      handleNavigate("next");
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }, [results.length, handleNavigate, setIsOpen]);

  const handleResultKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const node = results[index]?.node;
      if (node) {
        fitView({ nodes: [node], padding: 0.5, duration: 300 });
      }
    }
  }, [results, fitView]);

  const stats = useMemo(() => {
    const disconnectedCount = nodes.filter((n) => {
      return !edges.some((e) => e.source === n.id || e.target === n.id);
    }).length;
    return {
      totalNodes: nodes.length,
      disconnectedCount
    };
  }, [nodes, edges]);

  return (
    <Box css={containerStyles(theme)}>
      <Box className="search-header">
        <TextField
          className="search-input"
          placeholder="Search nodes... (Ctrl+F)"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          size="small"
          autoFocus
          InputProps={{
            startAdornment: <SearchIcon sx={{ mr: 1, color: "text.secondary" }} fontSize="small" />,
            endAdornment: inputValue && (
              <IconButton size="small" onClick={handleClearSearch}>
                <CloseIcon fontSize="small" />
              </IconButton>
            )
          }}
        />
        <Box className="search-actions">
          {results.length > 0 && (
            <>
              <IconButton size="small" onClick={() => handleNavigate("prev")} disabled={results.length <= 1}>
                <NavigateBeforeIcon fontSize="small" />
              </IconButton>
              <Typography variant="caption" color="text.secondary">
                {selectedResultIndex + 1}/{results.length}
              </Typography>
              <IconButton size="small" onClick={() => handleNavigate("next")} disabled={results.length <= 1}>
                <NavigateNextIcon fontSize="small" />
              </IconButton>
            </>
          )}
          <IconButton size="small" onClick={() => setShowFilters(!showFilters)} className={showFilters ? "active" : ""}>
            <FilterListIcon fontSize="small" color={showFilters ? "primary" : "inherit"} />
          </IconButton>
        </Box>
      </Box>

      <Collapse in={showFilters}>
        <Box className="filters-section">
          <Box className="filter-options">
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={filters.searchInNames}
                  onChange={(e) => setFilters({ searchInNames: e.target.checked })}
                />
              }
              label={<Typography variant="caption">Search in node names</Typography>}
            />
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={filters.searchInTypes}
                  onChange={(e) => setFilters({ searchInTypes: e.target.checked })}
                />
              }
              label={<Typography variant="caption">Search in node types</Typography>}
            />
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={filters.searchInProperties}
                  onChange={(e) => setFilters({ searchInProperties: e.target.checked })}
                />
              }
              label={<Typography variant="caption">Search in properties</Typography>}
            />
          </Box>
        </Box>
      </Collapse>

      <Box className="results-section">
        <Box className="results-header">
          <Typography variant="caption" className="results-count">
            {results.length > 0 ? `${results.length} result${results.length !== 1 ? "s" : ""}` : "No results"}
          </Typography>
          {results.length > 0 && (
            <Typography variant="caption" color="text.secondary">
              Press Enter to navigate
            </Typography>
          )}
        </Box>

        {results.length > 0 ? (
          <List className="results-list" disablePadding>
            {results.map((result, index) => (
              <ListItemButton
                key={result.nodeId}
                className={index === selectedResultIndex ? "selected" : ""}
                onClick={() => handleResultClick(index)}
                onKeyDown={(e) => handleResultKeyDown(e, index)}
                tabIndex={0}
              >
                <ListItemText
                  primary={
                    <Box className="result-item">
                      <Typography
                        variant="caption"
                        className="result-name"
                        dangerouslySetInnerHTML={{ __html: result.highlightedText }}
                      />
                      <Box className="result-meta">
                        <Chip
                          size="small"
                          label={getNodeTypeLabel(result.node.type)}
                          sx={{ height: 16, fontSize: "10px" }}
                        />
                        <Chip
                          size="small"
                          label={result.matchType}
                          color={result.matchType === "name" ? "primary" : result.matchType === "type" ? "secondary" : "default"}
                          variant="outlined"
                          sx={{ height: 16, fontSize: "10px" }}
                        />
                      </Box>
                      {result.matchType === "property" && (
                        <Typography
                          variant="caption"
                          className="result-match"
                          dangerouslySetInnerHTML={{ __html: result.highlightedText }}
                        />
                      )}
                    </Box>
                  }
                />
              </ListItemButton>
            ))}
          </List>
        ) : inputValue ? (
          <Box className="empty-state">
            <Typography variant="body2">No nodes match &quot;{inputValue}&quot;</Typography>
            <Typography variant="caption" sx={{ mt: 1 }}>
              Try adjusting your search or filters
            </Typography>
          </Box>
        ) : (
          <Box className="empty-state">
            <SearchIcon sx={{ fontSize: 48, opacity: 0.3, mb: 2 }} />
            <Typography variant="body2">Search your workflow</Typography>
            <Typography variant="caption" sx={{ mt: 1, opacity: 0.7 }}>
              Find nodes by name, type, or property values
            </Typography>
          </Box>
        )}
      </Box>

      <Box className="stats-bar">
        <span>{stats.totalNodes} total nodes</span>
        {stats.disconnectedCount > 0 && (
          <span>{stats.disconnectedCount} disconnected</span>
        )}
      </Box>
    </Box>
  );
};

export default GraphSearchPanel;
