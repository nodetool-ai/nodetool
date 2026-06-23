import React, { useCallback } from "react";
import {
  List,
  ListItem,
  ListItemButton,
  ListItemText
} from "@mui/material";
import { Chip, Text, ToolbarIconButton, Box, MOTION, BORDER_RADIUS, SPACING, getSpacingPx } from "../../ui_primitives";
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

  const onModelTypeChange = useCallback(
    (type: string) => {
      setSelectedModelType(type);
    },
    [setSelectedModelType]
  );

  const createModelTypeChangeHandler = useCallback((type: string) => {
    return () => onModelTypeChange(type);
  }, [onModelTypeChange]);

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
      <Text
        size="small"
        color="secondary"
        sx={{
          px: 1.5,
          pb: 1,
          fontSize: "var(--fontSizeSmaller)",
          fontWeight: 600,
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
                mb: 0.25,
                borderRadius: BORDER_RADIUS.lg,
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
                  borderRadius: BORDER_RADIUS.lg,
                  padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.lg)}`, // was 5px 10px
                  minWidth: 0,
                  gap: 1,
                  transition: `${MOTION.background}, color ${MOTION.fast}`,
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
                {/* "All" has no inline icon from prettifyModelType, so give it
                    one here. Every other category already renders a meaningful
                    leading icon (HF logo / Ollama / model) via the label, so a
                    second data-type icon would just be redundant clutter. */}
                {type === "All" && (
                  <IconForType
                    iconName="model"
                    containerStyle={{ marginRight: "0.5em", display: "flex" }}
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
                )}
                <ListItemText
                  primary={prettifyModelType(type)}
                  title={plainLabel(type)}
                  sx={{ minWidth: 0, my: 0 }}
                  primaryTypographyProps={{
                    noWrap: true,
                    sx: {
                      "& img": { verticalAlign: "middle" }
                    },
                    fontSize: "var(--fontSizeNormal)",
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
                      fontSize: "var(--fontSizeSmall)",
                      fontWeight: 600,
                      ml: 1,
                      backgroundColor: "transparent",
                      color: isSelected
                        ? theme.vars.palette.primary.main
                        : theme.vars.palette.text.secondary,
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
