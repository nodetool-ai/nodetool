/** @jsxImportSource @emotion/react */
import React, { useState, useCallback, useMemo, useEffect } from "react";
import { css } from "@emotion/react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  CircularProgress,
  Chip,
  InputAdornment,
  IconButton,
  Divider
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  useReplicateSearch,
  useFeaturedReplicateModels,
  parseModelVersion,
  FEATURED_REPLICATE_MODELS
} from "../../hooks/useReplicateModels";
import { ReplicateModel } from "../../stores/ReplicateStore";
import ReplicateModelInfo from "./ReplicateModelInfo";

const styles = (theme: Theme) =>
  css({
    ".model-browser-content": {
      display: "flex",
      flexDirection: "row",
      gap: theme.spacing(2),
      minHeight: 400,
      maxHeight: "70vh"
    },
    ".model-list-section": {
      flex: "0 0 350px",
      display: "flex",
      flexDirection: "column",
      borderRight: `1px solid ${theme.vars?.palette?.divider || theme.palette.divider}`,
      paddingRight: theme.spacing(2)
    },
    ".model-detail-section": {
      flex: 1,
      overflow: "auto",
      minWidth: 300
    },
    ".search-field": {
      marginBottom: theme.spacing(2)
    },
    ".model-list": {
      flex: 1,
      overflow: "auto",
      maxHeight: 400
    },
    ".model-list-item": {
      borderRadius: theme.spacing(0.5),
      marginBottom: theme.spacing(0.5),
      "&.selected": {
        backgroundColor: theme.vars?.palette?.action?.selected || theme.palette.action.selected
      }
    },
    ".model-item-content": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.25)
    },
    ".model-name": {
      fontWeight: 600,
      fontSize: theme.typography.body2.fontSize
    },
    ".model-owner": {
      fontSize: theme.typography.caption.fontSize,
      color: theme.vars?.palette?.text?.secondary || theme.palette.text.secondary
    },
    ".model-description": {
      fontSize: theme.typography.caption.fontSize,
      color: theme.vars?.palette?.text?.secondary || theme.palette.text.secondary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      maxWidth: 280
    },
    ".featured-section": {
      marginBottom: theme.spacing(2)
    },
    ".section-title": {
      fontSize: theme.typography.body2.fontSize,
      fontWeight: 600,
      color: theme.vars?.palette?.text?.secondary || theme.palette.text.secondary,
      marginBottom: theme.spacing(1),
      textTransform: "uppercase"
    },
    ".loading-container": {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      padding: theme.spacing(4)
    },
    ".error-message": {
      color: theme.vars?.palette?.error?.main || theme.palette.error.main,
      padding: theme.spacing(2)
    },
    ".no-results": {
      color: theme.vars?.palette?.text?.secondary || theme.palette.text.secondary,
      padding: theme.spacing(2),
      textAlign: "center"
    },
    ".featured-chips": {
      display: "flex",
      flexWrap: "wrap",
      gap: theme.spacing(0.5)
    }
  });

interface ReplicateModelBrowserProps {
  open: boolean;
  onClose: () => void;
  onModelSelect: (owner: string, name: string, version?: string) => void;
  initialValue?: string;
}

/**
 * Dialog component for browsing and selecting Replicate models
 */
const ReplicateModelBrowser: React.FC<ReplicateModelBrowserProps> = ({
  open,
  onClose,
  onModelSelect,
  initialValue
}) => {
  const theme = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedModel, setSelectedModel] = useState<ReplicateModel | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch search results
  const {
    data: searchResults,
    isLoading: isSearching,
    error: searchError
  } = useReplicateSearch(debouncedQuery, open && debouncedQuery.length > 0);

  // Fetch featured models
  const { data: featuredModels, isLoading: loadingFeatured } = useFeaturedReplicateModels();

  // Parse initial value to pre-select
  useEffect(() => {
    if (open && initialValue) {
      try {
        const parsed = parseModelVersion(initialValue);
        // Create a minimal model object from the parsed value
        setSelectedModel({
          owner: parsed.owner,
          name: parsed.name,
          url: `https://replicate.com/${parsed.owner}/${parsed.name}`,
          description: "",
          visibility: "public"
        });
      } catch {
        // Invalid format, ignore
      }
    }
  }, [open, initialValue]);

  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(event.target.value);
    },
    []
  );

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setDebouncedQuery("");
  }, []);

  const handleModelClick = useCallback((model: ReplicateModel) => {
    setSelectedModel(model);
  }, []);

  const handleSelect = useCallback(() => {
    if (selectedModel) {
      onModelSelect(
        selectedModel.owner,
        selectedModel.name,
        selectedModel.latest_version?.id
      );
    }
  }, [selectedModel, onModelSelect]);

  const handleFeaturedClick = useCallback(
    (owner: string, name: string) => {
      // Find in featured models if available
      const featured = featuredModels?.find(
        (m) => m.owner === owner && m.name === name
      );
      if (featured) {
        setSelectedModel(featured);
      } else {
        // Create minimal model object
        setSelectedModel({
          owner,
          name,
          url: `https://replicate.com/${owner}/${name}`,
          description: FEATURED_REPLICATE_MODELS.find(
            (m) => m.owner === owner && m.name === name
          )?.description || "",
          visibility: "public"
        });
      }
    },
    [featuredModels]
  );

  const handleOpenInReplicate = useCallback(() => {
    if (selectedModel) {
      window.open(
        `https://replicate.com/${selectedModel.owner}/${selectedModel.name}`,
        "_blank"
      );
    }
  }, [selectedModel]);

  // Determine which models to show
  const modelsToShow = useMemo(() => {
    if (debouncedQuery && searchResults) {
      return searchResults;
    }
    return featuredModels || [];
  }, [debouncedQuery, searchResults, featuredModels]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      css={styles(theme)}
    >
      <DialogTitle>
        Select Replicate Model
        <Typography variant="caption" display="block" color="text.secondary">
          Search for models or select from featured options
        </Typography>
      </DialogTitle>

      <DialogContent>
        <div className="model-browser-content">
          {/* Left side: Search and list */}
          <div className="model-list-section">
            <TextField
              className="search-field"
              placeholder="Search models..."
              value={searchQuery}
              onChange={handleSearchChange}
              size="small"
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: searchQuery && (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={handleClearSearch}>
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                )
              }}
            />

            {/* Featured models chips */}
            {!debouncedQuery && (
              <div className="featured-section">
                <Typography className="section-title">Featured</Typography>
                <div className="featured-chips">
                  {FEATURED_REPLICATE_MODELS.map(({ owner, name }) => (
                    <Chip
                      key={`${owner}/${name}`}
                      label={name}
                      size="small"
                      onClick={() => handleFeaturedClick(owner, name)}
                      variant={
                        selectedModel?.owner === owner &&
                        selectedModel?.name === name
                          ? "filled"
                          : "outlined"
                      }
                      color={
                        selectedModel?.owner === owner &&
                        selectedModel?.name === name
                          ? "primary"
                          : "default"
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            <Divider sx={{ my: 1 }} />

            <Typography className="section-title">
              {debouncedQuery ? "Search Results" : "Models"}
            </Typography>

            {/* Loading state */}
            {(isSearching || loadingFeatured) && (
              <div className="loading-container">
                <CircularProgress size={24} />
              </div>
            )}

            {/* Error state */}
            {searchError && (
              <Typography className="error-message">
                Failed to search models. Please try again.
              </Typography>
            )}

            {/* No results */}
            {!isSearching &&
              !searchError &&
              debouncedQuery &&
              modelsToShow.length === 0 && (
                <Typography className="no-results">
                  No models found for &quot;{debouncedQuery}&quot;
                </Typography>
              )}

            {/* Model list */}
            <List className="model-list" dense>
              {modelsToShow.map((model) => (
                <ListItem
                  key={`${model.owner}/${model.name}`}
                  disablePadding
                  className={`model-list-item ${
                    selectedModel?.owner === model.owner &&
                    selectedModel?.name === model.name
                      ? "selected"
                      : ""
                  }`}
                >
                  <ListItemButton onClick={() => handleModelClick(model)}>
                    <ListItemText
                      primary={
                        <div className="model-item-content">
                          <span className="model-name">{model.name}</span>
                          <span className="model-owner">{model.owner}</span>
                          {model.description && (
                            <span className="model-description">
                              {model.description}
                            </span>
                          )}
                        </div>
                      }
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </div>

          {/* Right side: Model details */}
          <div className="model-detail-section">
            {selectedModel ? (
              <ReplicateModelInfo
                model={selectedModel}
                onOpenInReplicate={handleOpenInReplicate}
              />
            ) : (
              <Box
                display="flex"
                alignItems="center"
                justifyContent="center"
                height="100%"
              >
                <Typography color="text.secondary">
                  Select a model to view details
                </Typography>
              </Box>
            )}
          </div>
        </div>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSelect}
          variant="contained"
          disabled={!selectedModel}
        >
          Select Model
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ReplicateModelBrowser;
