import React, { useState, useCallback, useMemo, useRef } from "react";
import isEqual from "lodash/isEqual";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import { client } from "../../stores/ApiClient";
import { useQuery } from "@tanstack/react-query";
import ModelSelectButton from "./shared/ModelSelectButton";
import { Menu, MenuItem, ListItemText, Typography, Divider } from "@mui/material";

// Local type until codegen adds Model3DModel to ApiTypes
interface Model3DModel {
  id: string;
  name?: string;
  provider?: string;
  supported_tasks?: string[];
}

// Memoized model menu item to prevent re-renders
interface ModelMenuItemProps {
  model: Model3DModel;
  isSelected: boolean;
  onSelect: (model: Model3DModel) => void;
}

const ModelMenuItem = React.memo<ModelMenuItemProps>(
  ({ model, isSelected, onSelect }) => (
    <MenuItem
      onClick={() => onSelect(model)}
      selected={isSelected}
      sx={{ pl: 3 }}
    >
      <ListItemText
        primary={model.name || model.id}
        secondary={model.supported_tasks?.join(", ")}
      />
    </MenuItem>
  ),
  (prevProps, nextProps) =>
    prevProps.model.id === nextProps.model.id &&
    prevProps.model.name === nextProps.model.name &&
    prevProps.isSelected === nextProps.isSelected
);
ModelMenuItem.displayName = "ModelMenuItem";

interface Model3DModelSelectProps {
  onChange: (value: any) => void;
  value: string;
  task?: "text_to_3d" | "image_to_3d";
}

const Model3DModelSelect: React.FC<Model3DModelSelectProps> = ({
  onChange,
  value,
  task
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const addRecent = useModelPreferencesStore((s) => s.addRecent);

  const load3DModels = useCallback(async () => {
    const { data, error } = await client.GET(
      "/api/models/{model_type}" as any,
      {
        params: { path: { model_type: "3d" } }
      }
    );
    if (error) {
      throw error;
    }
    return data as unknown as Model3DModel[];
  }, []);

  const { data: models, isLoading } = useQuery({
    queryKey: ["3d-models"],
    queryFn: async () => await load3DModels()
  });

  // Filter models by task if specified
  const filteredModels = useMemo(() => {
    if (!models) {return [];}
    if (!task) {return models;}
    return models.filter((m) => 
      m.supported_tasks?.includes(task) || 
      m.supported_tasks?.length === 0
    );
  }, [models, task]);

  // Group models by provider
  const modelsByProvider = useMemo(() => {
    const grouped: Record<string, Model3DModel[]> = {};
    for (const model of filteredModels) {
      const provider = model.provider || "Unknown";
      if (!grouped[provider]) {
        grouped[provider] = [];
      }
      grouped[provider].push(model);
    }
    return grouped;
  }, [filteredModels]);

  const currentSelectedModelDetails = useMemo(() => {
    if (!models || !value) {
      return null;
    }
    return models.find((m) => m.id === value);
  }, [models, value]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleModelSelect = useCallback(
    (model: Model3DModel) => {
      const modelToPass = {
        type: "model_3d_model" as const,
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
      setAnchorEl(null);
    },
    [onChange, addRecent]
  );

  return (
    <>
      <ModelSelectButton
        ref={buttonRef}
        active={!!value}
        label={currentSelectedModelDetails?.name || value || "Select 3D Model"}
        subLabel="Select 3D Model"
        onClick={handleClick}
      />
      <Menu
        anchorEl={anchorEl}
        open={!!anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left"
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "left"
        }}
        slotProps={{
          paper: {
            sx: {
              maxHeight: 400,
              minWidth: 250
            }
          }
        }}
      >
        {isLoading && (
          <MenuItem disabled>
            <ListItemText primary="Loading models..." />
          </MenuItem>
        )}
        {!isLoading && filteredModels.length === 0 && (
          <MenuItem disabled>
            <ListItemText primary="No 3D models available" />
          </MenuItem>
        )}
        {Object.entries(modelsByProvider).map(([provider, providerModels], index) => (
          <React.Fragment key={provider}>
            {index > 0 && <Divider />}
            <MenuItem disabled sx={{ opacity: 1 }}>
              <Typography variant="caption" color="text.secondary" fontWeight="bold">
                {provider}
              </Typography>
            </MenuItem>
            {providerModels.map((model) => (
              <ModelMenuItem
                key={model.id}
                model={model}
                isSelected={model.id === value}
                onSelect={handleModelSelect}
              />
            ))}
          </React.Fragment>
        ))}
      </Menu>
    </>
  );
};

export default React.memo(Model3DModelSelect, isEqual);
