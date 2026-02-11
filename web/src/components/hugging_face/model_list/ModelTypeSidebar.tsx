import React, { useCallback } from "react";
import {
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Tooltip
} from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { IconForType } from "../../../config/data_types";
import { prettifyModelType } from "../../../utils/modelFormatting";
import { useModels } from "./useModels";
import { useModelManagerStore } from "../../../stores/ModelManagerStore";
import { useTheme } from "@mui/material/styles";

const ModelTypeSidebar: React.FC = () => {
  const { modelTypes, availableModelTypes } = useModels();
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
                borderRadius: "8px",
                overflow: "hidden"
              }}
              secondaryAction={
                href ? (
                  <Tooltip title="View on Hugging Face">
                    <IconButton
                      edge="end"
                      component="a"
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      size="small"
                      onClick={handleLinkClick}
                      sx={{ 
                        color: isSelected ? theme.vars.palette.text.primary : "inherit",
                        opacity: 0.7,
                        "&:hover": { opacity: 1 }
                      }}
                    >
                      <OpenInNewIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ) : undefined
              }
            >
            <ListItemButton
              className={`model-type-button`}
              selected={isSelected}
              onClick={createModelTypeChangeHandler(type)}
              sx={{
                  borderRadius: "8px",
                  padding: "8px 12px",
                  transition: "all 0.2s ease",
                  "&.Mui-selected": {
                    backgroundColor: theme.vars.palette.action.selected,
                    backdropFilter: theme.vars.palette.glass.blur,
                    border: `1px solid ${theme.vars.palette.divider}`,
                    "&:hover": {
                      backgroundColor: theme.vars.palette.action.activatedOpacity,
                    }
                  },
                  "&:hover": {
                    backgroundColor: theme.vars.palette.action.hover,
                  }
                }}
              >
                {type === "All" && (
                  <IconForType
                    iconName={"model"}
                    containerStyle={{ marginRight: "0.75em" }}
                    svgProps={{
                      style: {
                        width: "18px",
                        height: "18px",
                        opacity: isSelected ? 1 : 0.7
                      }
                    }}
                    showTooltip={false}
                  />
                )}
                <ListItemText 
                  primary={prettifyModelType(type)} 
                  primaryTypographyProps={{
                    fontSize: "0.9rem",
                    fontWeight: isSelected ? 600 : 400,
                    color: isSelected ? theme.vars.palette.text.primary : "text.secondary"
                  }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
    </List>
  );
};

export default React.memo(ModelTypeSidebar);
