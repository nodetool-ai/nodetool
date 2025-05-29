/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  IconButton,
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
import ToolsSelector from "./ToolsSelector";
import { useQuery } from "@tanstack/react-query";
import useModelStore from "../../stores/ModelStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const styles = (theme: any) =>
  css({
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    padding: "0 1em",
    marginBottom: "0.5em",

    ".model-button": {
      backgroundColor: theme.palette.c_gray2,
      color: theme.palette.c_white,
      border: `1px solid ${theme.palette.c_gray3}`,
      "&:hover": {
        backgroundColor: theme.palette.c_gray3,
        borderColor: theme.palette.c_gray4
      },
      "&.active": {
        borderColor: theme.palette.c_hl1,
        color: theme.palette.c_hl1
      }
    }
  });

const menuStyles = (theme: any) =>
  css({
    "& .MuiPaper-root": {
      backgroundColor: theme.palette.c_gray1,
      border: `1px solid ${theme.palette.c_gray3}`,
      minWidth: "280px",
      maxHeight: "400px"
    },

    ".provider-header": {
      padding: "8px 16px",
      backgroundColor: theme.palette.c_gray2,
      color: theme.palette.c_gray5,
      fontSize: "0.75rem",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.05em"
    },

    ".model-item": {
      "&:hover": {
        backgroundColor: theme.palette.c_gray2
      },
      "&.selected": {
        backgroundColor: theme.palette.c_gray2
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

interface ChatToolBarProps {
  selectedTools: string[];
  onToolsChange: (tools: string[]) => void;
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

const ChatToolBar: React.FC<ChatToolBarProps> = ({
  selectedTools,
  onToolsChange,
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

  const selectedModelName = useMemo(() => {
    if (!models || !selectedModel) return null;
    const model = models.find((m) => m.id === selectedModel);
    return model?.name || selectedModel;
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
    <div css={styles}>
      {onModelChange && (
        <>
          <Tooltip
            title={selectedModelName || "Select AI Model"}
            enterDelay={TOOLTIP_ENTER_DELAY}
          >
            <IconButton
              ref={buttonRef}
              className={`model-button ${selectedModel ? "active" : ""}`}
              onClick={handleClick}
              size="small"
            >
              <SmartToyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Menu
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
                index > 0 && <Divider key={`divider-${provider}`} />,
                <Typography
                  key={`header-${provider}`}
                  className="provider-header"
                >
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
      )}
      <ToolsSelector value={selectedTools} onChange={onToolsChange} />
    </div>
  );
};

export default ChatToolBar;