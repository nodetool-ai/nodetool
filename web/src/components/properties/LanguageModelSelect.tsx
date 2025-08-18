import React, { useState, useCallback, useMemo, useRef } from "react";
import { Typography, Tooltip, Button, IconButton, useMediaQuery, Select, MenuItem, FormControl } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { useQuery } from "@tanstack/react-query";
import { isEqual } from "lodash";
import useModelStore from "../../stores/ModelStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import {
  isHuggingFaceProvider,
  getProviderBaseName,
  formatGenericProviderName
} from "../../utils/providerDisplay";
import ModelMenuDialog from "../model_menu/ModelMenuDialog";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import type { LanguageModel } from "../../stores/ApiTypes";

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

const HFBadge: React.FC = () => (
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
);

const renderProviderLabel = (provider: string): React.ReactNode => {
  if (isHuggingFaceProvider(provider)) {
    const base = getProviderBaseName(provider);
    return (
      <span>
        {base}
        <HFBadge />
      </span>
    );
  }
  return formatGenericProviderName(provider);
};

const LanguageModelSelect: React.FC<LanguageModelSelectProps> = ({
  onChange,
  value
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const addRecent = useModelPreferencesStore((s) => s.addRecent);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const loadLanguageModels = useModelStore((state) => state.loadLanguageModels);
  const {
    data: models,
    isLoading,
    isError
  } = useQuery({
    queryKey: ["models"],
    queryFn: async () => await loadLanguageModels()
  });

  const sortedModels = useMemo(() => {
    if (!models || isLoading || isError) return [];
    return models.sort((a, b) => a.name.localeCompare(b.name));
  }, [models, isLoading, isError]);

  const groupedModels = useMemo(() => {
    if (!sortedModels || isLoading || isError) return {};
    return sortedModels.reduce<GroupedModels>((acc, model) => {
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
  }, [sortedModels, isLoading, isError]);

  const currentSelectedModelDetails = useMemo(() => {
    if (!models || !value) return null;
    return models.find((m) => m.id === value);
  }, [models, value]);

  const handleClick = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setDialogOpen(false);
  }, []);

  const handleDialogModelSelect = useCallback(
    (model: LanguageModel) => {
      const modelToPass = {
        type: "language_model" as const,
        id: model.id,
        provider: model.provider,
        name: model.name || ""
      };
      onChange(modelToPass);
      addRecent({
        provider: model.provider || "",
        id: model.id || "",
        name: model.name || ""
      });
      setDialogOpen(false);
    },
    [onChange, addRecent]
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

  // Mobile version with simple dropdown
  if (isMobile) {
    return (
      <FormControl
        size="small"
        sx={{
          minWidth: 140,
          maxWidth: 160,
          "& .MuiOutlinedInput-root": {
            backgroundColor: "var(--palette-grey-800)",
            border: "1px solid var(--palette-grey-600)",
            borderRadius: "8px",
            color: "var(--palette-grey-0)",
            fontSize: "0.75rem",
            "&:hover": {
              borderColor: "var(--palette-grey-500)"
            },
            "&.Mui-focused": {
              borderColor: "var(--palette-primary-main)"
            }
          },
          "& .MuiSelect-select": {
            padding: "6px 8px",
            paddingRight: "24px !important"
          },
          "& .MuiSelect-icon": {
            color: "var(--palette-grey-400)",
            right: "4px"
          }
        }}
      >
        <Select
          value={value || ""}
          onChange={(e) => {
            const selectedModel = models?.find(m => m.id === e.target.value);
            if (selectedModel) {
              const modelToPass = {
                type: "language_model" as const,
                id: selectedModel.id,
                provider: selectedModel.provider,
                name: selectedModel.name || ""
              };
              onChange(modelToPass);
              addRecent({
                provider: selectedModel.provider || "",
                id: selectedModel.id || "",
                name: selectedModel.name || ""
              });
            }
          }}
          displayEmpty
          IconComponent={KeyboardArrowDownIcon}
          renderValue={(selected) => {
            if (!selected) {
              return (
                <Typography variant="body2" sx={{ color: "var(--palette-grey-500)" }}>
                  Select Model
                </Typography>
              );
            }
            const selectedModel = models?.find(m => m.id === selected);
            return (
              <Typography variant="body2" sx={{ color: "var(--palette-grey-0)" }}>
                {selectedModel?.name?.split('/').pop() || selected}
              </Typography>
            );
          }}
          MenuProps={{
            PaperProps: {
              sx: {
                backgroundColor: "var(--palette-grey-800)",
                border: "1px solid var(--palette-grey-600)",
                borderRadius: "8px",
                maxHeight: "300px",
                "& .MuiMenuItem-root": {
                  color: "var(--palette-grey-0)",
                  fontSize: "0.75rem",
                  padding: "8px 12px",
                  "&:hover": {
                    backgroundColor: "var(--palette-grey-700)"
                  },
                  "&.Mui-selected": {
                    backgroundColor: "var(--palette-primary-main)",
                    "&:hover": {
                      backgroundColor: "var(--palette-primary-dark)"
                    }
                  }
                }
              }
            }
          }}
        >
          {!models || isLoading ? (
            <MenuItem disabled>
              <Typography variant="body2">Loading models...</Typography>
            </MenuItem>
          ) : isError ? (
            <MenuItem disabled>
              <Typography variant="body2">Error loading models</Typography>
            </MenuItem>
          ) : (
            sortedProviders.map((provider) => [
              <MenuItem key={`provider-${provider}`} disabled sx={{ 
                fontWeight: "bold", 
                backgroundColor: "var(--palette-grey-700) !important",
                color: "var(--palette-grey-300) !important"
              }}>
                {renderProviderLabel(provider)}
              </MenuItem>,
              ...groupedModels[provider].map((model) => (
                <MenuItem key={model.id} value={model.id}>
                  <Typography variant="body2" sx={{ 
                    paddingLeft: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}>
                    {model.name.split('/').pop() || model.name}
                  </Typography>
                </MenuItem>
              ))
            ]).flat()
          )}
        </Select>
      </FormControl>
    );
  }

  // Desktop version with full text
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
      <ModelMenuDialog
        open={dialogOpen}
        onClose={handleClose}
        models={models}
        isLoading={isLoading}
        isError={isError}
        onModelChange={handleDialogModelSelect}
      />
    </>
  );
};

export default React.memo(LanguageModelSelect, isEqual);
