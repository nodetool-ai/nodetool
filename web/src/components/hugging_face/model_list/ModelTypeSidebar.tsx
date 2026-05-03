import React, { useCallback } from "react";
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemText
} from "@mui/material";
import { Chip, Text, ToolbarIconButton } from "../../ui_primitives";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { IconForType } from "../../../config/data_types";
import { prettifyModelType } from "../../../utils/modelFormatting";
import { useModels } from "./useModels";
import { useModelManagerStore } from "../../../stores/ModelManagerStore";
import { useTheme } from "@mui/material/styles";

const ModelTypeSidebar: React.FC = () => {
  const { modelTypes, availableModelTypes, modelCountsByType } = useModels();
  const selectedModelType = useModelManagerStore((state) => state.selectedModelType);
  const setSelectedModelType = useModelManagerStore((state) => state.setSelectedModelType);
  const theme = useTheme();

  const onModelTypeChange = useCallback(
    (type: string) => {
      setSelectedModelType(type);
    },
    [setSelectedModelType]
  );

  const createModelTypeChangeHandler = useCallback((type: string) => {
    return () => onModelTypeChange(type);
  }, [onModelTypeChange]);

  const getHuggingFaceLink = useCallback((type: string) => {
    if (!type.startsWith("hf.")) {
      return undefined;
    }

    const pipelineTag = type.slice(3).replace(/_/g, "-").toLowerCase();
    return `https://huggingface.co/models?pipeline_tag=${pipelineTag}`;
  }, []);

  const handleLinkClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
  }, []);

  return (
    <Box>
      <Text
        size="small"
        color="secondary"
        sx={{
          px: 1.5,
          pb: 1.25,
          fontSize: "0.7rem",
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          opacity: 0.7
        }}
      >
        Model Categories
      </Text>
    <List className="model-type-list" sx={{ padding: 0 }}>
      {modelTypes
        .filter((type) => availableModelTypes.has(type))
        .map((type) => {
          const href = getHuggingFaceLink(type);
          const isSelected = selectedModelType === type;
          
          return (
            <ListItem
              disablePadding
              key={type}
              sx={{ 
                mb: 0.5,
                borderRadius: "var(--rounded-lg)",
                overflow: "hidden"
              }}
              secondaryAction={
                href ? (
                  <ToolbarIconButton
                    icon={<OpenInNewIcon fontSize="small" />}
                    tooltip="View on Hugging Face"
                    edge="end"
                    component="a"
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={handleLinkClick}
                    ariaLabel={`View ${prettifyModelType(type)} models on Hugging Face`}
                    sx={{
                      color: isSelected ? theme.vars.palette.text.primary : "inherit",
                      opacity: 0.7,
                      "&:hover": { opacity: 1 }
                    }}
                  />
                ) : undefined
              }
            >
            <ListItemButton
              className={`model-type-button`}
              selected={isSelected}
              onClick={createModelTypeChangeHandler(type)}
              sx={{
                  borderRadius: "var(--rounded-lg)",
                  padding: "8px 12px",
                  transition: "background-color 0.15s ease, color 0.15s ease",
                  "&.Mui-selected": {
                    backgroundColor:
                      "rgba(var(--palette-primary-main-channel) / 0.12)",
                    border: "none",
                    "&:hover": {
                      backgroundColor:
                        "rgba(var(--palette-primary-main-channel) / 0.18)"
                    }
                  },
                  "&:hover": {
                    backgroundColor: theme.vars.palette.action.hover
                  }
                }}
              >
                <IconForType
                  iconName={type === "All" ? "model" : type.replace(/^hf\./, "") || "model"}
                  containerStyle={{ marginRight: "0.75em", display: "flex" }}
                  svgProps={{
                    style: {
                      width: "20px",
                      height: "20px",
                      opacity: isSelected ? 1 : 0.6,
                      color: isSelected
                        ? theme.vars.palette.primary.main
                        : theme.vars.palette.text.secondary
                    }
                  }}
                  showTooltip={false}
                />
                <ListItemText
                  primary={prettifyModelType(type)}
                  primaryTypographyProps={{
                    fontSize: "0.9rem",
                    fontWeight: isSelected ? 600 : 400,
                    color: isSelected
                      ? theme.vars.palette.primary.main
                      : "text.secondary"
                  }}
                />
                {modelCountsByType[type] !== undefined && (
                  <Chip
                    label={modelCountsByType[type]}
                    size="small"
                    sx={{
                      height: 20,
                      minWidth: 28,
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      ml: 1,
                      backgroundColor: "transparent",
                      color: isSelected
                        ? theme.vars.palette.primary.main
                        : theme.vars.palette.text.secondary,
                      "& .MuiChip-label": {
                        px: 0.75
                      }
                    }}
                  />
                )}
              </ListItemButton>
            </ListItem>
          );
        })}
    </List>
    </Box>
  );
};

export default React.memo(ModelTypeSidebar);
