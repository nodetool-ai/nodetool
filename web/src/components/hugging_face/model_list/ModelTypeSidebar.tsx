import React, { useCallback } from "react";

import {
  Chip,
  ToolbarIconButton,
  Box,
  BORDER_RADIUS,
  EYEBROW,
  SPACING,
  TYPOGRAPHY,
  selectableRowStyles,
  selectedRowStyles,
  getSpacingPx,
  List,
  ListItem,
  ListItemButton,
  ListItemText
} from "../../ui_primitives";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { IconForType } from "../../../config/IconForType";
import { prettifyModelType } from "../../../utils/modelFormatting";
import { useModels } from "./useModels";
import { useModelManagerStore } from "../../../stores/ModelManagerStore";
import { useTheme } from "@mui/material/styles";

const ModelTypeSidebar: React.FC = () => {
  const scope = useModelManagerStore((state) => state.scope);
  const { modelTypes, availableModelTypes, modelCountsByType } =
    useModels(scope);
  const selectedModelType = useModelManagerStore((state) => state.selectedModelType);
  const setSelectedModelType = useModelManagerStore((state) => state.setSelectedModelType);
  const theme = useTheme();

  const createModelTypeChangeHandler = useCallback((type: string) => {
    return () => setSelectedModelType(type);
  }, [setSelectedModelType]);

  // Plain-text label for the hover title (prettifyModelType returns JSX with a
  // leading icon, which can't be used as a title attribute).
  const plainLabel = useCallback((type: string) => {
    if (type === "All") {
      return "All";
    }
    return type
      .replace(/^(hf|tjs)\./, "")
      .split(/[._]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }, []);

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
      <Box
        sx={{
          ...EYEBROW,
          color: "text.secondary",
          px: 1.5,
          pb: 1
        }}
      >
        Model Categories
      </Box>
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
                mb: 0.25,
                borderRadius: BORDER_RADIUS.md,
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
                  ...selectableRowStyles(theme, { selected: isSelected }),
                  "&.Mui-selected": selectedRowStyles(theme),
                  "&.Mui-focusVisible": {
                    backgroundColor: isSelected
                      ? theme.vars.palette.action.selected
                      : theme.vars.palette.action.hover
                  },
                  padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.lg)}`,
                  minWidth: 0,
                  gap: 1,
                  // Provider logos (HF, Ollama) sit inline in the label; keep
                  // them monochrome so the rail reads as one list.
                  "& img": { filter: "saturate(0)" }
                }}
              >
                {/* "All" has no inline icon from prettifyModelType, so give it
                    one here. Every other category already renders a meaningful
                    leading icon (HF logo / Ollama / model) via the label, so a
                    second data-type icon would just be redundant clutter. */}
                {type === "All" && (
                  <IconForType
                    iconName="model"
                    containerStyle={{ marginRight: getSpacingPx(SPACING.md), display: "flex" }}
                    svgProps={{
                      style: {
                        width: "20px",
                        height: "20px",
                        color: isSelected
                          ? theme.vars.palette.text.primary
                          : theme.vars.palette.text.secondary
                      }
                    }}
                    showTooltip={false}
                  />
                )}
                <ListItemText
                  primary={prettifyModelType(type)}
                  title={plainLabel(type)}
                  sx={{ minWidth: 0, my: 0 }}
                  primaryTypographyProps={{
                    noWrap: true,
                    sx: {
                      ...TYPOGRAPHY.sans.label,
                      "& img": { verticalAlign: "middle" }
                    },
                    color: isSelected ? "text.primary" : "text.secondary"
                  }}
                />
                {modelCountsByType[type] !== undefined && (
                  <Chip
                    label={modelCountsByType[type]}
                    size="small"
                    sx={{
                      height: 20,
                      minWidth: 28,
                      ...TYPOGRAPHY.sans.caption,
                      ml: 1,
                      backgroundColor: "transparent",
                      color: theme.vars.palette.text.secondary,
                      "& .MuiChip-label": {
                        px: 1
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
