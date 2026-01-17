/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useMemo, useCallback } from "react";

import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Chip,
  Card,
  CardContent,
  CardActionArea,
  Grid,
  CircularProgress,
  Alert
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import SearchOffIcon from "@mui/icons-material/SearchOff";

import { usePatternLibraryStore, WorkflowPattern } from "../../stores/PatternLibraryStore";
import { serializeDragData } from "../../lib/dragdrop";

const styles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      width: "100%",
      overflow: "hidden"
    },
    ".header": {
      padding: "16px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.default
    },
    ".search-container": {
      padding: "12px 16px"
    },
    ".categories": {
      display: "flex",
      flexWrap: "wrap",
      gap: "8px",
      padding: "12px 16px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.paper
    },
    ".pattern-grid": {
      flex: 1,
      overflow: "auto",
      padding: "16px"
    },
    ".pattern-card": {
      height: "100%",
      display: "flex",
      flexDirection: "column",
      transition: "transform 0.2s ease, box-shadow 0.2s ease",
      "&:hover": {
        transform: "translateY(-2px)",
        boxShadow: `0 8px 24px ${theme.vars.palette.primary.main}22`
      },
      "& .MuiCardContent-root": {
        flex: 1,
        display: "flex",
        flexDirection: "column"
      }
    },
    ".pattern-description": {
      color: theme.vars.palette.text.secondary,
      fontSize: "0.875rem",
      lineHeight: 1.5,
      flex: 1,
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical",
      overflow: "hidden"
    },
    ".pattern-tags": {
      display: "flex",
      flexWrap: "wrap",
      gap: "4px",
      marginTop: "8px"
    },
    ".pattern-meta": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: "12px",
      paddingTop: "12px",
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      fontSize: "0.75rem",
      color: theme.vars.palette.text.secondary
    },
    ".node-count": {
      display: "flex",
      alignItems: "center",
      gap: "4px"
    }
  });

interface PatternCardProps {
  pattern: WorkflowPattern;
  onClick: (pattern: WorkflowPattern) => void;
}

const PatternCard = memo(function PatternCard({ pattern, onClick }: PatternCardProps) {
  const theme = useTheme();

  const handleDragStart = useCallback((e: React.DragEvent, pattern: WorkflowPattern) => {
    serializeDragData({ type: "pattern", payload: pattern }, e.dataTransfer);
    e.dataTransfer.effectAllowed = "copy";
  }, []);

  return (
    <Card className="pattern-card" sx={{ bgcolor: theme.vars.palette.background.default }}>
      <CardActionArea
        onClick={() => onClick(pattern)}
        draggable
        onDragStart={(e) => handleDragStart(e, pattern)}
      >
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <AutoAwesomeIcon sx={{ color: theme.vars.palette.primary.main, fontSize: 20 }} />
            <Typography variant="subtitle1" fontWeight={600} noWrap>
              {pattern.name}
            </Typography>
          </Box>
          <Typography variant="body2" className="pattern-description">
            {pattern.description}
          </Typography>
          <Box className="pattern-tags">
            {pattern.tags.slice(0, 3).map((tag) => (
              <Chip
                key={tag}
                label={tag}
                size="small"
                sx={{
                  fontSize: "0.7rem",
                  height: 20,
                  "& .MuiChip-label": { px: 0.75 }
                }}
              />
            ))}
            {pattern.tags.length > 3 && (
              <Chip
                label={`+${pattern.tags.length - 3}`}
                size="small"
                variant="outlined"
                sx={{
                  fontSize: "0.7rem",
                  height: 20,
                  "& .MuiChip-label": { px: 0.75 }
                }}
              />
            )}
          </Box>
          <Box className="pattern-meta">
            <Chip
              label={pattern.category}
              size="small"
              sx={{
                fontSize: "0.7rem",
                height: 20,
                bgcolor: theme.vars.palette.primary.main + "22",
                color: theme.vars.palette.primary.main,
                "& .MuiChip-label": { px: 0.75 }
              }}
            />
            <Box className="node-count">
              <Typography variant="caption">
                {pattern.nodes.length} nodes
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
});

const PatternLibraryPanel: React.FC = () => {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => styles(theme), [theme]);

  const {
    selectedCategory,
    searchTerm,
    isLoading,
    error,
    actions
  } = usePatternLibraryStore((state) => ({
    selectedCategory: state.selectedCategory,
    searchTerm: state.searchTerm,
    isLoading: state.isLoading,
    error: state.error,
    actions: state.actions
  }));

  const filteredPatterns = actions.getFilteredPatterns();
  const categories = actions.getCategories();

  const handleCategoryClick = useCallback(
    (category: string) => {
      actions.setSelectedCategory(category);
    },
    [actions]
  );

  const handlePatternClick = useCallback(
    (pattern: WorkflowPattern) => {
      console.log("[PatternLibraryPanel] Pattern selected:", pattern.name);
    },
    []
  );

  if (error) {
    return (
      <Box css={memoizedStyles}>
        <Alert severity="error" sx={{ m: 2 }}>
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box css={memoizedStyles}>
      <Box className="header">
        <Typography variant="h6" fontWeight={600}>
          Pattern Library
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Reusable workflow templates for common AI tasks
        </Typography>
      </Box>

      <Box className="search-container">
        <TextField
          fullWidth
          size="small"
          placeholder="Search patterns..."
          value={searchTerm}
          onChange={(e) => actions.setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: "text.secondary" }} />
              </InputAdornment>
            )
          }}
        />
      </Box>

      <Box className="categories">
        {categories.map((category) => (
          <Chip
            key={category}
            label={category}
            onClick={() => handleCategoryClick(category)}
            color={selectedCategory === category ? "primary" : "default"}
            variant={selectedCategory === category ? "filled" : "outlined"}
            size="small"
            sx={{ fontSize: "0.75rem" }}
          />
        ))}
      </Box>

      <Box className="pattern-grid">
        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
            <CircularProgress />
          </Box>
        ) : filteredPatterns.length === 0 ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "text.secondary"
            }}
          >
            <SearchOffIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
            <Typography variant="body2">No patterns found</Typography>
            <Typography variant="caption" color="text.secondary">
              Try adjusting your search or category filter
            </Typography>
          </Box>
        ) : (
          <Grid container spacing={2}>
            {filteredPatterns.map((pattern) => (
              <Grid size={{ xs: 12 }} key={pattern.id}>
                <PatternCard pattern={pattern} onClick={handlePatternClick} />
              </Grid>
            ))}
          </Grid>
        )}
      </Box>
    </Box>
  );
};

export default memo(PatternLibraryPanel);
