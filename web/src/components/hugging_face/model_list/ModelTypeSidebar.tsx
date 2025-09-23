import React, { useCallback } from "react";
import { List, ListItemButton, ListItemText } from "@mui/material";
import { IconForType } from "../../../config/data_types";
import { prettifyModelType } from "../../../utils/modelFormatting";
import { useModels } from "./useModels";
import { useModelManagerStore } from "../../../stores/ModelManagerStore";

const ModelTypeSidebar: React.FC = () => {
  const { modelTypes } = useModels();
  const { selectedModelType, setSelectedModelType } = useModelManagerStore();

  const onModelTypeChange = useCallback(
    (type: string) => {
      setSelectedModelType(type);
    },
    [setSelectedModelType]
  );

  return (
    <List className="model-type-list">
      {modelTypes.map((type) => {
        return (
          <ListItemButton
            className={`model-type-button`}
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
