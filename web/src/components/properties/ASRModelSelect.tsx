import React, { useState, useCallback, useMemo, useRef } from "react";
import isEqual from "lodash/isEqual";
import ASRModelMenuDialog from "../model_menu/ASRModelMenuDialog";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import type { ASRModel } from "../../stores/ApiTypes";
import { client } from "../../stores/ApiClient";
import { useQuery } from "@tanstack/react-query";
import ModelSelectButton from "./shared/ModelSelectButton";
interface ASRModelSelectProps {
  onChange: (value: any) => void;
  value: string;
}

const ASRModelSelect: React.FC<ASRModelSelectProps> = ({ onChange, value }) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const addRecent = useModelPreferencesStore((s) => s.addRecent);
  const loadASRModels = useCallback(async () => {
    const { data, error } = await client.GET(
      "/api/models/{model_type}" as any,
      {
        params: { path: { model_type: "asr" } }
      }
    );
    if (error) {
      throw error;
    }
    return data as unknown as ASRModel[];
  }, []);

  const { data: models } = useQuery({
    queryKey: ["asr-models"],
    queryFn: async () => await loadASRModels()
  });

  const currentSelectedModelDetails = useMemo(() => {
    if (!models || !value) {
      return null;
    }
    return models.find((m) => m.id === value);
  }, [models, value]);

  const handleClick = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setDialogOpen(false);
  }, []);

  const handleDialogModelSelect = useCallback(
    (model: ASRModel) => {
      const modelToPass = {
        type: "asr_model" as const,
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
      setDialogOpen(false);
    },
    [onChange, addRecent]
  );

  return (
    <>
      <ModelSelectButton
        ref={buttonRef}
        active={!!value}
        label={currentSelectedModelDetails?.name || value || "Select Model"}
        subLabel="Select ASR Model"
        onClick={handleClick}
      />
      <ASRModelMenuDialog
        open={dialogOpen}
        onClose={handleClose}
        onModelChange={handleDialogModelSelect}
      />
    </>
  );
};

export default React.memo(ASRModelSelect, isEqual);
