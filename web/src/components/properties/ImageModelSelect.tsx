import React, { useState, useCallback, useMemo, useRef } from "react";
import { Typography, Tooltip, Button } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { isEqual } from "lodash";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import ImageModelMenuDialog from "../model_menu/ImageModelMenuDialog";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import type { ImageModel } from "../../stores/ApiTypes";
import { useImageModelsByProvider } from "../../hooks/useModelsByProvider";

interface ImageModelSelectProps {
  onChange: (value: any) => void;
  value: string;
  task?: "text_to_image" | "image_to_image";
}


const ImageModelSelect: React.FC<ImageModelSelectProps> = ({
  onChange,
  value,
  task
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const addRecent = useModelPreferencesStore((s) => s.addRecent);
  const theme = useTheme();

  // Use the same hook as the dialog to fetch models
  const { models: fetchedModels } = useImageModelsByProvider();

  const currentSelectedModelDetails = useMemo(() => {
    if (!fetchedModels || !value) return null;
    return fetchedModels.find((m) => m.id === value);
  }, [fetchedModels, value]);

  const handleClick = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setDialogOpen(false);
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
      setDialogOpen(false);
    },
    [onChange, addRecent]
  );

  return (
    <>
      <Tooltip
        title={
          <div style={{ textAlign: "center" }}>
            <Typography variant="inherit">
              {currentSelectedModelDetails?.name ||
                value ||
                "Select an image model"}
            </Typography>
            <Typography variant="caption" display="block">
              Select Image Generation Model
            </Typography>
          </div>
        }
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <Button
          ref={buttonRef}
          className={`select-model-button image-model-button ${
            value ? "active" : ""
          }`}
          sx={{
            fontSize: "var(--fontSizeTiny)",
            border: "1px solid transparent",
            borderRadius: "0.25em",
            color: "var(--palette-grey-0)",
            textTransform: "none",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
            height: "18px",
            minHeight: 0,
            padding: "0 0.5em !important",
            "&:hover": {
              backgroundColor: "var(--palette-grey-500)"
            }
          }}
          onClick={handleClick}
          size="small"
        >
          <Typography
            variant="body2"
            sx={{
              color: "var(--palette-grey-200)",
              lineHeight: 1,
              display: "block"
            }}
          >
            {currentSelectedModelDetails?.name || value || "Select Image Model"}
          </Typography>
        </Button>
      </Tooltip>
      <ImageModelMenuDialog
        open={dialogOpen}
        onClose={handleClose}
        onModelChange={handleDialogModelSelect}
        task={task}
      />
    </>
  );
};

export default React.memo(ImageModelSelect, isEqual);
