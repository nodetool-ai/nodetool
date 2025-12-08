import React, { useState, useCallback, useMemo, useRef, memo } from "react";
import { isEqual } from "lodash";
import {
  Menu,
  MenuItem,
  ListItemText,
  ListItemIcon,
  Typography,
  Tooltip,
  CircularProgress,
  Box,
  Button
} from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import { useOllamaModels } from "../../hooks/useOllamaModels";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { isElectron } from "../../stores/ApiClient";
// no providers here; always Ollama

interface LlamaModelSelectProps {
  onChange: (value: any) => void;
  value: string;
}

const LlamaModelSelect = ({ onChange, value }: LlamaModelSelectProps) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const open = Boolean(anchorEl);

  const { ollamaModels, ollamaLoading, ollamaIsFetching, ollamaError } =
    useOllamaModels();

  const sortedModels = useMemo(() => {
    if (!ollamaModels || ollamaLoading || ollamaIsFetching || ollamaError)
      return [] as Array<{ name: string; repo_id: string }>;

    return ollamaModels
      .map((m) => ({
        name: m.name,
        repo_id: m.repo_id ?? m.name
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [ollamaModels, ollamaLoading, ollamaIsFetching, ollamaError]);

  const currentSelectedModelDetails = useMemo(() => {
    if (!ollamaModels || !value) return null;
    return ollamaModels.find((m) => m.repo_id === value) ?? null;
  }, [ollamaModels, value]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleModelSelect = useCallback(
    (repoId: string) => {
      onChange({
        type: "llama_model",
        repo_id: repoId
      });
      handleClose();
    },
    [onChange, handleClose]
  );

  // no providers menu; just one list of models

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
        {ollamaLoading ? (
          <Box className="loading-container">
            <CircularProgress size={24} />
          </Box>
        ) : ollamaError ? (
          <Box sx={{ p: 2, maxWidth: 300 }}>
            <Typography variant="body2" color="error" sx={{ mb: 1 }}>
              Could not load Ollama models
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mb: 1 }}
            >
              {typeof (ollamaError as any)?.detail === "string"
                ? (ollamaError as any).detail
                : "Please check that Ollama is running"}
            </Typography>
            {isElectron ? (
              <Typography
                variant="caption"
                color="warning.main"
                sx={{ display: "block", mt: 1 }}
              >
                Ollama should be running automatically. Please try restarting
                the application.
              </Typography>
            ) : (
              <Typography
                variant="caption"
                component="a"
                href="https://ollama.com/download"
                target="_blank"
                rel="noopener noreferrer"
                sx={{ color: "primary.main", textDecoration: "underline" }}
              >
                Download Ollama →
              </Typography>
            )}
          </Box>
        ) : sortedModels.length === 0 ? (
          <MenuItem disabled>
            <ListItemText primary="No models available" />
          </MenuItem>
        ) : (
          sortedModels.map((model) => (
            <MenuItem
              key={model.repo_id}
              onClick={() => handleModelSelect(model.repo_id)}
              className={`model-item ${
                value === model.repo_id ? "selected" : ""
              }`}
            >
              {value === model.repo_id && (
                <ListItemIcon>
                  <CheckIcon fontSize="small" />
                </ListItemIcon>
              )}
              <ListItemText
                inset={value !== model.repo_id}
                primary={<span className="model-name">{model.name}</span>}
              />
            </MenuItem>
          ))
        )}
      </Menu>
    </>
  );
};

export default memo(LlamaModelSelect, isEqual);
