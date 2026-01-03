/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  InputAdornment,
  CircularProgress,
  Typography,
  Box,
  Chip,
  IconButton,
  Tooltip
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";
import type { LanguageModel } from "../../../stores/ApiTypes";
import { apiClient } from "../../../stores/ApiClient";

const styles = (theme: Theme) =>
  css({
    ".model-select-button": {
      textTransform: "none",
      justifyContent: "space-between",
      padding: "4px 8px",
      minWidth: 120,
      maxWidth: 200,
      borderRadius: "6px",
      backgroundColor: theme.vars.palette.action.hover,
      border: `1px solid ${theme.vars.palette.divider}`,
      color: theme.vars.palette.text.primary,
      fontSize: theme.fontSizeSmall,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.selected,
        borderColor: theme.vars.palette.primary.main
      },
      "&.active": {
        borderColor: theme.vars.palette.primary.main,
        backgroundColor: theme.vars.palette.primary.main,
        color: theme.vars.palette.primary.contrastText
      }
    },
    ".model-name": {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      textAlign: "left",
      flex: 1
    }
  });

const dialogStyles = (theme: Theme) =>
  css({
    ".dialog-content": {
      minWidth: 400,
      maxHeight: "60vh"
    },
    ".search-field": {
      marginBottom: theme.spacing(2)
    },
    ".provider-chip": {
      marginRight: theme.spacing(1),
      marginBottom: theme.spacing(1)
    },
    ".model-list": {
      maxHeight: 300,
      overflow: "auto"
    },
    ".model-item": {
      borderRadius: "4px",
      marginBottom: "2px",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      },
      "&.Mui-selected": {
        backgroundColor: theme.vars.palette.action.selected,
        "&:hover": {
          backgroundColor: theme.vars.palette.action.selected
        }
      }
    },
    ".model-item-text": {
      "& .MuiListItemText-primary": {
        fontSize: theme.fontSizeNormal
      },
      "& .MuiListItemText-secondary": {
        fontSize: theme.fontSizeSmall
      }
    }
  });

interface LanguageModelSelectProps {
  value?: LanguageModel;
  onChange: (model: LanguageModel) => void;
  allowedProviders?: string[];
}

interface ProviderModels {
  provider: string;
  models: LanguageModel[];
}

const LanguageModelSelect: React.FC<LanguageModelSelectProps> = ({
  value,
  onChange,
  allowedProviders
}) => {
  const theme = useTheme();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [providerModels, setProviderModels] = useState<ProviderModels[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadedProviders, setLoadedProviders] = useState<Set<string>>(new Set());

  // Fetch providers when dialog opens
  useEffect(() => {
    if (!dialogOpen) return;
    
    const fetchProviders = async () => {
      setIsLoading(true);
      try {
        const { data: providers } = await apiClient.getProviders();
        if (providers) {
          // Filter to only providers with generate_message capability
          const llmProviders = providers
            .filter(p => p.capabilities.includes("generate_message"))
            .filter(p => !allowedProviders || allowedProviders.includes(p.provider));
          
          // Initialize empty model lists for each provider
          setProviderModels(llmProviders.map(p => ({
            provider: p.provider,
            models: []
          })));
        }
      } catch (error) {
        console.error("Failed to fetch providers:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchProviders();
  }, [dialogOpen, allowedProviders]);

  // Load models for a specific provider when selected
  useEffect(() => {
    if (!selectedProvider || loadedProviders.has(selectedProvider)) return;
    
    const fetchModels = async () => {
      setIsLoading(true);
      try {
        const { data: models } = await apiClient.getLanguageModels(selectedProvider);
        if (models) {
          setProviderModels(prev => 
            prev.map(pm => 
              pm.provider === selectedProvider 
                ? { ...pm, models }
                : pm
            )
          );
          setLoadedProviders(prev => new Set(prev).add(selectedProvider));
        }
      } catch (error) {
        console.error(`Failed to fetch models for ${selectedProvider}:`, error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchModels();
  }, [selectedProvider, loadedProviders]);

  const handleClick = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setDialogOpen(false);
    setSearchTerm("");
  }, []);

  const handleSelectModel = useCallback((model: LanguageModel) => {
    onChange(model);
    handleClose();
  }, [onChange, handleClose]);

  // Get all models for display
  const allModels = useMemo(() => {
    return providerModels.flatMap(pm => pm.models);
  }, [providerModels]);

  // Filter models based on search and selected provider
  const filteredModels = useMemo(() => {
    let models = selectedProvider 
      ? providerModels.find(pm => pm.provider === selectedProvider)?.models || []
      : allModels;
    
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      models = models.filter(m => 
        (m.name || "").toLowerCase().includes(term) ||
        (m.id || "").toLowerCase().includes(term) ||
        (m.provider || "").toLowerCase().includes(term)
      );
    }
    
    return models;
  }, [allModels, providerModels, selectedProvider, searchTerm]);

  // Get unique providers
  const providers = useMemo(() => {
    return providerModels.map(pm => pm.provider);
  }, [providerModels]);

  return (
    <>
      <Tooltip
        title={value ? `Model: ${value.name}` : "Select Language Model"}
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <Button
          className={`model-select-button ${value ? "active" : ""}`}
          css={styles(theme)}
          onClick={handleClick}
          size="small"
          endIcon={<ExpandMoreIcon sx={{ fontSize: 14 }} />}
        >
          <span className="model-name">
            {value?.name || value?.id || "Select Model"}
          </span>
        </Button>
      </Tooltip>

      <Dialog
        open={dialogOpen}
        onClose={handleClose}
        css={dialogStyles(theme)}
        maxWidth="sm"
        fullWidth
        slotProps={{
          backdrop: {
            style: { backdropFilter: "blur(8px)" }
          }
        }}
        sx={{
          "& .MuiDialog-paper": {
            borderRadius: 2,
            border: `1px solid ${theme.vars.palette.divider}`
          }
        }}
      >
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          Select Language Model
          <IconButton onClick={handleClose} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent className="dialog-content">
          <TextField
            className="search-field"
            fullWidth
            size="small"
            placeholder="Search models..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                )
              }
            }}
            sx={{ mb: 2 }}
          />

          {/* Provider filter chips */}
          <Box sx={{ mb: 2 }}>
            <Chip
              label="All"
              size="small"
              className="provider-chip"
              color={selectedProvider === null ? "primary" : "default"}
              onClick={() => setSelectedProvider(null)}
            />
            {providers.map(provider => (
              <Chip
                key={provider}
                label={provider}
                size="small"
                className="provider-chip"
                color={selectedProvider === provider ? "primary" : "default"}
                onClick={() => setSelectedProvider(provider)}
              />
            ))}
          </Box>

          {/* Model list */}
          {isLoading && !filteredModels.length ? (
            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : filteredModels.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", p: 2 }}>
              {selectedProvider 
                ? `Select "${selectedProvider}" provider to load models`
                : "No models found"}
            </Typography>
          ) : (
            <List className="model-list" dense>
              {filteredModels.map((model) => (
                <ListItemButton
                  key={`${model.provider}-${model.id}`}
                  className="model-item"
                  selected={value?.id === model.id && value?.provider === model.provider}
                  onClick={() => handleSelectModel(model)}
                >
                  <ListItemText
                    className="model-item-text"
                    primary={model.name || model.id}
                    secondary={model.provider}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default React.memo(LanguageModelSelect);
