import React, { useState, useCallback, useMemo, useRef } from "react";
import isEqual from "lodash/isEqual";
import ImageModelMenuDialog from "../model_menu/ImageModelMenuDialog";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import type { ImageModel, ImageModelValue } from "../../stores/ApiTypes";
import { useImageModelsByProvider } from "../../hooks/useModelsByProvider";
import ModelSelectButton from "./shared/ModelSelectButton";

interface ImageModelSelectProps {
  onChange: (value: ImageModelValue) => void;
  value: string;
  task?: "text_to_image" | "image_to_image";
}

const ImageModelSelect: React.FC<ImageModelSelectProps> = ({
  onChange,
  value,
  task
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const addRecent = useModelPreferencesStore((s) => s.addRecent);

  // Use the same hook as the dialog to fetch models
  const { models: fetchedModels } = useImageModelsByProvider();

  const currentSelectedModelDetails = useMemo(() => {
    if (!fetchedModels || !value) {
      return null;
    }
    return fetchedModels.find((m) => m.id === value);
  }, [fetchedModels, value]);

  const displayInfo = useMemo(() => {
    if (currentSelectedModelDetails) {
      // Try to split by colon first (HF style)
      if (currentSelectedModelDetails.id?.includes(":")) {
        const [repo, ...rest] = currentSelectedModelDetails.id.split(":");
        return {
          label: repo,
          secondaryLabel:
            rest.join(":") || currentSelectedModelDetails.path || undefined
        };
      }

      // Try to use explicit path
      if (currentSelectedModelDetails.path) {
        return {
          label: currentSelectedModelDetails.name || "",
          secondaryLabel: currentSelectedModelDetails.path
        };
      }

      // Try to split by slash (file path style)
      const name = currentSelectedModelDetails.name || "";
      if (name.includes("/")) {
        const lastSlash = name.lastIndexOf("/");
        return {
          label: name.substring(0, lastSlash),
          secondaryLabel: name.substring(lastSlash + 1)
        };
      }

      return { label: name, secondaryLabel: undefined };
    }

    // Fallback for value string
    if (value) {
      if (value.includes(":")) {
        const [repo, ...rest] = value.split(":");
        return { label: repo, secondaryLabel: rest.join(":") };
      }
      if (value.includes("/")) {
        const lastSlash = value.lastIndexOf("/");
        return {
          label: value.substring(0, lastSlash),
          secondaryLabel: value.substring(lastSlash + 1)
        };
      }
      return { label: value, secondaryLabel: undefined };
    }

    return { label: "Select Image Model", secondaryLabel: undefined };
  }, [currentSelectedModelDetails, value]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleDialogModelSelect = useCallback(
    (model: ImageModel) => {
      const modelToPass = {
        type: "image_model" as const,
        id: model.id,
        provider: model.provider,
        name: model.name || "",
        path: model.path || ""
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
        label={displayInfo.label}
        secondaryLabel={displayInfo.secondaryLabel}
        subLabel="Select Image Generation Model"
        onClick={handleClick}
      />
      <ImageModelMenuDialog
        open={!!anchorEl}
        anchorEl={anchorEl}
        onClose={handleClose}
        onModelChange={handleDialogModelSelect}
        task={task}
      />
    </>
  );
};

export default React.memo(ImageModelSelect, isEqual);
