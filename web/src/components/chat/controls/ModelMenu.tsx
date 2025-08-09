/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
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
  IconButton
} from "@mui/material";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import CheckIcon from "@mui/icons-material/Check";
import { useQuery } from "@tanstack/react-query";
import useModelStore from "../../../stores/ModelStore";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";
import { LanguageModel } from "../../../stores/ApiTypes";
import { useTheme } from "@mui/material/styles";
import {
  isHuggingFaceProvider,
  getProviderBaseName,
  formatGenericProviderName
} from "../../../utils/providerDisplay";

const menuStyles = (theme: Theme) =>
  css({
    "& button": {
      backgroundColor: theme.vars.palette.grey[800],
      border: `1px solid ${theme.vars.palette.grey[500]}`,
      minWidth: "280px",
      maxHeight: "400px"
    },
    ".provider-header": {
      marginTop: "1em",
      padding: "0.5em 1em",
      userSelect: "none",
      backgroundColor: theme.vars.palette.grey[800],
      color: theme.vars.palette.grey[100],
      fontSize: "var(--fontSizeNormal)",
      fontVariant: "small-caps",
      textTransform: "uppercase"
    },
    ".model-item": {
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[600]
      },
      "&.selected": {
        backgroundColor: theme.vars.palette.primary.dark
      },
      "& > div": {
        paddingLeft: 0
      }
    },
    ".model-name": {
      color: theme.vars.palette.grey[0]
    },
    ".loading-container": {
      display: "flex",
      justifyContent: "center",
      padding: theme.spacing(2)
    }
  });

interface ModelMenuProps {
  selectedModel?: LanguageModel;
  onModelChange?: (model: LanguageModel) => void;
}

interface GroupedModels {
  [provider: string]: Array<LanguageModel>;
}

const ModelMenu: React.FC<ModelMenuProps> = ({
  selectedModel,
  onModelChange
}) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const open = Boolean(anchorEl);
  const theme = useTheme();
  const loadLanguageModels = useModelStore((state) => state.loadLanguageModels);
  const {
    data: models,
    isLoading,
    isError
  } = useQuery({
    queryKey: ["models"],
    queryFn: async () => await loadLanguageModels()
  });

  const groupedModels: GroupedModels = useMemo(() => {
    if (!models || isLoading || isError) return {};
    return models.reduce<GroupedModels>((acc, model) => {
      const provider = model.provider || "Other";
      if (!acc[provider]) {
        acc[provider] = [];
      }
      acc[provider].push({
        type: "language_model",
        id: model.id || "",
        name: model.name || "",
        provider
      });
      return acc;
    }, {});
  }, [models, isLoading, isError]);

  const currentSelectedModelDetails = useMemo(() => {
    if (!models || !selectedModel) return null;
    return models.find(
      (m) => m.provider === selectedModel.provider && m.id === selectedModel.id
    );
  }, [models, selectedModel]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleModelSelect = useCallback(
    (model: LanguageModel) => {
      onModelChange?.(model);
      handleClose();
    },
    [onModelChange, handleClose]
  );

  const sortedProviders = useMemo(
    () =>
      Object.keys(groupedModels).sort((a, b) => {
        const aKey = (
          isHuggingFaceProvider(a)
            ? getProviderBaseName(a)
            : formatGenericProviderName(a)
        ).toLowerCase();
        const bKey = (
          isHuggingFaceProvider(b)
            ? getProviderBaseName(b)
            : formatGenericProviderName(b)
        ).toLowerCase();
        return aKey.localeCompare(bKey);
      }),
    [groupedModels]
  );

  return (
    <>
      <Tooltip
        title={
          <div style={{ textAlign: "center" }}>
            <Typography variant="inherit">
              {currentSelectedModelDetails?.name || "Select Model"}
            </Typography>
            <Typography variant="caption" display="block">
              Select Model
            </Typography>
          </div>
        }
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <IconButton
          ref={buttonRef}
          className={`select-model-button ${selectedModel ? "active" : ""}`}
          sx={{
            border: "1px solid transparent",
            color: "var(--palette-grey-0)",
            marginRight: ".5em !important",
            padding: "0.25em 0.75em !important",
            borderRadius: "0.25em",
            "&:hover": {
              backgroundColor: "var(--palette-grey-500)"
            }
          }}
          onClick={handleClick}
          size="small"
        >
          <SmartToyIcon
            fontSize="small"
            sx={{
              color: "var(--palette-grey-200)",
              marginRight: "0.5em"
            }}
          />
          <Typography
            variant="inherit"
            sx={{ fontSize: "var(--fontSizeNormal)" }}
          >
            {currentSelectedModelDetails?.name || "Select Model"}
          </Typography>
        </IconButton>
      </Tooltip>
      <Menu
        className="model-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        css={menuStyles(theme)}
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
        ) : (
          sortedProviders.map((provider, index) => [
            <Typography key={`header-${provider}`} className="provider-header">
              {isHuggingFaceProvider(provider) ? (
                <span>
                  {getProviderBaseName(provider)}{" "}
                  <span
                    style={{
                      marginLeft: 6,
                      padding: "1px 4px",
                      fontSize: "0.7em",
                      lineHeight: 1,
                      borderRadius: 3,
                      background: "var(--palette-grey-600)",
                      color: "var(--palette-grey-0)",
                      letterSpacing: 0.3
                    }}
                  >
                    HF
                  </span>
                </span>
              ) : (
                formatGenericProviderName(provider)
              )}
            </Typography>,
            ...groupedModels[provider].map((model) => (
              <MenuItem
                key={model.id}
                onClick={() => handleModelSelect(model)}
                className={`model-item ${
                  selectedModel?.provider === model.provider &&
                  selectedModel?.id === model.id
                    ? "selected"
                    : ""
                }`}
              >
                {selectedModel?.provider === model.provider &&
                  selectedModel?.id === model.id && (
                    <ListItemIcon>
                      <CheckIcon fontSize="small" />
                    </ListItemIcon>
                  )}
                <ListItemText
                  inset={
                    selectedModel?.provider !== model.provider ||
                    selectedModel?.id !== model.id
                  }
                  primary={<span className="model-name">{model.name}</span>}
                />
              </MenuItem>
            ))
          ])
        )}
      </Menu>
    </>
  );
};

export default ModelMenu;
