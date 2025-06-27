import React, { useCallback } from "react";
import { List, ListItemButton, ListItemText } from "@mui/material";
import { IconForType } from "../../../config/data_types";
import { prettifyModelType } from "../../../utils/modelFormatting";
import { UnifiedModel } from "../../../stores/ApiTypes";
import { ModelSource } from "./useModels";

interface ModelTypeSidebarProps {
  modelTypes: string[];
  selectedModelType: string;
  handleModelTypeChange: (type: string) => void;
  modelSource: ModelSource;
  ollamaModels: UnifiedModel[] | undefined;
  groupedHFModels: Record<string, UnifiedModel[]>;
  groupedRecommendedModels: Record<string, UnifiedModel[]>;
}

const ModelTypeSidebar: React.FC<ModelTypeSidebarProps> = ({
  modelTypes,
  selectedModelType,
  handleModelTypeChange,
  modelSource,
  ollamaModels,
  groupedHFModels,
  groupedRecommendedModels
}) => {
  const onModelTypeChange = useCallback(
    (type: string) => {
      handleModelTypeChange(type);
    },
    [handleModelTypeChange]
  );

  return (
    <List className="model-type-list">
      {modelTypes.map((type) => {
        let isEmpty = false;
        if (type === "llama_model") {
          isEmpty = (ollamaModels?.length || 0) === 0;
        } else if (modelSource === "downloaded") {
          isEmpty = (groupedHFModels[type]?.length || 0) === 0;
        } else {
          isEmpty = (groupedRecommendedModels[type]?.length || 0) === 0;
        }

        return (
          <ListItemButton
            className={`model-type-button ${isEmpty ? "empty" : ""}`}
            key={type}
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
        );
      })}
    </List>
  );
};

export default React.memo(ModelTypeSidebar);
