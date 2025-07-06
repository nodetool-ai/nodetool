import { useMemo, useCallback, memo } from "react";
import { HuggingFaceModel } from "../../stores/ApiTypes";
import { isEqual } from "lodash";
import Select from "../inputs/Select";
import { useRecommendedModels } from "../../hooks/useRecommendedModels";
import { useHuggingFaceModels } from "../../hooks/useHuggingFaceModels";
import { useLoraModels } from "../../hooks/useLoraModels";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { Button, Box } from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";

interface HuggingFaceModelSelectProps {
  modelType: string;
  onChange: (value: any) => void;
  value: any;
}

const HuggingFaceModelSelect = ({
  modelType,
  onChange,
  value
}: HuggingFaceModelSelectProps) => {
  const { hfModels, hfLoading, hfIsFetching, hfError } = useHuggingFaceModels();
  const { recommendedModels } = useRecommendedModels();
  const { data: loraModels, isLoading: loraIsLoading } = useLoraModels({
    modelType,
    enabled: !!modelType && !hfLoading && !hfIsFetching && !hfError
  });
  const downloadStore = useModelDownloadStore();

  const models = useMemo(() => {
    if (!modelType || hfLoading || hfIsFetching || hfError || modelType.startsWith("hf.lora_sd")) {
      return null;
    }

    if (modelType.startsWith("hf.text_to_image")) {
      const textToImages = hfModels?.filter(
        (model) => model.pipeline_tag === "text-to-image" && model.has_model_index
      );
      return textToImages
        ?.map((textToImage) => ({
          type: modelType,
          repo_id: textToImage.repo_id || "",
          path: textToImage.path || ""
        }));
    } else if (modelType.startsWith("hf.image_to_image")) {
      const imageToImages = hfModels?.filter(
        (model) =>
          model.has_model_index &&
          (model.pipeline_tag === "image-to-image" ||
            model.pipeline_tag === "text-to-image")
      );
      return imageToImages
        ?.map((imageToImage) => ({
          type: modelType,
          repo_id: imageToImage.repo_id || "",
          path: imageToImage.path || ""
        }));
    } else {
      const recommended =
        modelType === "hf.checkpoint_model"
          ? recommendedModels?.filter(
              (model) =>
                model.type === "hf.stable_diffusion" ||
                model.type === "hf.stable_diffusion_xl" ||
                model.type === "hf.stable_diffusion_3" ||
                model.type === "hf.flux" ||
                model.type === "hf.ltxv"
            )
          : recommendedModels?.filter((model) => model.type === modelType);
      return (
        recommended?.reduce((acc, recommendedModel) => {
          const model = hfModels?.find(
            (m) => m.repo_id === recommendedModel.repo_id
          );
          if (model) {
            acc.push({
              type: modelType,
              repo_id: model.repo_id || "",
              path: recommendedModel.path || ""
            });
          }
          return acc;
        }, [] as HuggingFaceModel[]) || []
      );
    }
  }, [modelType, hfModels, hfLoading, hfIsFetching, hfError, recommendedModels]);

  const options = useMemo(() => {
    const isLoadingModels = hfLoading || hfIsFetching || (modelType.startsWith("hf.lora_sd") && loraIsLoading);
    
    // Use loraModels for lora model types, otherwise use models from useMemo
    const currentModels = modelType.startsWith("hf.lora_sd") ? loraModels : models;
    
    if (!currentModels || isLoadingModels || hfError) return [];

    const modelOptions = (currentModels as HuggingFaceModel[]).map((model) => ({
      value: model.path ? `${model.repo_id}:${model.path}` : model.repo_id,
      label: model.path ? (
        <div className="model-label">
          <div className="model-label-repo-id">
            {model.repo_id}
          </div>
          <div className="model-label-path">
            {model.path}
          </div>
        </div>
      ) : (
        model.repo_id || ""
      ),
      // Add sortKey for consistent sorting
      sortKey: model.path
        ? `${model.repo_id} ${model.path}`
        : model.repo_id || ""
    }));

    return [
      { value: "", label: "None", sortKey: "" },
      ...modelOptions.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    ];
  }, [models, hfLoading, hfIsFetching, hfError, loraIsLoading, modelType, loraModels]);

  const handleChange = useCallback(
    (selectedValue: string) => {
      const [repo_id, path] = selectedValue.split(":");
      onChange({
        type: modelType,
        repo_id,
        path: path || undefined
      });
    },
    [onChange, modelType]
  );

  const selectValue = useMemo(() => {
    if (value?.repo_id && value?.path) {
      return `${value.repo_id}:${value.path}`;
    }
    return value?.repo_id || "";
  }, [value]);

  const isValueMissing =
    selectValue && !options.some((opt) => opt.value === selectValue);

  const placeholder = useMemo(() => {
    const isLoadingModels = hfLoading || hfIsFetching || (modelType.startsWith("hf.lora_sd") && loraIsLoading);
    if (isLoadingModels) return "Loading models...";
    if (hfError) return "Error loading models";
    if (options.length === 1)
      return "No models found. Click RECOMMENDED MODELS above to find models.";
    if (isValueMissing) return `${selectValue} (missing)`;
    return "Select a model";
  }, [
    hfLoading,
    hfIsFetching,
    hfError,
    options.length,
    isValueMissing,
    selectValue,
    loraIsLoading,
    modelType
  ]);

  const handleDownload = useCallback(() => {
    if (value?.repo_id) {
      downloadStore.startDownload(
        value.repo_id,
        modelType,
        value.path || undefined
      );
      downloadStore.openDialog();
    }
  }, [value, modelType, downloadStore]);

  return (
    <Box>
      <Select
        options={options}
        value={isValueMissing ? "" : selectValue}
        onChange={handleChange}
        placeholder={placeholder}
        fuseOptions={{
          keys: ["value"]
        }}
      />
      {isValueMissing && !hfLoading && value?.repo_id && (
        <Button
          variant="outlined"
          size="small"
          startIcon={<DownloadIcon />}
          onClick={handleDownload}
          sx={{ mt: 1, width: "100%" }}
        >
          Download {value.repo_id}
        </Button>
      )}
    </Box>
  );
};

export default memo(HuggingFaceModelSelect, isEqual);
