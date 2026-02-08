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

  const renderModelSelect = () => {
    // Map node type to task-specific filters for generic nodes
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
  };

  return (
    <div className={`model-property ${modelClass}`} css={styles(theme)}>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      {!isConnected && renderModelSelect()}
    </div>
  );
};

export default memo(ModelProperty, isEqual);
