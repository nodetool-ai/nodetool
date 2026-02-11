/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import ComfyModelSelect from "./ComfyModelSelect";
import LlamaModelSelect from "./LlamaModelSelect";
import HuggingFaceModelSelect from "./HuggingFaceModelSelect";
import isEqual from "lodash/isEqual";
import { memo, useMemo } from "react";
import LanguageModelSelect from "./LanguageModelSelect";
import EmbeddingModelSelect from "./EmbeddingModelSelect";
import ImageModelSelect from "./ImageModelSelect";
import TTSModelSelect from "./TTSModelSelect";
import ASRModelSelect from "./ASRModelSelect";
import VideoModelSelect from "./VideoModelSelect";
import Model3DModelSelect from "./Model3DModelSelect";
import { useNodes } from "../../contexts/NodeContext";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

const styles = (theme: Theme) =>
  css({
    // Model selects that use the custom `Select` component need slightly tighter density.
    "& .select-container .options-list": {
      padding: "2px 0",
      backgroundColor: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: theme.rounded.buttonSmall,
    },
    "& .select-container .option": {
      fontSize: theme.fontSizeSmaller,
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      color: theme.vars.palette.text.primary,
      padding: "4px 8px"
    },
    "& .select-container .option:first-of-type": {
      borderTop: "none"
    },
    "& .select-container .option:hover": {
      backgroundColor: theme.vars.palette.action.hover,
      cursor: "pointer"
    },
    "& .select-container .select-header-text": {
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.primary
    },
    "& .select-container .select-header": {
      padding: "0 4px",
      minHeight: "28px",
      borderRadius: theme.rounded.buttonSmall,
      border: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.paper
    }
  });

const ModelProperty = (props: PropertyProps) => {
  const id = `folder-${props.property.name}-${props.propertyIndex}`;
  const modelType = props.property.type.type;
  const edges = useNodes((state) => state.edges);
  const theme = useTheme();
  const isConnected = useMemo(() => {
    return edges.some(
      (edge) =>
        edge.target === props.nodeId &&
        edge.targetHandle === props.property.name
    );
  }, [edges, props.nodeId, props.property.name]);

  const modelClass = useMemo(
    () => `model-type-${modelType.replace(/\./g, "-")}`,
    [modelType]
  );

  // Memoize task calculations to avoid recalculation on every render
  const { imageTask, videoTask, model3dTask } = useMemo(() => {
    const imageTask =
      props.nodeType === "nodetool.image.TextToImage"
        ? ("text_to_image" as const)
        : props.nodeType === "nodetool.image.ImageToImage"
          ? ("image_to_image" as const)
          : undefined;
    const videoTask =
      props.nodeType === "nodetool.video.TextToVideo"
        ? ("text_to_video" as const)
        : props.nodeType === "nodetool.video.ImageToVideo"
          ? ("image_to_video" as const)
          : undefined;
    const model3dTask =
      props.nodeType === "nodetool.model3d.TextTo3D"
        ? ("text_to_3d" as const)
        : props.nodeType === "nodetool.model3d.ImageTo3D"
          ? ("image_to_3d" as const)
          : undefined;
    return { imageTask, videoTask, model3dTask };
  }, [props.nodeType]);

  // Memoize model select component to avoid recreation on every render
  const modelSelectComponent = useMemo(() => {
    if (modelType.startsWith("comfy.")) {
      if (props.nodeType.startsWith("comfy.loaders.")) {
        return (
          <ComfyModelSelect
            modelType={modelType}
            onChange={props.onChange}
            value={props.value?.name || ""}
          />
        );
      }
    } else if (modelType === "language_model") {
      return (
        <LanguageModelSelect
          onChange={props.onChange}
          value={props.value?.id || ""}
        />
      );
    } else if (modelType === "embedding_model") {
      return (
        <EmbeddingModelSelect
          onChange={props.onChange}
          value={props.value?.id || ""}
        />
      );
    } else if (modelType === "image_model") {
      return (
        <ImageModelSelect
          onChange={props.onChange}
          value={props.value?.id || ""}
          task={imageTask}
        />
      );
    } else if (modelType === "tts_model") {
      return (
        <TTSModelSelect
          onChange={props.onChange}
          value={props.value || ""}
        />
      );
    } else if (modelType === "asr_model") {
      return (
        <ASRModelSelect
          onChange={props.onChange}
          value={props.value?.id || ""}
        />
      );
    } else if (modelType === "video_model") {
      return (
        <VideoModelSelect
          onChange={props.onChange}
          value={props.value?.id || ""}
          task={videoTask}
        />
      );
    } else if (modelType === "model_3d_model") {
      return (
        <Model3DModelSelect
          onChange={props.onChange}
          value={props.value?.id || ""}
          task={model3dTask}
        />
      );
    } else if (modelType === "llama_model") {
      return (
        <LlamaModelSelect
          onChange={props.onChange}
          value={props.value?.repo_id || ""}
        />
      );
    } else if (modelType.startsWith("hf.")) {
      return (
        <HuggingFaceModelSelect
          modelType={modelType}
          onChange={props.onChange}
          value={props.value}
        />
      );
    }
    return null;
  }, [modelType, props.nodeType, props.onChange, props.value, imageTask, videoTask, model3dTask]);

  return (
    <div className={`model-property ${modelClass}`} css={styles(theme)}>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      {!isConnected && modelSelectComponent}
    </div>
  );
};

export default memo(ModelProperty, isEqual);
