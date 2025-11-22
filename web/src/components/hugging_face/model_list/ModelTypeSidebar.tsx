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

const ModelTypeSidebar: React.FC = () => {
  const { modelTypes, availableModelTypes } = useModels();
  const { selectedModelType, setSelectedModelType } = useModelManagerStore();

  const onModelTypeChange = useCallback(
    (type: string) => {
      setSelectedModelType(type);
    },
    [setSelectedModelType]
  );

  const getHuggingFaceLink = useCallback((type: string) => {
    if (!type.startsWith("hf.")) {
      return undefined;
    }

    const pipelineTag = type.slice(3).replace(/_/g, "-").toLowerCase();
    return `https://huggingface.co/models?pipeline_tag=${pipelineTag}`;
  }, []);

  return (
    <List className="model-type-list">
      {modelTypes
        .filter((type) => availableModelTypes.has(type))
        .map((type) => {
          const href = getHuggingFaceLink(type);
          const listItemSx =
            type === "All"
              ? {
                  mb: 2,
                  pb: 1,
                  borderBottom: (theme) => `1px solid ${theme.palette.divider}`
                }
              : undefined;
          return (
            <ListItem
              disablePadding
              key={type}
              sx={listItemSx}
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
                      onClick={(event) => event.stopPropagation()}
                    >
                      <OpenInNewIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ) : undefined
              }
            >
              <ListItemButton
                className={`model-type-button`}
                selected={selectedModelType === type}
                onClick={() => onModelTypeChange(type)}
              >
                {type === "All" && (
                  <IconForType
                    iconName={"model"}
                    containerStyle={{ marginRight: "0.5em" }}
                    svgProps={{
                      style: {
                        width: "20px",
                        height: "20px"
                      }
                    }}
                    showTooltip={false}
                  />
                )}
                <ListItemText primary={prettifyModelType(type)} />
              </ListItemButton>
            </ListItem>
          );
        })}
    </List>
  );
};

export default React.memo(ModelTypeSidebar);
