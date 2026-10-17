import { useModelProviderSetup } from "../../hooks/useModelProviderSetup";
import React, { useState, useCallback, useMemo, useRef } from "react";
import isEqual from "../../utils/isEqual";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import { BASE_URL } from "../../stores/BASE_URL";
import { Model3DModelValue } from "../../stores/ApiTypes";
import { useQuery } from "@tanstack/react-query";
import ModelSelectButton from "./shared/ModelSelectButton";

import {
  Divider,
  EditorMenu,
  ListSubheader,
  MenuItemPrimitive
} from "../ui_primitives";

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
  ({ model, isSelected, onSelect }) => {
    const handleClick = useCallback(() => {
      onSelect(model);
    }, [model, onSelect]);

    return (
      <MenuItemPrimitive
        label={model.name || model.id}
        secondary={model.supported_tasks?.join(", ")}
        selected={isSelected}
        onClick={handleClick}
      />
    );
  },
  (prevProps, nextProps) =>
    prevProps.model.id === nextProps.model.id &&
    prevProps.model.provider === nextProps.model.provider &&
    prevProps.model.name === nextProps.model.name &&
    prevProps.isSelected === nextProps.isSelected
);
ModelMenuItem.displayName = "ModelMenuItem";

interface Model3DModelSelectProps {
  onChange: (value: Model3DModelValue) => void;
  value: string;
  provider?: string;
  task?: "text_to_3d" | "image_to_3d";
}

const Model3DModelSelect: React.FC<Model3DModelSelectProps> = ({
  onChange,
  value,
  provider,
  task
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const addRecent = useModelPreferencesStore((s) => s.addRecent);

  const load3DModels = useCallback(async () => {
    const res = await fetch(`${BASE_URL}/api/models/3d`);
    if (!res.ok) {
      throw new Error(`Failed to fetch 3D models: ${res.status}`);
    }
    return (await res.json()) as Model3DModel[];
  }, []);

  const { data: models, isLoading } = useQuery({
    queryKey: ["3d-models"],
    queryFn: async () => await load3DModels()
  });

  const filteredModels = useMemo(() => {
    if (!models) {return [];}
    if (!task) {return models;}
    return models.filter((m) => 
      m.supported_tasks?.includes(task) || 
      m.supported_tasks?.length === 0
    );
  }, [models, task]);

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
    return models.find(
      (m) => m.id === value && (!provider || m.provider === provider)
    );
  }, [models, value, provider]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const { openSetup } = useModelProviderSetup({
    open: !!anchorEl,
    onClose: handleClose,
    capability: task ?? "text_to_3d"
  });

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
        label={currentSelectedModelDetails?.name || value || "Select 3D model"}
        subLabel="Select 3D model"
        onClick={handleClick}
      />
      <EditorMenu
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
        paperSx={{
          maxHeight: 400,
          minWidth: 250
        }}
      >
        {isLoading && <MenuItemPrimitive label="Loading models…" disabled />}
        {!isLoading && filteredModels.length === 0 && (
          <MenuItemPrimitive label="No 3D models available" disabled />
        )}
        {Object.entries(modelsByProvider).flatMap(
          ([groupProvider, providerModels], index) => [
            index > 0 ? <Divider key={`${groupProvider}-divider`} /> : null,
            <ListSubheader key={`${groupProvider}-header`}>
              {groupProvider}
            </ListSubheader>,
            ...providerModels.map((model) => (
              <ModelMenuItem
                key={`${groupProvider}-${model.id}`}
                model={model}
                isSelected={
                  model.id === value && (!provider || model.provider === provider)
                }
                onSelect={handleModelSelect}
              />
            ))
          ]
        )}
        <MenuItemPrimitive label="Add providers" dividerBefore onClick={openSetup} />
      </EditorMenu>
    </>
  );
};

export default React.memo(Model3DModelSelect, isEqual);
