import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";

import {
  ToolbarIconButton,
  Box,
  BORDER_RADIUS,
  EYEBROW,
  SPACING,
  getSpacingPx,
  ListGroup,
  ListItemRow,
  Text
} from "../../ui_primitives";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { IconForType } from "../../../config/IconForType";
import { prettifyModelType } from "../../../utils/modelFormatting";
import { useModels } from "./useModels";
import { useModelManagerStore } from "../../../stores/ModelManagerStore";
import { useTheme } from "@mui/material/styles";

const ModelTypeSidebar: React.FC = () => {
  const { t } = useTranslation();
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
      return t("i18n-next29.categories.all");
    }
    return type
      .replace(/^(hf|tjs)\./, "")
      .split(/[._]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }, [t]);

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
      {t("i18n-next29.categories.title")}
      </Box>
    <ListGroup className="model-type-list" flush>
      {modelTypes
        .filter((type) => availableModelTypes.has(type))
        .map((type) => {
          const href = getHuggingFaceLink(type);
          const isSelected = selectedModelType === type;

          return (
            <ListItemRow
              key={type}
              onClick={createModelTypeChangeHandler(type)}
              selected={isSelected}
              className="model-type-item"
              sx={{
                mb: 0.25,
                borderRadius: BORDER_RADIUS.md,
                overflow: "hidden"
              }}
              buttonSx={{
                padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.lg)}`,
                minWidth: 0,
                gap: 1,
                // Provider logos (HF, Ollama) sit inline in the label; keep
                // them monochrome so the rail reads as one list.
                "& img": { filter: "saturate(0)" }
              }}
              // "All" has no inline icon from prettifyModelType, so give it
              // one here. Every other category already renders a meaningful
              // leading icon (HF logo / Ollama / model) via the label.
              icon={
                type === "All" ? (
                  <IconForType
                    iconName="model"
                    containerStyle={{ display: "flex" }}
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
                ) : undefined
              }
              primary={
                <Box
                  component="span"
                  title={plainLabel(type)}
                  sx={{
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: isSelected ? "text.primary" : "text.secondary",
                    "& img": { verticalAlign: "middle" }
                  }}
                >
                  {prettifyModelType(type)}
                </Box>
              }
              textSx={{ minWidth: 0, my: 0 }}
              secondaryAction={
                href ? (
                  <ToolbarIconButton
                    icon={<OpenInNewIcon fontSize="small" />}
                    tooltip={t("i18n-next29.categories.viewOnHuggingFace")}
                    edge="end"
                    component="a"
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={handleLinkClick}
                    ariaLabel={t("i18n-next29.categories.viewTypeOnHuggingFace", { type: plainLabel(type) })}
                    sx={{
                      color: isSelected ? theme.vars.palette.text.primary : "inherit",
                      opacity: 0.7,
                      "&:hover": { opacity: 1 }
                    }}
                  />
                ) : undefined
              }
            >
              {modelCountsByType[type] !== undefined && (
                <Text size="smaller" color="secondary" sx={{ ml: 1 }}>
                  {modelCountsByType[type]}
                </Text>
              )}
            </ListItemRow>
          );
        })}
    </ListGroup>
    </Box>
  );
};

export default React.memo(ModelTypeSidebar);
