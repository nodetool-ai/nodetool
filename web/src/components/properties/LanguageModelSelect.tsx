import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  Menu,
  MenuItem,
  ListItemText,
  ListItemIcon,
  Typography,
  Tooltip,
  CircularProgress,
  Box,
  IconButton,
  Button
} from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import ArrowBackIosIcon from "@mui/icons-material/ArrowBackIos";
import { useQuery } from "@tanstack/react-query";
import { isEqual } from "lodash";
import useModelStore from "../../stores/ModelStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

interface LanguageModelSelectProps {
  onChange: (value: any) => void;
  value: string;
}

interface GroupedModels {
  [provider: string]: Array<{
    id: string;
    name: string;
    provider: string;
  }>;
}

const formatProviderName = (provider: string): string => {
  return provider
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const LanguageModelSelect: React.FC<LanguageModelSelectProps> = ({
  onChange,
  value
}) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [menuLevel, setMenuLevel] = useState<'providers' | 'models'>('providers');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const open = Boolean(anchorEl);

  const loadLanguageModels = useModelStore((state) => state.loadLanguageModels);
  const {
    data: models,
    isLoading,
    isError
  } = useQuery({
    queryKey: ["models"],
    queryFn: async () => await loadLanguageModels()
  });

  const groupedModels = useMemo(() => {
    if (!models || isLoading || isError) return {};
    return models.reduce<GroupedModels>((acc, model) => {
      const provider = model.provider || "Other";
      if (!acc[provider]) {
        acc[provider] = [];
      }
      acc[provider].push({
        id: model.id || "",
        name: model.name || "",
        provider
      });
      return acc;
    }, {});
  }, [models, isLoading, isError]);

  const currentSelectedModelDetails = useMemo(() => {
    if (!models || !value) return null;
    return models.find((m) => m.id === value);
  }, [models, value]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
    setSelectedProvider(null);
    setMenuLevel('providers');
  }, []);

  const handleProviderSelect = useCallback((provider: string) => {
    setSelectedProvider(provider);
    setMenuLevel('models');
  }, []);

  const handleBackToProviders = useCallback(() => {
    setSelectedProvider(null);
    setMenuLevel('providers');
  }, []);

  const handleModelSelect = useCallback(
    (modelId: string) => {
      onChange({
        type: "language_model",
        id: modelId,
        provider: models?.find((m) => m.id === modelId)?.provider
      });
      handleClose();
    },
    [onChange, models, handleClose]
  );

  const sortedProviders = Object.keys(groupedModels).sort();

  return (
    <>
      <Tooltip
        title={
          <div style={{ textAlign: "center" }}>
            <Typography variant="inherit">
              {currentSelectedModelDetails?.name || value || "Select a model"}
            </Typography>
            <Typography variant="caption" display="block">
              Select Model
            </Typography>
          </div>
        }
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <Button
          ref={buttonRef}
          className={`select-model-button ${value ? "active" : ""}`}
          sx={{
            fontSize: "var(--fontSizeTiny)",
            border: "1px solid transparent",
            borderRadius: "0.25em",
            color: "var(--palette-grey-0)",
            padding: "0em 0.75em !important",
            "&:hover": {
              backgroundColor: "var(--palette-grey-500)"
            }
          }}
          onClick={handleClick}
          size="small"
        >
          <Typography variant="body2" sx={{ color: "var(--palette-grey-200)" }}>
            {currentSelectedModelDetails?.name || value || "Select Model"}
          </Typography>
        </Button>
      </Tooltip>
      <Menu
        className="model-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "top",
          horizontal: "left"
        }}
        transformOrigin={{
          vertical: "bottom",
          horizontal: "left"
        }}
      >
        {isLoading ? (
          <Box className="loading-container">
            <CircularProgress size={24} />
          </Box>
        ) : isError ? (
          <MenuItem disabled>
            <ListItemText primary="Error loading models" />
          </MenuItem>
        ) : Object.keys(groupedModels).length === 0 ? (
          <MenuItem disabled>
            <ListItemText primary="No models available" />
          </MenuItem>
        ) : menuLevel === 'providers' ? (
          // First level: Show providers
          sortedProviders.map((provider) => (
            <MenuItem
              key={provider}
              onClick={() => handleProviderSelect(provider)}
              className="provider-item"
            >
              <ListItemText primary={formatProviderName(provider)} />
              <ListItemIcon>
                <ArrowForwardIosIcon sx={{ fontSize: '12px' }} />
              </ListItemIcon>
            </MenuItem>
          ))
        ) : (
          // Second level: Show models for selected provider
          [
            <MenuItem
              key="back-button"
              onClick={handleBackToProviders}
              className="back-button"
            >
              <ListItemIcon>
                <ArrowBackIosIcon sx={{ fontSize: '12px' }} />
              </ListItemIcon>
              <ListItemText primary={`Back to providers`} />
            </MenuItem>,
            <Typography key="provider-title" className="provider-header">
              {selectedProvider ? formatProviderName(selectedProvider) : 'Provider'} Models
            </Typography>,
            ...(selectedProvider && groupedModels[selectedProvider] || []).map((model) => (
              <MenuItem
                key={model.id}
                onClick={() => handleModelSelect(model.id)}
                className={`model-item ${value === model.id ? "selected" : ""}`}
              >
                {value === model.id && (
                  <ListItemIcon>
                    <CheckIcon fontSize="small" />
                  </ListItemIcon>
                )}
                <ListItemText
                  inset={value !== model.id}
                  primary={<span className="model-name">{model.name}</span>}
                />
              </MenuItem>
            ))
          ]
        )}
      </Menu>
    </>
  );
};

export default React.memo(LanguageModelSelect, isEqual);
