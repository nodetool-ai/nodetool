/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  Button,
  Menu,
  MenuItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Typography,
  Tooltip,
  CircularProgress,
  Box
} from "@mui/material";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import CheckIcon from "@mui/icons-material/Check";
import { useQuery } from "@tanstack/react-query";
import useModelStore from "../../../stores/ModelStore";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";

const menuStyles = (theme: any) =>
  css({
    "& button": {
      backgroundColor: theme.palette.c_gray1,
      border: `1px solid ${theme.palette.c_gray3}`,
      minWidth: "280px",
      maxHeight: "400px"
    },
    ".provider-header": {
      marginTop: "1em",
      padding: "0.5em 1em",
      userSelect: "none",
      backgroundColor: theme.palette.c_gray1,
      color: theme.palette.c_gray6,
      fontSize: "var(--fontSizeNormal)",
      fontVariant: "small-caps",
      textTransform: "uppercase"
    },
    ".model-item": {
      "&:hover": {
        backgroundColor: theme.palette.c_gray2
      },
      "&.selected": {
        backgroundColor: theme.palette.primary.dark
      },
      "& > div": {
        paddingLeft: 0
      }
    },
    ".model-name": {
      color: theme.palette.c_white
    },
    ".loading-container": {
      display: "flex",
      justifyContent: "center",
      padding: theme.spacing(2)
    }
  });

interface ModelMenuProps {
  selectedModel?: string;
  onModelChange?: (modelId: string) => void;
}

interface GroupedModels {
  [provider: string]: Array<{
    id: string;
    name: string;
    provider: string;
  }>;
}

const ModelMenu: React.FC<ModelMenuProps> = ({
  selectedModel,
  onModelChange
}) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
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
    if (!models || !selectedModel) return null;
    return models.find((m) => m.id === selectedModel);
  }, [models, selectedModel]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleModelSelect = useCallback(
    (modelId: string) => {
      onModelChange?.(modelId);
      handleClose();
    },
    [onModelChange, handleClose]
  );

  const sortedProviders = Object.keys(groupedModels).sort();

  return (
    <>
      <Tooltip
        title={
          <div style={{ textAlign: "center" }}>
            <Typography variant="inherit">
              {currentSelectedModelDetails?.name ||
                selectedModel ||
                "Select Model"}
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
          className={`select-model-button ${selectedModel ? "active" : ""}`}
          sx={{
            border: "1px solid transparent",
            color: "var(--c_white)",
            marginRight: ".5em !important",
            padding: "0.25em 0.75em !important",
            "&:hover": {
              backgroundColor: "var(--c_gray3)"
            }
          }}
          onClick={handleClick}
          size="small"
          startIcon={
            <SmartToyIcon
              fontSize="small"
              sx={{
                color: "var(--c_gray5)",
                marginRight: "0.5em"
              }}
            />
          }
        >
          {currentSelectedModelDetails?.name || selectedModel || "Model"}
        </Button>
      </Tooltip>
      <Menu
        className="model-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        css={menuStyles}
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
              {provider}
            </Typography>,
            ...groupedModels[provider].map((model) => (
              <MenuItem
                key={model.id}
                onClick={() => handleModelSelect(model.id)}
                className={`model-item ${
                  selectedModel === model.id ? "selected" : ""
                }`}
              >
                {selectedModel === model.id && (
                  <ListItemIcon>
                    <CheckIcon fontSize="small" />
                  </ListItemIcon>
                )}
                <ListItemText
                  inset={selectedModel !== model.id}
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
